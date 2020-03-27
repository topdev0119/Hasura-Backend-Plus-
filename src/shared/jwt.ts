import { JWK, JWKS, JWT } from 'jose'
import { JWT_ALGORITHM, JWT_EXPIRES_IN, JWT_SECRET_KEY, KEY_FILE_PATH } from './config'

import Boom from '@hapi/boom'
import fs from 'fs'

const RSA_TYPES = ['RS256', 'RS384', 'RS512']
const SHA_TYPES = ['HS256', 'HS384', 'HS512']

let jwtKey: string | JWK.RSAKey | JWK.ECKey | JWK.OKPKey | JWK.OctKey = JWT_SECRET_KEY as string

/**
 * * Sets the JWT Key.
 * * If RSA algorithm, then checks if the PEM has been passed on through the JWT_SECRET_KEY
 * * If not, tries to read the private.pem file, or generates it otherwise
 * * If SHA algorithm, then uses the JWT_SECRET_KEY environment variables
 */
if (RSA_TYPES.includes(JWT_ALGORITHM)) {
  if (jwtKey) {
    try {
      jwtKey = JWK.asKey(jwtKey, { alg: JWT_ALGORITHM })
      jwtKey.toPEM(true)
    } catch (error) {
      throw Boom.badImplementation(
        'Invalid RSA private key in the JWT_SECRET_KEY environment variable.'
      )
    }
  } else {
    try {
      const file = fs.readFileSync(KEY_FILE_PATH)
      jwtKey = JWK.asKey(file)
    } catch (error) {
      jwtKey = JWK.generateSync('RSA', 2048, { alg: JWT_ALGORITHM, use: 'sig' }, true)
      fs.writeFileSync(KEY_FILE_PATH, jwtKey.toPEM(true))
    }
  }
} else if (SHA_TYPES.includes(JWT_ALGORITHM)) {
  if (!jwtKey) {
    throw Boom.badImplementation('Empty JWT secret key.')
  }
} else {
  throw Boom.badImplementation(`Invalid JWT algorithm: ${JWT_ALGORITHM}`)
}

export const newJwtExpiry = JWT_EXPIRES_IN * 60 * 1000

/**
 * * Creates a JWKS store. Only works with RSA algorithms. Raises an error otherwise
 * @returns JWKS store
 */
export const getJwkStore = (): JWKS.KeyStore => {
  if (RSA_TYPES.includes(JWT_ALGORITHM)) {
    const keyStore = new JWKS.KeyStore()
    keyStore.add(jwtKey as JWK.RSAKey)
    return keyStore
  }
  throw Boom.notImplemented('JWKS is not implemented on this server.')
}

/**
 * * Signs a payload with the existing JWT configuration
 */
export const sign = (payload: object): string =>
  JWT.sign(payload, jwtKey, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${JWT_EXPIRES_IN}m`
  })

/**
 * Claims interface.
 */
export interface Claims {
  'x-hasura-user-id': string
  'x-hasura-default-role': string
  'x-hasura-allowed-roles': string[]
  [key: string]: string | string[]
}

/**
 * Token interface.
 */
interface Token {
  'https://hasura.io/jwt/claims': Claims
  exp: bigint
  iat: bigint
}

/**
 * Verify JWT token.
 * @param authorization Authorization header.
 */
export function verify(authorization: string | undefined): Token {
  try {
    if (!authorization) {
      throw Boom.unauthorized('Missing Authorization header.')
    }
    const token = authorization.replace('Bearer ', '')
    return JWT.verify(token, jwtKey) as Token
  } catch (err) {
    throw Boom.unauthorized('Invalid or expired JWT token.')
  }
}
