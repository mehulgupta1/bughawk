// Local login gate. Credentials live in IndexedDB; the password is stored only as
// a salted SHA-256 hash (never plaintext). This locks the UI — it is NOT real
// security (data is still in the browser), just an access gate as requested.
import { get, set, KEYS } from './storage.js';

const ENC = new TextEncoder();
const SESSION_FLAG = 'bbd:unlocked';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', ENC.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getAuth() {
  return get(KEYS.auth, null);
}
export async function isConfigured() {
  const a = await getAuth();
  return !!(a && a.hash);
}
export async function setCredentials(username, password) {
  const salt = randSalt();
  const hash = await sha256Hex(`${salt}:${password}`);
  await set(KEYS.auth, { username: (username || '').trim(), salt, hash });
}
export async function verify(username, password) {
  const a = await getAuth();
  if (!a || !a.hash) return false;
  if (a.username && a.username.toLowerCase() !== (username || '').trim().toLowerCase()) return false;
  const hash = await sha256Hex(`${a.salt}:${password}`);
  return hash === a.hash;
}

// session = unlocked until the tab is closed (survives refresh, not reopen)
export const isUnlocked = () => sessionStorage.getItem(SESSION_FLAG) === '1';
export const markUnlocked = () => sessionStorage.setItem(SESSION_FLAG, '1');
export const lock = () => sessionStorage.removeItem(SESSION_FLAG);
