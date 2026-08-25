const PURPOSE_BY_BUNDLE = Object.freeze({
  'requirements-decomposition': ['DECOMPOSITION'],
  'requirements-insights': ['REQUIREMENTS_INSIGHTS'],
});

export function qualifyPromptCatalog({ catalog, policy }) {
  const qualified = [];
  for (const [id, release] of Object.entries(policy)) {
    for (const version of release.released) {
      const bundle = catalog.get(id, version);
      for (const purpose of PURPOSE_BY_BUNDLE[id] || []) {
        if (!bundle.workflowPurposes.includes(purpose)) throw new Error(`${id}@${version} does not support ${purpose}`);
      }
      qualified.push({ id, version, active: version === release.active, manifestHash: bundle.manifestHash, outputSchemaVersion: bundle.outputSchemaVersion });
    }
  }
  return qualified;
}
