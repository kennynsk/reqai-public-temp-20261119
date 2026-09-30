import express from 'express';

import { requestContext } from './middleware/request-context.js';
import { createApiV1Router } from './routes/api-v1-routes.js';
import { createSystemRouter } from './routes/system-routes.js';
import { createReadinessService } from './services/readiness-service.js';
import { telemetryMiddleware } from './observability/telemetry.js';

const developmentConfig = Object.freeze({
  auth: Object.freeze({ enabled: false }),
  tenancy: Object.freeze({ defaultTenantId: 'default-enterprise' }),
});

export function createApp({ siteId = 'local', readiness = createReadinessService(), config = developmentConfig, services = {} } = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Dynamic tenant data must never be served from the browser's heuristic
  // cache: a mid-generation snapshot (e.g. a running discussion attempt)
  // would otherwise resurrect ghost state after a page reload.
  app.use('/api/v1', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  app.use(requestContext);
  app.use(telemetryMiddleware);
  app.use(createSystemRouter({ readiness, siteId }));
  app.use(createApiV1Router({ config, services }));

  return { app, readiness };
}
