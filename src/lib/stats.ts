import type { Film, Person } from './types';

export const average = (nums: number[]): number | null => nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null;
export const prettyNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const minutesToLabel = (mins: number) => `${Math.round(mins / 60).toLocaleString('en-US')}h`;
export type RankedItem = { name: string; id?: number; count: number; average: number | null; percent: number; profile?: string | null; films: string[] };
function rankedGroups(films: Film[], getItems: (f: Film) => (Person | string)[]): RankedItem[] {
  const groups = new Map<string, { name: string; id?: number; profile?: string | null; ratings: number[]; films: Map<string, string> }>();
  const enriched = films.filter(f => f.metadata).length || 1;
  for (const film of films) {
    const seen = new Set<string>();
    for (const item of getItems(film)) {
      const id = typeof item === 'string' ? undefined : item.id;
      const name = typeof item === 'string' ? item : item.name;
      const key = id === undefined ? name.toLowerCase() : String(id);
      if (seen.has(key) || !name) continue;
      seen.add(key);
      let group = groups.get(key);
      if (!group) { group = { name, id, profile: typeof item === 'string' ? undefined : item.profile, ratings: [], films: new Map() }; groups.set(key, group); }
      group.films.set(film.key, `${film.title}${film.year ? ` (${film.year})` : ''}`);
      if (film.rating !== null) group.ratings.push(film.rating);
    }
  }
  return [...groups.values()].map(group => ({ name: group.name, id: group.id, count: group.films.size,
    average: average(group.ratings), percent: Math.round(group.films.size / enriched * 100), profile: group.profile, films: [...group.films.values()] }))
    .sort((a,b) => b.count - a.count || (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));
}
export type PeopleCategory = 'directors' | 'cast' | 'writers' | 'cinematographers' | 'composers';
export const rankPeople = (films: Film[], category: PeopleCategory) => rankedGroups(films, f => f.metadata?.[category] ?? []);
export const rankGenres = (films: Film[]) => rankedGroups(films, f => f.metadata?.genres ?? []);
export const rankCountries = (films: Film[]) => rankedGroups(films, f => f.metadata?.countries ?? []);
export const rankLanguages = (films: Film[]) => rankedGroups(films, f => f.metadata?.language ? [f.metadata.language] : []);
export function collaborations(films: Film[]) {
  const groups = new Map<string, { director: string; actor: string; count: number; titles: string[] }>();
  for (const film of films) {
    for (const director of film.metadata?.directors ?? []) for (const actor of film.metadata?.cast.slice(0, 12) ?? []) {
      const key = `${director.id}|${actor.id}`;
      let value = groups.get(key);
      if (!value) { value = { director: director.name, actor: actor.name, count: 0, titles: [] }; groups.set(key, value); }
      value.count++;
      value.titles.push(film.title);
    }
  }
  return [...groups.values()].filter(value => value.count >= 2).sort((a,b) => b.count - a.count).slice(0, 12);
}
export function getStats(films: Film[]) {
  const ratings = films.map(f => f.rating).filter((r): r is number => r !== null);
  const diaryDates = films.flatMap(f => f.diaryDates).filter(Boolean);
  const runtimeFilms = films.filter(f => typeof f.metadata?.runtime === 'number' && f.metadata.runtime > 0);
  const knownRuntime = runtimeFilms.reduce((acc,f) => acc + f.metadata!.runtime! * Math.max(1, f.diaryDates.length),0);
  const decades = new Map<string, number>();
  const releases = new Map<number, number>();
  const ratingCounts = new Map<number, number>();
  const viewingYears = new Map<string, number>();
  const viewingMonths = new Map<string, number>();
  const weekday = [0,0,0,0,0,0,0];
  for (const film of films) {
    if (film.year) {
      const decade = `${Math.floor(film.year / 10) * 10}s`;
      decades.set(decade, (decades.get(decade) || 0) + 1);
      releases.set(film.year, (releases.get(film.year) || 0) + 1);
    }
    if (film.rating !== null) ratingCounts.set(film.rating, (ratingCounts.get(film.rating) || 0) + 1);
    for (const date of film.diaryDates) {
      const year = date.slice(0, 4); const month = date.slice(0, 7);
      viewingYears.set(year, (viewingYears.get(year) || 0) + 1);
      viewingMonths.set(month, (viewingMonths.get(month) || 0) + 1);
      weekday[new Date(`${date}T12:00:00Z`).getUTCDay()]++;
    }
  }
  const ordered = (map: Map<string | number, number>) => [...map.entries()].sort(([a],[b]) => String(a).localeCompare(String(b))).map(([name, count]) => ({ name: String(name), count }));
  // Preserve quiet calendar periods instead of connecting two active months.
  if (viewingMonths.size) {
    const months = [...viewingMonths.keys()].sort();
    const first = months[0]; const last = months.at(-1)!;
    let year = Number(first.slice(0, 4)); let month = Number(first.slice(5));
    while (`${year}-${String(month).padStart(2, '0')}` <= last) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!viewingMonths.has(key)) viewingMonths.set(key, 0);
      if (!viewingYears.has(String(year))) viewingYears.set(String(year), 0);
      if (++month > 12) { month = 1; year++; }
    }
  }
  return {
    total: films.length, rated: ratings.length, avgRating: average(ratings), diaryEntries: diaryDates.length,
    metadataCount: films.filter(f => !!f.metadata).length, runtimeCount: runtimeFilms.length, knownRuntime, ratedFive: ratings.filter(r => r === 5).length,
    ratingCounts: [...ratingCounts.entries()].sort(([a],[b]) => a-b).map(([rating,count]) => ({ rating: `${rating}★`, count })),
    decades: ordered(decades), releases: ordered(releases), viewingYears: ordered(viewingYears), viewingMonths: ordered(viewingMonths),
    weekday: weekday.map((count, i) => ({ name: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i], count })),
    sortedFavorites: films.filter(f => f.rating !== null).sort((a,b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title)),
  };
}

