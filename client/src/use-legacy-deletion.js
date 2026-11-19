import { useState } from 'react';
import { rebaseReview } from './review-state.js';

const fields = ['relatedIds', 'relatedTo', 'affectedIds'];
export function useLegacyDeletion(review) {
  const [pending, setPending] = useState(null);
  const [last, setLast] = useState(null);
  return {
    pending, last,
    ask(type, id) { setPending({ type, id, affected: Object.values(review.content).flat().filter((record) => fields.some((key) => record[key]?.includes(id))).map((record) => record.id) }); },
    dismiss() { setPending(null); },
    confirm() {
      const before = review.content;
      const after = Object.fromEntries(Object.entries(before).map(([type, records]) => [type, records.filter((record) => record.id !== pending.id).map((record) => {
        const next = { ...record };
        for (const key of fields) if (Array.isArray(next[key])) next[key] = next[key].filter((id) => id !== pending.id);
        return next;
      })]));
      setLast({ id: pending.id, before, after });
      review.setContent(after); review.clear(`${pending.type}:${pending.id}`); setPending(null);
    },
    undo() {
      const restored = rebaseReview(review.state, last.after, last.before, review.state.decisions, review.state.decisions);
      review.dispatch({ type: 'restore', value: restored.state }); setLast(null);
    },
  };
}
