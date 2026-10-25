import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronDown,
  Clapperboard, Compass, Database, Download, ExternalLink, Film as FilmIcon, Flame, FolderOpen,
  HardDrive, Heart, Info, LayoutDashboard, Menu, Moon, Music, Pause, Play, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Timer, Trash2, UploadCloud, Users, X
} from 'lucide-react';
import type { DiscoveryItem, Film, FilmMeta, ImportResult, Screen } from './lib/types';
import type { PeopleCategory, PersonProfileData, RankedItem } from './lib/stats';
import { importInWorker } from './lib/import-client';
import { mergeImportResults } from './lib/import';
import { demoFilms } from './data/demo';
import {
  collaborations, filterFilmsByYear, getAvailableYears, getCinemaPersonality,
  getHeatmapAndStreaks, getPersonProfile, getStats, minutesToLabel, prettyNumber,
  rankCountries, rankGenres, rankLanguages, rankPeople
} from './lib/stats';
import { enrichBatch, fetchMediaDetails, fetchTrending, hasApi, waitFor } from './lib/enrich';
import { getRecommendations, type RecommendationMode, type RecommendedFilm } from './lib/recommend';
import { clearLibraryFromDevice, isSaveEnabled, loadLibraryFromDevice, saveLibraryToDevice, setSaveEnabled } from './lib/storage';
import { FilmArea, FilmBars, VerticalBars } from './components/Charts';

