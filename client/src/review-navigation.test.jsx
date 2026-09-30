// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ReviewSessionProvider } from './ReviewDraftProvider.jsx';
import { useReviewUiState } from './review-state.js';

afterEach(cleanup);
function Navigation() {
  const [section, setSection] = useReviewUiState('section', 'requirements');
  const [anchor, setAnchor] = useReviewUiState('anchor', null);
  return <><p>{section}</p><p>{anchor || 'no discussion'}</p><button onClick={() => { setSection('questions'); setAnchor('GAP-001'); }}>Уточнить</button></>;
}
function Session({ jobId = 'job-1', version }) {
  return <ReviewSessionProvider scope="alice" jobId={jobId} baseVersionId={version}><Navigation key={version} /></ReviewSessionProvider>;
}
test('saving remounts the editor without losing its question or discussion, and another task starts fresh', () => {
  const { rerender } = render(<Session version="base" />);
  fireEvent.click(screen.getByText('Уточнить'));
  rerender(<Session version="saved-v1" />);
  expect(screen.getByText('questions')).toBeInTheDocument();
  expect(screen.getByText('GAP-001')).toBeInTheDocument();
  rerender(<Session jobId="job-2" version="saved-v2" />);
  expect(screen.getByText('requirements')).toBeInTheDocument();
  expect(screen.getByText('no discussion')).toBeInTheDocument();
});
