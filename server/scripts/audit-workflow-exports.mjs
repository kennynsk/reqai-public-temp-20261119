import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

// Read-only checks against a named synthetic task; never creates or alters a version.
const [jobId, outputDirectory] = process.argv.slice(2);
assert.match(jobId || '', /^[a-f0-9-]{36}$/u);
assert.ok(outputDirectory);
const base = process.env.REQAI_BASE_URL || 'http://localhost:5178';
async function json(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  return response.json();
}
const versions = await json(`/api/v1/jobs/${jobId}/requirements/versions`);
assert.ok(versions.items.length);
const version = await json(`/api/v1/requirements/versions/${versions.items[0].versionId}`);
await writeFile(`${outputDirectory}/export-version.json`, JSON.stringify(version, null, 2));
const registry = version.registry;
const records = Object.values(registry.groups).flat();
const evidence = { jobId, versionId: version.versionId, formats: {} };
for (const format of ['markdown', 'html', 'docx']) {
  const response = await fetch(`${base}/api/v1/requirements/versions/${version.versionId}/export?format=${format}`);
  assert.equal(response.status, 200, format);
  assert.match(response.headers.get('content-disposition'), /attachment/u);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.ok(buffer.length > 100);
  const extension = { markdown: 'md', html: 'html', docx: 'docx' }[format];
  await writeFile(`${outputDirectory}/requirements.${extension}`, buffer);
  const text = format === 'docx' ? await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string') : buffer.toString('utf8');
  const searchable = format === 'markdown' ? text.replaceAll('\\-', '-') : text;
  for (const record of records) assert.ok(searchable.includes(record.id), `${format} lost ${record.id}`);
  for (const gap of registry.analysis.GAP) assert.ok(searchable.includes(gap.id), `${format} lost ${gap.id}`);
  evidence.formats[format] = { bytes: buffer.length, requirements: records.length, gaps: registry.analysis.GAP.length };
}
await writeFile(`${outputDirectory}/exports-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
