import { ApiError } from '../errors/api-error.js';

export const APPLICATION_ROLES = Object.freeze(['user', 'tenant-admin', 'operator', 'auditor', 'system-admin']);

function claimValues(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

export function mapApplicationRoles(rawRoles, mapping) {
  const source = new Set(claimValues(rawRoles));
  return APPLICATION_ROLES.filter((applicationRole) =>
    (mapping[applicationRole] || []).some((externalRole) => source.has(externalRole)),
  );
}

export function requireAnyRole(...allowed) {
  return (req, res, next) => {
    if (!req.auth || !allowed.some((role) => req.auth.roles.includes(role))) {
      return next(new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient privileges' }));
    }
    next();
  };
}