export function getAvailableYears(films: Film[]): string[] {
  const years = new Set<string>();
  for (const film of films) {
    for (const d of film.diaryDates) {
      if (d && d.length >= 4) years.add(d.slice(0, 4));
    }
    if (!film.diaryDates.length && film.dateAdded && film.dateAdded.length >= 4) {
      years.add(film.dateAdded.slice(0, 4));
    }
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function filterFilmsByYear(films: Film[], year: string): Film[] {
  if (!year || year === 'All time') return films;
  const filtered: Film[] = [];
  for (const film of films) {
    const matchingDates = film.diaryDates.filter(d => d.startsWith(`${year}-`));
    if (matchingDates.length > 0) {
      filtered.push({ ...film, diaryDates: matchingDates });
    } else if (!film.diaryDates.length && film.dateAdded?.startsWith(`${year}-`)) {
      filtered.push(film);
    }
  }
  return filtered;
}

export interface HeatmapDay {
  date: string;
  count: number;
  titles: string[];
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapStats {
  year: string;
  availableYears: string[];
  days: HeatmapDay[];
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  totalLogs: number;
  rewatches: number;
  busiestDay: { date: string; count: number; titles: string[] } | null;
}

export function getHeatmapAndStreaks(films: Film[], preferredYear?: string): HeatmapStats {
  const availableYears = getAvailableYears(films);
  const targetYear = (preferredYear && preferredYear !== 'All time' && availableYears.includes(preferredYear))
    ? preferredYear
    : (availableYears[0] || String(new Date().getUTCFullYear()));
  const byDate = new Map<string, { count: number; titles: string[] }>();
  const allLoggedDates = new Set<string>();
  let rewatches = 0;

  for (const film of films) {
    const matchesTarget = !preferredYear || preferredYear === 'All time'
      ? film.diaryDates.some(d => d.startsWith(`${targetYear}-`))
      : true;
    if (matchesTarget && film.rewatches > 0) rewatches += film.rewatches;
    for (const date of film.diaryDates) {
      if (!date) continue;
      allLoggedDates.add(date);
      if (date.startsWith(`${targetYear}-`)) {
        let entry = byDate.get(date);
        if (!entry) { entry = { count: 0, titles: [] }; byDate.set(date, entry); }
        entry.count++;
        if (!entry.titles.includes(film.title)) entry.titles.push(film.title);
      }
    }
  }

  // Compute streaks across the selected scope (or targetYear)
  const streakDates = [...allLoggedDates]
    .filter(d => !preferredYear || preferredYear === 'All time' ? true : d.startsWith(`${preferredYear}-`))
    .sort();
  let longestStreak = 0;
  let currentRun = 0;
  let prevTime: number | null = null;
  for (const d of streakDates) {
    const t = new Date(`${d}T12:00:00Z`).getTime();
    if (prevTime !== null && Math.round((t - prevTime) / 86400000) === 1) {
      currentRun++;
    } else {
      currentRun = 1;
    }
    if (currentRun > longestStreak) longestStreak = currentRun;
    prevTime = t;
  }

  const start = new Date(`${targetYear}-01-01T12:00:00Z`);
  const end = new Date(`${targetYear}-12-31T12:00:00Z`);
  const days: HeatmapDay[] = [];
  let busiestDay: { date: string; count: number; titles: string[] } | null = null;
  let totalLogs = 0;

  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const iso = cur.toISOString().slice(0, 10);
    const info = byDate.get(iso);
    const count = info?.count ?? 0;
    const titles = info?.titles ?? [];
    totalLogs += count;
    if (count > 0 && (!busiestDay || count > busiestDay.count)) {
      busiestDay = { date: iso, count, titles };
    }
    const level: 0 | 1 | 2 | 3 | 4 = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4;
    days.push({ date: iso, count, titles, level });
  }

  return {
    year: targetYear,
    availableYears,
    days,
    activeDays: byDate.size,
    longestStreak,
    currentStreak: currentRun,
    totalLogs,
    rewatches,
    busiestDay,
  };
}

export interface PersonProfileData {
  name: string;
  id?: number;
  category: PeopleCategory;
  profile?: string | null;
  count: number;
  average: number | null;
  highestRated: Film | null;
  watchedFilms: Film[];
  collaborators: { name: string; role: string; count: number }[];
}

export function getPersonProfile(films: Film[], item: RankedItem, category: PeopleCategory): PersonProfileData {
  const watchedFilms = films.filter(f => {
    const list = f.metadata?.[category] ?? [];
    return list.some(p => (item.id !== undefined && p.id === item.id) || p.name.toLowerCase() === item.name.toLowerCase());
  }).sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.year ?? 0) - (a.year ?? 0));

  const highestRated = watchedFilms.find(f => f.rating !== null) ?? watchedFilms[0] ?? null;
  const collabMap = new Map<string, { name: string; role: string; count: number }>();

  for (const film of watchedFilms) {
    const m = film.metadata;
    if (!m) continue;
    const candidates: { person: Person; role: string }[] = [
      ...m.directors.map(person => ({ person, role: 'Director' })),
      ...m.cast.slice(0, 8).map(person => ({ person, role: 'Actor' })),
      ...m.writers.slice(0, 4).map(person => ({ person, role: 'Writer' })),
      ...m.cinematographers.slice(0, 2).map(person => ({ person, role: 'Cinematographer' })),
      ...m.composers.slice(0, 2).map(person => ({ person, role: 'Composer' })),
    ];
    const seenInFilm = new Set<string>();
    for (const { person, role } of candidates) {
      if ((item.id !== undefined && person.id === item.id) || person.name.toLowerCase() === item.name.toLowerCase()) continue;
      const key = `${person.id || person.name.toLowerCase()}`;
      if (seenInFilm.has(key)) continue;
      seenInFilm.add(key);
      let existing = collabMap.get(key);
      if (!existing) {
        existing = { name: person.name, role, count: 0 };
        collabMap.set(key, existing);
      }
      existing.count++;
    }
  }

  const collaborators = [...collabMap.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 6);

  return {
    name: item.name,
    id: item.id,
    category,
    profile: item.profile,
    count: watchedFilms.length,
    average: item.average,
    highestRated,
    watchedFilms,
    collaborators,
  };
}

