import type { DiscoveryItem, Film, FilmMeta } from './types';
import { filmKey } from './import';
import { rankGenres, rankLanguages, rankPeople } from './stats';

export interface RecommendedFilm {
  id: number;
  title: string;
  year: number;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  runtime: number;
  genres: string[];
  directors: string[];
  cast: string[];
  countries: string[];
  language: string;
  tmdbRating: number;
  popularity: number;
  tasteMatch: number;
  popularityTier: 'Mainstream Hit' | 'Acclaimed Favorite' | 'Hidden Gem';
  reasons: string[];
  metadata: FilmMeta;
}

interface CandidateSeed {
  id: number;
  title: string;
  year: number;
  poster: string;
  backdrop: string;
  overview: string;
  runtime: number;
  genres: string[];
  directors: { id: number; name: string }[];
  cast: { id: number; name: string }[];
  countries: string[];
  language: string;
  tmdbRating: number;
  popularity: number;
}

const CANDIDATE_POOL: CandidateSeed[] = [
  {
    id: 374720, title: 'Dunkirk', year: 2017,
    poster: '/ebSnODDg9lbsMIaWg2uAbjn7TO5.jpg', backdrop: '/fudEG1VUWuOqleXv6NwCExK0VLy.jpg',
    overview: 'Allied soldiers from Belgium, the British Commonwealth and Empire, and France are surrounded by the German Army and evacuated during a fierce battle in World War II.',
    runtime: 107, genres: ['War', 'Action', 'Drama', 'History'],
    directors: [{ id: 525, name: 'Christopher Nolan' }],
    cast: [{ id: 11288, name: 'Fionn Whitehead' }, { id: 2037, name: 'Cillian Murphy' }, { id: 2524, name: 'Tom Hardy' }],
    countries: ['United Kingdom', 'United States', 'France'], language: 'en', tmdbRating: 7.5, popularity: 82,
  },
  {
    id: 1124, title: 'The Prestige', year: 2006,
    poster: '/bdN3gXuIZYaJP7ftKK2sU0nPtEA.jpg', backdrop: '/mfJepkInUbiZ0mFXFhDNz8ko6Zr.jpg',
    overview: 'A mysterious story of two magicians whose intense rivalry leads them on a life-long battle for supremacy — full of obsession, deceit and jealousy with dangerous and deadly consequences.',
    runtime: 130, genres: ['Drama', 'Mystery', 'Science Fiction'],
    directors: [{ id: 525, name: 'Christopher Nolan' }],
    cast: [{ id: 3894, name: 'Christian Bale' }, { id: 6968, name: 'Hugh Jackman' }, { id: 1245, name: 'Scarlett Johansson' }],
    countries: ['United Kingdom', 'United States'], language: 'en', tmdbRating: 8.2, popularity: 88,
  },
  {
    id: 152532, title: 'Dallas Buyers Club', year: 2013,
    poster: '/7Fdh7gUq3plvQqxRbNYhWvDABXA.jpg', backdrop: '/5fX1oSGuYdKgwWmUTAN5MNSQGzr.jpg',
    overview: 'Loosely based on the true-life tale of Ron Woodroof, a drug-taking, women-loving, homophobic man who in 1986 was diagnosed with HIV/AIDS and given thirty days to live.',
    runtime: 117, genres: ['Drama', 'History'],
    directors: [{ id: 9322, name: 'Jean-Marc Vallée' }],
    cast: [{ id: 10297, name: 'Matthew McConaughey' }, { id: 7499, name: 'Jared Leto' }],
    countries: ['United States'], language: 'en', tmdbRating: 7.9, popularity: 64,
  },
  {
    id: 244786, title: 'Whiplash', year: 2014,
    poster: '/7fn624j5lj3xTme2SgiLCeuedmO.jpg', backdrop: '/vRGqS0N7hN6I8kG3p2m9fBf4sE6.jpg',
    overview: 'Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.',
    runtime: 107, genres: ['Drama', 'Music'],
    directors: [{ id: 136495, name: 'Damien Chazelle' }],
    cast: [{ id: 996701, name: 'Miles Teller' }, { id: 18999, name: 'J.K. Simmons' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.4, popularity: 91,
  },
  {
    id: 376867, title: 'Moonlight', year: 2016,
    poster: '/4911T5FbJ9eD2Faz5Z8cT3SUhU3.jpg', backdrop: '/A9KPbYTQvWsp51Lgz85ukVkFrKf.jpg',
    overview: 'The tender, heartbreaking story of a young man’s struggle to find himself, told across three defining chapters in his life as he experiences the ecstasy, pain, and beauty of falling in love.',
    runtime: 111, genres: ['Drama'],
    directors: [{ id: 96831, name: 'Barry Jenkins' }],
    cast: [{ id: 936227, name: 'Mahershala Ali' }, { id: 1371226, name: 'Trevante Rhodes' }],
    countries: ['United States'], language: 'en', tmdbRating: 7.9, popularity: 58,
  },
  {
    id: 290098, title: 'The Handmaiden', year: 2016,
    poster: '/dLlH4aNHdnmf62umnInL8xPlPzw.jpg', backdrop: '/fC5T4bC2B8d5k5n2r0v1l4Z7Q9w.jpg',
    overview: '1930s Korea, in the period of Japanese occupation, a new girl is hired as a handmaiden to a Japanese heiress who lives a secluded life on a large countryside estate.',
    runtime: 145, genres: ['Thriller', 'Drama', 'Romance'],
    directors: [{ id: 10099, name: 'Park Chan-wook' }],
    cast: [{ id: 85002, name: 'Kim Min-hee' }, { id: 73249, name: 'Ha Jung-woo' }],
    countries: ['South Korea'], language: 'ko', tmdbRating: 8.2, popularity: 54,
  },
  {
    id: 705996, title: 'Decision to Leave', year: 2022,
    poster: '/N0rskx91Eh6aWjvBybeY6epNic.jpg', backdrop: '/A1bWhTFQKkhF1yhSKWosSyzn2Hp.jpg',
    overview: 'From a mountain peak in South Korea, a man plummets to his death. Did he jump, or was he pushed? When detective Hae-joon arrives on the scene, he begins to suspect the dead man’s wife Seo-rae.',
    runtime: 138, genres: ['Crime', 'Drama', 'Romance', 'Mystery'],
    directors: [{ id: 10099, name: 'Park Chan-wook' }],
    cast: [{ id: 68905, name: 'Park Hae-il' }, { id: 38280, name: 'Tang Wei' }],
    countries: ['South Korea'], language: 'ko', tmdbRating: 7.3, popularity: 43,
  },
  {
    id: 496243, title: 'Burning', year: 2018,
    poster: '/w1K43daZw02Yx2UF1c04f1G2sLa.jpg', backdrop: '/bLJTjfbZ1c5zSNiAvGYs1Uc82ir.jpg',
    overview: 'An aspiring writer goes to the airport to pick up a high school friend returning from a trip to Africa, but is disheartened to see her with another man.',
    runtime: 148, genres: ['Mystery', 'Drama', 'Thriller'],
    directors: [{ id: 95597, name: 'Lee Chang-dong' }],
    cast: [{ id: 572043, name: 'Yoo Ah-in' }, { id: 21045, name: 'Steven Yeun' }],
    countries: ['South Korea'], language: 'ko', tmdbRating: 7.4, popularity: 39,
  },
  {
    id: 264660, title: 'Ex Machina', year: 2015,
    poster: '/dmJW8IAKHKxFNiUnoDR7JfsK7Rp.jpg', backdrop: '/9X3cDZb4GYGQeOnZHLwMcCFz2Ro.jpg',
    overview: 'Caleb, a coder at the world’s largest internet company, wins a competition to spend a week at a private mountain retreat belonging to Nathan, the reclusive CEO of the company.',
    runtime: 108, genres: ['Drama', 'Science Fiction'],
    directors: [{ id: 2036, name: 'Alex Garland' }],
    cast: [{ id: 93210, name: 'Domhnall Gleeson' }, { id: 227454, name: 'Alicia Vikander' }, { id: 25072, name: 'Oscar Isaac' }],
    countries: ['United Kingdom'], language: 'en', tmdbRating: 7.7, popularity: 77,
  },
  {
    id: 399055, title: 'The Shape of Water', year: 2017,
    poster: '/k4FwHlMhuRR5BISY2Gm2QZHlH5Q.jpg', backdrop: '/rgyhSn3mINvkuy9iswZK0VLqQO3.jpg',
    overview: 'An otherworldly story, set against the backdrop of Cold War era America circa 1962, where a mute janitor working at a lab falls in love with an amphibious man being held captive there.',
    runtime: 123, genres: ['Drama', 'Fantasy', 'Romance'],
    directors: [{ id: 10828, name: 'Guillermo del Toro' }],
    cast: [{ id: 39187, name: 'Sally Hawkins' }, { id: 2282, name: 'Michael Shannon' }],
    countries: ['United States'], language: 'en', tmdbRating: 7.2, popularity: 69,
  },
  {
    id: 96724, title: 'Anna Karenina', year: 2012,
    poster: '/extraAnna.jpg', backdrop: '/extraAnnaBg.jpg',
    overview: 'Trapped in a loveless marriage, aristocrat Anna Karenina enters into a life-changing affair with the affluent Count Vronsky.',
    runtime: 130, genres: ['Drama', 'Romance'],
    directors: [{ id: 36588, name: 'Joe Wright' }],
    cast: [{ id: 116, name: 'Keira Knightley' }, { id: 9642, name: 'Jude Law' }],
    countries: ['United Kingdom'], language: 'en', tmdbRating: 6.8, popularity: 38,
  },
  {
    id: 37165, title: 'The Truman Show', year: 1998,
    poster: '/vuza0WqY239yBXOadKlGwJsZJFE.jpg', backdrop: '/aCHn2TXYJfzPXQKA6r9mKPbMlUB.jpg',
    overview: 'Truman Burbank is the star of The Truman Show, a 24-hour-a-day reality TV show that broadcasts every aspect of his life without his knowledge.',
    runtime: 103, genres: ['Comedy', 'Drama', 'Science Fiction'],
    directors: [{ id: 13680, name: 'Peter Weir' }],
    cast: [{ id: 206, name: 'Jim Carrey' }, { id: 350, name: 'Laura Linney' }, { id: 228, name: 'Ed Harris' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.1, popularity: 89,
  },
  {
    id: 62, title: '2001: A Space Odyssey', year: 1968,
    poster: '/ve72VxNqjGM69Uky4WTo2bK6rfq.jpg', backdrop: '/w5IDXtifKntw0ajv2co7jFlTQDM.jpg',
    overview: 'Humanity finds a mysterious object buried beneath the lunar surface and sets off to find its origins with the help of HAL 9000, the world’s most advanced supercomputer.',
    runtime: 149, genres: ['Science Fiction', 'Mystery', 'Adventure'],
    directors: [{ id: 240, name: 'Stanley Kubrick' }],
    cast: [{ id: 245, name: 'Keir Dullea' }, { id: 246, name: 'Gary Lockwood' }],
    countries: ['United Kingdom', 'United States'], language: 'en', tmdbRating: 8.1, popularity: 85,
  },
  {
    id: 38, title: 'Eternal Sunshine of the Spotless Mind', year: 2004,
    poster: '/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg', backdrop: '/7y3eYvTsGjxPYDdS3k0A1M7P8tL.jpg',
    overview: 'Joel Barish, heartbroken that his girlfriend underwent a procedure to erase him from her memory, decides to do the same. However, as he watches his memories of her fade away, he realizes that he still loves her.',
    runtime: 108, genres: ['Science Fiction', 'Drama', 'Romance'],
    directors: [{ id: 201, name: 'Michel Gondry' }],
    cast: [{ id: 206, name: 'Jim Carrey' }, { id: 204, name: 'Kate Winslet' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.1, popularity: 84,
  },
  {
    id: 426, title: 'Vertigo', year: 1958,
    poster: '/15uOEfqBNTVtDUT7hGBVCka0rZz.jpg', backdrop: '/wP0pT7a99iZ1W05b32M5n6rL9c1.jpg',
    overview: 'A retired San Francisco detective suffering from acrophobia investigates the strange activities of an old friend’s wife, all the while becoming dangerously obsessed with her.',
    runtime: 128, genres: ['Mystery', 'Romance', 'Thriller'],
    directors: [{ id: 2636, name: 'Alfred Hitchcock' }],
    cast: [{ id: 854, name: 'James Stewart' }, { id: 5729, name: 'Kim Novak' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.2, popularity: 62,
  },
  {
    id: 843, title: 'In the Mood for Love', year: 2000,
    poster: '/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg', backdrop: '/n4GJFGzsc7NinI1VeGDXIcQjtU2.jpg',
    overview: 'Two neighbors in a cramped Hong Kong apartment building form a profound bond after both suspect their spouses of extramarital activities.',
    runtime: 99, genres: ['Drama', 'Romance'],
    directors: [{ id: 12453, name: 'Wong Kar-wai' }],
    cast: [{ id: 1337, name: 'Tony Leung Chiu-wai' }, { id: 1338, name: 'Maggie Cheung' }],
    countries: ['Hong Kong', 'France'], language: 'cn', tmdbRating: 8.1, popularity: 48,
  },
  {
    id: 531428, title: 'Portrait of a Lady on Fire', year: 2019,
    poster: '/2LquGwEhbg3soxSCs9VNyh5VJd9.jpg', backdrop: '/cP16d18H4F1r2b8e5u5q8V7w3X2.jpg',
    overview: 'On an isolated island in Brittany at the end of the eighteenth century, a female painter is obliged to paint a wedding portrait of a young woman.',
    runtime: 122, genres: ['Drama', 'Romance', 'History'],
    directors: [{ id: 72805, name: 'Céline Sciamma' }],
    cast: [{ id: 583992, name: 'Noémie Merlant' }, { id: 72808, name: 'Adèle Haenel' }],
    countries: ['France'], language: 'fr', tmdbRating: 8.1, popularity: 45,
  },
  {
    id: 77, title: 'Memento', year: 2000,
    poster: '/yuNs09hvpHVU1cBTCAk9zxsL2oW.jpg', backdrop: '/q2CtXYjp9IlnfBcPktNkBPsuAEO.jpg',
    overview: 'Leonard Shelby is tracking down the man who raped and murdered his wife. The difficulty of locating his wife’s killer, however, is compounded by the fact that he suffers from a rare, untreatable form of short-term memory loss.',
    runtime: 113, genres: ['Mystery', 'Thriller'],
    directors: [{ id: 525, name: 'Christopher Nolan' }],
    cast: [{ id: 529, name: 'Guy Pearce' }, { id: 530, name: 'Carrie-Anne Moss' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.2, popularity: 83,
  },
  {
    id: 68718, title: 'Django Unchained', year: 2012,
    poster: '/7oWY8VDWW7thTzWh3OKYRkWUlD5.jpg', backdrop: '/2oZklIzUbvZXXzIFzv7Hi68d6xf.jpg',
    overview: 'With the help of a German bounty hunter, a freed slave sets out to rescue his wife from a brutal Mississippi plantation owner.',
    runtime: 165, genres: ['Drama', 'Western'],
    directors: [{ id: 138, name: 'Quentin Tarantino' }],
    cast: [{ id: 134, name: 'Jamie Foxx' }, { id: 27319, name: 'Christoph Waltz' }, { id: 6193, name: 'Leonardo DiCaprio' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.2, popularity: 92,
  },
  {
    id: 103, title: 'Taxi Driver', year: 1976,
    poster: '/ekstpH614fwDX8DUln1a2Opz0N8.jpg', backdrop: '/6aoyUbvu0419XLKLIMoH0TkEicH.jpg',
    overview: 'A mentally unstable Vietnam War veteran works as a night-time taxi driver in New York City where the perceived decadence and sleaze feed his urge for violent action.',
    runtime: 114, genres: ['Crime', 'Drama'],
    directors: [{ id: 1032, name: 'Martin Scorsese' }],
    cast: [{ id: 380, name: 'Robert De Niro' }, { id: 1038, name: 'Jodie Foster' }],
    countries: ['United States'], language: 'en', tmdbRating: 8.1, popularity: 86,
  },
  {
    id: 475557, title: 'Anatomy of a Fall', year: 2023,
    poster: '/kQs6keheMwCxJxrzV83VUwFtHkB.jpg', backdrop: '/fGe1ej335XbqN1j9teo9d2m9s5c.jpg',
    overview: 'A woman is suspected of her husband’s murder, and their blind son faces a moral dilemma as the sole witness.',
    runtime: 152, genres: ['Thriller', 'Drama', 'Crime'],
    directors: [{ id: 544442, name: 'Justine Triet' }],
    cast: [{ id: 6416, name: 'Sandra Hüller' }, { id: 139549, name: 'Swann Arlaud' }],
    countries: ['France'], language: 'fr', tmdbRating: 7.6, popularity: 52,
  },
  {
    id: 906126, title: 'The Zone of Interest', year: 2023,
    poster: '/hUu9zyZmDd8VZegKi1iK1Vk0RYS.jpg', backdrop: '/aPQsU3yLDUOhLJYnSqkhKRkQTAw.jpg',
    overview: 'The commandant of Auschwitz, Rudolf Höss, and his wife Hedwig, strive to build a dream life for their family in a house and garden beside the camp.',
    runtime: 105, genres: ['Drama', 'History', 'War'],
    directors: [{ id: 66728, name: 'Jonathan Glazer' }],
    cast: [{ id: 6416, name: 'Sandra Hüller' }, { id: 23310, name: 'Christian Friedel' }],
    countries: ['United Kingdom', 'Poland'], language: 'de', tmdbRating: 7.2, popularity: 44,
  },
  {
    id: 110420, title: 'Wolf Children', year: 2012,
    poster: '/3Nllh6JgcrFdtOn6iFOWHudNInd.jpg', backdrop: '/8Y43POKjjKDGI9MH89NW0NAzzp8.jpg',
    overview: 'After her werewolf lover unexpectedly dies in an accident, a woman must find a way to raise the son and daughter that she had with him.',
    runtime: 117, genres: ['Animation', 'Fantasy', 'Drama'],
    directors: [{ id: 57606, name: 'Mamoru Hosoda' }],
    cast: [{ id: 86862, name: 'Aoi Miyazaki' }],
    countries: ['Japan'], language: 'ja', tmdbRating: 8.2, popularity: 41,
  },
  {
    id: 670, title: 'Oldboy', year: 2003,
    poster: '/pWDtjs568ZfOTMbURQBYuT4Qxka.jpg', backdrop: '/47L2A2yP60c9gZ9xP4wM2D3Z4v8.jpg',
    overview: 'With no clue how he came to be imprisoned, drugged and tortured for 15 years, a desperate businessman seeks revenge on his captors.',
    runtime: 120, genres: ['Drama', 'Thriller', 'Mystery', 'Action'],
    directors: [{ id: 10099, name: 'Park Chan-wook' }],
    cast: [{ id: 64880, name: 'Choi Min-sik' }, { id: 10102, name: 'Yoo Ji-tae' }],
    countries: ['South Korea'], language: 'ko', tmdbRating: 8.3, popularity: 74,
  },
];

export type RecommendationMode = 'match' | 'gems' | 'popular';

export function getRecommendations(
  films: Film[],
  mode: RecommendationMode = 'match',
  liveItems: DiscoveryItem[] = [],
): RecommendedFilm[] {
  const watchedKeys = new Set(films.map(f => f.key));
  const watchedIds = new Set(films.map(f => f.metadata?.id).filter((id): id is number => typeof id === 'number'));
  const watchedTitles = new Set(films.map(f => f.title.toLowerCase().trim()));

  const genres = rankGenres(films);
  const directors = rankPeople(films, 'directors');
  const actors = rankPeople(films, 'cast');
  const languages = rankLanguages(films);

  const genreWeights = new Map<string, number>();
  genres.slice(0, 6).forEach((g, idx) => {
    const ratingBoost = g.average ? (g.average - 3.0) * 6 : 2;
    genreWeights.set(g.name, Math.max(4, (18 - idx * 2.5) + ratingBoost));
  });

  const directorWeights = new Map<string, { weight: number; count: number; avg: number | null }>();
  directors.slice(0, 12).forEach((d, idx) => {
    const ratingBoost = d.average ? (d.average - 3.0) * 8 : 3;
    directorWeights.set(d.name.toLowerCase(), {
      weight: Math.max(8, (26 - idx * 1.5) + ratingBoost),
      count: d.count,
      avg: d.average,
    });
  });

  const actorWeights = new Map<string, { weight: number; name: string }>();
  actors.slice(0, 20).forEach((a, idx) => {
    actorWeights.set(a.name.toLowerCase(), { weight: Math.max(4, 14 - idx * 0.5), name: a.name });
  });

  const langWeights = new Map<string, number>();
  languages.slice(0, 5).forEach((l, idx) => {
    langWeights.set(l.name.toLowerCase(), Math.max(3, 12 - idx * 2));
  });

  // Combine curated pool with any live TMDB movie items not already in pool
  const combinedPool: CandidateSeed[] = [...CANDIDATE_POOL];
  const poolIds = new Set(CANDIDATE_POOL.map(c => c.id));
  for (const item of liveItems) {
    if (item.mediaType !== 'movie' || poolIds.has(item.id) || !item.year) continue;
    poolIds.add(item.id);
    combinedPool.push({
      id: item.id,
      title: item.title,
      year: item.year,
      poster: item.poster || '',
      backdrop: item.backdrop || '',
      overview: item.overview,
      runtime: item.metadata?.runtime || 120,
      genres: item.genres,
      directors: item.metadata?.directors || [],
      cast: item.metadata?.cast || [],
      countries: item.metadata?.countries || [],
      language: item.language || 'en',
      tmdbRating: item.tmdbRating ?? 7.5,
      popularity: Math.min(98, Math.round((item as { popularity?: number }).popularity || 75)),
    });
  }

  const scored: RecommendedFilm[] = [];

  for (const cand of combinedPool) {
    const key = filmKey(cand.title, cand.year);
    if (watchedKeys.has(key) || watchedIds.has(cand.id) || watchedTitles.has(cand.title.toLowerCase().trim())) {
      continue;
    }

    let rawScore = 38;
    const reasons: string[] = [];

    // 1. Director match
    for (const d of cand.directors) {
      const match = directorWeights.get(d.name.toLowerCase());
      if (match) {
        rawScore += match.weight;
        const avgLabel = match.avg ? ` (${match.avg.toFixed(1)}★ avg)` : '';
        reasons.push(`Directed by ${d.name}${avgLabel}`);
      }
    }

    // 2. Genre affinity
    const matchedGenres: string[] = [];
    for (const g of cand.genres) {
      const w = genreWeights.get(g);
      if (w) {
        rawScore += w;
        matchedGenres.push(g);
      }
    }
    if (matchedGenres.length > 0) {
      reasons.push(`Matches your ${matchedGenres.slice(0, 2).join(' & ')} taste`);
    }

    // 3. Cast match
    for (const c of cand.cast) {
      const m = actorWeights.get(c.name.toLowerCase());
      if (m) {
        rawScore += m.weight;
        if (reasons.length < 3) reasons.push(`Features ${m.name}`);
      }
    }

    // 4. Language affinity (especially non-English affinity)
    const langW = langWeights.get(cand.language.toLowerCase());
    if (langW) {
      rawScore += cand.language !== 'en' ? langW + 6 : langW * 0.5;
      if (cand.language !== 'en' && reasons.length < 3) {
        reasons.push(`Matches your ${cand.language.toUpperCase()} cinema affinity`);
      }
    }

    // 5. Critical acclaim baseline
    rawScore += Math.max(0, (cand.tmdbRating - 7.0) * 6);

    const tasteMatch = Math.max(58, Math.min(99, Math.round(rawScore)));
    const popularityTier: RecommendedFilm['popularityTier'] =
      cand.popularity >= 80 ? 'Mainstream Hit' : cand.popularity >= 55 ? 'Acclaimed Favorite' : 'Hidden Gem';

    if (!reasons.length) {
      reasons.push(`Critically acclaimed ${cand.genres.slice(0, 2).join(' / ') || 'cinema'}`);
    }

    const metadata: FilmMeta = {
      id: cand.id,
      title: cand.title,
      year: cand.year,
      poster: cand.poster || null,
      backdrop: cand.backdrop || null,
      overview: cand.overview,
      runtime: cand.runtime,
      genres: cand.genres,
      countries: cand.countries,
      language: cand.language,
      cast: cand.cast,
      directors: cand.directors,
      writers: [],
      cinematographers: [],
      composers: [],
      tmdbRating: cand.tmdbRating,
    };

    scored.push({
      id: cand.id,
      title: cand.title,
      year: cand.year,
      poster: cand.poster || null,
      backdrop: cand.backdrop || null,
      overview: cand.overview,
      runtime: cand.runtime,
      genres: cand.genres,
      directors: cand.directors.map(d => d.name),
      cast: cand.cast.map(c => c.name),
      countries: cand.countries,
      language: cand.language,
      tmdbRating: cand.tmdbRating,
      popularity: cand.popularity,
      tasteMatch,
      popularityTier,
      reasons: reasons.slice(0, 2),
      metadata,
    });
  }

  if (mode === 'gems') {
    return scored
      .sort((a, b) => {
        const gemA = a.tasteMatch - a.popularity * 0.45;
        const gemB = b.tasteMatch - b.popularity * 0.45;
        return gemB - gemA || b.tasteMatch - a.tasteMatch;
      })
      .slice(0, 12);
  }

  if (mode === 'popular') {
    return scored
      .sort((a, b) => (b.popularity + b.tasteMatch * 0.5) - (a.popularity + a.tasteMatch * 0.5))
      .slice(0, 12);
  }

  return scored
    .sort((a, b) => b.tasteMatch - a.tasteMatch || b.tmdbRating - a.tmdbRating)
    .slice(0, 12);
}
