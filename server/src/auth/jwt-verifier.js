import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createJwtVerifier(config, { createJwkSet = createRemoteJWKSet, verify = jwtVerify } = {}) {
  if (!config.auth.enabled) return null;
  const jwksUri = config.auth.jwksUri || `${config.auth.issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
  const jwks = createJwkSet(new URL(jwksUri));

  return async function verifyToken(token) {
    const result = await verify(token, jwks, {
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      clockTolerance: config.auth.clockToleranceSeconds,
    });
    return result.payload;
  };
}
