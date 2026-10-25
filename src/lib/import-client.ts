import type { ImportResult } from './types';

// Keep decompression and CSV parsing off the UI thread. Termination also bounds
// the time spent processing a hostile archive with misleading size headers.
export function importInWorker(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Import took too long. Try an individual CSV or a smaller export.')); }, 30000);
    worker.onmessage = event => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => { cleanup(); reject(new Error('Could not process this file. Try a fresh Letterboxd export.')); };
    worker.postMessage(file);
  });
}
