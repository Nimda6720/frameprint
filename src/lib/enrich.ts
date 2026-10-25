import type { DiscoveryItem, EnrichResult, Film, FilmMeta, MediaType } from './types';

const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const hasApi = Boolean(base);
export function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function enrichBatch(films: Film[], signal?: AbortSignal): Promise<EnrichResult[]> {
  if (!base) throw new Error('Movie details are temporarily unavailable. Your imported statistics still work.');
  let pending = films;
  const complete = new Map<string, EnrichResult>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${base}/api/enrich`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(300000)]),
      body: JSON.stringify({ films: pending.map(({ key, title, year }) => ({ key, title, year })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 429) {
      if (!Array.isArray(data.items) && res.ok) throw new Error('Unexpected response from metadata service.');
      const requested = new Set(pending.map(f => f.key));
      for (const item of data.items || []) if (requested.has(item.key)) complete.set(item.key, item);
      pending = films.filter(f => !complete.has(f.key));
      if (res.ok) {
        for (const film of pending) complete.set(film.key, { key: film.key, metadata: null, retryable: true });
        return [...complete.values()];
      }
      if (!pending.length) return [...complete.values()];
      if (attempt < 2) {
        const seconds = Number(res.headers.get('Retry-After') || 60);
        await waitFor((Number.isFinite(seconds) ? Math.max(1, Math.min(120, seconds)) : 60) * 1000, signal);
        continue;
      }
      for (const film of pending) complete.set(film.key, { key: film.key, metadata: null, retryable: true });
      return [...complete.values()];
    }
    throw new Error(data.error || `Metadata request failed (${res.status}).`);
  }
  return [...complete.values()];
}

export async function fetchTrending(
  type: 'all' | 'movie' | 'tv' = 'all',
  window: 'day' | 'week' = 'week',
  signal?: AbortSignal,
): Promise<DiscoveryItem[]> {
  if (!base) return [];
  const params = new URLSearchParams({ type, window });
  const res = await fetch(`${base}/api/discover?${params}`, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Discovery request failed (${res.status}).`);
  return Array.isArray(data.items) ? data.items : [];
}

export async function searchTmdb(
  query: string,
  type: 'multi' | 'movie' | 'tv' = 'multi',
  signal?: AbortSignal,
): Promise<DiscoveryItem[]> {
  const q = query.trim();
  if (!base || !q) return [];
  const params = new URLSearchParams({ q, type });
  const res = await fetch(`${base}/api/search?${params}`, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Search request failed (${res.status}).`);
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchMediaDetails(
  mediaType: MediaType,
  id: number,
  signal?: AbortSignal,
): Promise<FilmMeta | null> {
  if (!base) return null;
  const params = new URLSearchParams({ type: mediaType, id: String(id) });
  const res = await fetch(`${base}/api/details?${params}`, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Details request failed (${res.status}).`);
  return data.metadata || null;
}
