import express from 'express';
import { renderMetrics } from '../observability/metrics.js';

export function createSystemRouter({ readiness, siteId }) {
  const router = express.Router();

  router.get('/health/live', (req, res) => {
    res.status(readiness.isLive() ? 200 : 503).json({
      ok: readiness.isLive(),
      service: 'reqai-api',
      site: siteId,
      requestId: req.context?.requestId,
    });
  });

  router.get('/health/ready', async (req, res) => {
    const result = await readiness.checkReady();
    res.status(result.ok ? 200 : 503).json({
      ok: result.ok,
      service: 'reqai-api',
      site: siteId,
      requestId: req.context?.requestId,
      checks: result.checks,
    });
  });
  router.get('/metrics', (req,res)=>res.type('text/plain; version=0.0.4').send(renderMetrics()));

  return router;
}
