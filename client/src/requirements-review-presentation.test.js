import { describe, expect, test } from 'vitest';
import { researchPresentation, reviewPrimary } from './requirements-review-presentation.js';
import { reviewStateFixture } from './requirements-review.fixture.js';

describe('stage-two actions use independent version and lifecycle state', () => {
  test.each(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED'])('%s blocks another run even for an older version', (status) => {
    const state = reviewStateFixture({ child: { status, inputArtifactId: 'old' } });
    const research = researchPresentation(state);
    expect(research).toMatchObject({ active: true, previous: true, current: false, openPrimary: true });
    expect(reviewPrimary({ ...state, research })).toBe('open');
    expect(research.status).toContain('предыдущей версии');
  });
  test('a child ID alone never claims processing or completion', () => {
    const research = researchPresentation(reviewStateFixture({ child: null }));
    expect(research).toMatchObject({ active: false, openPrimary: false, current: false });
    expect(research.status).toContain('недоступен');
  });
  test('completed research is primary only for its input version', () => {
    const current = reviewStateFixture();
    expect(reviewPrimary({ ...current, research: researchPresentation(current) })).toBe('open');
    const previous = { ...current, versionId: 'v2' };
    expect(reviewPrimary({ ...previous, research: researchPresentation(previous) })).toBe('final');
  });
  test.each(['FAILED', 'CANCELLED'])('%s does not imply successful results', (status) => {
    const state = reviewStateFixture({ child: { status, inputArtifactId: 'v1' } });
    const research = researchPresentation(state);
    expect(research.active).toBe(false);
    expect(research.openLabel).toBe('Открыть AI-исследование');
    expect(reviewPrimary({ ...state, research })).toBe('final');
  });
  test.each([{ dirty: true }, { saved: false }, { busy: true }])('saving takes priority over completed research: %j', (overrides) => {
    const state = reviewStateFixture(overrides);
    expect(reviewPrimary({ ...state, research: researchPresentation(state) })).toBe('save');
  });
  test('submission with no durable child has a single waiting action', () => {
    const state = reviewStateFixture({ childId: null, child: null, submitting: true, busy: true });
    expect(reviewPrimary({ ...state, research: researchPresentation(state) })).toBe('starting');
  });
});
