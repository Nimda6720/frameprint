// Frameprint API: narrowly scoped TMDB metadata enrichment and discovery gateway, not an open proxy.
const API = 'https://api.themoviedb.org/3';
const MAX_BATCH = 24;
const ENRICH_CONCURRENCY = 6;
const CACHE_SECONDS = 14 * 24 * 60 * 60;
const NEGATIVE_CACHE_SECONDS = 24 * 60 * 60;
const DISCOVER_CACHE_SECONDS = 60 * 60;

const GENRE_NAMES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

const normalize = (s) => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();
const yearOf = (str) => { const y = Number(String(str || '').slice(0,4)); return y >= 1870 && y <= 2100 ? y : null; };

export function selectMatch(results, title, year) {
  const target = normalize(title);
  if (!target) return null;
  const matches = (results || []).map(movie => {
    const candidateYear = yearOf(movie.release_date || movie.first_air_date);
    const names = [movie.title, movie.original_title, movie.name, movie.original_name].filter(Boolean).map(normalize);
    const exact = names.includes(target);
    const titleSimilarity = exact ? 100 : names.some(n => n.includes(target) || target.includes(n)) ? 55 : 0;
    const yearDistance = year ? (candidateYear ? Math.abs(year - candidateYear) : Infinity) : 0;
    const score = titleSimilarity + (year ? (yearDistance === 0 ? 28 : yearDistance === 1 ? 8 : -60) : 5);
    return { movie, score, exact, yearDistance };
  }).sort((a,b) => b.score - a.score);
  if (!matches.length || !matches[0].exact || matches[0].score < (year ? 80 : 100)) return null;
  // When there is no known release year, avoid selecting ambiguous identical titles.
  if (matches.length > 1 && matches[1].score === matches[0].score) return null;
  return matches[0].movie;
}

const people = arr => (arr || []).map(p => ({ id: p.id, name: p.name, profile: p.profile_path || null }));
const uniquePeople = arr => people((arr || []).filter((p, i, a) => p && p.name && a.findIndex(other => other.id === p.id) === i));

export function shapeMetadata(movie, mediaType = 'movie') {
  const crew = movie.credits?.crew || [];
  const byJob = (filter) => uniquePeople(crew.filter(filter));
  const creators = Array.isArray(movie.created_by) ? uniquePeople(movie.created_by) : [];
  const directors = byJob(p => p.job === 'Director' || p.job === 'Series Director');
  const runtimeVal = Number.isFinite(movie.runtime) && movie.runtime > 0
    ? movie.runtime
    : (Array.isArray(movie.episode_run_time) && Number.isFinite(movie.episode_run_time[0]) && movie.episode_run_time[0] > 0 ? movie.episode_run_time[0] : null);
  const shaped = {
    id: movie.id,
    title: movie.title || movie.name || 'Untitled',
    year: yearOf(movie.release_date || movie.first_air_date),
    poster: movie.poster_path || null,
    backdrop: movie.backdrop_path || null,
    overview: movie.overview || '',
    runtime: runtimeVal,
    genres: (movie.genres || []).map(g => g.name),
    countries: (movie.production_countries || []).map(c => c.name),
    language: movie.original_language || null,
    cast: uniquePeople((movie.credits?.cast || []).sort((a,b) => (a.order ?? 999) - (b.order ?? 999)).slice(0,20)),
    directors: directors.length ? directors : creators,
    writers: byJob(p => ['Writer','Screenplay','Story','Co-Writer','Author','Teleplay','Series Composition'].includes(p.job)),
    cinematographers: byJob(p => p.job === 'Director of Photography'),
    composers: byJob(p => p.job === 'Original Music Composer' || p.job === 'Music'),
    tmdbRating: typeof movie.vote_average === 'number' ? movie.vote_average : null,
  };
  if (mediaType === 'tv' || movie.first_air_date || movie.number_of_seasons) {
    shaped.mediaType = 'tv';
    if (Number.isFinite(movie.number_of_seasons)) shaped.seasons = movie.number_of_seasons;
    if (Number.isFinite(movie.number_of_episodes)) shaped.episodes = movie.number_of_episodes;
  }
  return shaped;
}

export function shapeDiscoveryItem(item, fallbackType = 'movie') {
  const mediaType = item.media_type === 'tv' || fallbackType === 'tv' ? 'tv' : 'movie';
  const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  return {
    id: item.id,
    mediaType,
    title: item.title || item.name || 'Untitled',
    year: yearOf(item.release_date || item.first_air_date),
    poster: item.poster_path || null,
    backdrop: item.backdrop_path || null,
    overview: item.overview || '',
    tmdbRating: typeof item.vote_average === 'number' && item.vote_average > 0 ? Number(item.vote_average.toFixed(1)) : null,
    voteCount: typeof item.vote_count === 'number' ? item.vote_count : 0,
    genres: genreIds.map(id => GENRE_NAMES[id]).filter(Boolean),
    language: item.original_language || null,
  };
}

