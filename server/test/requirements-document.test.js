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
  assert.match(xml, /w:bottom="1800"/);
  assert.match(xml, /w:pStyle w:val="Heading1"/);
  assert.match(styles, /w:line="300"/);
  assert.ok(!xml.includes('private-version-uuid'));
});

test('new documents omit manual completeness status while historical checks and omissions remain exportable', () => {
  const current = requirementsDocument(version);
  assert.ok(!current.blocks.some((block) => /ручн.*свер|Проверка полноты/.test(block.text)));
  const review = {
    completeness: { checked: true, stale: true, recordedAt: '2026-08-28T09:00:00Z', note: 'Проверили условия возврата.' },
    omissions: [{ id: 'OMISSION-history', text: 'Не указан срок возврата', requirementIds: ['FR-002'] }],
  };
  const historical = { ...version, decisions: { review } };
  const snapshot = structuredClone(historical);
  const text = requirementsDocument(historical).blocks.map((block) => block.text).join('\n');
  assert.match(text, /История ручной сверки/);
  assert.match(text, /Отметка устарела после изменений/);
  assert.match(text, /Проверили условия возврата/);
  assert.match(text, /Не указан срок возврата.*FR-002/);
  assert.deepEqual(historical, snapshot);
  const unchecked = requirementsDocument({ ...version, decisions: { review: { completeness: { checked: false, stale: false } } } });
  assert.ok(!unchecked.blocks.some((block) => /ручн.*свер|Проверка полноты/.test(block.text)));
});
