import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseModelJson } from '../src/domain/model-json.js';

test('one complete object may have plain trailing prose without incorporating it into facts', () => {
  assert.deepEqual(parseModelJson('{"goal":"Привлечь клиентов"}\nМетаданные модели: недостоверный текст.'), { goal: 'Привлечь клиентов' });
  assert.deepEqual(parseModelJson('```json\n{"text":"Скобки { внутри строки }"}\n```'), { text: 'Скобки { внутри строки }' });
});
test('only missing closing delimiters are recoverable; content is never guessed', () => {
  assert.deepEqual(parseModelJson('{"items":[{"text":"Готовое значение"}'), { items: [{ text: 'Готовое значение' }] });
  for (const body of ['{"text":"unfinished', '{"text":', '{"text":true,', '{"text"]', '{"text":"one"} {"text":"two"}', '{"text":"one"}\nFinal answer {"text":"two"}', '{"text":"one"}\n[1,2]']) assert.throws(() => parseModelJson(body));
});
test('both format failures from the real fast run decode without another paid model call', () => {
  const captured = JSON.parse(readFileSync(new URL('./fixtures/model-json-live-errors.json', import.meta.url)));
  for (const response of captured.responses) {
    const registry = parseModelJson(response);
    assert.equal(registry.schemaVersion, 'babok-requirements.v1');
    assert.ok(registry.groups.BR.length);
    assert.equal(JSON.stringify(registry).includes('OpenRouter'), false);
  }
});
