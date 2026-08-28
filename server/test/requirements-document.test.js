import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { requirementsDocument, documentMarkdown, documentHtml } from '../src/services/requirements-document.js';
import { documentDocx } from '../src/services/requirements-docx.js';

const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url)));
const version = { versionId: 'private-version-uuid', createdAt: '2026-08-28T12:00:00Z', registry, decisions: { review: { schemaVersion: 1, acknowledgment: { recordedAt: '2026-08-28T12:00:00Z', stale: false }, gaps: { 'GAP-001': { state: 'answered', answer: 'Ответ не закрывает GAP' } } } } };
test('one version document includes all six types, structured fields, evidence and open questions without diagnostics', () => {
  const model = requirementsDocument(version, 'Переговорные');
  const text = documentMarkdown(model);
  for (const type of ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON']) assert.ok(text.includes(`${type}\\-001`));
  assert.match(text, /Критерий успеха/);
  assert.match(text, /Ответ не закрывает GAP/);
  assert.match(text, /Пользователь подтвердил сохранение открытых вопросов/);
  for (const internal of ['primary-artifact', 'private-version-uuid', 'schemaVersion', 'COMPLETE', 'sha256']) assert.ok(!text.includes(internal));
  assert.equal(model.versionId, version.versionId);
});
test('HTML and Markdown escape executable markup and legacy documents remain readable', () => {
  const legacy = { versionId: 'version', createdAt: version.createdAt, requirements: { business: [{ id: 'BT-1', text: '<img src=x onerror=alert(1)> [link](javascript:alert(1))' }], functional: [], nonfunctional: [] } };
  const model = requirementsDocument(legacy, '<script>bad</script>');
  const html = documentHtml(model);
  assert.ok(!html.includes('<script>bad'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /@media print/);
  assert.ok(!documentMarkdown(model).includes('[link](javascript:'));
});
test('DOCX contains long Cyrillic text, real headings and explicit page geometry', async () => {
  const model = requirementsDocument(version);
  const longText = 'Длинное требование с кириллицей и переносами. '.repeat(250);
  model.blocks.push({ kind: 'paragraph', text: longText });
  const zip = await JSZip.loadAsync(await documentDocx(model));
  const xml = await zip.file('word/document.xml').async('string');
  const styles = await zip.file('word/styles.xml').async('string');
  assert.ok(xml.includes(longText));
  assert.match(xml, /w:w="12240"/);
  assert.match(xml, /w:left="1440"/);
  assert.match(xml, /w:pStyle w:val="Heading1"/);
  assert.match(styles, /w:line="300"/);
  assert.ok(!xml.includes('private-version-uuid'));
});
