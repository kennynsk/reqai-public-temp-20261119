import express from 'express';

import legacyApp from './legacy-app.js';
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
  app.use(requestContext);
  app.use(telemetryMiddleware);
  app.use(createSystemRouter({ readiness, siteId }));
  app.use(createApiV1Router({ config, services }));
  app.use(legacyApp);

  return { app, readiness };
}
