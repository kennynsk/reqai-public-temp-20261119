import { useEffect } from 'react';

export default function RecordFocus({ id }) {
  useEffect(() => {
    if (!id) return;
    const target = document.getElementById(`record-${id}`);
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    target?.scrollIntoView?.({ block: 'center' });
    target?.focus();
  }, [id]);
  return null;
}
