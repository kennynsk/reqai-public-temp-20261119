import { loadConfig, redactedConfig } from '../src/config/env.js';

const config = loadConfig();
process.stdout.write(`${JSON.stringify(redactedConfig(config), null, 2)}\n`);
