import { loadConfig } from '../src/config/env.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { qualifyPromptCatalog } from '../src/prompts/prompt-qualification.js';

const config = loadConfig();
const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot(), maxRenderedBytes: config.prompts.maxRenderedBytes });
process.stdout.write(`${JSON.stringify({ qualified: qualifyPromptCatalog({ catalog, policy: config.prompts.policy }) }, null, 2)}\n`);
