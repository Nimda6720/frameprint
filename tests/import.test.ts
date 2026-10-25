import { describe, expect, test } from 'vitest';
import { importCsvFiles, filmKey } from '../src/lib/import';

describe('Letterboxd import', () => {
 const exportFiles = {
  'watched.csv': 'Date,Name,Year,Letterboxd URI\n2025-06-01,Inception,2010,https://letterboxd.com/film/inception/\n2025-07-01,Dune,2021,https://letterboxd.com/film/dune-2021/\n',
  'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2025-07-01,Inception,2010,https://letterboxd.com/film/inception/,4.5\n',
  'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Watched Date\n2025-06-04,Inception,2010,https://letterboxd.com/film/inception/,4.5,No,2025-06-02\n2025-07-10,Inception,2010,https://letterboxd.com/film/inception/,4.5,Yes,2025-07-09\n',
  'watchlist.csv': 'Date,Name,Year\n2025-01-01,Parasite,2019\n'
 };
 test('combines watched, ratings and diary without double counting',()=>{
  const out=importCsvFiles(exportFiles);
  expect(out.films).toHaveLength(2);
  const film=out.films.find(f=>f.title==='Inception')!;
  expect(film.rating).toBe(4.5);
  expect(film.rewatches).toBe(1);
  expect(film.diaryDates).toEqual(['2025-06-02','2025-07-09']);
  expect(out.watchlistCount).toBe(1);
 });
 test('does not use marked-watched Date as viewing date',()=>{
  const out=importCsvFiles({'watched.csv':exportFiles['watched.csv']});
  expect(out.films[0].diaryDates).toEqual([]);
 });
 test('preserves two versions of a film as separate movies',()=>{
  expect(filmKey('Dune',1984)).not.toBe(filmKey('Dune',2021));
 });
 test('rejects missing film CSVs',()=>{
  expect(()=>importCsvFiles({'profile.csv':'Name\nJoe'})).toThrow(/No watched.csv/);
 });
 test('imports IMDb ratings CSV exports and converts 1-10 ratings to 5-star scale',()=>{
  const imdbCsv = 'Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\ntt0816692,9,2025-03-15,Interstellar,https://www.imdb.com/title/tt0816692/,movie,8.7,169,2014,"Adventure, Drama, Sci-Fi",2000000,2014-11-05,Christopher Nolan\n';
  const out = importCsvFiles({ 'imdb-ratings.csv': imdbCsv });
  expect(out.films).toHaveLength(1);
  expect(out.films[0].title).toBe('Interstellar');
  expect(out.films[0].year).toBe(2014);
  expect(out.films[0].rating).toBe(4.5);
  expect(out.films[0].diaryDates).toEqual(['2025-03-15']);
  expect(out.films[0].letterboxdUrl).toBe('https://www.imdb.com/title/tt0816692/');
 });
});
