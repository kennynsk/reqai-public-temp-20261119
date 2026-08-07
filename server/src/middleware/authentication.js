import { ApiError } from '../errors/api-error.js';
import { createJwtVerifier } from '../auth/jwt-verifier.js';
import { mapApplicationRoles } from '../auth/authorization.js';

function unauthorized(message = 'Authentication required') {
  return new ApiError({ status: 401, code: 'UNAUTHORIZED', message });
}

export function createAuthenticationMiddleware(config, { verifier = createJwtVerifier(config) } = {}) {
  if (!config.auth.enabled) {
    return (req, res, next) => {
      req.auth = Object.freeze({
        userId: 'development-user',
        tenantId: config.tenancy.defaultTenantId,
        roles: Object.freeze(['system-admin']),
        claims: Object.freeze({}),
      });
      next();
    };
  }

  return async (req, res, next) => {
    try {
      const header = String(req.get('Authorization') || '');
      const match = header.match(/^Bearer\s+(.+)$/i);
      if (!match) throw unauthorized();
      const claims = await verifier(match[1]);
      const userId = claims[config.auth.userIdClaim];
      if (typeof userId !== 'string' || !userId) throw unauthorized('Token has no valid user identifier');

      let tenantId = claims[config.auth.tenantClaim];
      if (typeof tenantId !== 'string' || !tenantId) {
        if (!config.auth.defaultTenantAllowed) throw unauthorized('Token has no tenant context');
        tenantId = config.tenancy.defaultTenantId;
      }

      req.auth = Object.freeze({
        userId,
        tenantId,
        roles: Object.freeze(mapApplicationRoles(claims[config.auth.rolesClaim], config.auth.roleMapping)),
        claims: Object.freeze({ ...claims }),
      });
      next();
    } catch (error) {
      if (error instanceof ApiError) return next(error);
      next(unauthorized('Token validation failed'));
    }
  };
}

export function rejectClientTenantMiddleware(req, res, next) {
  if (req.body && Object.hasOwn(req.body, 'tenantId')) {
    return next(new ApiError({
      status: 400,
      code: 'TENANT_CONTEXT_FORBIDDEN',
      message: 'tenantId must not be supplied by the client',
    }));
  }
  next();
}
