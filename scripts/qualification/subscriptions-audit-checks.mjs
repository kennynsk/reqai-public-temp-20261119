import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';
import { acceptGapClarification, reconcileDiscussionReceipts } from '../../client/src/gap-clarification.js';
import { rebaseReview } from '../../client/src/review-state.js';
import { renderBabokReport } from '../../server/src/services/babok-report-renderer.js';
import { gapStatus, remainingQuestions as currentRemainingQuestions } from '../../server/src/services/gap-review-state.js';

// Read-only verification of the named synthetic audit artifacts. No API writes.
const dir = process.argv[2];
assert.ok(dir, 'Pass the subscriptions audit directory');
const read = async (file) => JSON.parse(await readFile(`${dir}/${file}`, 'utf8'));
const direct = await read('export-version.json');
const final = await read('research-final/export-version.json');
const records = Object.values(final.registry.groups).flat();
assert.equal(records.length, 11);
assert.equal(new Set(records.map((record) => record.id)).size, records.length);
assert.match(final.registry.groups.BR[0].successIndicator, /750[\s\S]*1000[\s\S]*CRM/u);
assert.match(records.find((record) => record.id === 'FR-001').text, /в мобильном приложении[\s\S]*перечень[\s\S]*получателя/u);
assert.match(records.find((record) => record.id === 'FR-002').text, /push/u);
assert.match(records.find((record) => record.id === 'FR-004').text, /не изменяет категории других операций автоматически/u);
assert.match(records.find((record) => record.id === 'FR-006').text, /не выполняет отмену подписки у поставщика/u);
assert.deepEqual(final.decisions.acceptedEnhancementKeys, ['insight-1:0']);
assert.ok(final.decisions.rejectedEnhancementKeys.length);
assert.equal(final.decisions.review.gaps['GAP-006'].state, 'closed');
assert.equal(final.decisions.review.gaps['GAP-003'].state, 'answered');
assert.equal(direct.versionId, final.baseVersionId);
assert.equal(direct.decisions.skippedResearch, true);
const expected = records.find((record) => record.id === 'FR-001').text;
for (const format of ['md', 'html', 'docx']) {
  const data = await readFile(`${dir}/research-final/requirements.${format}`);
  const raw = format === 'docx' ? await (await JSZip.loadAsync(data)).file('word/document.xml').async('string') : data.toString('utf8');
  const text = format === 'md' ? raw.replace(/\\([\p{P}\p{S}])/gu, '$1') : raw;
  assert.ok(text.includes(expected), `${format} lost the exact final wording`);
  assert.ok(text.includes('GAP-006') && text.includes('Закрыт'), `${format} lost the closure decision`);
  assert.ok(text.includes('CRM') && text.includes('750'), `${format} lost the metric`);
}

// Verify the previously failing rebase without modifying product records.
const versions = await read('versions.json');
const noChange = (await read('gap005.json')).proposal;
assert.ok(noChange);
const base = versions.items.find((item) => item.versionId === noChange.baseVersionId);
assert.ok(base);
const next = direct;
let decisions = acceptGapClarification(base.decisions, noChange.clarification);
const { gapId, answer, canResolve, remainingQuestions, checks } = noChange.clarification;
decisions = { ...decisions, review: { ...decisions.review, discussionProposals: { ...decisions.review.discussionProposals, [noChange.proposalId]: {
  proposalId: noChange.proposalId, decision: 'accepted', baseVersionId: noChange.baseVersionId, changes: [], baseHash: noChange.baseHash,
  gapBases: noChange.gapBases, clarification: { gapId, answer, canResolve, remainingQuestions, checks },
} } } };
const rebased = rebaseReview({ content: base.registry, decisions, drafts: {}, editor: 'requirements' }, base.registry, next.registry, base.decisions, next.decisions);
const reconciled = reconcileDiscussionReceipts(rebased.state.decisions, rebased.state.content);
assert.equal(rebased.transferredProposalCount, 1);
assert.equal(reconciled.review.discussionProposals[noChange.proposalId], undefined);
const normalizedReview = normalizeReviewMetadata({ supplied: reconciled.review, inherited: next.decisions.review, content: rebased.state.content, allowedGaps: next.registry.analysis.GAP, baseContent: next.registry, baseVersionId: next.versionId, actorId: 'development-user', now: new Date() });
assert.equal(normalizedReview.gaps['GAP-005'].state, 'answered');
assert.equal(normalizedReview.gapRequirements['GAP-005']['FR-004'].state, 'pending');
assert.equal(normalizedReview.gaps['GAP-006'].state, 'closed');
const evidence = { invariants: 'passed', requirements: records.length, exports: ['markdown', 'html', 'docx'], rebase: 'passed: edits and answers retained; old AI confirmation requires review; fresh remote closure retained', finalVersionId: final.versionId };
const latestDir = process.argv[3];
if (latestDir) {
  const latest = JSON.parse(await readFile(`${latestDir}/export-version.json`, 'utf8'));
  const review = latest.decisions.review;
  assert.equal(review.gaps['GAP-005'].state, 'closed');
  assert.equal(review.gaps['GAP-003'].state, 'answered');
  assert.equal(currentRemainingQuestions(review, 'GAP-003').length, 4);
  const report = renderBabokReport(latest.registry, { review });
  assert.match(report, /GAP-005[\s\S]*Закрыт/u);
  assert.ok(report.includes(review.gaps['GAP-005'].answer));
  for (const question of currentRemainingQuestions(review, 'GAP-003')) assert.ok(report.includes(question));
  await writeFile(`${latestDir}/full-report.md`, report);
  for (const format of ['md', 'html', 'docx']) {
    const data = await readFile(`${latestDir}/requirements.${format}`);
    const raw = format === 'docx' ? await (await JSZip.loadAsync(data)).file('word/document.xml').async('string') : data.toString('utf8');
    const text = format === 'md' ? raw.replace(/\\([\p{P}\p{S}])/gu, '$1') : raw;
    for (const gap of latest.registry.analysis.GAP) assert.ok(text.includes(`${gap.id} · ${gapStatus(review, gap.id)}`), `${format} lost current state for ${gap.id}`);
    assert.ok(text.includes(review.gaps['GAP-005'].answer), `${format} lost the transferred answer`);
    for (const question of currentRemainingQuestions(review, 'GAP-003')) assert.ok(text.includes(question), `${format} lost a remaining question`);
    for (const record of Object.values(latest.registry.groups).flat()) assert.ok(text.includes(record.text), `${format} lost the exact wording of ${record.id}`);
  }
  evidence.latest = { versionId: latest.versionId, statusAgreement: 'passed: editor metadata, full report and all three exports', closedGap: 'GAP-005', partialGap: 'GAP-003', remainingQuestions: 4 };
  await writeFile(`${latestDir}/invariants-evidence.json`, JSON.stringify(evidence.latest, null, 2));
}
await writeFile(`${dir}/invariants-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
