import JSZip from 'jszip';
import Papa from 'papaparse';
import type { Film, ImportResult } from './types';

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const MAX_FILMS = 20000;
const numberYear = (x: unknown): number | null => {
  const n = Number(String(x ?? '').trim());
  return Number.isInteger(n) && n >= 1870 && n <= 2100 ? n : null;
};
const clean = (x: unknown) => String(x ?? '').trim();
export const filmKey = (title: string, year: number | null) =>
  `${title.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()}|${year ?? ''}`;
function parseRating(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0.5 && n <= 5 ? Math.round(n * 2) / 2 : null;
}
function normalizeDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (numberYear(value.slice(0, 4)) === null) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function rows(csv: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', preview: 100001, transformHeader: h => h.trim() });
  if (parsed.errors.length) throw new Error('This CSV is malformed. Please use an unedited Letterboxd export.');
  if (parsed.data.length > 100000) throw new Error('CSV exceeds the 100,000 row limit.');
  if (!parsed.meta.fields?.some(f => f === 'Name' || f === 'Title')) throw new Error('CSV is missing the Name or Title column.');
  return parsed.data;
}
export function importCsvFiles(files: Record<string, string>): ImportResult {
  const films = new Map<string, Film>();
  const warnings: string[] = [];
  const names = Object.keys(files);
  let watchlistCount = 0;
  let processed = 0;
  const find = (name: string) => names.find(n => n.split('/').at(-1)?.toLowerCase() === name);
  const get = (name: string) => {
    const filename = find(name);
    return filename ? rows(files[filename]) : [];
  };
  function upsert(row: Record<string, string>): Film | null {
    const title = clean(row.Name || row.Title);
    if (!title) return null;
    const year = numberYear(row.Year);
    const key = filmKey(title, year);
    let film = films.get(key);
    if (!film) {
      if (films.size >= MAX_FILMS) throw new Error('Exports with more than 20,000 unique films are not yet supported.');
      film = { key, title, year, rating: null, liked: false, rewatches: 0, diaryDates: [] };
      films.set(key, film);
    }
    const url = clean(row['Letterboxd URI'] || row.URL);
    if (url.startsWith('https://letterboxd.com/')) film.letterboxdUrl = url;
    return film;
  }
  const watched = get('watched.csv');
  const ratings = get('ratings.csv');
  const diary = get('diary.csv');
  const likes = [
    ...get('likes.csv'),
    ...names.filter(n => /(^|\/)likes\/films\.csv$/i.test(n) || ((watched.length || ratings.length || diary.length) && n.split('/').at(-1)?.toLowerCase() === 'films.csv')).flatMap(n => rows(files[n]))
  ];
  const watchlist = get('watchlist.csv');
  if (!watched.length && !ratings.length && !diary.length && !likes.length && !watchlist.length) {
    throw new Error('No watched.csv, ratings.csv or diary.csv found. Please export your Letterboxd data ZIP.');
  }
  for (const row of watched) {
    const f = upsert(row);
    if (!f) continue;
    const date = normalizeDate(clean(row.Date));
    if (date) f.dateAdded = date; // marked watched on Letterboxd; not necessarily viewing date
  }
  for (const row of ratings) {
    const f = upsert(row);
    if (f) f.rating = parseRating(clean(row.Rating));
  }
  for (const row of diary) {
    const f = upsert(row);
    if (!f) continue;
    const rating = parseRating(clean(row.Rating));
    if (rating !== null && f.rating === null) f.rating = rating;
    const date = normalizeDate(clean(row['Watched Date']));
    if (date) f.diaryDates.push(date);
    if (clean(row.Rewatch).toLowerCase() === 'yes') f.rewatches++;
    if (clean(row.Like).toLowerCase() === 'yes') f.liked = true;
    processed++;
  }
  for (const row of likes) {
    if (clean(row.Type) && clean(row.Type).toLowerCase() !== 'film') continue;
    const title = clean(row.Name || row.Title);
    const f = (watched.length || ratings.length || diary.length)
      ? films.get(filmKey(title, numberYear(row.Year)))
      : upsert(row);
    if (f) f.liked = true;
  }
  watchlistCount = watchlist.filter(r => clean(r.Name || r.Title)).length;
  if (!watched.length) warnings.push('watched.csv was not found; the library was reconstructed from ratings and diary rows.');
  if (!diary.length) warnings.push('No diary entries found. Watching timelines require dated diary entries.');
  if (processed && !Array.from(films.values()).some(f => f.diaryDates.length)) warnings.push('Diary entries have no valid “Watched Date” fields. Logging dates are not treated as viewing dates.');
  if (!ratings.length) warnings.push('No ratings.csv found. Ratings, if any, came from diary entries.');
  return { films: Array.from(films.values()).sort((a, b) => a.title.localeCompare(b.title)), watchlistCount, warnings, fileNames: names };
}
export function mergeImportResults(existing: ImportResult, incoming: ImportResult): ImportResult {
  const map = new Map<string, Film>();
  for (const f of existing.films) {
    map.set(f.key, { ...f, diaryDates: [...f.diaryDates] });
  }
  const hasIncomingDiary = incoming.fileNames.some(n => n.split('/').at(-1)?.toLowerCase() === 'diary.csv');
  const hasIncomingWatchlist = incoming.fileNames.some(n => n.split('/').at(-1)?.toLowerCase() === 'watchlist.csv');
  for (const inc of incoming.films) {
    const prev = map.get(inc.key);
    if (!prev) {
      map.set(inc.key, { ...inc, diaryDates: [...inc.diaryDates] });
    } else {
      map.set(inc.key, {
        ...prev,
        dateAdded: inc.dateAdded ?? prev.dateAdded,
        rating: inc.rating ?? prev.rating,
        liked: prev.liked || inc.liked,
        rewatches: hasIncomingDiary ? inc.rewatches : (prev.rewatches || inc.rewatches),
        diaryDates: hasIncomingDiary && inc.diaryDates.length ? [...inc.diaryDates] : (prev.diaryDates.length ? prev.diaryDates : [...inc.diaryDates]),
        letterboxdUrl: inc.letterboxdUrl ?? prev.letterboxdUrl,
        metadata: prev.metadata ?? inc.metadata,
      });
    }
  }
  const combinedNames = Array.from(new Set([...existing.fileNames, ...incoming.fileNames]));
  const hasFile = (target: string) => combinedNames.some(n => n.split('/').at(-1)?.toLowerCase() === target);
  const mergedFilms = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  const warnings: string[] = [];
  if (!hasFile('watched.csv')) warnings.push('watched.csv was not found; the library was reconstructed from ratings and diary rows.');
  if (!hasFile('diary.csv')) warnings.push('No diary entries found. Watching timelines require dated diary entries.');
  if (hasFile('diary.csv') && !mergedFilms.some(f => f.diaryDates.length)) warnings.push('Diary entries have no valid “Watched Date” fields. Logging dates are not treated as viewing dates.');
  if (!hasFile('ratings.csv')) warnings.push('No ratings.csv found. Ratings, if any, came from diary entries.');
  return {
    films: mergedFilms,
    watchlistCount: hasIncomingWatchlist ? incoming.watchlistCount : existing.watchlistCount,
    warnings,
    fileNames: combinedNames,
  };
}

