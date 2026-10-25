import { describe, expect, test } from 'vitest';
import { demoFilms } from '../src/data/demo';
import {
  collaborations,
  filterFilmsByYear,
  getAvailableYears,
  getCinemaPersonality,
  getHeatmapAndStreaks,
  getPersonProfile,
  getStats,
  rankGenres,
  rankPeople,
} from '../src/lib/stats';
import { getRecommendations } from '../src/lib/recommend';
import {
  clearLibraryFromDevice,
  isSaveEnabled,
  loadLibraryFromDevice,
  saveLibraryToDevice,
  setSaveEnabled,
} from '../src/lib/storage';

describe('statistics',()=>{
 test('counted ratings mean actual user ratings',()=>{
  const stats=getStats(demoFilms);
  expect(stats.total).toBe(demoFilms.length);
  expect(stats.rated).toBe(demoFilms.length);
  expect(stats.avgRating).toBeGreaterThan(3);
 });
 test('crew rankings and collaborations use film credits',()=>{
  const directors=rankPeople(demoFilms,'directors');
  expect(directors[0].count).toBeGreaterThan(1);
  expect(collaborations(demoFilms).some(x=>x.director==='Christopher Nolan')).toBe(true);
 });
 test('genre film count can exceed library size across genres',()=>{
  const genres=rankGenres(demoFilms);
  expect(genres.reduce((a,g)=>a+g.count,0)).toBeGreaterThan(demoFilms.length);
 });
 test('no movie date is invented',()=>{
  const stripped=demoFilms.map(f=>({...f,diaryDates:[]}));
  expect(getStats(stripped).diaryEntries).toBe(0);
 });
});

test('remakes count as separate films in genre and person rankings',()=>{
 const original=demoFilms[0];
 const films=[{...original,key:'one',title:'Same title',year:1980},{...original,key:'two',title:'Same title',year:2020}];
 expect(rankGenres(films)[0].count).toBe(2);
 expect(rankPeople(films,'directors')[0].count).toBe(2);
});
test('runtime counts logged repeats while unknown runtimes remain unknown',()=>{
 const film={...demoFilms[0],diaryDates:['2025-01-01','2025-01-02'],metadata:{...demoFilms[0].metadata!,runtime:100}};
 const unknown={...demoFilms[1],metadata:undefined};
 const stats=getStats([film,unknown]);
 expect(stats.knownRuntime).toBe(200);
 expect(stats.runtimeCount).toBe(1);
});
test('timeline includes months with no logged watches',()=>{
 const film={...demoFilms[0],diaryDates:['2025-01-01','2025-03-01']};
 expect(getStats([film]).viewingMonths).toEqual([{name:'2025-01',count:1},{name:'2025-02',count:0},{name:'2025-03',count:1}]);
});

describe('year filtering, heatmap, profiles, personality, recommendations, and local storage', () => {
 test('global year filter scopes diary dates to the selected year', () => {
  const years = getAvailableYears(demoFilms);
  expect(years.length).toBeGreaterThan(0);
  const targetYear = years[0];
  const filtered = filterFilmsByYear(demoFilms, targetYear);
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.every(f => f.diaryDates.some(d => d.startsWith(targetYear)))).toBe(true);
  expect(filterFilmsByYear(demoFilms, 'All time').length).toBe(demoFilms.length);
 });

 test('heatmap and streak calculation computes active days, streaks, rewatches, and 365/366 cells', () => {
  const f1 = { ...demoFilms[0], rewatches: 2, diaryDates: ['2025-04-01', '2025-04-02', '2025-04-03'] };
  const f2 = { ...demoFilms[1], rewatches: 0, diaryDates: ['2025-04-03', '2025-04-05'] };
  const heatmap = getHeatmapAndStreaks([f1, f2], '2025');
  expect(heatmap.year).toBe('2025');
  expect(heatmap.activeDays).toBe(4);
  expect(heatmap.longestStreak).toBe(3);
  expect(heatmap.totalLogs).toBe(5);
  expect(heatmap.rewatches).toBeGreaterThanOrEqual(2);
  expect(heatmap.busiestDay?.date).toBe('2025-04-03');
  expect(heatmap.busiestDay?.count).toBe(2);
  expect(heatmap.days.length).toBe(365);
 });

 test('person profile aggregates watched films, highest rated film, and frequent collaborators', () => {
  const directors = rankPeople(demoFilms, 'directors');
  const topDirector = directors[0];
  const profile = getPersonProfile(demoFilms, topDirector, 'directors');
  expect(profile.name).toBe(topDirector.name);
  expect(profile.watchedFilms.length).toBe(topDirector.count);
  expect(profile.highestRated).not.toBeNull();
  expect(profile.collaborators.length).toBeGreaterThan(0);
 });

 test('cinema personality returns archetype title, subtitle, badge, and traits', () => {
  const personality = getCinemaPersonality(demoFilms);
  expect(personality.title.length).toBeGreaterThan(3);
  expect(personality.traits.length).toBe(3);
 });

 test('recommendations score unwatched films and separate taste match from popularity tier', () => {
  const matchRecs = getRecommendations(demoFilms.slice(0, 8), 'match');
  const gemRecs = getRecommendations(demoFilms.slice(0, 8), 'gems');
  expect(matchRecs.length).toBeGreaterThan(0);
  expect(gemRecs.length).toBeGreaterThan(0);
  for (const rec of matchRecs) {
   expect(rec.tasteMatch).toBeGreaterThanOrEqual(58);
   expect(rec.tasteMatch).toBeLessThanOrEqual(99);
   expect(['Mainstream Hit', 'Acclaimed Favorite', 'Hidden Gem']).toContain(rec.popularityTier);
   expect(rec.reasons.length).toBeGreaterThan(0);
  }
 });

 test('optional device storage saves, loads, and deletes library state cleanly', async () => {
  setSaveEnabled(true);
  expect(isSaveEnabled()).toBe(true);
  await saveLibraryToDevice({
   films: demoFilms.slice(0, 2),
   watchlistCount: 4,
   warnings: [],
   fileNames: ['ratings.csv'],
   savedAt: '2026-10-25T00:00:00.000Z',
  });
  const loaded = await loadLibraryFromDevice();
  expect(loaded?.films.length).toBe(2);
  expect(loaded?.watchlistCount).toBe(4);
  await clearLibraryFromDevice();
  expect(await loadLibraryFromDevice()).toBeNull();
  setSaveEnabled(false);
  expect(isSaveEnabled()).toBe(false);
 });
});
