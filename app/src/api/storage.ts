/**
 * Browser persistence adapter. In production this layer is replaced by the REST API
 * (see docs/04-architecture.md); the rest of the app talks only to `hub.ts`.
 */
import type { User, Workspace } from '../domain/types';

const DB_NAME = 'dairyhub';
const DB_VER = 1;
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('ws')) d.createObjectStore('ws');
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const wsStore = {
  get: (id: string) => tx<Workspace | undefined>('ws', 'readonly', (s) => s.get(id)),
  put: (ws: Workspace) => tx<IDBValidKey>('ws', 'readwrite', (s) => s.put(ws, ws.id)),
  del: (id: string) => tx<undefined>('ws', 'readwrite', (s) => s.delete(id)),
};
export const photoStore = {
  get: (id: string) => tx<string | undefined>('photos', 'readonly', (s) => s.get(id)),
  put: (id: string, dataUrl: string) => tx<IDBValidKey>('photos', 'readwrite', (s) => s.put(dataUrl, id)),
};

// ---- users & session (small, synchronous) ----
const USERS_KEY = 'dh:users:v1';
const SESSION_KEY = 'dh:session:v1';

function safeGet(st: Storage, k: string): string | null {
  try { return st.getItem(k); } catch { return null; }
}
function safeSet(st: Storage, k: string, v: string) {
  try { st.setItem(k, v); } catch { /* storage unavailable */ }
}
function safeDel(st: Storage, k: string) {
  try { st.removeItem(k); } catch { /* noop */ }
}

export function loadUsers(): User[] {
  try { return JSON.parse(safeGet(localStorage, USERS_KEY) ?? '[]'); } catch { return []; }
}
export function saveUsers(users: User[]) {
  safeSet(localStorage, USERS_KEY, JSON.stringify(users));
}

export interface Session {
  userId: string;
  exp: number;
  remember: boolean;
  impersonatedBy?: string;
}
export function loadSession(): Session | null {
  const raw = safeGet(localStorage, SESSION_KEY) ?? safeGet(sessionStorage, SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (s.exp < Date.now()) { clearSession(); return null; }
    return s;
  } catch { return null; }
}
export function saveSession(s: Session) {
  clearSession();
  safeSet(s.remember ? localStorage : sessionStorage, SESSION_KEY, JSON.stringify(s));
}
export function clearSession() {
  safeDel(localStorage, SESSION_KEY);
  safeDel(sessionStorage, SESSION_KEY);
}

/** Downscale a captured photo to keep storage small (max 960 px, JPEG 0.72). */
export async function compressImage(file: File, max = 960): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // watermark: time stamp like real field-force apps
    const stamp = new Date().toLocaleString('ru-RU');
    ctx.font = `${Math.max(12, Math.round(c.width / 40))}px -apple-system, sans-serif`;
    const w = ctx.measureText(stamp).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(c.width - w - 8, c.height - 34, w, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(stamp, c.width - w, c.height - 16);
    return c.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}
