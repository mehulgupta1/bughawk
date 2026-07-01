// Shared status-group helpers used by badges, chips, spectrum and stats.
import { UNKNOWN } from './parser.js';

export const STATUS_GROUPS = ['2xx', '3xx', '4xx', '5xx', 'other'];

export const STATUS_COLORS = {
  '2xx': 'var(--status-2xx)',
  '3xx': 'var(--status-3xx)',
  '4xx': 'var(--status-4xx)',
  '5xx': 'var(--status-5xx)',
  other: 'var(--status-other)',
};

export const STATUS_LABELS = {
  '2xx': '2xx',
  '3xx': '3xx',
  '4xx': '4xx',
  '5xx': '5xx',
  other: 'other',
};

export function statusGroup(status) {
  if (status === UNKNOWN || status == null) return 'other';
  const n = Number(status);
  if (n >= 200 && n < 300) return '2xx';
  if (n >= 300 && n < 400) return '3xx';
  if (n >= 400 && n < 500) return '4xx';
  if (n >= 500 && n < 600) return '5xx';
  return 'other';
}

export function statusLabel(status) {
  return status === UNKNOWN || status == null ? '—' : String(status);
}