function response(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff', ...cors } });
}
function corsHeaders(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Vary':'Origin', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Max-Age':'3600' };
}
async function tmdb(path, token) {
  const result = await fetch(`${API}${path}`, { headers: { Authorization:`Bearer ${token}`, Accept:'application/json' }, signal: AbortSignal.timeout(12000) });
  if (result.status === 429) throw new Error('TMDB_RATE_LIMIT');
  if (!result.ok) throw new Error(`TMDB_${result.status}`);
  return result.json();
}

async function lookupFilm({ key, title, year }, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`https://frameprint-cache.internal/v2/${encodeURIComponent(title.normalize('NFKC').toLowerCase().trim())}/${year ?? 'unknown'}`);
  const cached = await cache.match(cacheKey);
  if (cached) return { ...await cached.json(), key };
  const params = new URLSearchParams({ query: title, include_adult: 'false', language: 'en-US' });
  if (year) params.set('year', String(year));
  let search = await tmdb(`/search/movie?${params}`, env.TMDB_READ_TOKEN);
  let match = !year && search.total_pages > 1 ? null : selectMatch(search.results, title, year);
  // Some non-US or festival releases differ by one year; retry without the strict year query.
  if (!match && year) {
    params.delete('year');
    search = await tmdb(`/search/movie?${params}`, env.TMDB_READ_TOKEN);
    match = selectMatch(search.results, title, year);
  }
  let result;
  if (!match) result = { metadata: null, reason: 'No confident TMDB match; title left unmatched.' };
  else {
    const details = await tmdb(`/movie/${match.id}?append_to_response=credits&language=en-US`, env.TMDB_READ_TOKEN);
    result = { metadata: shapeMetadata(details) };
  }
  const ttl = match ? CACHE_SECONDS : NEGATIVE_CACHE_SECONDS;
  ctx.waitUntil?.(cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'Cache-Control': `public, max-age=${ttl}` } })));
  return { ...result, key };
}

