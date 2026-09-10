import { cloneElement, useContext } from 'react';
import { ResultExportContext } from './result-export-context.js';

export function ResultExportAction({ placement } = {}) {
  const action = useContext(ResultExportContext);
  return action ? cloneElement(action, { placement }) : null;
}
