// Only unfinished, explicitly requested work is kept locally; never store auth codes here.
export const PENDING_KEY = 'studio_pending_signup_v1';
export const PENDING_TTL = 60 * 60 * 1000;
const ROUTES = new Set(['/listing-upgrade/', '/free-copy/', '/studio/']);
export function safeReturnPath(value) {
  try {
    const url = new URL(value, 'https://dressupsesh.studio');
    if (url.origin !== 'https://dressupsesh.studio' || !ROUTES.has(url.pathname)) return '/studio/';
    const result = new URL(url.pathname, url.origin);
    for (const key of ['draft', 'source', 'ref']) {
      const v = url.searchParams.get(key);
      if (v && /^[a-zA-Z0-9_-]{1,100}$/.test(v)) result.searchParams.set(key, v);
    }
    return result.pathname + result.search;
  } catch { return '/studio/'; }
}
export function readPending(storage, now = Date.now()) {
  try {
    storage ||= globalThis.localStorage;
    const p = JSON.parse(storage.getItem(PENDING_KEY));
    if (!p || !/^[a-f0-9-]{36}$/i.test(p.id) || !Number.isFinite(p.expires) || p.expires <= now || p.expires > now + PENDING_TTL || safeReturnPath(p.path) !== p.path) return null;
    return p;
  } catch { return null; }
}
function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('studio-signup', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('pending', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('This browser could not keep your selected photos. Keep this page open, sign in, then choose the photos again if needed.'));
  });
}
async function transaction(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('pending', mode);
      let result;
      operation(tx.objectStore('pending'), value => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('Your browser could not keep this item. Keep this page open while signing in.'));
    });
  } finally { db.close(); }
}
export async function savePending(payload, path = location.pathname + location.search) {
  const p = { id: crypto.randomUUID(), path: safeReturnPath(path), expires: Date.now() + PENDING_TTL };
  await transaction('readwrite', store => { store.clear(); store.put({ ...p, payload }); });
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  catch { await transaction('readwrite', store => store.clear()); throw new Error('Keep this page open while signing in. Your browser cannot restore this item in another tab.'); }
  return p;
}
export async function takePending() {
  const p = readPending();
  if (!p || safeReturnPath(location.pathname + location.search).split('?')[0] !== p.path.split('?')[0]) return null;
  // Taking and deleting in one transaction prevents two email tabs from running the item twice.
  const record = await transaction('readwrite', (store, set) => {
    const req = store.get(p.id);
    req.onsuccess = () => { const value = req.result; store.delete(p.id); set(value?.expires > Date.now() ? value : null); };
  });
  try { if (readPending()?.id === p.id) localStorage.removeItem(PENDING_KEY); } catch {}
  return record?.payload || null;
}
export async function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
  await transaction('readwrite', store => store.clear()).catch(() => {});
}
export async function expirePending() {
  if (!readPending()) await clearPending();
}
export function emailReturnURL() {
  // The root callback is already allowed by the deployed email-auth configuration.
  return 'https://dressupsesh.studio/';
}