export interface CinemaPersonality {
  title: string;
  subtitle: string;
  description: string;
  traits: string[];
}

export function getCinemaPersonality(films: Film[]): CinemaPersonality {
  const stats = getStats(films);
  const genres = rankGenres(films);
  const languages = rankLanguages(films);
  const directors = rankPeople(films, 'directors');
  const topGenre = genres[0]?.name || 'Cinema';
  const topDirector = directors[0]?.name || 'visionary auteurs';
  const nonEnglishShare = languages.filter(l => l.name.toLowerCase() !== 'en').reduce((acc, l) => acc + l.count, 0) / Math.max(1, stats.metadataCount);
  const avg = stats.avgRating ?? 3.8;

  if (nonEnglishShare >= 0.35) {
    return {
      title: 'The Global Arthouse Explorer',
      subtitle: 'SUBTITLES ARE YOUR SECOND LANGUAGE',
      description: `Your archive crosses borders effortlessly, gravitating toward ${topGenre.toLowerCase()} storytelling and the distinct voice of ${topDirector}.`,
      traits: [`${languages.length} original languages`, `Signature: ${topGenre}`, `Auteur affinity: ${topDirector}`],
    };
  }
  if (topGenre === 'Science Fiction' || topGenre === 'Fantasy') {
    return {
      title: 'The Speculative Worldbuilder',
      subtitle: 'DRAWN TO HORIZONS BEYOND REALITY',
      description: `You seek out immersive universes, grand visual scale, and philosophical ${topGenre.toLowerCase()} anchored by ${topDirector}.`,
      traits: [`Top genre: ${topGenre}`, `${minutesToLabel(stats.knownRuntime)} screen time`, `Guided by ${topDirector}`],
    };
  }
  if (avg >= 4.25) {
    return {
      title: 'The Devoted Auteurist',
      subtitle: 'CURATOR OF MODERN MASTERPIECES',
      description: `You know exactly what moves you—selective, generous with great craft (${avg.toFixed(2)}★ avg), and anchored by ${topGenre} and ${topDirector}.`,
      traits: [`${stats.ratedFive} perfect 5★ ratings`, `Top genre: ${topGenre}`, `Top director: ${topDirector}`],
    };
  }
  if (avg <= 3.3 && stats.rated >= 5) {
    return {
      title: 'The Unsparing Critic',
      subtitle: 'FIVE STARS MUST BE EARNED',
      description: `You hold cinema to a rigorous standard (${avg.toFixed(2)}★ avg), rewarding only the sharpest ${topGenre.toLowerCase()} and boldest direction from ${topDirector}.`,
      traits: [`${avg.toFixed(2)}★ average rating`, `Primary lens: ${topGenre}`, `Most watched: ${topDirector}`],
    };
  }
  return {
    title: 'The Midnight Storyteller',
    subtitle: 'CHASING ATMOSPHERE, CHARACTER & CRAFT',
    description: `From intimate character studies to tension-filled ${topGenre.toLowerCase()}, your taste is defined by emotional resonance and directors like ${topDirector}.`,
    traits: [`Signature genre: ${topGenre}`, `${stats.total} films archived`, `Top auteur: ${topDirector}`],
  };
}
