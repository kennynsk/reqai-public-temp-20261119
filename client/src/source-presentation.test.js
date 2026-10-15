import { expect, test } from 'vitest';
import { presentSource } from './source-presentation.js';

test('shows the business context instead of internal chunk identifiers', () => {
  const source = { artifactId: 'primary-id', locator: 'chunk-1', quote: 'Цель банка' };
  expect(presentSource(source, { primary: { artifactId: 'primary-id', name: 'Primary source' } })).toEqual({ label: 'Исходная бизнес-задача', locator: '', quote: 'Цель банка' });
  expect(source.locator).toBe('chunk-1');
});
test('keeps real filenames and translates genuine document locations', () => {
  expect(presentSource({ artifactId: 'file', locator: 'page:12' }, { references: [{ artifactId: 'file', name: 'Условия сервиса.pdf' }] })).toMatchObject({ label: 'Условия сервиса.pdf', locator: 'Страница 12' });
  expect(presentSource({ artifactId: 'base', locator: 'unit_4' }, { baseline: [{ artifactId: 'base', name: 'Baseline' }] })).toMatchObject({ label: 'Предыдущая версия', locator: '' });
});
test('identifies user clarification and accepted proposals by their actual origin', () => {
  expect(presentSource({ artifactId: 'primary', locator: 'discussion:GAP-007' }, { primary: { artifactId: 'primary', name: 'Бриф' } })).toMatchObject({ label: 'Ответ на уточнение GAP-007', locator: '' });
  expect(presentSource({ artifactId: 'review-decision:insight:0', locator: 'Принятие точной формулировки пользователем' })).toMatchObject({ label: 'Принятое AI-предложение', locator: '' });
});
test('does not invent a document or location for unmatched sources', () => {
  expect(presentSource({ artifactId: 'missing', locator: 'chunk-2' })).toMatchObject({ label: 'Источник требований', locator: '' });
  expect(presentSource(null)).toBeNull();
});
