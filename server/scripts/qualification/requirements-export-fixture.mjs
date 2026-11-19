import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requirementsDocument, documentHtml } from '../../src/services/requirements-document.js';
import { documentDocx } from '../../src/services/requirements-docx.js';

const outputDir = resolve(process.argv[2] || 'tmp/requirements-export-qa');
const fixtureUrl = new URL('../../test/fixtures/babok-requirements-v1.complete.json', import.meta.url);
const registry = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const longCyrillic = 'Длинное кириллическое требование должно переноситься между строками и страницами без обрезки. '.repeat(120);
registry.groups.FR.push({
  ...registry.groups.FR[0],
  id: 'FR-099',
  text: longCyrillic,
  relatedTo: ['BR-001'],
});
registry.summary.counts.FR = registry.groups.FR.length;
const version = {
  versionId: 'qa-export-version',
  createdAt: '2026-08-31T20:00:00Z',
  registry,
  decisions: {
    review: {
      schemaVersion: 1,
      acknowledgment: { recordedAt: '2026-08-31T20:00:00Z', stale: false },
      gaps: { 'GAP-001': { state: 'answered', answer: 'Открытый GAP сохраняется в экспортируемой версии.' } },
      citationChecks: {
        unsafe: { source: { title: 'Опасная ссылка', url: 'javascript:alert(1)' }, checked: false, note: 'Не должна становиться активной.' },
      },
    },
  },
};
const model = requirementsDocument(version, 'Проверка экспорта требований: длинные таблицы, кириллица и открытые вопросы');

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, 'requirements-export-qa.docx'), await documentDocx(model)),
  writeFile(resolve(outputDir, 'requirements-export-qa.html'), documentHtml(model), 'utf8'),
]);
console.log(outputDir);
