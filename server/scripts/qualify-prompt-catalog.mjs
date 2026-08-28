import { loadConfig } from '../src/config/env.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { qualifyPromptCatalog } from '../src/prompts/prompt-qualification.js';
import { createBabokSkillBundleLoader, defaultBabokSkillBundleRoot, qualifyBabokSkillBundle } from '../src/skills/babok-skill-bundle.js';

const config = loadConfig();
const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot(), maxRenderedBytes: config.prompts.maxRenderedBytes });
const skill = qualifyBabokSkillBundle({ loader: createBabokSkillBundleLoader({ rootDir: defaultBabokSkillBundleRoot() }), policy: config.skills.babokRequirements });
process.stdout.write(`${JSON.stringify({ qualified: qualifyPromptCatalog({ catalog, policy: config.prompts.policy }), skills: [skill] }, null, 2)}\n`);
