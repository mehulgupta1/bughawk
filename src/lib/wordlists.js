// Wordlist library helpers — global store (KEYS.wordlists), reused by the
// Wordlists tab and the URL Parser "Send to Wordlists" pipeline.
import { get, set, KEYS } from './storage.js';

// Trim / drop blanks / optional dedup + sort. The cleaning applied on every save.
export function cleanLines(text, { dedup = true, sort = false, trim = true } = {}) {
  let lines = (text || '').split('\n');
  if (trim) lines = lines.map((l) => l.trim());
  lines = lines.filter(Boolean);
  if (dedup) lines = [...new Set(lines)];
  if (sort) lines.sort((a, b) => a.localeCompare(b));
  return lines.join('\n');
}

export async function loadWordlists() {
  const w = await get(KEYS.wordlists, []);
  return Array.isArray(w) ? w : [];
}
export async function saveWordlists(list) {
  await set(KEYS.wordlists, list);
  return list;
}

// Add (or merge into an existing same-name+category) a wordlist. Returns the
// full updated array. Cleans content per opts; merge = union of lines.
export async function addWordlist({ name, category, content }, opts = {}) {
  const lists = await loadWordlists();
  const cleaned = cleanLines(content, opts);
  const cat = (category || '').trim() || 'Uncategorized';
  const meta = (c) => ({ content: c, lines: c ? c.split('\n').filter(Boolean).length : 0, preview: c.split('\n').slice(0, 6).join('\n') });
  const idx = lists.findIndex((l) => l.name === name && (l.category || 'Uncategorized') === cat);
  if (idx >= 0) {
    lists[idx] = { ...lists[idx], ...meta(cleanLines(`${lists[idx].content}\n${cleaned}`, opts)) };
  } else {
    lists.push({ id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, category: cat, ...meta(cleaned) });
  }
  await saveWordlists(lists);
  return lists;
}

// Stats across all lists: unique entries overall, and how many appear in >1 list.
export function crossListStats(lists) {
  const seen = new Map();
  for (const l of lists) {
    for (const e of new Set(l.content.split('\n').filter(Boolean))) seen.set(e, (seen.get(e) || 0) + 1);
  }
  let shared = 0;
  for (const c of seen.values()) if (c > 1) shared++;
  return { uniqueEntries: seen.size, sharedEntries: shared };
}

// Which lists match a target's detected tech (substring match either way).
export function suggestForTech(lists, techHints = []) {
  const hints = techHints.map((t) => String(t).toLowerCase()).filter(Boolean);
  if (hints.length === 0) return [];
  return lists.filter((l) => {
    const hay = `${l.name} ${l.category || ''}`.toLowerCase();
    return hints.some((h) => hay.includes(h) || h.includes((l.category || '').toLowerCase()));
  });
}
