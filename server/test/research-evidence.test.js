import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCitationUrl, normalizeCitations } from '../src/domain/research-evidence.js';
import { normalizeReviewMetadata } from '../src/services/review-metadata.js';
import { normalizeProposalMetadata } from '../src/services/proposal-metadata.js';

test('citations are passive data, never trust model verification, and reject execution-capable URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,a', '//example.com', 'https://user:password@example.com', 'https://example.com/\n']) assert.equal(safeCitationUrl(url), null);
  assert.equal(safeCitationUrl('https://example.com/article'), 'https://example.com/article');
  assert.deepEqual(normalizeCitations([{ title: '<script>x</script>', url: 'javascript:x', verified: true }]), [{ title: '<script>x</script>', url: 'javascript:x', publishedAt: null }]);
});
test('source checks use authoritative citations and authenticated actor/time', () => {
  const input = { content: { business: [], functional: [], nonfunctional: [] }, now: new Date('2026-08-28'), actorId: 'reviewer', researchJobId: 'research', researchResult: { insights: [{ id: 'i1', citations: [{ title: 'Источник', url: 'https://example.com/' }] }] } };
  const reviewed = normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, citationChecks: { 'i1:0': { checked: true, note: 'Проверена применимость', actorUserId: 'forged' } } } });
  assert.equal(reviewed.citationChecks['i1:0'].actorUserId, 'reviewer');
  assert.equal(reviewed.citationChecks['i1:0'].source.url, 'https://example.com/');
  assert.deepEqual(normalizeReviewMetadata({ ...input, inherited: reviewed }).citationChecks, reviewed.citationChecks);
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, citationChecks: { 'foreign:0': { checked: true } } } }), { code: 'INVALID_REVIEW_METADATA' });
});
test('proposal validation rejects foreign keys, forged originals and stale replacement targets', () => {
  const before = { id: 'FR-001', text: 'Старая логика' };
  const after = { ...before, text: 'Новая логика', researchEnhancementKey: 'i1:0' };
  const proposal = { operation: 'replace', decision: 'accepted', targetType: 'FR', targetId: before.id, before, after, originalText: 'Исходное предложение' };
  const input = { content: { groups: { FR: [after] } }, baseContent: { groups: { FR: [before] } }, researchResult: { insights: [{ id: 'i1', enhancements: [{ text: proposal.originalText }] }] }, stamp: { actorUserId: 'reviewer' } };
  const normalize = (value, key = 'i1:0') => normalizeProposalMetadata({ ...input, supplied: { [key]: value } });
  assert.equal(normalize(proposal)['i1:0'].actorUserId, 'reviewer');
  assert.throws(() => normalize(proposal, 'foreign:0'), { code: 'INVALID_REVIEW_METADATA' });
  assert.throws(() => normalize({ ...proposal, originalText: 'Подмена' }), { code: 'INVALID_REVIEW_METADATA' });
  assert.throws(() => normalize({ ...proposal, before: { ...before, text: 'Устаревшая логика' } }), { code: 'INVALID_REVIEW_METADATA' });
});