const movieImage = (path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const portraitImage = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w185${path}` : null;
const fRating = (n: number | null) => (n === null ? '—' : `${Number(n.toFixed(2))} / 5`);
const percent = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const features = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'library', label: 'Film library', icon: FilmIcon },
  { id: 'people', label: 'Cast & crew', icon: Users },
  { id: 'dna', label: 'Cinematic DNA', icon: Compass },
  { id: 'timeline', label: 'Timeline', icon: CalendarDays },
  { id: 'wrapped', label: 'Your wrapped', icon: Sparkles },
] as const;

const sections: Record<Screen, string> = {
  overview: 'The big picture',
  library: 'Your film archive',
  people: 'Behind the frames',
  dna: 'The stories you gravitate to',
  timeline: 'A journey through film',
  wrapped: 'Your films in frames',
};

function TinyTag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <span className={`tag ${accent ? 'tag-accent' : ''}`}>{children}</span>;
}

function SectionHeading({
  eyebrow, title, description, side,
}: {
  eyebrow: string; title: string; description?: string; side?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {side && <div className="section-side">{side}</div>}
    </div>
  );
}

function SmallStars({ rating, scale = 5 }: { rating: number | null; scale?: 5 | 10 }) {
  return (
    <span className="stars">
      <Star size={12} fill="currentColor" />{' '}
      {rating === null ? 'Unrated' : scale === 10 ? `${rating.toFixed(1)}` : rating.toFixed(1)}
    </span>
  );
}

function FilmPoster({
  film, className = '', onClick, badge,
}: {
  film: { title: string; year: number | null; metadata?: { poster?: string | null } };
  className?: string;
  onClick?: () => void;
  badge?: string;
}) {
  const img = movieImage(film.metadata?.poster);
  const colors = ['poster-sage', 'poster-umber', 'poster-ruby', 'poster-ink', 'poster-teal', 'poster-violet'];
  const tint = colors[Math.abs([...film.title].reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
  return (
    <button className={`poster ${tint} ${img ? 'poster-has-img' : ''} ${className}`} onClick={onClick} aria-label={`View ${film.title} details`}>
      {badge && <span className={`media-badge media-${badge.toLowerCase()}`}>{badge}</span>}
      {img ? (
        <img loading="lazy" src={img} alt={`${film.title} movie poster`} />
      ) : (
        <span className="poster-typography">
          <small>FRAMEPRINT / {film.year || 'FILM'}</small>
          <strong>{film.title}</strong>
          <i>◈</i>
        </span>
      )}
      <span className="poster-shade" />
      <span className="poster-hover">
        View film <ArrowRight size={13} />
      </span>
    </button>
  );
}

function FilmDetail({ film, onClose }: { film: Film; onClose: () => void }) {
  const m = film.metadata;
  const isTv = m?.mediaType === 'tv';
  const tmdbUrl = m ? `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${m.id}` : null;
  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <section
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${film.title} details`}
        onClick={e => e.stopPropagation()}
      >
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="detail-poster">
          <FilmPoster film={film} badge={isTv ? 'TV' : undefined} />
        </div>
        <div className="detail-copy">
          <div className="eyebrow">
            {isTv ? 'TV SERIES DETAILS' : 'FILM DETAILS'} · {film.year ?? 'UNKNOWN YEAR'}
          </div>
          <h2>{film.title}</h2>
          <div className="detail-tags">
            {film.rating !== null ? (
              <TinyTag accent>{`${film.rating} / 5 stars`}</TinyTag>
            ) : (
              <TinyTag accent>{isTv ? 'TV Series' : 'Not rated'}</TinyTag>
            )}
            {m?.tmdbRating !== null && m?.tmdbRating !== undefined && (
              <TinyTag>TMDB {Number(m.tmdbRating).toFixed(1)} ★</TinyTag>
            )}
            {m?.runtime && (
              <TinyTag>{isTv ? `${m.runtime}m / ep` : `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`}</TinyTag>
            )}
            {m?.seasons && (
              <TinyTag>
                {m.seasons} season{m.seasons === 1 ? '' : 's'}
                {m.episodes ? ` · ${m.episodes} eps` : ''}
              </TinyTag>
            )}
            {film.diaryDates.length > 0 && <TinyTag>{film.diaryDates.length} diary log(s)</TinyTag>}
          </div>
          <p>{m?.overview || 'Detailed movie information becomes available after TMDB enrichment.'}</p>
          <div className="detail-data">
            <span>{isTv ? 'CREATED BY' : 'DIRECTED BY'}</span>
            <strong>{m?.directors.map(p => p.name).join(', ') || 'Not available'}</strong>
            {m?.writers && m.writers.length > 0 && (
              <>
                <span>WRITTEN BY</span>
                <strong>{m.writers.slice(0, 4).map(p => p.name).join(', ')}</strong>
              </>
            )}
            <span>GENRES</span>
            <strong>{m?.genres.join(' · ') || 'Not available'}</strong>
            <span>CAST</span>
            <strong>{m?.cast.slice(0, 6).map(p => p.name).join(' · ') || 'Not available'}</strong>
            <span>PRODUCTION</span>
            <strong>{m?.countries.join(' · ') || 'Not available'}</strong>
          </div>
          <div className="detail-actions">
            {film.letterboxdUrl && (
              <a className="primary-btn" href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer">
                {film.letterboxdUrl.includes('imdb.com') ? 'View on IMDb' : 'View on Letterboxd'}{' '}
                <ExternalLink size={14} />
              </a>
            )}
            {tmdbUrl && (
              <a className="soft-btn" href={tmdbUrl} target="_blank" rel="noopener noreferrer">
                TMDB page <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PersonDetail({
  person, onClose, onSelectFilm,
}: {
  person: PersonProfileData;
  onClose: () => void;
  onSelectFilm: (f: Film) => void;
}) {
  const roleLabel: Record<PeopleCategory, string> = {
    directors: 'DIRECTOR PROFILE',
    cast: 'ACTOR PROFILE',
    writers: 'WRITER PROFILE',
    cinematographers: 'CINEMATOGRAPHER PROFILE',
    composers: 'COMPOSER PROFILE',
  };
  const tmdbPersonUrl = person.id ? `https://www.themoviedb.org/person/${person.id}` : null;
  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <section
        className="detail-modal person-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${person.name} profile`}
        onClick={e => e.stopPropagation()}
      >
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="person-modal-header">
          <div className="person-avatar person-modal-avatar">
            {person.profile ? (
              <img src={portraitImage(person.profile)!} alt={person.name} />
            ) : (
              <span>{person.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
            )}
          </div>
          <div className="person-modal-headline">
            <div className="eyebrow">{roleLabel[person.category]}</div>
            <h2>{person.name}</h2>
            <div className="detail-tags">
              <TinyTag accent>{person.count} watched film{person.count === 1 ? '' : 's'}</TinyTag>
              <TinyTag>{person.average === null ? 'No rated films yet' : `${person.average.toFixed(2)} ★ avg rating`}</TinyTag>
              {person.highestRated && (
                <TinyTag>
                  Highest rated: {person.highestRated.title}
                  {person.highestRated.rating ? ` (${person.highestRated.rating}★)` : ''}
                </TinyTag>
              )}
            </div>
            {tmdbPersonUrl && (
              <div className="person-modal-links">
                <a className="soft-btn btn-small" href={tmdbPersonUrl} target="_blank" rel="noopener noreferrer">
                  TMDB Filmography <ExternalLink size={13} />
                </a>
              </div>
            )}
          </div>
        </div>

        {person.collaborators.length > 0 && (
          <div className="person-modal-section">
            <div className="eyebrow">FREQUENT COLLABORATORS IN YOUR LIBRARY</div>
            <div className="person-collab-chips">
              {person.collaborators.map(c => (
                <div className="person-collab-chip" key={`${c.name}-${c.role}`}>
                  <strong>{c.name}</strong>
                  <span>{c.role} · {c.count} film{c.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="person-modal-section">
          <div className="eyebrow">WATCHED FILMS IN YOUR ARCHIVE ({person.watchedFilms.length})</div>
          <div className="person-films-grid">
            {person.watchedFilms.map(f => (
              <div className="library-item" key={f.key}>
                <FilmPoster
                  film={f}
                  onClick={() => {
                    onClose();
                    onSelectFilm(f);
                  }}
                />
                <strong>{f.title}</strong>
                <div>
                  {f.year ?? 'TBA'} <SmallStars rating={f.rating} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ViewingHeatmap({
  allFilms, selectedYear, onSelectYear,
}: {
  allFilms: Film[];
  selectedYear: string;
  onSelectYear: (y: string) => void;
}) {
  const [inspectYear, setInspectYear] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number; titles: string[] } | null>(null);
  const activeTargetYear = selectedYear !== 'All time' ? selectedYear : inspectYear || undefined;
  const heatmap = useMemo(() => getHeatmapAndStreaks(allFilms, activeTargetYear), [allFilms, activeTargetYear]);

  useEffect(() => {
    if (selectedYear !== 'All time') setInspectYear(selectedYear);
    else if (!inspectYear && heatmap.year) setInspectYear(heatmap.year);
  }, [selectedYear, inspectYear, heatmap.year]);

  // Pad leading days of first week so Sunday aligns to row 0
  const firstDayDow = heatmap.days.length
    ? new Date(`${heatmap.days[0].date}T12:00:00Z`).getUTCDay()
    : 0;
  const paddedDays: (typeof heatmap.days[number] | null)[] = [
    ...Array.from({ length: firstDayDow }, () => null),
    ...heatmap.days,
  ];

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="panel heatmap-panel" aria-label="Viewing activity calendar heatmap">
      <div className="panel-head heatmap-head">
        <div>
          <div className="eyebrow">DAILY VIEWING CADENCE & STREAKS</div>
          <h3>{heatmap.year} Viewing Activity Heatmap</h3>
        </div>
        <div className="heatmap-year-pills" role="group" aria-label="Heatmap year selector">
          <button
            type="button"
            className={`soft-btn btn-small ${selectedYear === 'All time' ? 'window-active' : ''}`}
            onClick={() => onSelectYear('All time')}
          >
            All time
          </button>
          {heatmap.availableYears.slice(0, 6).map(y => (
            <button
              type="button"
              key={y}
              className={`soft-btn btn-small ${(selectedYear === y || (selectedYear === 'All time' && heatmap.year === y)) ? 'window-active' : ''}`}
              onClick={() => {
                setInspectYear(y);
                onSelectYear(y);
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="heatmap-metrics">
        <div className="heatmap-metric">
          <span>LONGEST STREAK</span>
          <strong>
            <Flame size={16} /> {heatmap.longestStreak} day{heatmap.longestStreak === 1 ? '' : 's'}
          </strong>
          <small>Consecutive days with logged films</small>
        </div>
        <div className="heatmap-metric">
          <span>ACTIVE VIEWING DAYS</span>
          <strong>{heatmap.activeDays}</strong>
          <small>{heatmap.totalLogs} diary viewings in {heatmap.year}</small>
        </div>
        <div className="heatmap-metric">
          <span>REWATCHES</span>
          <strong>{heatmap.rewatches}</strong>
          <small>Repeat viewings in period</small>
        </div>
        <div className="heatmap-metric">
          <span>PEAK VIEWING DAY</span>
          <strong>{heatmap.busiestDay ? `${heatmap.busiestDay.count} film${heatmap.busiestDay.count === 1 ? '' : 's'}` : '—'}</strong>
          <small>{heatmap.busiestDay ? heatmap.busiestDay.date : 'Log dated diary entries'}</small>
        </div>
      </div>

      <div className="heatmap-scroll">
        <div className="heatmap-months">
          {months.map(m => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {paddedDays.map((day, idx) =>
            day ? (
              <button
                type="button"
                key={day.date}
                className={`heatmap-cell level-${day.level}`}
                title={
                  day.count
                    ? `${day.date}: ${day.count} film(s) — ${day.titles.join(', ')}`
                    : `${day.date}: No films logged`
                }
                aria-label={
                  day.count
                    ? `${day.date}: ${day.count} film(s)`
                    : `${day.date}: 0 films`
                }
                onClick={() => setSelectedDay(day.count ? day : null)}
              />
            ) : (
              <span key={`pad-${idx}`} className="heatmap-cell heatmap-pad" aria-hidden="true" />
            ),
          )}
        </div>
      </div>

      <div className="heatmap-footer">
        <div className="heatmap-day-detail">
          {selectedDay ? (
            <span>
              <strong>{selectedDay.date}:</strong> {selectedDay.titles.join(' · ')} ({selectedDay.count} viewing{selectedDay.count === 1 ? '' : 's'})
            </span>
          ) : heatmap.busiestDay ? (
            <span>
              <strong>Peak day ({heatmap.busiestDay.date}):</strong> {heatmap.busiestDay.titles.join(' · ')} — click any lit square to inspect that day
            </span>
          ) : (
            <span>Import diary entries with Watched Dates to light up your daily heatmap.</span>
          )}
        </div>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Less</span>
          <i className="heatmap-cell level-0" />
          <i className="heatmap-cell level-1" />
          <i className="heatmap-cell level-2" />
          <i className="heatmap-cell level-3" />
          <i className="heatmap-cell level-4" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

function RecommendationsPanel({
  films, onSelectFilm,
}: {
  films: Film[];
  onSelectFilm: (f: Film) => void;
}) {
  const [mode, setMode] = useState<RecommendationMode>('match');
  const [liveCandidates, setLiveCandidates] = useState<DiscoveryItem[]>([]);

  useEffect(() => {
    if (!hasApi) return;
    const controller = new AbortController();
    fetchTrending('movie', 'week', controller.signal)
      .then(items => {
        if (!controller.signal.aborted && items.length) setLiveCandidates(items);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const recommendations = useMemo(
    () => getRecommendations(films, mode, liveCandidates),
    [films, mode, liveCandidates],
  );

  const openRec = async (rec: RecommendedFilm) => {
    const baseFilm: Film = {
      key: `rec|${rec.id}`,
      title: rec.title,
      year: rec.year,
      rating: null,
      liked: false,
      rewatches: 0,
      diaryDates: [],
      metadata: rec.metadata,
    };
    onSelectFilm(baseFilm);
    if (hasApi) {
      try {
        const detailed = await fetchMediaDetails('movie', rec.id);
        if (detailed) onSelectFilm({ ...baseFilm, metadata: detailed });
      } catch {
        // Keep seeded metadata on offline/error
      }
    }
  };

  return (
    <div className="panel recommendations-panel" aria-label="Personalized film recommendations">
      <div className="panel-head recommendations-head">
        <div>
          <div className="eyebrow">PERSONALIZED FILM RECOMMENDATIONS</div>
          <h3>What to watch next, tailored to your DNA</h3>
          <p className="fine-print">
            Ranked by your favorite genres, auteurs, languages, and high ratings — separating personal taste affinity from mainstream popularity.
          </p>
        </div>
        <div className="discover-window" role="tablist" aria-label="Recommendation ranking mode">
          <button
            type="button"
            className={`soft-btn btn-small ${mode === 'match' ? 'window-active' : ''}`}
            onClick={() => setMode('match')}
          >
            Best Taste Match
          </button>
          <button
            type="button"
            className={`soft-btn btn-small ${mode === 'gems' ? 'window-active' : ''}`}
            onClick={() => setMode('gems')}
          >
            Hidden Gems
          </button>
          <button
            type="button"
            className={`soft-btn btn-small ${mode === 'popular' ? 'window-active' : ''}`}
            onClick={() => setMode('popular')}
          >
            Crowdpleasers
          </button>
        </div>
      </div>

      <div className="rec-grid">
        {recommendations.slice(0, 6).map(rec => (
          <div className="rec-card" key={rec.id}>
            <div className="rec-poster-wrap">
              <FilmPoster
                film={{ title: rec.title, year: rec.year, metadata: { poster: rec.poster } }}
                badge={`${rec.tasteMatch}% MATCH`}
                onClick={() => void openRec(rec)}
              />
            </div>
            <div className="rec-copy">
              <div className="rec-badges">
                <span className="rec-match-pill">{rec.tasteMatch}% Taste Match</span>
                <span className={`rec-pop-pill pop-${rec.popularityTier.toLowerCase().replace(/\s+/g, '-')}`}>
                  {rec.popularityTier} · TMDB {rec.tmdbRating.toFixed(1)}★
                </span>
              </div>
              <h4>
                <button type="button" className="rec-title-btn" onClick={() => void openRec(rec)}>
                  {rec.title} <span>({rec.year})</span>
                </button>
              </h4>
              <p className="rec-reason">{rec.reasons.join(' · ')}</p>
              <div className="rec-meta">
                {rec.directors[0] && <span>Dir. {rec.directors[0]}</span>}
                <span>{rec.genres.slice(0, 2).join(', ')}</span>
                <span>{rec.language.toUpperCase()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label, value, note, icon: Icon, accent = false,
}: {
  label: string; value: string; note: string; icon: typeof FilmIcon; accent?: boolean;
}) {
  return (
    <div className={`stat-card ${accent ? 'stat-accent' : ''}`}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <div className="stat-value">{value}</div>
      <p>{note}</p>
    </div>
  );
}

function Overview({
  films, allFilms, selectedYear, onSelectYear, onFilm, onSelectPerson, openUpload, demo, watchlist,
}: {
  films: Film[];
  allFilms: Film[];
  selectedYear: string;
  onSelectYear: (y: string) => void;
  onFilm: (f: Film) => void;
  onSelectPerson: (p: PersonProfileData) => void;
  openUpload: () => void;
  demo: boolean;
  watchlist: number;
}) {
  const stats = useMemo(() => getStats(films), [films]);
  const favorites = stats.sortedFavorites.slice(0, 6);
  const allGenres = rankGenres(films);
  const directors = rankPeople(films, 'directors');
  const directorTotal = directors.reduce((a, b) => a + b.count, 0);
  const releaseDecades = stats.decades.slice(-7);
  const hasDated = stats.diaryEntries > 0;
  const booksUnread = Math.round(stats.knownRuntime / 300);
  const toiletBreaks = Math.round(stats.knownRuntime / 5);
  const songsUnheard = Math.round(stats.knownRuntime / 3.5);
  const nightsOfSleep = Math.round(stats.knownRuntime / 480);

  return (
    <>
      <div className="hero">
        <div className="hero-text">
          <div className="hero-kicker">
            <span className="live-dot" /> YOUR CINEMATIC UNIVERSE <span className="hero-line" />
          </div>
          <h1>
            Every film tells
            <br />a little <em>about you.</em>
          </h1>
          <p>A beautifully detailed portrait of everything you've watched, loved, and rated on Letterboxd or IMDb.</p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={openUpload}>
              <UploadCloud size={17} /> {demo ? 'Analyze Letterboxd or IMDb' : 'Import another export'}{' '}
              <ArrowRight size={16} />
            </button>
            <span className="hero-privacy">
              <ShieldCheck size={15} /> ZIP & CSVs stay in your browser
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="hero-art-text">
            FRAME
            <br />
            <i>BY</i> FRAME<span>EST. YOUR FIRST WATCH</span>
          </div>
          <div className="corner-number">01 / 06</div>
        </div>
      </div>

      <SectionHeading
        eyebrow="01 / AT A GLANCE"
        title={selectedYear === 'All time' ? 'Your story in numbers' : `Your ${selectedYear} in numbers`}
        description="A few numbers that say a lot about your taste."
        side={<TinyTag accent>{demo ? 'SAMPLE ACCOUNT' : selectedYear === 'All time' ? 'YOUR IMPORT' : `${selectedYear} FILTER`}</TinyTag>}
      />

      <div className="stats-grid">
        <StatCard label="Films watched" value={prettyNumber(stats.total)} note="Unique titles in your library" icon={Clapperboard} accent />
        <StatCard label="Average rating" value={stats.avgRating === null ? '—' : stats.avgRating.toFixed(2) + ' ★'} note={`Across ${prettyNumber(stats.rated)} rated films`} icon={Star} />
        <StatCard label="Known screen time" value={minutesToLabel(stats.knownRuntime)} note={`${stats.runtimeCount} of ${stats.total} runtimes known; includes diary repeats`} icon={Activity} />
        <StatCard label="Books unread" value={prettyNumber(booksUnread)} note="300-page novels you could have finished (~5h each)" icon={BookOpen} />
        <StatCard label="Toilet breaks" value={prettyNumber(toiletBreaks)} note="5-minute bathroom trips spent watching movies" icon={Timer} />
        <StatCard label="Songs unheard" value={prettyNumber(songsUnheard)} note="3.5-minute tracks that went unplayed" icon={Music} />
        <StatCard label="Nights of sleep" value={prettyNumber(nightsOfSleep)} note="Full 8-hour nights traded for cinema" icon={Moon} />
        <StatCard label="Diary watches" value={prettyNumber(stats.diaryEntries)} note={`${prettyNumber(watchlist)} films in watchlist`} icon={CalendarDays} />
      </div>

      <div className="grid-two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">YOUR TASTE, VISUALIZED</div>
              <h3>Ratings distribution</h3>
            </div>
            <TinyTag>{stats.rated} rated</TinyTag>
          </div>
          <FilmBars data={stats.ratingCounts.map(d => ({ name: d.rating, count: d.count }))} />
          <p className="fine-print">Your personal ratings (Letterboxd or IMDb), not TMDB community scores.</p>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">THROUGH THE DECADES</div>
              <h3>When your films were made</h3>
            </div>
            <TinyTag>{releaseDecades.length} decades</TinyTag>
          </div>
          <FilmBars data={releaseDecades} />
          <p className="fine-print">Release decade of watched films — not viewing date.</p>
        </div>
      </div>

      <div className="panel favorites-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">THE HALL OF FAME</div>
            <h3>Your highest-rated films</h3>
          </div>
          <span className="muted-small">
            From your own ratings <Heart size={13} />
          </span>
        </div>
        {favorites.length ? (
          <div className="poster-row">
            {favorites.map(f => (
              <div className="poster-item" key={f.key}>
                <FilmPoster film={f} onClick={() => onFilm(f)} />
                <div className="poster-item-title">{f.title}</div>
                <div className="poster-item-sub">
                  {f.year} <SmallStars rating={f.rating} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="Rate films on Letterboxd or IMDb to see your favorites here." />
        )}
      </div>

      <div className="grid-two bottom-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">MOST WATCHED GENRES</div>
              <h3>What keeps you watching</h3>
            </div>
            <Compass size={18} className="muted-icon" />
          </div>
          {allGenres.length ? (
            <VerticalBars data={allGenres.slice(0, 5).map(x => ({ name: x.name, count: x.count }))} />
          ) : (
            <EmptyState label="Connect TMDB metadata to unlock genres." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">DIRECTOR SPOTLIGHT</div>
              <h3>The minds behind your movies</h3>
            </div>
            <Users size={18} className="muted-icon" />
          </div>
          {directors.length ? (
            <div className="director-mini">
              {directors.slice(0, 5).map((d, i) => (
                <button
                  type="button"
                  className="director-mini-row director-mini-btn"
                  key={d.name}
                  onClick={() => onSelectPerson(getPersonProfile(films, d, 'directors'))}
                >
                  <span className="director-rank">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{d.name}</strong>
                    <span>{percent(d.count, directorTotal)}% of director credits · View profile</span>
                  </div>
                  <b>
                    {d.count} <small>films</small>
                  </b>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState label="Connect TMDB metadata to unlock directors." />
          )}
        </div>
      </div>

      <ViewingHeatmap allFilms={allFilms} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      <RecommendationsPanel films={films} onSelectFilm={onFilm} />

      {!hasDated && (
        <div className="notice muted">
          <Info size={17} /> Viewing timelines appear only for diary entries with an actual Watched Date.
        </div>
      )}
    </>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <Database size={20} />
      <span>{label}</span>
    </div>
  );
}

function Library({ films, onFilm }: { films: Film[]; onFilm: (f: Film) => void }) {
  const [visible, setVisible] = useState(72);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('rating');
  const [genre, setGenre] = useState('All genres');
  const [rating, setRating] = useState('All ratings');
  useEffect(() => setVisible(72), [term, sort, genre, rating]);
  const genres = ['All genres', ...rankGenres(films).map(g => g.name)];
  const filtered = films
    .filter(
      f =>
        f.title.toLowerCase().includes(term.trim().toLowerCase()) &&
        (genre === 'All genres' || f.metadata?.genres.includes(genre)) &&
        (rating === 'All ratings' ||
          (rating === 'Unrated' ? f.rating === null : f.rating !== null && f.rating >= Number(rating))),
    )
    .sort((a, b) => {
      if (sort === 'newest') return (b.year || 0) - (a.year || 0);
      if (sort === 'oldest') return (a.year || 0) - (b.year || 0);
      if (sort === 'title') return a.title.localeCompare(b.title);
      return (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title);
    });
  return (
    <>
      <SectionHeading
        eyebrow="02 / THE ARCHIVE"
        title="Every frame you collected"
        description="Search, sort, and rediscover the films that make up your story."
        side={<TinyTag accent>{filtered.length} FILMS</TinyTag>}
      />
      <div className="filters">
        <label className="filter-search">
          <Search size={16} />
          <input value={term} onChange={e => setTerm(e.target.value)} aria-label="Search films" placeholder="Find a film..." />
        </label>
        <div className="filter-select">
          <SlidersHorizontal size={15} />
          <select aria-label="Filter by genre" value={genre} onChange={e => setGenre(e.target.value)}>
            {genres.map(g => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="filter-select">
          <Star size={14} />
          <select aria-label="Filter by rating" value={rating} onChange={e => setRating(e.target.value)}>
            <option>All ratings</option>
            <option value="4.5">4.5+ stars</option>
            <option value="4">4+ stars</option>
            <option value="3">3+ stars</option>
            <option>Unrated</option>
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="filter-select">
          <select aria-label="Sort films" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="rating">Highest rated</option>
            <option value="newest">Newest release</option>
            <option value="oldest">Oldest release</option>
            <option value="title">Title A–Z</option>
          </select>
          <ChevronDown size={13} />
        </div>
      </div>
      {filtered.length ? (
        <div className="library-grid">
          {filtered.slice(0, visible).map(f => (
            <div className="library-item" key={f.key}>
              <FilmPoster film={f} onClick={() => onFilm(f)} />
              <strong>{f.title}</strong>
              <div>
                {f.year ?? 'Year unknown'} <SmallStars rating={f.rating} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label="No films match these filters." />
      )}
      {filtered.length > visible && (
        <button className="soft-btn" onClick={() => setVisible(n => n + 72)}>
          Show more films ({filtered.length - visible} remaining)
        </button>
      )}
    </>
  );
}

function People({
  films, onSelectPerson,
}: {
  films: Film[];
  onSelectPerson: (p: PersonProfileData) => void;
}) {
  const [category, setCategory] = useState<PeopleCategory>('directors');
  const label: Record<PeopleCategory, string> = {
    directors: 'Directors',
    cast: 'Actors',
    writers: 'Writers',
    cinematographers: 'Cinematographers',
    composers: 'Composers',
  };
  const items = useMemo(() => rankPeople(films, category), [films, category]);
  const unique = items.length;
  const one = items.filter(x => x.count === 1).length;
  const collabs = useMemo(() => collaborations(films), [films]);

  const openPerson = (item: RankedItem) => {
    onSelectPerson(getPersonProfile(films, item, category));
  };

  return (
    <>
      <SectionHeading
        eyebrow="03 / THE PEOPLE"
        title="The people behind your taste"
        description="Click any filmmaker or performer to inspect your watched films, highest ratings, and frequent collaborations."
        side={<TinyTag accent>{films.filter(f => f.metadata).length} FILMS ANALYZED</TinyTag>}
      />
      <div className="category-tabs">
        {(Object.keys(label) as PeopleCategory[]).map(cat => (
          <button key={cat} className={category === cat ? 'active' : ''} onClick={() => setCategory(cat)}>
            {label[cat]}
          </button>
        ))}
      </div>
      <div className="people-stats">
        <div>
          <span>UNIQUE {label[category].toUpperCase()}</span>
          <strong>{unique}</strong>
          <small>Across enriched films</small>
        </div>
        <div>
          <span>ONE-FILM SHARE</span>
          <strong>{unique ? Math.round((one / unique) * 100) : 0}%</strong>
          <small>People seen in only one film</small>
        </div>
        <div>
          <span>TOP REPEAT</span>
          <strong>{items[0]?.count ?? 0}</strong>
          <small>Movies with the top {category === 'cast' ? 'performer' : 'creator'}</small>
        </div>
      </div>
      {items.length ? (
        <div className="people-grid">
          {items.slice(0, 24).map((item, index) => (
            <div
              className="person-card person-card-interactive"
              key={`${item.id}-${item.name}`}
              role="button"
              tabIndex={0}
              aria-label={`View ${item.name} profile`}
              onClick={() => openPerson(item)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openPerson(item);
                }
              }}
            >
              <div className="person-avatar">
                {item.profile ? (
                  <img src={portraitImage(item.profile)!} loading="lazy" alt="" />
                ) : (
                  <span>{item.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
                )}
              </div>
              <div className="person-copy">
                <span className="rank-label">
                  #{String(index + 1).padStart(2, '0')} · {item.count} FILM{item.count !== 1 ? 'S' : ''}
                </span>
                <h4>{item.name}</h4>
                <div className="person-rating">
                  {item.average === null ? 'Not rated' : `${item.average.toFixed(2)} ★ average`}
                </div>
                <p title={item.films.join(', ')}>{item.films.slice(0, 3).join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label="People rankings appear when film metadata has been loaded." />
      )}
      <div className="panel collab-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">CREATIVE CHEMISTRY</div>
            <h3>Director × actor collaborations</h3>
          </div>
          <TinyTag>{collabs.length} recurring pairs</TinyTag>
        </div>
        {collabs.length ? (
          <div className="collab-list">
            {collabs.map((p, i) => (
              <div className="collab-row" key={`${p.director}-${p.actor}`}>
                <span className="collab-number">{String(i + 1).padStart(2, '0')}</span>
                <div className="collab-names">
                  <strong>{p.director}</strong>
                  <span>with {p.actor}</span>
                  <small>{p.titles.slice(0, 3).join(' · ')}</small>
                </div>
                <strong className="collab-count">
                  {p.count} <span>FILMS</span>
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="Pairs appearing in two or more of your films will show here." />
        )}
      </div>
    </>
  );
}

function DNA({ films, onSelectFilm }: { films: Film[]; onSelectFilm: (f: Film) => void }) {
  const genres = rankGenres(films);
  const countries = rankCountries(films);
  const languages = rankLanguages(films);
  const known = films.filter(f => f.metadata).length;
  const stats = getStats(films);
  const top = genres[0];
  return (
    <>
      <SectionHeading
        eyebrow="04 / CINEMATIC DNA"
        title="Your taste, decoded"
        description="Every genre, language and era leaves a mark on the way you watch."
        side={<TinyTag accent>{percent(known, films.length)}% COVERAGE</TinyTag>}
      />
      <div className="dna-feature">
        <div className="eyebrow">YOUR SIGNATURE GENRE</div>
        <div className="dna-feature-row">
          <div>
            <h2>{top?.name ?? 'Still a mystery'}</h2>
            <p>
              {top
                ? `${top.count} of ${known} enriched films explore this genre. The pattern says something about what draws you in.`
                : 'Movie metadata will reveal your signature genre.'}
            </p>
          </div>
          <div className="dna-big-number">
            {top?.percent ?? '—'}
            <span>{top ? '%' : ''}</span>
          </div>
        </div>
        <div className="dna-grain" />
      </div>
      <div className="grid-two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">GENRE AFFINITIES</div>
              <h3>The stories you choose</h3>
            </div>
          </div>
          {genres.length ? (
            <VerticalBars data={genres.slice(0, 9).map(g => ({ name: g.name, count: g.count }))} />
          ) : (
            <EmptyState label="TMDB enrichment needed." />
          )}
          <p className="fine-print">One film can belong to multiple genres.</p>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">BORDERS & BEYOND</div>
              <h3>Countries of production</h3>
            </div>
          </div>
          {countries.length ? (
            <VerticalBars data={countries.slice(0, 9).map(g => ({ name: g.name, count: g.count }))} />
          ) : (
            <EmptyState label="TMDB enrichment needed." />
          )}
          <p className="fine-print">Co-productions appear under each country.</p>
        </div>
      </div>
      <div className="grid-two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">ORIGINAL LANGUAGE</div>
              <h3>Languages in your library</h3>
            </div>
          </div>
          {languages.length ? (
            <div className="language-cloud">
              {languages.slice(0, 12).map((l, i) => (
                <div key={l.name} className={i === 0 ? 'lang-feature' : ''}>
                  <strong>{l.name.toUpperCase()}</strong>
                  <span>{l.count} films</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="TMDB enrichment needed." />
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">RELEASE ERAS</div>
              <h3>Decades you travel to</h3>
            </div>
          </div>
          <FilmBars data={stats.decades.slice(-8)} height={235} />
        </div>
      </div>
      <RecommendationsPanel films={films} onSelectFilm={onSelectFilm} />
      <div className="notice">
        <Info size={16} /> Genres, countries and language are calculated from matched TMDB films only. Counts are not extrapolated to films without metadata.
      </div>
    </>
  );
}

function Timeline({
  films, allFilms, selectedYear, onSelectYear,
}: {
  films: Film[];
  allFilms: Film[];
  selectedYear: string;
  onSelectYear: (y: string) => void;
}) {
  const stats = getStats(films);
  const years = stats.viewingYears;
  const month = stats.viewingMonths.slice(-18);
  const total = stats.diaryEntries;
  return (
    <>
      <SectionHeading
        eyebrow="05 / THE TIMELINE"
        title="When films became memories"
        description="A history of what you logged watching, one diary entry at a time."
        side={<TinyTag accent>{total} DATED WATCHES</TinyTag>}
      />
      <div className="timeline-banner">
        <div>
          <span className="eyebrow">LOGGED VIEWINGS</span>
          <h2>
            {prettyNumber(total)} <span>movie moments</span>
          </h2>
          <p>Only entries with a valid “Watched Date” count here. Simply marking a film as watched does not imply when it was viewed.</p>
        </div>
        <CalendarDays size={72} strokeWidth={1} />
      </div>
      <ViewingHeatmap allFilms={allFilms} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      <div className="grid-two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">YEAR OVER YEAR</div>
              <h3>Your viewing years</h3>
            </div>
          </div>
          <FilmArea data={years} height={260} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">RECENT VIEWING HISTORY</div>
              <h3>Monthly rhythm</h3>
            </div>
          </div>
          <FilmArea data={month} height={260} color="#82c2b4" />
        </div>
      </div>
      <div className="grid-two">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">MONDAY TO SUNDAY</div>
              <h3>When you watch</h3>
            </div>
          </div>
          <FilmBars data={[...stats.weekday.slice(1), stats.weekday[0]]} height={245} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">DIARY BREAKDOWN</div>
              <h3>The habit in numbers</h3>
            </div>
          </div>
          <div className="timeline-mini">
            <div>
              <span>Viewing years recorded</span>
              <strong>{years.length}</strong>
            </div>
            <div>
              <span>Diary watches</span>
              <strong>{total}</strong>
            </div>
            <div>
              <span>Reported rewatches</span>
              <strong>{films.reduce((a, f) => a + f.rewatches, 0)}</strong>
            </div>
            <div>
              <span>Most active year</span>
              <strong>{[...years].sort((a, b) => b.count - a.count)[0]?.name || '—'}</strong>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

type WrappedSlideId = 'overview' | 'genres' | 'auteurs' | 'favorites' | 'personality';
type CardFormat = 'story' | 'portrait' | 'square';

function Wrapped({ films, demo, selectedYear }: { films: Film[]; demo: boolean; selectedYear: string }) {
  const [slide, setSlide] = useState<WrappedSlideId>('overview');
  const [format, setFormat] = useState<CardFormat>('story');
  const stats = getStats(films);
  const genres = rankGenres(films);
  const directors = rankPeople(films, 'directors');
  const actors = rankPeople(films, 'cast');
  const favorites = stats.sortedFavorites.slice(0, 4);
  const favorite = favorites[0];
  const personality = useMemo(() => getCinemaPersonality(films), [films]);
  const heatmap = useMemo(() => getHeatmapAndStreaks(films, selectedYear), [films, selectedYear]);

  const slideOrder: { id: WrappedSlideId; label: string }[] = [
    { id: 'overview', label: '01 · Total Watching' },
    { id: 'genres', label: '02 · Top Genres' },
    { id: 'auteurs', label: '03 · Favorite Directors' },
    { id: 'favorites', label: '04 · Highest-Rated' },
    { id: 'personality', label: '05 · Cinema Personality' },
  ];
  const slideIndex = slideOrder.findIndex(s => s.id === slide);

  const copy = async () => {
    const s = `My Frameprint (${selectedYear}) 🎞️\nArchetype: ${personality.title}\n${stats.total} films · ${minutesToLabel(stats.knownRuntime)} · ${fRating(stats.avgRating)} avg\nTop genre: ${genres[0]?.name || 'N/A'}\nTop director: ${directors[0]?.name || 'N/A'}\nFavorite film: ${favorite?.title || 'N/A'}\nMade with Frameprint`;
    try {
      await navigator.clipboard.writeText(s);
      alert('Your cinematic summary was copied!');
    } catch {
      window.prompt('Copy your summary:', s);
    }
  };

  const savePng = () => {
    const dims: Record<CardFormat, { w: number; h: number }> = {
      story: { w: 1080, h: 1920 },
      portrait: { w: 1080, h: 1350 },
      square: { w: 1080, h: 1080 },
    };
    const { w, h } = dims[format];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#13262b');
    bg.addColorStop(0.5, '#0c181d');
    bg.addColorStop(1, '#060d11');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#d5ef76';
    ctx.beginPath();
    ctx.arc(w - 140, 170, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101f25';
    ctx.beginPath();
    ctx.arc(w - 140, 170, 155, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d5ef76';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`FRAMEPRINT  /  ${selectedYear.toUpperCase()} CINEMA WRAPPED`, 70, 100);

    ctx.fillStyle = '#fafaf4';
    ctx.font = 'bold 74px sans-serif';
    if (slide === 'personality') {
      ctx.fillText(personality.title, 70, 265, w - 140);
      ctx.fillStyle = '#d5ef76';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(personality.subtitle, 70, 325);
    } else {
      ctx.fillText('Every film tells', 70, 255);
      ctx.fillText('my story.', 70, 340);
      ctx.fillStyle = '#9aa9a7';
      ctx.font = '26px sans-serif';
      ctx.fillText(`${personality.title} · ${stats.total} films archived`, 70, 400);
    }

    ctx.strokeStyle = '#3c5347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 445);
    ctx.lineTo(w - 70, 445);
    ctx.stroke();

    const line = (name: string, value: string, y: number) => {
      ctx.fillStyle = '#879a9d';
      ctx.font = 'bold 23px sans-serif';
      ctx.fillText(name.toUpperCase(), 72, y);
      ctx.fillStyle = '#fafaf4';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText(value, 72, y + 60, w - 144);
    };

    if (slide === 'genres') {
      genres.slice(0, 4).forEach((g, idx) => {
        line(`#${idx + 1} Genre (${g.percent}% share)`, `${g.name} · ${g.count} films`, 520 + idx * 130);
      });
    } else if (slide === 'auteurs') {
      directors.slice(0, 4).forEach((d, idx) => {
        line(`#${idx + 1} Director`, `${d.name} (${d.count} films)`, 520 + idx * 130);
      });
    } else if (slide === 'favorites') {
      favorites.slice(0, 4).forEach((f, idx) => {
        line(`#${idx + 1} Highest Rated (${f.rating ?? 5}★)`, `${f.title} (${f.year ?? ''})`, 520 + idx * 130);
      });
    } else {
      line('Films watched & screen time', `${stats.total} films · ${minutesToLabel(stats.knownRuntime)}`, 520);
      line('Average rating', fRating(stats.avgRating), 660);
      line('Signature genre', genres[0]?.name || 'Unknown', 800);
      line('Top director', directors[0]?.name || 'Unknown', 940);
    }

    ctx.fillStyle = '#d5ef76';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`CINEMA PERSONALITY: ${personality.title.toUpperCase()}`, 70, h - 70, w - 140);

    const a = document.createElement('a');
    a.download = 'my-frameprint.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <>
      <SectionHeading
        eyebrow="06 / YOUR FRAMEPRINT"
        title="A little bit of movie magic"
        description="Explore all 5 Wrapped slides and export as an Instagram Story (9:16), Classic Portrait (4:5), or Square Social Card (1:1)."
        side={<TinyTag accent>{demo ? 'PREVIEW MODE' : `MADE FROM YOUR ${selectedYear.toUpperCase()} DATA`}</TinyTag>}
      />

      <div className="wrapped-slide-tabs" role="tablist" aria-label="Movie Wrapped slides">
        {slideOrder.map(s => (
          <button
            type="button"
            key={s.id}
            role="tab"
            aria-selected={slide === s.id}
            className={`soft-btn btn-small ${slide === s.id ? 'window-active' : ''}`}
            onClick={() => setSlide(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="wrapped-layout">
        <div className={`wrapped-card wrapped-format-${format}`}>
          <div className="wrapped-orbit" />
          <div className="wrapped-header">
            <span>
              <Clapperboard size={19} /> FRAMEPRINT
            </span>
            <small>{selectedYear === 'All time' ? 'MY CINEMATIC DNA' : `${selectedYear} WRAPPED`}</small>
          </div>

          {slide === 'overview' && (
            <>
              <div className="wrapped-main">
                <div className="eyebrow">SLIDE 01 / TOTAL WATCHING</div>
                <h2>
                  Every film
                  <br />
                  tells <em>my story.</em>
                </h2>
                <p>Here's what the movies say about me ({selectedYear}).</p>
              </div>
              <div className="wrapped-metrics">
                <div>
                  <strong>{stats.total}</strong>
                  <span>FILMS WATCHED</span>
                </div>
                <div>
                  <strong>
                    {stats.avgRating?.toFixed(2) ?? '—'}
                    <small>★</small>
                  </strong>
                  <span>AVERAGE RATING</span>
                </div>
                <div>
                  <strong>{minutesToLabel(stats.knownRuntime)}</strong>
                  <span>SCREEN TIME</span>
                </div>
              </div>
              <div className="wrapped-footer">
                <div>
                  <span>MY TOP GENRE</span>
                  <strong>{genres[0]?.name || 'Unknown'}</strong>
                </div>
                <div>
                  <span>DIRECTOR OF MY LIFE</span>
                  <strong>{directors[0]?.name || 'Unknown'}</strong>
                </div>
              </div>
            </>
          )}

          {slide === 'genres' && (
            <>
              <div className="wrapped-main">
                <div className="eyebrow">SLIDE 02 / TOP GENRES</div>
                <h2>
                  Drawn to <em>{genres[0]?.name || 'Cinema'}</em>.
                </h2>
                <p>The worlds and moods you returned to most often.</p>
              </div>
              <div className="wrapped-slide-list">
                {genres.slice(0, 5).map((g, i) => (
                  <div className="wrapped-slide-row" key={g.name}>
                    <span>#{i + 1} {g.name}</span>
                    <strong>{g.count} films ({g.percent}%)</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {slide === 'auteurs' && (
            <>
              <div className="wrapped-main">
                <div className="eyebrow">SLIDE 03 / FAVORITE DIRECTORS & STARS</div>
                <h2>
                  Guided by <em>{directors[0]?.name || 'Auteurs'}</em>.
                </h2>
                <p>The visionaries and performers who defined your screen time.</p>
              </div>
              <div className="wrapped-slide-list">
                {directors.slice(0, 3).map((d, i) => (
                  <div className="wrapped-slide-row" key={d.name}>
                    <span>Director #{i + 1} · {d.name}</span>
                    <strong>{d.count} films {d.average ? `· ${d.average.toFixed(1)}★` : ''}</strong>
                  </div>
                ))}
                {actors.slice(0, 2).map((a, i) => (
                  <div className="wrapped-slide-row" key={a.name}>
                    <span>Star #{i + 1} · {a.name}</span>
                    <strong>{a.count} films {a.average ? `· ${a.average.toFixed(1)}★` : ''}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {slide === 'favorites' && (
            <>
              <div className="wrapped-main">
                <div className="eyebrow">SLIDE 04 / HIGHEST-RATED FILMS</div>
                <h2>
                  <em>{stats.ratedFive}</em> Perfect 5★ Classics.
                </h2>
                <p>The films that earned a permanent place in your hall of fame.</p>
              </div>
              <div className="wrapped-slide-list">
                {favorites.map((f, i) => (
                  <div className="wrapped-slide-row" key={f.key}>
                    <span>#{i + 1} {f.title} ({f.year ?? 'TBA'})</span>
                    <strong>{f.rating ?? 5} ★</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {slide === 'personality' && (
            <>
              <div className="wrapped-main">
                <div className="eyebrow">SLIDE 05 / CINEMA PERSONALITY</div>
                <h2>
                  <em>{personality.title}</em>
                </h2>
                <p>{personality.description}</p>
              </div>
              <div className="wrapped-slide-list">
                {personality.traits.map(t => (
                  <div className="wrapped-slide-row" key={t}>
                    <span>TRAIT</span>
                    <strong>{t}</strong>
                  </div>
                ))}
                <div className="wrapped-slide-row">
                  <span>LONGEST STREAK</span>
                  <strong>{heatmap.longestStreak} day(s)</strong>
                </div>
              </div>
            </>
          )}

          <div className="wrapped-card-nav">
            <button
              type="button"
              className="soft-btn btn-small"
              onClick={() => setSlide(slideOrder[(slideIndex - 1 + slideOrder.length) % slideOrder.length].id)}
              aria-label="Previous Wrapped slide"
            >
              <ArrowLeft size={14} /> Prev slide
            </button>
            <span className="wrapped-bottom">Slide {slideIndex + 1} of {slideOrder.length} · ◈</span>
            <button
              type="button"
              className="soft-btn btn-small"
              onClick={() => setSlide(slideOrder[(slideIndex + 1) % slideOrder.length].id)}
              aria-label="Next Wrapped slide"
            >
              Next slide <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="wrapped-side">
          <div className="eyebrow">MAKE IT YOURS</div>
          <h2>Your movie taste deserves a spotlight.</h2>
          <p>Choose an image ratio for Instagram Stories or square social feeds, then download your active Wrapped card or copy your highlights.</p>

          <div className="wrapped-format-picker" role="group" aria-label="Share card image format">
            <button
              type="button"
              className={`soft-btn btn-small ${format === 'story' ? 'window-active' : ''}`}
              onClick={() => setFormat('story')}
            >
              Story 9:16 (1080×1920)
            </button>
            <button
              type="button"
              className={`soft-btn btn-small ${format === 'portrait' ? 'window-active' : ''}`}
              onClick={() => setFormat('portrait')}
            >
              Portrait 4:5 (1080×1350)
            </button>
            <button
              type="button"
              className={`soft-btn btn-small ${format === 'square' ? 'window-active' : ''}`}
              onClick={() => setFormat('square')}
            >
              Square 1:1 (1080×1080)
            </button>
          </div>

          <button className="primary-btn" onClick={savePng}>
            <Download size={17} /> Download share card
          </button>
          <button className="soft-btn" onClick={copy}>
            <ArrowDownToLine size={17} /> Copy my highlights
          </button>
          <div className="wrapped-highlights">
            <div>
              <span>CINEMA PERSONALITY</span>
              <strong>{personality.title}</strong>
            </div>
            <div>
              <span>FAVORITE FILM</span>
              <strong>{favorite?.title || 'No ratings yet'}</strong>
            </div>
            <div>
              <span>HIGHEST-RATED MOVIES</span>
              <strong>{stats.ratedFive} perfect 5★ ratings</strong>
            </div>
            <div>
              <span>TOP DIRECTOR</span>
              <strong>{directors[0]?.name || 'Needs metadata'}</strong>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function UploadDialog({
  onClose, onImport, busy, error, canMerge, loadedFiles, saveLocal, onToggleSaveLocal, onDeleteLocalData,
}: {
  onClose: () => void;
  onImport: (files: File[], merge?: boolean) => Promise<void>;
  busy: boolean;
  error: string | null;
  canMerge: boolean;
  loadedFiles: string[];
  saveLocal: boolean;
  onToggleSaveLocal: (val: boolean) => void;
  onDeleteLocalData: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const mergeOverride = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section
        className="upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import Letterboxd or IMDb data"
        onMouseDown={e => e.stopPropagation()}
      >
        <button className="icon-btn modal-close" aria-label="Close upload" onClick={onClose}>
          <X size={19} />
        </button>
        <div className="upload-logo">
          <UploadCloud size={27} />
        </div>
        <div className="eyebrow">YOUR DATA, YOUR STORY</div>
        <h2>Let's find your frameprint.</h2>
        <p>
          Drop your <strong>Letterboxd .zip / .csv</strong> export or your <strong>IMDb ratings / lists .csv</strong> export. You can also select multiple CSV files at once.
        </p>
        {error && (
          <div role="alert" className="upload-error">
            {error}
          </div>
        )}
        {canMerge && (
          <div className="upload-merge-bar">
            <label className="upload-merge-toggle">
              <input
                type="checkbox"
                checked={mergeMode}
                onChange={e => {
                  mergeOverride.current = e.target.checked;
                  setMergeMode(e.target.checked);
                }}
              />
              <span>
                Merge with current library ({loadedFiles.length ? loadedFiles.map(f => f.split('/').at(-1)).join(', ') : 'active import'})
              </span>
            </label>
            <button
              type="button"
              className="soft-btn btn-small"
              onClick={() => {
                mergeOverride.current = true;
                setMergeMode(true);
                fileInput.current?.click();
              }}
            >
              + Add & merge CSVs
            </button>
          </div>
        )}
        <div
          className={`dropzone ${drag ? 'is-dragging' : ''}`}
          onDragEnter={e => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={e => e.preventDefault()}
          onDragLeave={e => {
            e.preventDefault();
            setDrag(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setDrag(false);
            const list = Array.from(e.dataTransfer.files);
            if (list.length) void onImport(list, mergeOverride.current || mergeMode);
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
          }}
        >
          <FolderOpen size={34} />
          <strong>{busy ? 'Reading your export…' : 'Drag & drop your Letterboxd or IMDb export'}</strong>
          <span>or click to select a ZIP or one or more CSV files</span>
          <small>Letterboxd ZIP / CSVs or IMDb ratings / lists CSV · Max 25 MB</small>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".zip,.csv"
            onChange={e => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              const shouldMerge = mergeOverride.current || mergeMode;
              mergeOverride.current = false;
              if (list.length) void onImport(list, shouldMerge);
              e.target.value = '';
            }}
          />
        </div>
        <div className="upload-persist-bar">
          <label className="upload-merge-toggle">
            <input type="checkbox" checked={saveLocal} onChange={e => onToggleSaveLocal(e.target.checked)} />
            <span>Save on this device (IndexedDB) so reloads keep my library</span>
          </label>
          {(saveLocal || canMerge) && (
            <button type="button" className="soft-btn btn-small" onClick={onDeleteLocalData}>
              <Trash2 size={13} /> Delete my local data
            </button>
          )}
        </div>
        <div className="upload-steps">
          <span>01</span> Open{' '}
          <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener noreferrer">
            Letterboxd → Data <ExternalLink size={12} />
          </a>{' '}
          or{' '}
          <a href="https://www.imdb.com/list/ratings/" target="_blank" rel="noopener noreferrer">
            IMDb → Ratings <ExternalLink size={12} />
          </a>
          <span>02</span> Export Data / CSV <span>03</span> Upload ZIP or CSVs
        </div>
        <div className="privacy-line">
          <ShieldCheck size={17} /> We process your files locally. Only movie titles and release years are sent for TMDB lookup.
        </div>
      </section>
    </div>
  );
}

const META_CACHE_KEY = 'frameprint.meta.v1';
function loadCachedMeta(): Map<string, FilmMeta> {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw) as [string, FilmMeta][];
    return new Map(Array.isArray(entries) ? entries : []);
  } catch {
    return new Map();
  }
}
function saveCachedMeta(cache: Map<string, FilmMeta>) {
  try {
    const entries = Array.from(cache.entries()).slice(-2500);
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

export default function App() {
  const [films, setFilms] = useState<Film[]>(demoFilms);
  const [demo, setDemo] = useState(true);
  const [screen, setScreen] = useState<Screen>('overview');
  const [selectedYear, setSelectedYear] = useState<string>('All time');
  const [selected, setSelected] = useState<Film | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonProfileData | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const [saveLocal, setSaveLocal] = useState<boolean>(() => isSaveEnabled());
  const [error, setError] = useState<string | null>(null);
  const [enrich, setEnrich] = useState({ running: false, done: 0, total: 0, message: '' });
  const aborter = useRef<AbortController | null>(null);
  const importing = useRef(false);
  const attempted = useRef(new Set<string>());
  const metaCache = useRef<Map<string, FilmMeta>>(loadCachedMeta());
  const filmsRef = useRef(films);

  useEffect(() => {
    filmsRef.current = films;
  }, [films]);
  useEffect(() => () => aborter.current?.abort(), []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setSelectedPerson(null);
        setUploadOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  // Load saved library from IndexedDB if user opted into Save on this device
  useEffect(() => {
    if (!isSaveEnabled()) return;
    let cancelled = false;
    loadLibraryFromDevice()
      .then(saved => {
        if (cancelled || !saved || !saved.films.length) return;
        filmsRef.current = saved.films;
        setFilms(saved.films);
        setWatchlistCount(saved.watchlistCount);
        setWarnings(saved.warnings);
        setLoadedFiles(saved.fileNames);
        setDemo(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep IndexedDB updated when saveLocal is enabled and user has imported data
  useEffect(() => {
    if (!saveLocal || demo) return;
    void saveLibraryToDevice({
      films,
      watchlistCount,
      warnings,
      fileNames: loadedFiles,
      savedAt: new Date().toISOString(),
    });
  }, [saveLocal, demo, films, watchlistCount, warnings, loadedFiles]);

  const availableYears = useMemo(() => getAvailableYears(films), [films]);
  const activeFilms = useMemo(() => filterFilmsByYear(films, selectedYear), [films, selectedYear]);
  const stats = useMemo(() => getStats(activeFilms), [activeFilms]);

  const handleToggleSaveLocal = (enabled: boolean) => {
    setSaveEnabled(enabled);
    setSaveLocal(enabled);
    if (enabled && !demo) {
      void saveLibraryToDevice({
        films: filmsRef.current,
        watchlistCount,
        warnings,
        fileNames: loadedFiles,
        savedAt: new Date().toISOString(),
      });
    } else if (!enabled) {
      void clearLibraryFromDevice();
    }
  };

  const handleDeleteLocalData = () => {
    aborter.current?.abort();
    attempted.current.clear();
    metaCache.current.clear();
    void clearLibraryFromDevice();
    setSaveLocal(false);
    setDemo(true);
    setSelectedYear('All time');
    setWatchlistCount(0);
    setLoadedFiles([]);
    setSelected(null);
    setSelectedPerson(null);
    setFilms(demoFilms);
    filmsRef.current = demoFilms;
    setScreen('overview');
    setError(null);
    setWarnings([]);
    setEnrich({ running: false, done: 0, total: 0, message: '' });
  };

  const runEnrich = useCallback(async (input: Film[]) => {
    if (!hasApi) return;
    aborter.current?.abort();
    const controller = new AbortController();
    aborter.current = controller;
    const queue = input.filter(f => !f.metadata && !attempted.current.has(f.key));
    if (!queue.length) return;
    const BATCH_SIZE = 24;
    const PARALLEL_BATCHES = 2;
    setEnrich({ running: true, done: 0, total: queue.length, message: 'Matching films with TMDB…' });
    try {
      let completed = 0;
      for (let pos = 0; pos < queue.length; pos += BATCH_SIZE * PARALLEL_BATCHES) {
        if (controller.signal.aborted) break;
        const wave: Film[][] = [];
        for (let b = 0; b < PARALLEL_BATCHES; b++) {
          const slice = queue.slice(pos + b * BATCH_SIZE, pos + (b + 1) * BATCH_SIZE);
          if (slice.length) wave.push(slice);
        }
        const waveResults = await Promise.all(wave.map(batch => enrichBatch(batch, controller.signal)));
        if (controller.signal.aborted) break;
        const items = waveResults.flat();
        const map = new Map(items.map(x => [x.key, x]));
        let cacheUpdated = false;
        for (const item of items) {
          if (!item.retryable) attempted.current.add(item.key);
          if (item.metadata) {
            metaCache.current.set(item.key, item.metadata);
            cacheUpdated = true;
          }
        }
        if (cacheUpdated) saveCachedMeta(metaCache.current);
        completed += wave.reduce((sum, b) => sum + b.length, 0);
        setFilms(old => {
          const newer = old.map(f => {
            const found = map.get(f.key);
            return found?.metadata ? { ...f, metadata: found.metadata } : f;
          });
          filmsRef.current = newer;
          return newer;
        });
        setEnrich({
          running: true,
          done: Math.min(completed, queue.length),
          total: queue.length,
          message: 'Building your cinematic portrait…',
        });
        if (pos + BATCH_SIZE * PARALLEL_BATCHES < queue.length) await waitFor(120, controller.signal);
      }
      if (!controller.signal.aborted) setEnrich(old => ({ ...old, running: false, message: 'Metadata pass complete.' }));
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message);
      setEnrich(old => ({ ...old, running: false, message: 'Enrichment paused. Resume when ready.' }));
    }
  }, []);

  const onImport = async (input: File | File[], merge = false) => {
    if (importing.current) return;
    const fileList = Array.isArray(input) ? input : [input];
    if (!fileList.length) return;
    importing.current = true;
    setIsImporting(true);
    setError(null);
    aborter.current?.abort();
    setEnrich(old => ({ ...old, running: false }));
    try {
      const incoming: ImportResult = await importInWorker(fileList.length === 1 ? fileList[0] : fileList);
      const parsed: ImportResult =
        !demo && merge
          ? mergeImportResults({ films: filmsRef.current, watchlistCount, warnings, fileNames: loadedFiles }, incoming)
          : incoming;
      const hydratedFilms = parsed.films.map(f => {
        if (f.metadata) return f;
        const cached = metaCache.current.get(f.key);
        return cached ? { ...f, metadata: cached } : f;
      });
      if (demo || !merge) attempted.current.clear();
      filmsRef.current = hydratedFilms;
      setFilms(hydratedFilms);
      setWarnings(parsed.warnings);
      setWatchlistCount(parsed.watchlistCount);
      setLoadedFiles(parsed.fileNames);
      setDemo(false);
      setSelectedYear('All time');
      setSelected(null);
      setSelectedPerson(null);
      setScreen('overview');
      setUploadOpen(false);
      setNavOpen(false);
      setEnrich({ running: false, done: 0, total: 0, message: '' });
      if (hasApi) void runEnrich(hydratedFilms);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      importing.current = false;
      setIsImporting(false);
    }
  };

  const resetDemo = () => {
    aborter.current?.abort();
    attempted.current.clear();
    setDemo(true);
    setSelectedYear('All time');
    setWatchlistCount(0);
    setLoadedFiles([]);
    setSelected(null);
    setSelectedPerson(null);
    setFilms(demoFilms);
    filmsRef.current = demoFilms;
    setScreen('overview');
    setError(null);
    setWarnings([]);
    setEnrich({ running: false, done: 0, total: 0, message: '' });
  };

  const remaining = films.filter(f => !f.metadata && !attempted.current.has(f.key)).length;
  const downloadData = () => {
    const data = {
      source: 'Frameprint',
      demo,
      selectedYear,
      generatedAt: new Date().toISOString(),
      stats,
      topGenres: rankGenres(activeFilms),
      topDirectors: rankPeople(activeFilms, 'directors'),
      films: activeFilms,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frameprint-analysis.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const navigate = (id: Screen) => {
    setScreen(id);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={e => {
            e.preventDefault();
            navigate('overview');
          }}
        >
          <span className="brand-icon">
            <Clapperboard size={24} />
          </span>
          <span>
            frameprint<small>YOUR CINEMATIC DNA</small>
          </span>
        </a>
        <div className="sidebar-section-label">YOUR WORLD</div>
        <nav className="nav-list" aria-label="Main navigation">
          {features.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${screen === id ? 'nav-active' : ''}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {screen === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-callout">
            <span className="callout-mark">✳</span>
            <strong>It's all about your stories.</strong>
            <p>One upload. A whole universe of insights.</p>
            <button onClick={() => setUploadOpen(true)}>
              Analyze my films <ArrowRight size={14} />
            </button>
          </div>
          <div className="sidebar-credit">
            <div>
              MADE FOR FILM LOVERS <Heart size={12} />
            </div>
            <span>Not affiliated with Letterboxd or IMDb</span>
          </div>
        </div>
      </aside>
      {navOpen && (
        <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setNavOpen(false)} />
      )}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <span className="breadcrumbs">
              YOUR FRAMEPRINT <span>/</span> {sections[screen].toUpperCase()}
            </span>
          </div>
          <div className="topbar-right">
            <div className="topbar-year-filter">
              <CalendarDays size={13} />
              <select
                aria-label="Filter dashboard by year"
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
              >
                <option value="All time">All time</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
            <div className={`status-pill ${demo ? 'status-demo' : 'status-live'}`}>
              <span className="live-dot" />
              {demo ? 'DEMO DATA' : 'PERSONAL LIBRARY'}
            </div>
            <button
              className="icon-btn topbar-download"
              title="Download analysis JSON"
              aria-label="Download analysis"
              onClick={downloadData}
            >
              <Download size={18} />
            </button>
            <button aria-label="Import data" className="topbar-import" onClick={() => setUploadOpen(true)}>
              <UploadCloud size={16} />
              <span>Import data</span>
            </button>
          </div>
        </header>
        <main className="content">
          {error && (
            <div role="alert" className="notice error-notice">
              <Info size={17} />
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {demo && screen !== 'overview' && (
            <div className="demo-note">
              <Sparkles size={16} /> You're exploring a fictional sample library.{' '}
              <button onClick={() => setUploadOpen(true)}>
                Upload your own export <ArrowRight size={14} />
              </button>
            </div>
          )}
          {!demo && (
            <div className="local-save-banner">
              <div className="local-save-copy">
                <HardDrive size={15} />
                <span>
                  {saveLocal
                    ? 'Saved privately on this device (IndexedDB) — reloads will restore your library.'
                    : 'Session-only mode — enable Save on this device to keep your library across reloads.'}
                </span>
              </div>
              <div className="local-save-actions">
                <label className="upload-merge-toggle">
                  <input
                    type="checkbox"
                    checked={saveLocal}
                    onChange={e => handleToggleSaveLocal(e.target.checked)}
                  />
                  <span>Save on this device</span>
                </label>
                <button type="button" className="soft-btn btn-small" onClick={handleDeleteLocalData}>
                  <Trash2 size={13} /> Delete my local data
                </button>
              </div>
            </div>
          )}
          {!demo && !hasApi && (
            <div className="notice">
              <Info size={17} /> Your import is ready. Movie details are temporarily unavailable; your ratings, library and diary statistics still work.
            </div>
          )}
          {!demo && hasApi && (enrich.running || remaining > 0) && (
            <div className="enrich-banner">
              <div className="enrich-info">
                <span className="enrich-dot" />
                <div>
                  <strong>
                    {enrich.running ? 'Enriching your movie library…' : `${remaining} films still need metadata`}
                  </strong>
                  <p>
                    {enrich.running
                      ? `${enrich.done} of ${enrich.total} films in this pass · ${getStats(films).metadataCount} of ${films.length} enriched overall`
                      : 'Continue loading movie details. Titles without a confident match are left unmatched.'}
                  </p>
                </div>
              </div>
              <div className="enrich-controls">
                {enrich.running ? (
                  <>
                    <div className="progress-track">
                      <span style={{ width: `${percent(enrich.done, enrich.total)}%` }} />
                    </div>
                    <button
                      className="soft-btn btn-small"
                      onClick={() => {
                        aborter.current?.abort();
                        setEnrich(old => ({ ...old, running: false }));
                      }}
                    >
                      <Pause size={13} /> Pause
                    </button>
                  </>
                ) : (
                  <button
                    className="soft-btn btn-small"
                    onClick={() => {
                      setError(null);
                      void runEnrich(filmsRef.current);
                    }}
                  >
                    <Play size={13} /> Continue enrichment
                  </button>
                )}
              </div>
            </div>
          )}
          {!demo && warnings.length > 0 && (
            <details className="warning-details">
              <summary>
                {warnings.length} import note{warnings.length > 1 ? 's' : ''} <ChevronDown size={14} />
              </summary>
              <ul>
                {warnings.map(w => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {screen === 'overview' && (
            <Overview
              films={activeFilms}
              allFilms={films}
              selectedYear={selectedYear}
              onSelectYear={setSelectedYear}
              onFilm={setSelected}
              onSelectPerson={setSelectedPerson}
              openUpload={() => setUploadOpen(true)}
              demo={demo}
              watchlist={watchlistCount}
            />
          )}
          {screen === 'library' && <Library films={activeFilms} onFilm={setSelected} />}
          {screen === 'people' && <People films={activeFilms} onSelectPerson={setSelectedPerson} />}
          {screen === 'dna' && <DNA films={activeFilms} onSelectFilm={setSelected} />}
          {screen === 'timeline' && (
            <Timeline
              films={activeFilms}
              allFilms={films}
              selectedYear={selectedYear}
              onSelectYear={setSelectedYear}
            />
          )}
          {screen === 'wrapped' && <Wrapped films={activeFilms} demo={demo} selectedYear={selectedYear} />}
          <footer className="footer">
            <div className="footer-logo">
              <Clapperboard size={17} /> frameprint <span>© {new Date().getFullYear()}</span>
            </div>
            <div className="footer-links">
              <button onClick={resetDemo}>Explore sample</button>
              <button onClick={downloadData}>Export JSON</button>
              {!demo && (
                <button onClick={handleDeleteLocalData}>Delete my local data</button>
              )}
              <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
                TMDB <ExternalLink size={12} />
              </a>
            </div>
            <p className="tmdb-credit">
              <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="Visit TMDB">
                <img
                  width="93"
                  height="25"
                  alt="TMDB logo"
                  src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg"
                />
              </a>
              <span>
                This product uses the TMDB API but is not endorsed or certified by TMDB. Movie metadata and imagery:{' '}
                <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
                  The Movie Database
                </a>
                .
              </span>
            </p>
          </footer>
        </main>
      </div>
      {selected && <FilmDetail film={selected} onClose={() => setSelected(null)} />}
      {selectedPerson && (
        <PersonDetail
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onSelectFilm={setSelected}
        />
      )}
      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onImport={onImport}
          busy={isImporting}
          error={error}
          canMerge={!demo}
          loadedFiles={loadedFiles}
          saveLocal={saveLocal}
          onToggleSaveLocal={handleToggleSaveLocal}
          onDeleteLocalData={handleDeleteLocalData}
        />
      )}
    </div>
  );
}
