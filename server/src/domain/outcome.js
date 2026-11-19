export function evaluateOutcome({ successfulUnits, failedUnits, textDraft = false }) {
  if (!Number.isInteger(successfulUnits) || successfulUnits < 0 || !Number.isInteger(failedUnits) || failedUnits < 0) throw new TypeError('Outcome counts must be non-negative integers');
  if (successfulUnits === 0) return { status: 'FAILED', outcome: null, reasonCode: 'NO_USABLE_OUTPUT' };
  if (textDraft) return { status: 'SUCCEEDED', outcome: 'PARTIAL', reasonCode: 'PARTIAL_RESULT' };
  return { status: 'SUCCEEDED', outcome: failedUnits > 0 ? 'PARTIAL' : 'COMPLETE', reasonCode: failedUnits > 0 ? 'PARTIAL_RESULT' : null };
}