async function checkRateLimit(request, env, headers) {
  if (!env.API_RATE_LIMITER) return response({error:'Metadata service rate limiter is not configured.'},503,headers);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.API_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return new Response(JSON.stringify({ error:'Rate limit reached. Try again in a minute.' }), {
      status:429,
      headers: { 'Content-Type':'application/json', 'Retry-After':'60', ...headers },
    });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/health' && request.method === 'GET') return response({ status: 'ok', configured: Boolean(env.TMDB_READ_TOKEN) });
    if (!['/api/enrich', '/api/discover', '/api/search', '/api/details'].includes(path)) return response({ error: 'Not found' },404);
    const origin = request.headers.get('Origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return response({ error: 'Origin not allowed' }, 403);
    const headers = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});

    if (path === '/api/discover') {
      if (request.method !== 'GET') return response({error:'Method not allowed'},405,headers);
      if (!env.TMDB_READ_TOKEN) return response({error:'TMDB_READ_TOKEN is not configured on the Worker.'},503,headers);
      const type = url.searchParams.get('type') || 'all';
      const window = url.searchParams.get('window') || 'week';
      if (!['all', 'movie', 'tv'].includes(type) || !['day', 'week'].includes(window)) {
        return response({error:'Invalid discover parameters.'},400,headers);
      }
      const limited = await checkRateLimit(request, env, headers);
      if (limited) return limited;
      const cache = caches?.default;
      const cacheKey = new Request(`https://frameprint-cache.internal/v2/discover/${type}/${window}`);
      const cached = await cache?.match(cacheKey);
      if (cached) return response(await cached.json(), 200, headers);
      try {
        const data = await tmdb(`/trending/${type}/${window}?language=en-US`, env.TMDB_READ_TOKEN);
        const items = (data.results || [])
          .filter(r => r && (type !== 'all' || r.media_type === 'movie' || r.media_type === 'tv'))
          .slice(0, 20)
          .map(r => shapeDiscoveryItem(r, type === 'tv' ? 'tv' : 'movie'));
        const payload = { items };
        ctx?.waitUntil?.(cache?.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'Cache-Control': `public, max-age=${DISCOVER_CACHE_SECONDS}` } })));
        return response(payload, 200, headers);
      } catch (error) {
        if (String(error).includes('TMDB_RATE_LIMIT')) return response({error:'TMDB is rate-limiting requests. Please retry shortly.'},429,{...headers,'Retry-After':'60'});
        return response({error:'TMDB discovery is temporarily unavailable.'},502,headers);
      }
    }

    if (path === '/api/search') {
      if (request.method !== 'GET') return response({error:'Method not allowed'},405,headers);
      if (!env.TMDB_READ_TOKEN) return response({error:'TMDB_READ_TOKEN is not configured on the Worker.'},503,headers);
      const q = (url.searchParams.get('q') || '').trim();
      const type = url.searchParams.get('type') || 'multi';
      if (!q || q.length > 120 || !['multi', 'movie', 'tv'].includes(type)) {
        return response({error:'Provide a search query (1–120 characters) and valid type.'},400,headers);
      }
      const limited = await checkRateLimit(request, env, headers);
      if (limited) return limited;
      const cache = caches?.default;
      const cacheKey = new Request(`https://frameprint-cache.internal/v2/search/${type}/${encodeURIComponent(q.normalize('NFKC').toLowerCase())}`);
      const cached = await cache?.match(cacheKey);
      if (cached) return response(await cached.json(), 200, headers);
      try {
        const params = new URLSearchParams({ query: q, include_adult: 'false', language: 'en-US' });
        const data = await tmdb(`/search/${type}?${params}`, env.TMDB_READ_TOKEN);
        const items = (data.results || [])
          .filter(r => r && (type !== 'multi' || r.media_type === 'movie' || r.media_type === 'tv'))
          .slice(0, 20)
          .map(r => shapeDiscoveryItem(r, type === 'tv' ? 'tv' : 'movie'));
        const payload = { items };
        ctx?.waitUntil?.(cache?.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'Cache-Control': `public, max-age=${DISCOVER_CACHE_SECONDS}` } })));
        return response(payload, 200, headers);
      } catch (error) {
        if (String(error).includes('TMDB_RATE_LIMIT')) return response({error:'TMDB is rate-limiting requests. Please retry shortly.'},429,{...headers,'Retry-After':'60'});
        return response({error:'TMDB search is temporarily unavailable.'},502,headers);
      }
    }

    if (path === '/api/details') {
      if (request.method !== 'GET') return response({error:'Method not allowed'},405,headers);
      if (!env.TMDB_READ_TOKEN) return response({error:'TMDB_READ_TOKEN is not configured on the Worker.'},503,headers);
      const type = url.searchParams.get('type') || 'movie';
      const id = Number(url.searchParams.get('id'));
      if (!['movie', 'tv'].includes(type) || !Number.isInteger(id) || id <= 0) {
        return response({error:'Valid media type and positive integer ID are required.'},400,headers);
      }
      const limited = await checkRateLimit(request, env, headers);
      if (limited) return limited;
      const cache = caches?.default;
      const cacheKey = new Request(`https://frameprint-cache.internal/v2/details/${type}/${id}`);
      const cached = await cache?.match(cacheKey);
      if (cached) return response(await cached.json(), 200, headers);
      try {
        const details = await tmdb(`/${type}/${id}?append_to_response=credits&language=en-US`, env.TMDB_READ_TOKEN);
        const payload = { metadata: shapeMetadata(details, type) };
        ctx?.waitUntil?.(cache?.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })));
        return response(payload, 200, headers);
      } catch (error) {
        if (String(error).includes('TMDB_RATE_LIMIT')) return response({error:'TMDB is rate-limiting requests. Please retry shortly.'},429,{...headers,'Retry-After':'60'});
        return response({error:'TMDB details are temporarily unavailable.'},502,headers);
      }
    }

    if (request.method !== 'POST') return response({error:'Method not allowed'},405,headers);
    if (!env.TMDB_READ_TOKEN) return response({error:'TMDB_READ_TOKEN is not configured on the Worker.'},503,headers);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return response({error:'Content-Type must be application/json.'},415,headers);
    if (Number(request.headers.get('Content-Length') || 0) > 24000) return response({error:'Payload too large.'},413,headers);
    let body;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw Error('empty');
      let size = 0; let raw = ''; const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 24000) { await reader.cancel(); return response({error:'Payload too large.'},413,headers); }
        raw += decoder.decode(value, { stream:true });
      }
      body = JSON.parse(raw + decoder.decode());
    } catch { return response({error:'Invalid JSON.'},400,headers); }
    if (!body || !Array.isArray(body.films) || !body.films.length || body.films.length > MAX_BATCH) return response({error:`Send 1–${MAX_BATCH} films.`},400,headers);
    const valid = body.films.every(f => f && typeof f.key === 'string' && f.key.length > 0 && f.key.length <= 2048 && typeof f.title === 'string' && f.title.trim().length > 0 && f.title.length <= 1000 && (f.year === null || (Number.isInteger(f.year) && f.year >= 1870 && f.year <= 2100)));
    if (!valid) return response({error:'Invalid film entries.'},400,headers);
    const limited = await checkRateLimit(request, env, headers);
    if (limited) return limited;
    // Bounded concurrency speeds up batch enrichment ~5x while respecting TMDB rate limits.
    const results = new Array(body.films.length);
    let rateLimited = false;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, body.films.length) }, async () => {
      while (!rateLimited) {
        const idx = cursor++;
        if (idx >= body.films.length) break;
        const film = body.films[idx];
        try {
          results[idx] = await lookupFilm(film, env, ctx);
        } catch (error) {
          if (String(error).includes('TMDB_RATE_LIMIT')) {
            rateLimited = true;
            break;
          }
          results[idx] = { key: film.key, metadata: null, retryable: true, reason: 'TMDB temporarily unavailable; retry this title later.' };
        }
      }
    });
    await Promise.all(workers);
    const items = results.filter(Boolean);
    if (rateLimited) {
      return response({ error: 'TMDB is rate-limiting requests. Please retry shortly.', items }, 429, { ...headers, 'Retry-After': '5' });
    }
    return response({ items },200,headers);
  }
};
