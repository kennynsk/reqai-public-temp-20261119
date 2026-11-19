import assert from 'node:assert/strict';
import test from 'node:test';

import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, jwtVerify } from 'jose';

import { createJwtVerifier } from '../src/auth/jwt-verifier.js';
import { mapApplicationRoles, requireAnyRole } from '../src/auth/authorization.js';
import { createAuthenticationMiddleware, rejectClientTenantMiddleware } from '../src/middleware/authentication.js';

const issuer = 'https://iam.example.test';
const audience = 'reqai';

function config(overrides = {}) {
  return {
    auth: {
      enabled: true,
      issuer,
      audience,
      jwksUri: `${issuer}/jwks`,
      clockToleranceSeconds: 0,
      userIdClaim: 'sub',
      rolesClaim: 'roles',
      tenantClaim: 'tenant_id',
      defaultTenantAllowed: true,
      roleMapping: {
        user: ['reqai-user'],
        'tenant-admin': ['reqai-tenant-admin'],
        operator: ['reqai-operator'],
        auditor: ['reqai-auditor'],
        'system-admin': ['reqai-system-admin'],
      },
      ...overrides,
    },
    tenancy: { defaultTenantId: 'default-enterprise' },
  };
}

function invoke(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (error) => resolve(error)));
}

test('JWT verifier enforces signature, issuer and audience', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const verifier = createJwtVerifier(config(), {
    createJwkSet: () => createLocalJWKSet({ keys: [jwk] }),
    verify: jwtVerify,
  });
  const token = await new SignJWT({ roles: ['reqai-user'], tenant_id: 'tenant-a' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('user-a')
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('5m')
    .sign(privateKey);
  const claims = await verifier(token);
  assert.equal(claims.sub, 'user-a');
  await assert.rejects(
    () => createJwtVerifier(config({ audience: 'other' }), {
      createJwkSet: () => createLocalJWKSet({ keys: [jwk] }),
      verify: jwtVerify,
    })(token),
  );
});

test('authentication derives trusted user, roles and default tenant', async () => {
  const middleware = createAuthenticationMiddleware(config(), {
    verifier: async () => ({ sub: 'user-a', roles: ['reqai-user'] }),
  });
  const req = { get: () => 'Bearer token' };
  assert.equal(await invoke(middleware, req), undefined);
  assert.equal(req.auth.userId, 'user-a');
  assert.equal(req.auth.tenantId, 'default-enterprise');
  assert.deepEqual(req.auth.roles, ['user']);
});

test('role authorization and client tenant rejection enforce boundaries', async () => {
  assert.deepEqual(mapApplicationRoles(['reqai-operator'], config().auth.roleMapping), ['operator']);
  const denied = await invoke(requireAnyRole('system-admin'), { auth: { roles: ['user'] } });
  assert.equal(denied.status, 403);
  const tenantError = await invoke(rejectClientTenantMiddleware, { body: { tenantId: 'forged' } });
  assert.equal(tenantError.code, 'TENANT_CONTEXT_FORBIDDEN');
});