export async function importLetterboxd(input: File | File[]): Promise<ImportResult> {
  const files = Array.isArray(input) ? input : [input];
  if (!files.length) throw new Error('Upload a Letterboxd .zip export, or watched.csv, ratings.csv or diary.csv files.');
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
    const file = files[0];
    if (file.size > MAX_ZIP_BYTES) throw new Error('File is too large (25 MB maximum).');
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new Error('This does not appear to be a valid ZIP file.'); }
    if (Object.keys(zip.files).length > 10000) throw new Error('ZIP contains too many entries (10,000 maximum).');
    const selected: Record<string, string> = {};
    let total = 0;
    for (const item of Object.values(zip.files)) {
      if (item.dir || item.name.startsWith('__MACOSX/')) continue;
      const filename = /(^|\/)likes\/films\.csv$/i.test(item.name) ? 'likes.csv' : item.name.split('/').at(-1)?.toLowerCase();
      if (!filename || !['watched.csv', 'ratings.csv', 'diary.csv', 'likes.csv', 'watchlist.csv'].includes(filename)) continue;
      const bytes = (item as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (bytes && bytes > MAX_CSV_BYTES) throw new Error(`${filename} is too large.`);
      if (Object.hasOwn(selected, filename)) throw new Error(`ZIP contains multiple ${filename} files. Upload one export at a time.`);
      if (bytes && total + bytes > MAX_CSV_BYTES) throw new Error('Uncompressed export exceeds the 20 MB processing limit.');
      // Count actual inflated bytes while streaming, even if the ZIP directory lies.
      selected[filename] = await new Promise<string>((resolve, reject) => {
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        const stream = (item as JSZip.JSZipObject & {
          internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
        }).internalStream('uint8array');
        stream.on('data', chunk => {
          total += chunk.length;
          if (total > MAX_CSV_BYTES) {
            stream.pause();
            reject(new Error('Uncompressed export exceeds the 20 MB processing limit.'));
            return;
          }
          chunks.push(decoder.decode(chunk, { stream: true }));
        });
        stream.on('error', reject);
        stream.on('end', () => resolve(chunks.join('') + decoder.decode()));
        stream.resume();
      });
    }
    return importCsvFiles(selected);
  }
  const csvFiles: Record<string, string> = {};
  let totalBytes = 0;
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      throw new Error('Upload a single .zip export, or select multiple .csv files together.');
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      throw new Error('Upload a Letterboxd .zip export, or watched.csv, ratings.csv or diary.csv files.');
    }
    totalBytes += file.size;
    if (file.size > MAX_CSV_BYTES || totalBytes > MAX_CSV_BYTES) {
      throw new Error('CSV exceeds the 20 MB processing limit.');
    }
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    csvFiles[relPath] = await file.text();
  }
  return importCsvFiles(csvFiles);
}
