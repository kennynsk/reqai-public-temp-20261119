import { logEvent } from '../middleware/safe-logging.js';
import { startApiRuntime } from './api-runtime.js';
import { startWorkerRuntime } from './worker-runtime.js';

export async function startRuntime(config, { apiRunner = startApiRuntime, workerRunner = startWorkerRuntime } = {}) {
  if (config.process.role === 'api') return apiRunner(config);
  return workerRunner(config);
}

export function shutdownGraceMs(config) {
  return config.process.role === 'api'
    ? config.process.apiShutdownGraceMs
    : config.process.workerShutdownGraceMs;
}

export function installSignalHandlers(runtime, config, { exit = (code) => process.exit(code) } = {}) {
  let stopping = false;
  const handle = async (signal) => {
    if (stopping) return;
    stopping = true;
    const graceMs = shutdownGraceMs(config);
    logEvent('info', 'runtime.shutdown.started', { role: runtime.role, signal, graceMs });

    let timer;
    try {
      await Promise.race([
        runtime.stop(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('graceful shutdown timed out')), graceMs);
        }),
      ]);
      clearTimeout(timer);
      logEvent('info', 'runtime.shutdown.completed', { role: runtime.role, signal });
      exit(0);
    } catch (error) {
      clearTimeout(timer);
      runtime.forceStop?.();
      logEvent('error', 'runtime.shutdown.failed', {
        role: runtime.role,
        signal,
        errorType: error?.name || 'Error',
      });
      exit(1);
    }
  };

  process.once('SIGTERM', handle);
  process.once('SIGINT', handle);
  return () => {
    process.off('SIGTERM', handle);
    process.off('SIGINT', handle);
  };
}
