import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalSha256, sha256 } from '../prompts/prompt-utils.js';

const BUNDLE_ID = 'babok-requirements-v3';
const OUTPUT_SCHEMA_VERSION = 'babok-requirements.v1';
const VERSION = /^[1-9]\d*\.[0-9]+\.[0-9]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_VARIABLES = Object.freeze(['BUSINESS_CONTEXT', 'SOURCE_MATERIAL', 'BASELINE_MATERIAL', 'REFERENCE_MATERIALS']);
const REQUIRED_MATERIAL_ROLES = Object.freeze(['primary', 'baseline', 'reference']);
const REQUIRED_REFERENCES = Object.freeze([
  'references/classification.md',
  'references/requirements-quality.md',
  'references/output-template.md',
]);

function fail(message, type = 'BABOK_SKILL_BUNDLE_INVALID') {
  throw Object.assign(new Error(message), { type });
}

function safeBundlePath(bundleDir, filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\\')) fail('BABOK skill file path is invalid');
  const path = resolve(bundleDir, filePath);
  const scope = `${resolve(bundleDir)}${sep}`;
  if (!path.startsWith(scope) || relative(bundleDir, path).startsWith('..')) fail('BABOK skill file path traversal is forbidden');
  return path;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) fail(`${label} must be an array of non-empty strings`);
  if (new Set(value).size !== value.length) fail(`${label} must not contain duplicates`);
  return value;
}

function equalSet(actual, expected, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) fail(`${label} does not match the released BABOK contract`);
}

function readManifest(bundleDir) {
  const manifestPath = join(bundleDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    fail(`Cannot read BABOK skill manifest ${manifestPath}`);
  }
  if (!manifest || typeof manifest !== 'object' || manifest.id !== BUNDLE_ID || !VERSION.test(manifest.version || '')) {
    fail('BABOK skill manifest identity is invalid');
  }
  if (manifest.release !== OUTPUT_SCHEMA_VERSION) fail(`BABOK skill ${manifest.id}@${manifest.version} must release ${OUTPUT_SCHEMA_VERSION}`);
  if (manifest.entrypoint !== 'SKILL.md' || manifest.metadata !== 'agents/openai.yaml') fail('BABOK skill entrypoint metadata is invalid');
  if (typeof manifest.applicationAdapter !== 'string' || !manifest.applicationAdapter) fail('BABOK skill application adapter is missing');
  if (!manifest.output || manifest.output.schemaVersion !== OUTPUT_SCHEMA_VERSION || manifest.output.format !== 'json') {
    fail('BABOK skill output contract is invalid');
  }

  const requiredReferences = stringArray(manifest.requiredReferences, 'requiredReferences');
  const optionalReferences = stringArray(manifest.optionalReferences, 'optionalReferences');
  if (optionalReferences.some((reference) => requiredReferences.includes(reference))) fail('BABOK required and optional references overlap');
  for (const reference of REQUIRED_REFERENCES) {
    if (!requiredReferences.includes(reference)) fail(`BABOK skill is missing required reference ${reference}`);
  }

  const qualification = manifest.qualification;
  if (!qualification || typeof qualification !== 'object') fail('BABOK skill qualification metadata is missing');
  const requiredVariables = stringArray(qualification.requiredVariables, 'qualification.requiredVariables');
  const requiredMaterialRoles = stringArray(qualification.requiredMaterialRoles, 'qualification.requiredMaterialRoles');
  equalSet(requiredVariables, REQUIRED_VARIABLES, 'qualification.requiredVariables');
  equalSet(requiredMaterialRoles, REQUIRED_MATERIAL_ROLES, 'qualification.requiredMaterialRoles');
  if (qualification.releasePolicy !== 'qualified-canary') fail('BABOK skill release policy must be qualified-canary');

  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) fail('BABOK skill file inventory is missing');
  const files = {};
  for (const [filePath, expectedHash] of Object.entries(manifest.files)) {
    if (!SHA256.test(expectedHash)) fail(`BABOK skill file hash is invalid for ${filePath}`);
    const path = safeBundlePath(bundleDir, filePath);
    let text;
    try {
      if (!statSync(path).isFile()) fail(`BABOK skill file is not a regular file: ${filePath}`);
      text = readFileSync(path, 'utf8');
    } catch (error) {
      if (error?.type === 'BABOK_SKILL_BUNDLE_INVALID') throw error;
      fail(`BABOK skill file is missing: ${filePath}`);
    }
    const actualHash = sha256(text);
    if (actualHash !== expectedHash) fail(`BABOK skill file hash mismatch for ${filePath}`, 'BABOK_SKILL_INTEGRITY_ERROR');
    files[filePath] = Object.freeze({ path, sha256: actualHash, text });
  }
  for (const filePath of [manifest.entrypoint, manifest.metadata, ...requiredReferences, ...optionalReferences]) {
    if (!files[filePath]) fail(`BABOK skill manifest does not inventory ${filePath}`);
  }

  return Object.freeze({
    ...manifest,
    requiredReferences: Object.freeze([...requiredReferences]),
    optionalReferences: Object.freeze([...optionalReferences]),
    qualification: Object.freeze({ ...qualification, requiredVariables: Object.freeze([...requiredVariables]), requiredMaterialRoles: Object.freeze([...requiredMaterialRoles]) }),
    files: Object.freeze(files),
    manifestHash: canonicalSha256(manifest),
    read(filePath) {
      const file = files[filePath];
      if (!file) fail(`BABOK skill file ${filePath} is not part of the released bundle`);
      return file.text;
    },
  });
}

