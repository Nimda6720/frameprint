import { describe, expect, test } from 'vitest';
import { demoFilms } from '../src/data/demo';
import { collaborations, getStats, rankGenres, rankPeople } from '../src/lib/stats';

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
