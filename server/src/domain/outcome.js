export function evaluateOutcome({ successfulUnits, failedUnits }) {
  if (!Number.isInteger(successfulUnits) || successfulUnits < 0 || !Number.isInteger(failedUnits) || failedUnits < 0) throw new TypeError('Outcome counts must be non-negative integers');
  if (successfulUnits === 0) return { status: 'FAILED', outcome: null, reasonCode: 'NO_USABLE_OUTPUT' };
  return { status: 'SUCCEEDED', outcome: failedUnits > 0 ? 'PARTIAL' : 'COMPLETE', reasonCode: failedUnits > 0 ? 'PARTIAL_RESULT' : null };
}
