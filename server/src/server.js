import { loadConfig } from './config/env.js';
import { installSignalHandlers, startRuntime } from './runtime/index.js';

const config = loadConfig();
const runtime = await startRuntime(config);
installSignalHandlers(runtime, config);
