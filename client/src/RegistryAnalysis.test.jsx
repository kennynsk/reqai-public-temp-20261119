// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import RegistryAnalysis, { RecordLinks } from './RegistryAnalysis.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';

afterEach(cleanup);

test('navigates traceability links and renders an empty-links explanation', () => {
  const registry = roomBookingRegistry();
  const onNavigate = vi.fn();
  registry.analysis.traceability = [{ from: 'BR-001', to: 'FR-001', relation: 'Поддерживает', status: 'Полная' }];
  render(<RegistryAnalysis registry={registry} section="links" onNavigate={onNavigate} readOnly />);
  expect(screen.queryByText('Приложения: контекст, материалы и анализ')).not.toBeInTheDocument();

  const link = screen.getByRole('link', { name: 'BR-001' });
  expect(link).toHaveAttribute('href', '#record-BR-001');
  fireEvent.click(link);
  expect(onNavigate).toHaveBeenCalledWith('BR-001');
  expect(screen.getByText('Поддерживает')).toBeInTheDocument();

  cleanup();
  registry.analysis.traceability = [];
  render(<RegistryAnalysis registry={registry} section="links" onNavigate={onNavigate} readOnly />);
  expect(screen.getByText('Отдельная схема связей не сформирована. Связанные записи доступны на карточках требований.')).toBeInTheDocument();
});

test('groups traceability links by source requirement', () => {
  const registry = roomBookingRegistry();
  registry.analysis.traceability = [
    { from: 'BR-001', to: 'FR-001', relation: 'Поддерживает', status: 'Полная' },
    { from: 'BR-001', to: 'FR-002', relation: 'Реализует', status: 'Предполагается' },
    { from: 'SR-001', to: 'FR-001', relation: 'Проверяет', status: 'Полная' },
  ];
  render(<RegistryAnalysis registry={registry} section="links" onNavigate={vi.fn()} readOnly />);

  const businessGroup = screen.getByRole('article', { name: 'Связи от BR-001' });
  expect(within(businessGroup).getAllByRole('link', { name: 'BR-001' })).toHaveLength(1);
  expect(within(businessGroup).getByRole('link', { name: 'FR-001' })).toBeInTheDocument();
  expect(within(businessGroup).getByRole('link', { name: 'FR-002' })).toBeInTheDocument();
  expect(within(businessGroup).getByText('2 связи')).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Связи от SR-001' })).toBeInTheDocument();
});

test('renders questions section with read-only answers and sources', () => {
  const registry = roomBookingRegistry();
  registry.analysis.GAP = [{ ...registry.analysis.GAP[0], source: registry.groups.BR[0].source }];
  render(<RegistryAnalysis registry={registry} section="questions" onNavigate={vi.fn()} readOnly />);

  expect(screen.getByRole('heading', { name: /Вопросы для уточнения · 1/ })).toBeInTheDocument();
  expect(screen.getByText('GAP-001 · Канал уведомлений')).toBeInTheDocument();
  expect(screen.getByText('Как определить: Канал уведомлений?')).toBeInTheDocument();
  expect(screen.getByText('Бриф переговорных')).toBeInTheDocument();
});

test('shows conclusions, material coverage and fallback text for analysis records', () => {
  const registry = roomBookingRegistry();
  const source = registry.groups.BR[0].source;
  registry.summary.conclusions = ['Нужно уточнить владельца процесса.'];
  registry.context = [{ id: 'CTX-1', text: 'Бизнес-контекст', relatedIds: ['BR-001'], source }];
  registry.analysis.HYP = [{ id: 'HYP-1', comment: 'Гипотеза о роли администратора', affectedIds: ['FR-001'] }];
  registry.analysis.TERM = [
    { id: 'TERM-1', term: 'SLA', meaning: 'Срок реакции', relatedIds: ['NFR-001'] },
    { id: 'TERM-2', term: 'Логирование' },
  ];
  registry.analysis.delta = [{ id: 'DELTA-1', baselineId: 'BR-001', newId: 'FR-001', text: 'Добавлено функциональное требование.' }];
  registry.materials.references = [{ artifactId: 'reference-1', role: 'reference', name: 'Справочник', status: 'AVAILABLE' }];

  render(<RegistryAnalysis registry={registry} section="report" onNavigate={vi.fn()} readOnly />);

  expect(screen.getByText('Нужно уточнить владельца процесса.')).toBeInTheDocument();
  expect(screen.getByText('Бизнес-контекст')).toBeInTheDocument();
  expect(screen.getByText('Гипотеза о роли администратора')).toBeInTheDocument();
  expect(screen.getByText('SLA: Срок реакции')).toBeInTheDocument();
  expect(screen.getByText('Логирование: Требует уточнения')).toBeInTheDocument();
  expect(screen.getByText('Добавлено функциональное требование.')).toBeInTheDocument();
  expect(screen.getByText('Материалы и охват')).toBeInTheDocument();

  cleanup();
  render(<RecordLinks ids={['BR-001']} />);
  const plainLink = screen.getByRole('link', { name: 'BR-001' });
  expect(plainLink).toHaveAttribute('href', '#record-BR-001');
  fireEvent.click(plainLink);
});

test('baseline identifiers are displayed without linking to unrelated current records', () => {
  const registry = roomBookingRegistry();
  registry.analysis.delta = [{ id: 'DELTA-001', baselineId: 'FR-999', newId: 'FR-001', kind: 'изменено', comment: 'Изменён состав данных.' }];
  render(<RegistryAnalysis registry={registry} section="report" readOnly />);
  fireEvent.click(screen.getByText('Приложения: контекст, материалы и анализ'));
  fireEvent.click(screen.getByText('Сравнение с базовым набором · 1'));
  expect(screen.getByText('В базовом наборе: FR-999')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'FR-999' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'FR-001' })).toHaveAttribute('href', '#record-FR-001');
});
