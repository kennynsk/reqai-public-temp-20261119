import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiError } from '../errors/api-error.js';
import { canonicalSha256, sha256 } from './prompt-utils.js';
import { getOutputContract, hasOutputContract } from './output-contract-registry.js';

const ID = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION = /^[1-9]\d*\.[0-9]+\.[0-9]+$/;
const PURPOSES = new Set(['DECOMPOSITION', 'REQUIREMENTS_INSIGHTS']);
const PLACEHOLDER = /{{([A-Za-z][A-Za-z0-9]*)}}/g;

function fail(message, type = 'PROMPT_CATALOG_INVALID') {
  throw Object.assign(new Error(message), { type });
}

function safeTemplatePath(bundleDir, templatePath) {
  if (typeof templatePath !== 'string' || !templatePath || templatePath.includes('\\')) fail('Prompt template path is invalid');
  const path = resolve(bundleDir, templatePath);
  const scope = `${resolve(bundleDir)}${sep}`;
  if (!path.startsWith(scope) || relative(bundleDir, path).startsWith('..')) fail('Prompt template path traversal is forbidden');
  return path;
}

function validateManifest(manifest, bundleDir) {
  if (!manifest || typeof manifest !== 'object' || !ID.test(manifest.id || '') || !VERSION.test(manifest.version || '')) fail('Prompt manifest identity is invalid');
  if (!Array.isArray(manifest.workflowPurposes) || !manifest.workflowPurposes.length || manifest.workflowPurposes.some((purpose) => !PURPOSES.has(purpose))) fail(`Bundle ${manifest.id}@${manifest.version} has unsupported workflow purposes`);
  if (!hasOutputContract(manifest.outputSchemaVersion)) fail(`Bundle ${manifest.id}@${manifest.version} references unsupported output contract`);
  if (!manifest.templates || typeof manifest.templates !== 'object' || Array.isArray(manifest.templates) || !Object.keys(manifest.templates).length) fail(`Bundle ${manifest.id}@${manifest.version} has no templates`);
  if (manifest.semanticPolicy !== undefined && !['babok-semantic.v1', 'babok-semantic.v2'].includes(manifest.semanticPolicy)) fail('Unsupported semantic validation policy');
  if (manifest.semanticPolicy && !manifest.templates['semantic-audit']) fail('Semantic validation requires its audit template');
  const maxBudgetMs = manifest.workflowPurposes.includes('REQUIREMENTS_INSIGHTS') ? 900_000 : 240_000;
  if (manifest.requiredResearchCategories !== undefined && (manifest.id !== 'requirements-insights' || JSON.stringify([...manifest.requiredResearchCategories].sort()) !== JSON.stringify(['competitors', 'patterns', 'risks', 'standards', 'trends']))) fail('Research coverage must contain all five directions exactly once');
  if (manifest.semanticPolicy === 'babok-semantic.v2' && (!manifest.templates['semantic-repair'] || !Number.isInteger(manifest.performanceBudgetMs) || manifest.performanceBudgetMs < 60_000 || manifest.performanceBudgetMs > maxBudgetMs)) fail('Compact semantic validation requires targeted repair and a workflow-specific execution budget');
  const templates = {};
  for (const [step, declaration] of Object.entries(manifest.templates)) {
    if (!ID.test(step) || !declaration || typeof declaration !== 'object') fail(`Bundle ${manifest.id}@${manifest.version} has an invalid step`);
    if (!Array.isArray(declaration.requiredVariables) || new Set(declaration.requiredVariables).size !== declaration.requiredVariables.length) fail(`Step ${step} has invalid variables`);
    const path = safeTemplatePath(bundleDir, declaration.path);
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { fail(`Template for step ${step} is missing`); }
    const actualHash = sha256(text);
    if (declaration.sha256 !== actualHash) fail(`Template hash mismatch for ${manifest.id}@${manifest.version}:${step}`, 'PROMPT_INTEGRITY_ERROR');
    const placeholders = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
    const actualVariables = [...new Set(placeholders)].sort();
    const requiredVariables = [...declaration.requiredVariables].sort();
    if (JSON.stringify(actualVariables) !== JSON.stringify(requiredVariables)) fail(`Declared variables do not match template ${step}`);
    templates[step] = Object.freeze({ ...declaration, path, text });
  }
  return Object.freeze({
    ...manifest,
    workflowPurposes: Object.freeze([...manifest.workflowPurposes]),
    templates: Object.freeze(templates),
    manifestHash: canonicalSha256(manifest),
  });
}