export function createBabokSkillBundleLoader({ rootDir = defaultBabokSkillBundleRoot() } = {}) {
  if (!rootDir || !statSync(rootDir).isDirectory()) fail('BABOK skill bundle root is not a directory');
  const bundles = new Map();
  for (const version of readdirSync(rootDir)) {
    const bundleDir = join(rootDir, version);
    if (!statSync(bundleDir).isDirectory()) continue;
    const bundle = readManifest(bundleDir);
    if (bundle.version !== version) fail(`BABOK skill bundle directory does not match manifest ${bundle.id}@${bundle.version}`);
    const identity = `${bundle.id}@${bundle.version}`;
    if (bundles.has(identity)) fail(`Duplicate BABOK skill bundle ${identity}`);
    bundles.set(identity, bundle);
  }
  if (!bundles.size) fail('No BABOK skill bundles are installed');

  return Object.freeze({
    inventory: () => [...bundles.values()].map((bundle) => ({ id: bundle.id, version: bundle.version, release: bundle.release, manifestHash: bundle.manifestHash })),
    get(version) {
      const bundle = bundles.get(`${BUNDLE_ID}@${version}`);
      if (!bundle) fail(`BABOK skill bundle ${BUNDLE_ID}@${version} is unavailable`, 'BABOK_SKILL_BUNDLE_UNAVAILABLE');
      return bundle;
    },
  });
}

export function qualifyBabokSkillBundle({ loader, policy }) {
  if (!loader || typeof loader.get !== 'function') fail('BABOK skill bundle loader is required');
  if (!policy || typeof policy !== 'object' || !VERSION.test(policy.active || '') || !Array.isArray(policy.released) || !policy.released.length) {
    fail('BABOK skill release policy is invalid');
  }
  if (!policy.released.includes(policy.active)) fail('BABOK skill active version must be released');
  const released = policy.released.map((version) => {
    if (!VERSION.test(version)) fail('BABOK skill released versions must use semantic versioning');
    const bundle = loader.get(version);
    if (bundle.release !== OUTPUT_SCHEMA_VERSION) fail(`BABOK skill ${version} has an unsupported output schema`);
    return { id: bundle.id, version: bundle.version, release: bundle.release, manifestHash: bundle.manifestHash };
  });
  const active = loader.get(policy.active);
  return Object.freeze({
    id: active.id,
    version: active.version,
    release: active.release,
    manifestHash: active.manifestHash,
    released: Object.freeze(released),
  });
}

export function defaultBabokSkillBundleRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../skill-bundles/babok-requirements-v3');
}

export const babokSkillContract = Object.freeze({
  id: BUNDLE_ID,
  outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
  requiredVariables: REQUIRED_VARIABLES,
  requiredMaterialRoles: REQUIRED_MATERIAL_ROLES,
});
