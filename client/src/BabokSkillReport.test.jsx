// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import BabokSkillReport from './BabokSkillReport.jsx';
import fixture from '../../server/test/fixtures/babok-requirements-v1.complete.json';

test('full skill report renders every section as headings and real tables', () => {
  render(<BabokSkillReport registry={fixture} />);
  const report = screen.getByRole('region', { name: 'Полный отчёт по скиллу BABOK' });
  expect(within(report).getAllByRole('heading', { level: 2 })).toHaveLength(12);
  expect(within(report).getAllByRole('table').length).toBeGreaterThanOrEqual(9);
  expect(within(report).getByRole('heading', { name: '11. Вопросы для уточнения' })).toBeTruthy();
  expect(within(report).getByText('Кто утверждает показатель успеха?', { exact: false }).textContent).toBeTruthy();
});