export function createPromptCatalog({ rootDir, maxRenderedBytes = 2 * 1024 * 1024 } = {}) {
  if (!rootDir) throw new Error('Prompt catalog rootDir is required');
  const bundles = new Map();
  if (!statSync(rootDir).isDirectory()) fail('Prompt catalog root is not a directory');
  for (const id of readdirSync(rootDir)) {
    const idDir = join(rootDir, id);
    if (!statSync(idDir).isDirectory()) continue;
    for (const version of readdirSync(idDir)) {
      const bundleDir = join(idDir, version);
      if (!statSync(bundleDir).isDirectory()) continue;
      const manifestPath = join(bundleDir, 'manifest.json');
      let manifest;
      try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { fail(`Cannot read prompt manifest ${manifestPath}`); }
      const bundle = validateManifest(manifest, bundleDir);
      const identity = `${bundle.id}@${bundle.version}`;
      if (bundles.has(identity)) fail(`Duplicate prompt bundle ${identity}`);
      if (bundle.id !== id || bundle.version !== version) fail(`Prompt bundle directory does not match manifest ${identity}`);
      bundles.set(identity, bundle);
    }
  }

  return Object.freeze({
    inventory: () => [...bundles.values()].map((bundle) => ({ id: bundle.id, version: bundle.version, workflowPurposes: bundle.workflowPurposes, outputSchemaVersion: bundle.outputSchemaVersion, manifestHash: bundle.manifestHash })),
    get(id, version) {
      const bundle = bundles.get(`${id}@${version}`);
      if (!bundle) throw new ApiError({ status: 409, code: 'PROMPT_BUNDLE_UNAVAILABLE', message: `Prompt bundle ${id}@${version} is unavailable` });
      return bundle;
    },
    render(profile, step, variables) {
      const bundle = this.get(profile.id, profile.version);
      if (bundle.manifestHash !== profile.manifestHash || bundle.outputSchemaVersion !== profile.outputSchemaVersion) fail('Snapshotted prompt manifest does not match catalog', 'PROMPT_INTEGRITY_ERROR');
      const template = bundle.templates[step];
      const snapshotTemplate = profile.templates?.[step];
      if (!template || !snapshotTemplate || snapshotTemplate.sha256 !== template.sha256) fail(`Snapshotted prompt step ${step} is unavailable or altered`, 'PROMPT_INTEGRITY_ERROR');
      const supplied = Object.keys(variables || {}).sort();
      const required = [...template.requiredVariables].sort();
      if (JSON.stringify(supplied) !== JSON.stringify(required)) fail(`Prompt variables for ${step} must exactly match the manifest`, 'PROMPT_RENDER_ERROR');
      const rendered = template.text.replace(PLACEHOLDER, (_, name) => String(variables[name]));
      if (Buffer.byteLength(rendered, 'utf8') > maxRenderedBytes) fail(`Rendered prompt ${step} exceeds size limit`, 'PROMPT_RENDER_TOO_LARGE');
      return { text: rendered, outputContract: getOutputContract(bundle.outputSchemaVersion), metadata: { id: bundle.id, version: bundle.version, step, manifestHash: bundle.manifestHash, templateHash: template.sha256, outputSchemaVersion: bundle.outputSchemaVersion } };
    },
  });
}

export function defaultPromptBundleRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../prompt-bundles');
}
