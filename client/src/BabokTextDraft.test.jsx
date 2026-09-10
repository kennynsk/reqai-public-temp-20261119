// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import BabokTextDraft from './BabokTextDraft.jsx';
import { createBabokTextDraft, presentBabokTextResponse } from '../../server/src/services/babok-text-draft.js';
afterEach(cleanup);
test('shows an invalid registry as a readable draft with a download action', () => {
  const raw = JSON.stringify({ groups: { SR: [{ id: 'SR-001', text: 'Клиент открывает вклад', provenance: 'Источник' }] } });
  const draft = createBabokTextDraft([raw]);
  render(<BabokTextDraft value={draft} />);
  expect(screen.getByRole('heading', { name: 'Аналитический черновик' })).toBeTruthy();
  expect(screen.getByText(/Клиент открывает вклад/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Скачать черновик (.md)' })).toBeTruthy();
  expect(draft.responses[0]).toBe(raw);
});
test('plain skill output is retained even when there is no JSON', () => {
  const text = '## Требования\n\nКлиент открывает вклад.';
  expect(presentBabokTextResponse(text)).toBe(text);
  expect(() => createBabokTextDraft([' '])).toThrow();
});
