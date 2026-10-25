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
