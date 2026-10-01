// Shared by the editor, report, exports and closure validation. A receipt only
// describes the current answer if it is still active and that answer matches.
export function currentGapClarification(review, gapId) {
  return Object.values(review.discussionProposals || {}).filter((receipt) => receipt.decision === 'accepted' && !receipt.superseded && !receipt.discarded && receipt.clarification?.gapId === gapId && receipt.clarification.answer === review.gaps?.[gapId]?.answer).at(-1)?.clarification;
}

export function gapStatus(review, id) {
  return ({ closed: 'Закрыт', answered: 'Дан ответ · ещё открыт' })[review.gaps?.[id]?.state] || 'Открыт';
}

export function remainingQuestions(review, id) {
  return review.gaps?.[id]?.state === 'closed' ? [] : currentGapClarification(review, id)?.remainingQuestions || [];
}
