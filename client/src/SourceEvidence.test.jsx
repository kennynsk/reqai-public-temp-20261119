// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { CoverageWarning, SourceEvidence, MaterialCoverage } from './SourceEvidence.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';
afterEach(cleanup);

test('renders named evidence and quotes without infrastructure identifiers', () => {
  const registry = roomBookingRegistry();
  const { container } = render(<SourceEvidence source={registry.groups.BR[0].source} materials={registry.materials} />);
  expect(screen.getByText('Бриф переговорных')).toBeInTheDocument();
  expect(container.textContent).toContain(registry.groups.BR[0].source.quote);
  expect(container.textContent).not.toContain(registry.materials.primary.artifactId);
});

test('keeps coverage warnings visible without exposing raw material enums', () => {
  const registry = roomBookingRegistry();
  const { container } = render(<MaterialCoverage materials={registry.materials} scope={{ partial: true }} />);
  expect(screen.getByRole('status')).toHaveTextContent('недоступные материалы');
  expect(container.textContent).not.toMatch(/AVAILABLE|NOT_PROVIDED|sha256/);
  expect(container.textContent).toContain('не подтверждает полноту');
});

test('handles absent evidence, technical names, locator aliases, and known material roles', () => {
  expect(render(<SourceEvidence />).container).toHaveTextContent('Источник не указан');
  cleanup();
  render(<SourceEvidence source={{ artifactId: 'base', locator: 'section:Безопасность' }} materials={{ baseline: { artifacts: [{ artifactId: 'base', role: 'baseline', name: 'artifactId-123' }] } }} />);
  expect(screen.getByText('Предыдущая версия')).toBeInTheDocument();
  expect(screen.getByText(/Раздел Безопасность/)).toBeInTheDocument();
  expect(screen.getByText('Дословная цитата не приведена.')).toBeInTheDocument();

  cleanup();
  render(<SourceEvidence source={{ artifactId: 'ref', locator: 'manual-research-review' }} materials={{ references: [{ artifactId: 'ref', role: 'reference', name: 'reference-artifactId' }] }} />);
  expect(screen.getByText('Справочный материал')).toBeInTheDocument();
  expect(screen.getByText(/AI-предложение после ручной проверки/)).toBeInTheDocument();

  cleanup();
  render(<SourceEvidence source={{ artifactId: 'primary', locator: 'research:insight-1', quote: 'Цитата' }} materials={{ primary: { artifactId: 'primary', name: 'sha256:abc' } }} />);
  expect(screen.getByText('Исходная бизнес-задача')).toBeInTheDocument();
  expect(screen.getByText(/AI-предложение/)).toBeInTheDocument();
  expect(screen.getByText('Цитата')).toBeInTheDocument();

  cleanup();
  const { container } = render(<SourceEvidence source={{ artifactId: 'primary', locator: 'artifactId-technical' }} materials={{ primary: { artifactId: 'primary', name: 'Бизнес-задача' } }} />);
  expect(container.textContent).not.toContain('artifactId-technical');
});

test('does not show a warning when all materials are available and labels unknown statuses safely', () => {
  const { container } = render(<CoverageWarning registry={{ materials: { primary: { status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED' }, references: [{ status: 'AVAILABLE' }] }, scope: { partial: false } }} />);
  expect(container).toBeEmptyDOMElement();
  cleanup();
  render(<MaterialCoverage materials={{ primary: { status: 'OTHER' }, baseline: { status: 'OTHER' } }} />);
  expect(screen.getByText('Основной материал: Статус неизвестен')).toBeInTheDocument();
  expect(screen.getByText('Предыдущая версия: Не предоставлена')).toBeInTheDocument();
});

test('shows a warning when the primary material is unavailable', () => {
  render(<CoverageWarning registry={{ materials: { primary: { status: 'UNAVAILABLE' } }, scope: {} }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Часть материалов недоступна');
});
