import type { Film } from './types';

const DB_NAME = 'frameprint-local-db';
const DB_VERSION = 1;
const STORE_NAME = 'library_state';
const RECORD_KEY = 'saved_archive';
const OPT_IN_KEY = 'frameprint.save_enabled.v1';

export interface SavedLibraryPayload {
  films: Film[];
  watchlistCount: number;
  warnings: string[];
  fileNames: string[];
  savedAt: string;
}

let memoryFallback: SavedLibraryPayload | null = null;
let memoryOptIn = false;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function isSaveEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(OPT_IN_KEY) === 'true';
    }
    return memoryOptIn;
  } catch {
    return memoryOptIn;
  }
}

export function setSaveEnabled(enabled: boolean): void {
  memoryOptIn = enabled;
  try {
    if (typeof localStorage !== 'undefined') {
      if (enabled) localStorage.setItem(OPT_IN_KEY, 'true');
      else localStorage.removeItem(OPT_IN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function saveLibraryToDevice(payload: SavedLibraryPayload): Promise<boolean> {
  memoryFallback = payload;
  const db = await openDb();
  if (!db) return true;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(payload, RECORD_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function loadLibraryFromDevice(): Promise<SavedLibraryPayload | null> {
  const db = await openDb();
  if (!db) return memoryFallback;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => {
        db.close();
        const res = req.result as SavedLibraryPayload | undefined;
        resolve(res && Array.isArray(res.films) ? res : memoryFallback);
      };
      req.onerror = () => { db.close(); resolve(memoryFallback); };
    } catch {
      db.close();
      resolve(memoryFallback);
    }
  });
}

export async function clearLibraryFromDevice(): Promise<void> {
  memoryFallback = null;
  setSaveEnabled(false);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('frameprint.meta.v1');
    }
  } catch {
    // Ignore
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch {
      db.close();
      resolve();
    }
  });
}
