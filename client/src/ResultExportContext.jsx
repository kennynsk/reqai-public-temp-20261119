import { cloneElement, useContext } from 'react';
import VersionExport from './VersionExport.jsx';
import { ResultExportContext } from './result-export-context.js';

export function ResultExportAction({ placement, triggerLabel, children } = {}) {
  const action = useContext(ResultExportContext);
  if (action) return cloneElement(action, { placement, triggerLabel, children });
  return children ? <VersionExport triggerLabel={triggerLabel}>{children}</VersionExport> : null;
}
