import { memo } from 'react';
import { statusGroup, statusLabel } from '../../lib/status.js';

function StatusBadge({ status }) {
  const group = statusGroup(status);
  return <span className={`badge badge-${group}`}>{statusLabel(status)}</span>;
}

export default memo(StatusBadge);
