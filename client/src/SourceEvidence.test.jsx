// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { SourceEvidence, MaterialCoverage } from './SourceEvidence.jsx';
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
