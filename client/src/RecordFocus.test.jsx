// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import RecordFocus from './RecordFocus.jsx';

afterEach(cleanup);

test('opens parent details, scrolls to, and focuses the requested record', () => {
  const target = document.createElement('div');
  target.id = 'record-FR-1';
  target.tabIndex = -1;
  target.scrollIntoView = () => {};
  const details = document.createElement('details');
  details.append(target);
  document.body.append(details);

  render(<RecordFocus id="FR-1" />);
  expect(details).toHaveAttribute('open');
  expect(target).toHaveFocus();
  details.remove();
});

test('does nothing when there is no focus target', () => {
  render(<RecordFocus />);
  render(<RecordFocus id="missing" />);
});
