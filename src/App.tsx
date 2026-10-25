import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 Activity, ArrowDownToLine, ArrowRight, CalendarDays, ChevronDown,
 Clapperboard, Compass, Database, Download, ExternalLink, Film as FilmIcon, FolderOpen,
 Heart, Info, LayoutDashboard, Menu, Pause, Play, Search, ShieldCheck,
 SlidersHorizontal, Sparkles, Star, Tv, UploadCloud, Users, X
} from 'lucide-react';
import type { DiscoveryItem, Film, FilmMeta, ImportResult, Screen } from './lib/types';
import type { PeopleCategory } from './lib/stats';
import { importInWorker } from './lib/import-client';
import { demoDiscovery, demoFilms } from './data/demo';
import { collaborations, getStats, minutesToLabel, prettyNumber, rankCountries, rankGenres, rankLanguages, rankPeople } from './lib/stats';
import { enrichBatch, fetchMediaDetails, fetchTrending, hasApi, searchTmdb, waitFor } from './lib/enrich';
import { FilmArea, FilmBars, VerticalBars } from './components/Charts';

const movieImage = (path:string|null|undefined, size:'w185'|'w342'|'w500'|'w780'='w342') => path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const portraitImage = (path:string|null|undefined) => path ? `https://image.tmdb.org/t/p/w185${path}` : null;
const fRating = (n:number|null) => n === null ? '—' : `${Number(n.toFixed(2))} / 5`;
const percent = (n:number, total:number) => total ? Math.round(n/total*100) : 0;
const features = [
 {id:'overview',label:'Overview',icon:LayoutDashboard},
 {id:'discover',label:'Discover',icon:Tv},
 {id:'library',label:'Film library',icon:FilmIcon},
 {id:'people',label:'Cast & crew',icon:Users},
 {id:'dna',label:'Cinematic DNA',icon:Compass},
 {id:'timeline',label:'Timeline',icon:CalendarDays},
 {id:'wrapped',label:'Your wrapped',icon:Sparkles},
] as const;
const sections:Record<Screen,string> = {
 overview:'The big picture',
 discover:'Movies & TV discovery',
 library:'Your film archive',
 people:'Behind the frames',
 dna:'The stories you gravitate to',
 timeline:'A journey through film',
 wrapped:'Your films in frames'
};

function TinyTag({children,accent=false}:{children:React.ReactNode;accent?:boolean}) {return <span className={`tag ${accent?'tag-accent':''}`}>{children}</span>;}
function SectionHeading({eyebrow,title,description,side}:{eyebrow:string;title:string;description?:string;side?:React.ReactNode}) {
 return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{side&&<div className="section-side">{side}</div>}</div>;
}
function SmallStars({rating,scale=5}:{rating:number|null;scale?:5|10}) {
 return <span className="stars"><Star size={12} fill="currentColor"/> {rating === null?'Unrated':scale===10?`${rating.toFixed(1)}`:rating.toFixed(1)}</span>;
}
function FilmPoster({film,className='',onClick,badge}:{film:{title:string;year:number|null;metadata?:{poster?:string|null}};className?:string;onClick?:()=>void;badge?:string}) {
 const img = movieImage(film.metadata?.poster);
 const colors = ['poster-sage','poster-umber','poster-ruby','poster-ink','poster-teal','poster-violet'];
 const tint = colors[Math.abs([...film.title].reduce((a,c)=>a+c.charCodeAt(0),0))%colors.length];
 return <button className={`poster ${tint} ${className}`} onClick={onClick} aria-label={`View ${film.title} details`}>
 {badge && <span className={`media-badge media-${badge.toLowerCase()}`}>{badge}</span>}
 {img ? <img loading="lazy" src={img} alt={`${film.title} movie poster`}/> : <span className="poster-typography"><small>FRAMEPRINT / {film.year || 'FILM'}</small><strong>{film.title}</strong><i>◈</i></span>}
 <span className="poster-shade"/><span className="poster-hover">View film <ArrowRight size={13}/></span>
 </button>;
}
function FilmDetail({film,onClose}:{film:Film;onClose:()=>void}) {
 const m = film.metadata;
 const isTv = m?.mediaType === 'tv';
 const tmdbUrl = m ? `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${m.id}` : null;
 return <div className="modal-scrim" onClick={onClose} role="presentation"><section className="detail-modal" role="dialog" aria-modal="true" aria-label={`${film.title} details`} onClick={e=>e.stopPropagation()}>
 <button className="icon-btn modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
 <div className="detail-poster"><FilmPoster film={film} badge={isTv?'TV':undefined}/></div>
 <div className="detail-copy">
  <div className="eyebrow">{isTv ? 'TV SERIES DETAILS' : 'FILM DETAILS'} · {film.year ?? 'UNKNOWN YEAR'}</div>
  <h2>{film.title}</h2>
  <div className="detail-tags">
   {film.rating!==null ? <TinyTag accent>{`${film.rating} / 5 stars`}</TinyTag> : <TinyTag accent>{isTv ? 'TV Series' : 'Not rated'}</TinyTag>}
   {m?.tmdbRating!==null&&m?.tmdbRating!==undefined&&<TinyTag>TMDB {Number(m.tmdbRating).toFixed(1)} ★</TinyTag>}
   {m?.runtime&&<TinyTag>{isTv ? `${m.runtime}m / ep` : `${Math.floor(m.runtime/60)}h ${m.runtime%60}m`}</TinyTag>}
   {m?.seasons&&<TinyTag>{m.seasons} season{m.seasons===1?'':'s'}{m.episodes?` · ${m.episodes} eps`:''}</TinyTag>}
   {film.diaryDates.length>0&&<TinyTag>{film.diaryDates.length} diary log(s)</TinyTag>}
  </div>
  <p>{m?.overview||'Detailed movie information becomes available after TMDB enrichment.'}</p>
  <div className="detail-data">
   <span>{isTv ? 'CREATED BY' : 'DIRECTED BY'}</span><strong>{m?.directors.map(p=>p.name).join(', ')||'Not available'}</strong>
   {m?.writers&&m.writers.length>0&&<><span>WRITTEN BY</span><strong>{m.writers.slice(0,4).map(p=>p.name).join(', ')}</strong></>}
   <span>GENRES</span><strong>{m?.genres.join(' · ')||'Not available'}</strong>
   <span>CAST</span><strong>{m?.cast.slice(0,6).map(p=>p.name).join(' · ')||'Not available'}</strong>
   <span>PRODUCTION</span><strong>{m?.countries.join(' · ')||'Not available'}</strong>
  </div>
  <div className="detail-actions">{film.letterboxdUrl&&<a className="primary-btn" href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer">View on Letterboxd <ExternalLink size={14}/></a>}{tmdbUrl&&<a className="soft-btn" href={tmdbUrl} target="_blank" rel="noopener noreferrer">TMDB page <ExternalLink size={14}/></a>}</div>
 </div></section></div>;
}
function StatCard({label,value,note,icon:Icon,accent=false}:{label:string;value:string;note:string;icon:typeof FilmIcon;accent?:boolean}) {
 return <div className={`stat-card ${accent?'stat-accent':''}`}><div className="stat-top"><span>{label}</span><Icon size={18}/></div><div className="stat-value">{value}</div><p>{note}</p></div>;
}
function Overview({films,onFilm,openUpload,onDiscover,demo,watchlist}:{films:Film[];onFilm:(f:Film)=>void;openUpload:()=>void;onDiscover:()=>void;demo:boolean;watchlist:number}) {
 const stats = useMemo(()=>getStats(films),[films]);
 const favorites = stats.sortedFavorites.slice(0,6);
 const allGenres=rankGenres(films);
 const directors=rankPeople(films,'directors');
 const directorTotal=directors.reduce((a,b)=>a+b.count,0);
 const releaseDecades=stats.decades.slice(-7);
 const hasDated = stats.diaryEntries > 0;
 return <>
 <div className="hero"><div className="hero-text"><div className="hero-kicker"><span className="live-dot"/> YOUR CINEMATIC UNIVERSE <span className="hero-line"/></div><h1>Every film tells<br/>a little <em>about you.</em></h1><p>A beautifully detailed portrait of everything you've watched, loved, and rated—plus live TMDB movie and TV discovery.</p><div className="hero-actions"><button className="primary-btn" onClick={openUpload}><UploadCloud size={17}/> {demo?'Analyze your Letterboxd':'Import another export'} <ArrowRight size={16}/></button><button className="soft-btn" onClick={onDiscover}><Tv size={16}/> Explore Movies & TV</button><span className="hero-privacy"><ShieldCheck size={15}/> ZIP stays in your browser</span></div></div>
 <div className="hero-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="hero-art-text">FRAME<br/><i>BY</i> FRAME<span>EST. YOUR FIRST WATCH</span></div><div className="corner-number">01 / 07</div></div></div>
 <SectionHeading eyebrow="01 / AT A GLANCE" title="Your story in numbers" description="A few numbers that say a lot about your taste." side={<TinyTag accent>{demo?'SAMPLE ACCOUNT':'YOUR IMPORT'}</TinyTag>}/>
 <div className="stats-grid"><StatCard label="Films watched" value={prettyNumber(stats.total)} note="Unique titles in your library" icon={Clapperboard} accent/>
 <StatCard label="Average rating" value={stats.avgRating===null?'—':stats.avgRating.toFixed(2)+' ★'} note={`Across ${prettyNumber(stats.rated)} rated films`} icon={Star}/>
 <StatCard label="Known screen time" value={minutesToLabel(stats.knownRuntime)} note={`${stats.runtimeCount} of ${stats.total} runtimes known; includes diary repeats`} icon={Activity}/>
 <StatCard label="Diary watches" value={prettyNumber(stats.diaryEntries)} note={`${prettyNumber(watchlist)} films in watchlist`} icon={CalendarDays}/></div>
 <div className="grid-two">
  <div className="panel"><div className="panel-head"><div><div className="eyebrow">YOUR TASTE, VISUALIZED</div><h3>Ratings distribution</h3></div><TinyTag>{stats.rated} rated</TinyTag></div><FilmBars data={stats.ratingCounts.map(d=>({name:d.rating,count:d.count}))}/><p className="fine-print">Your Letterboxd ratings, not TMDB community scores.</p></div>
  <div className="panel"><div className="panel-head"><div><div className="eyebrow">THROUGH THE DECADES</div><h3>When your films were made</h3></div><TinyTag>{releaseDecades.length} decades</TinyTag></div><FilmBars data={releaseDecades}/><p className="fine-print">Release decade of watched films — not viewing date.</p></div>
 </div>
 <div className="panel favorites-panel"><div className="panel-head"><div><div className="eyebrow">THE HALL OF FAME</div><h3>Your highest-rated films</h3></div><span className="muted-small">From your own ratings <Heart size={13}/></span></div>
 {favorites.length ? <div className="poster-row">{favorites.map(f=><div className="poster-item" key={f.key}><FilmPoster film={f} onClick={()=>onFilm(f)}/><div className="poster-item-title">{f.title}</div><div className="poster-item-sub">{f.year} <SmallStars rating={f.rating}/></div></div>)}</div> : <EmptyState label="Rate films on Letterboxd to see your favorites here."/>}</div>
 <div className="grid-two bottom-grid"><div className="panel"><div className="panel-head"><div><div className="eyebrow">MOST WATCHED GENRES</div><h3>What keeps you watching</h3></div><Compass size={18} className="muted-icon"/></div>{allGenres.length?<VerticalBars data={allGenres.slice(0,5).map(x=>({name:x.name,count:x.count}))}/>:<EmptyState label="Connect TMDB metadata to unlock genres."/>}</div>
 <div className="panel"><div className="panel-head"><div><div className="eyebrow">DIRECTOR SPOTLIGHT</div><h3>The minds behind your movies</h3></div><Users size={18} className="muted-icon"/></div>{directors.length?<div className="director-mini">{directors.slice(0,5).map((d,i)=><div className="director-mini-row" key={d.name}><span className="director-rank">{String(i+1).padStart(2,'0')}</span><div><strong>{d.name}</strong><span>{percent(d.count,directorTotal)}% of director credits</span></div><b>{d.count} <small>films</small></b></div>)}</div>:<EmptyState label="Connect TMDB metadata to unlock directors."/>}</div></div>
 {!hasDated&&<div className="notice muted"><Info size={17}/> Viewing timelines appear only for diary entries with an actual Watched Date.</div>}
 </>;
}
function EmptyState({label}:{label:string}){return <div className="empty-state"><Database size={20}/><span>{label}</span></div>}

function Discover({onSelectFilm}:{onSelectFilm:(f:Film)=>void}) {
 const [mediaFilter,setMediaFilter]=useState<'all'|'movie'|'tv'>('all');
 const [timeWindow,setTimeWindow]=useState<'week'|'day'>('week');
 const [query,setQuery]=useState('');
 const [genreFilter,setGenreFilter]=useState('All genres');
 const [items,setItems]=useState<DiscoveryItem[]>(demoDiscovery);
 const [loading,setLoading]=useState(false);
 const [liveSource,setLiveSource]=useState(false);
 const detailCache=useRef(new Map<string,FilmMeta>());

 useEffect(()=>{
  const trimmed=query.trim();
  const controller=new AbortController();
  if(!hasApi){
   const basePool=demoDiscovery.filter(item=>
    (mediaFilter==='all'||item.mediaType===mediaFilter)&&
    (!trimmed||item.title.toLowerCase().includes(trimmed.toLowerCase())||item.overview.toLowerCase().includes(trimmed.toLowerCase()))
   );
   setItems(basePool);
   setLiveSource(false);
   return ()=>controller.abort();
  }
  const timer=setTimeout(async()=>{
   setLoading(true);
   try{
    const remote=trimmed
     ? await searchTmdb(trimmed, mediaFilter==='all'?'multi':mediaFilter, controller.signal)
     : await fetchTrending(mediaFilter, timeWindow, controller.signal);
    if(!controller.signal.aborted){
     if(remote.length){
      const merged=trimmed?remote:[...remote,...demoDiscovery.filter(d=>!remote.some(r=>r.id===d.id&&r.mediaType===d.mediaType))];
      setItems(merged);
      setLiveSource(true);
     }else{
      const fallback=demoDiscovery.filter(item=>
       (mediaFilter==='all'||item.mediaType===mediaFilter)&&
       (!trimmed||item.title.toLowerCase().includes(trimmed.toLowerCase()))
      );
      setItems(fallback);
      setLiveSource(false);
     }
    }
   }catch{
    if(!controller.signal.aborted){
     const fallback=demoDiscovery.filter(item=>
      (mediaFilter==='all'||item.mediaType===mediaFilter)&&
      (!trimmed||item.title.toLowerCase().includes(trimmed.toLowerCase()))
     );
     setItems(fallback);
     setLiveSource(false);
    }
   }finally{
    if(!controller.signal.aborted)setLoading(false);
   }
  }, trimmed ? 260 : 0);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[mediaFilter,timeWindow,query]);

 const allGenres=useMemo(()=>{
  const set=new Set<string>();
  for(const item of items)for(const g of item.genres)set.add(g);
  return ['All genres',...Array.from(set).sort()];
 },[items]);

 const visibleItems=useMemo(()=>items.filter(item=>
  (mediaFilter==='all'||item.mediaType===mediaFilter)&&
  (genreFilter==='All genres'||item.genres.includes(genreFilter))
 ),[items,mediaFilter,genreFilter]);

 const openDiscoveryItem=async(item:DiscoveryItem)=>{
  const cacheKey=`${item.mediaType}:${item.id}`;
  const existing=item.metadata||detailCache.current.get(cacheKey);
  const initialMeta:FilmMeta=existing||{
   id:item.id,title:item.title,year:item.year,poster:item.poster,backdrop:item.backdrop,
   overview:item.overview,runtime:null,genres:item.genres,countries:[],language:item.language,
   cast:[],directors:[],writers:[],cinematographers:[],composers:[],tmdbRating:item.tmdbRating,
   mediaType:item.mediaType
  };
  const asFilm:Film={
   key:`discover|${item.mediaType}|${item.id}`,
   title:item.title,year:item.year,rating:null,liked:false,rewatches:0,diaryDates:[],metadata:initialMeta
  };
  onSelectFilm(asFilm);
  if(!existing&&hasApi){
   try{
    const full=await fetchMediaDetails(item.mediaType,item.id);
    if(full){
     detailCache.current.set(cacheKey,full);
     onSelectFilm({...asFilm,metadata:full});
    }
   }catch{
    // Keep initial discovery metadata on network failure.
   }
  }
 };

 const spotlight=visibleItems[0];
 const backdropUrl=movieImage(spotlight?.backdrop||spotlight?.poster,'w780');

 return <>
  <SectionHeading
   eyebrow="02 / MOVIE & TV DISCOVERY"
   title="Trending across cinema & television"
   description="Search movies and TV series worldwide, explore trending releases, and inspect full TMDB cast, crew, and ratings."
   side={<TinyTag accent>{liveSource?'LIVE TMDB FEED':`${visibleItems.length} TITLES`}</TinyTag>}
  />
  {spotlight&&<div className="discover-spotlight" style={backdropUrl?{backgroundImage:`linear-gradient(95deg, rgba(11,18,22,0.96) 35%, rgba(16,28,33,0.78) 100%), url(${backdropUrl})`}:undefined}>
   <div className="discover-spotlight-copy">
    <div className="discover-badges">
     <TinyTag accent>{spotlight.mediaType==='tv'?'TRENDING TV SERIES':'TRENDING FILM'}</TinyTag>
     {spotlight.year&&<TinyTag>{spotlight.year}</TinyTag>}
     {spotlight.tmdbRating!==null&&<TinyTag>TMDB {spotlight.tmdbRating.toFixed(1)} ★</TinyTag>}
    </div>
    <h3>{spotlight.title}</h3>
    <p>{spotlight.overview||'Explore cast, crew, release details, and ratings via TMDB.'}</p>
    <div className="discover-spotlight-meta">
     {spotlight.genres.slice(0,4).map(g=><span key={g} className="discover-genre-chip">{g}</span>)}
    </div>
    <div className="discover-spotlight-actions">
     <button className="primary-btn" onClick={()=>void openDiscoveryItem(spotlight)}>View full details <ArrowRight size={15}/></button>
    </div>
   </div>
  </div>}
  <div className="discover-controls">
   <div className="category-tabs discover-tabs" role="tablist" aria-label="Media type filter">
    <button className={mediaFilter==='all'?'active':''} onClick={()=>setMediaFilter('all')}>All Trending</button>
    <button className={mediaFilter==='movie'?'active':''} onClick={()=>setMediaFilter('movie')}>Movies</button>
    <button className={mediaFilter==='tv'?'active':''} onClick={()=>setMediaFilter('tv')}>TV Series</button>
   </div>
   <div className="discover-window">
    <button className={`soft-btn btn-small ${timeWindow==='week'?'window-active':''}`} onClick={()=>setTimeWindow('week')}>This Week</button>
    <button className={`soft-btn btn-small ${timeWindow==='day'?'window-active':''}`} onClick={()=>setTimeWindow('day')}>Today</button>
   </div>
  </div>
  <div className="filters">
   <label className="filter-search">
    <Search size={16}/>
    <input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search movies and TV" placeholder="Search any movie or TV series on TMDB..."/>
    {query&&<button className="icon-btn" onClick={()=>setQuery('')} aria-label="Clear search"><X size={14}/></button>}
   </label>
   <div className="filter-select">
    <SlidersHorizontal size={15}/>
    <select aria-label="Filter discovery by genre" value={genreFilter} onChange={e=>setGenreFilter(e.target.value)}>
     {allGenres.map(g=><option key={g}>{g}</option>)}
    </select>
    <ChevronDown size={13}/>
   </div>
  </div>
  {loading&&<div className="notice"><Sparkles size={16}/><span>Searching TMDB catalog…</span></div>}
  {visibleItems.length ? (
   <div className="library-grid">
    {visibleItems.map(item=>(
     <div className="library-item" key={`${item.mediaType}-${item.id}`}>
      <FilmPoster
       film={{title:item.title,year:item.year,metadata:{poster:item.poster}}}
       badge={item.mediaType==='tv'?'TV':'MOVIE'}
       onClick={()=>void openDiscoveryItem(item)}
      />
      <strong>{item.title}</strong>
      <div>{item.year ?? 'TBA'} <SmallStars rating={item.tmdbRating} scale={10}/></div>
     </div>
    ))}
   </div>
  ) : (
   <EmptyState label="No movies or TV series match your search."/>
  )}
 </>
}

function Library({films,onFilm}:{films:Film[];onFilm:(f:Film)=>void}) {
 const [visible,setVisible]=useState(72);
 const [term,setTerm]=useState(''); const [sort,setSort]=useState('rating'); const [genre,setGenre]=useState('All genres'); const [rating,setRating]=useState('All ratings');
 useEffect(()=>setVisible(72),[term,sort,genre,rating]);
 const genres=['All genres',...rankGenres(films).map(g=>g.name)];
 const filtered=films.filter(f=>f.title.toLowerCase().includes(term.trim().toLowerCase()) && (genre==='All genres'||f.metadata?.genres.includes(genre)) && (rating==='All ratings'||(rating==='Unrated'?f.rating===null:f.rating!==null&&f.rating>=Number(rating)))).sort((a,b)=>{
 if(sort==='newest')return (b.year||0)-(a.year||0);if(sort==='oldest')return (a.year||0)-(b.year||0);if(sort==='title')return a.title.localeCompare(b.title);
 return (b.rating??-1)-(a.rating??-1)||a.title.localeCompare(b.title);
 });
 return <><SectionHeading eyebrow="03 / THE ARCHIVE" title="Every frame you collected" description="Search, sort, and rediscover the films that make up your story." side={<TinyTag accent>{filtered.length} FILMS</TinyTag>}/>
 <div className="filters"><label className="filter-search"><Search size={16}/><input value={term} onChange={e=>setTerm(e.target.value)} aria-label="Search films" placeholder="Find a film..."/></label>
 <div className="filter-select"><SlidersHorizontal size={15}/><select aria-label="Filter by genre" value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select><ChevronDown size={13}/></div>
 <div className="filter-select"><Star size={14}/><select aria-label="Filter by rating" value={rating} onChange={e=>setRating(e.target.value)}><option>All ratings</option><option value="4.5">4.5+ stars</option><option value="4">4+ stars</option><option value="3">3+ stars</option><option>Unrated</option></select><ChevronDown size={13}/></div>
 <div className="filter-select"><select aria-label="Sort films" value={sort} onChange={e=>setSort(e.target.value)}><option value="rating">Highest rated</option><option value="newest">Newest release</option><option value="oldest">Oldest release</option><option value="title">Title A–Z</option></select><ChevronDown size={13}/></div></div>
 {filtered.length?<div className="library-grid">{filtered.slice(0,visible).map(f=><div className="library-item" key={f.key}><FilmPoster film={f} onClick={()=>onFilm(f)}/><strong>{f.title}</strong><div>{f.year ?? 'Year unknown'} <SmallStars rating={f.rating}/></div></div>)}</div>:<EmptyState label="No films match these filters."/>}{filtered.length>visible&&<button className="soft-btn" onClick={()=>setVisible(n=>n+72)}>Show more films ({filtered.length-visible} remaining)</button>}</>;
}
function People({films}:{films:Film[]}) {
 const [category,setCategory]=useState<PeopleCategory>('directors');
 const label:Record<PeopleCategory,string>={directors:'Directors',cast:'Actors',writers:'Writers',cinematographers:'Cinematographers',composers:'Composers'};
 const items=useMemo(()=>rankPeople(films,category),[films,category]);
 const unique=items.length; const one=items.filter(x=>x.count===1).length;
 const collabs=useMemo(()=>collaborations(films),[films]);
 return <><SectionHeading eyebrow="04 / THE PEOPLE" title="The people behind your taste" description="The filmmakers and performers you keep coming back to." side={<TinyTag accent>{films.filter(f=>f.metadata).length} FILMS ANALYZYZED</TinyTag>}/>
 <div className="category-tabs">{(Object.keys(label) as PeopleCategory[]).map(cat=><button key={cat} className={category===cat?'active':''} onClick={()=>setCategory(cat)}>{label[cat]}</button>)}</div>
 <div className="people-stats"><div><span>UNIQUE {label[category].toUpperCase()}</span><strong>{unique}</strong><small>Across enriched films</small></div><div><span>ONE-FILM SHARE</span><strong>{unique?Math.round(one/unique*100):0}%</strong><small>People seen in only one film</small></div><div><span>TOP REPEAT</span><strong>{items[0]?.count??0}</strong><small>Movies with the top {category==='cast'?'performer':'creator'}</small></div></div>
 {items.length?<div className="people-grid">{items.slice(0,24).map((item,index)=><div className="person-card" key={`${item.id}-${item.name}`}><div className="person-avatar">{item.profile?<img src={portraitImage(item.profile)!} loading="lazy" alt=""/>:<span>{item.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>}</div><div className="person-copy"><span className="rank-label">#{String(index+1).padStart(2,'0')} · {item.count} FILM{item.count!==1?'S':''}</span><h4>{item.name}</h4><div className="person-rating">{item.average===null?'Not rated':`${item.average.toFixed(2)} ★ average`}</div><p title={item.films.join(', ')}>{item.films.slice(0,3).join(' · ')}</p></div></div>)}</div>:<EmptyState label="People rankings appear when film metadata has been loaded."/>}
 <div className="panel collab-panel"><div className="panel-head"><div><div className="eyebrow">CREATIVE CHEMISTRY</div><h3>Director × actor collaborations</h3></div><TinyTag>{collabs.length} recurring pairs</TinyTag></div>{collabs.length?<div className="collab-list">{collabs.map((p,i)=><div className="collab-row" key={`${p.director}-${p.actor}`}><span className="collab-number">{String(i+1).padStart(2,'0')}</span><div className="collab-names"><strong>{p.director}</strong><span>with {p.actor}</span><small>{p.titles.slice(0,3).join(' · ')}</small></div><strong className="collab-count">{p.count} <span>FILMS</span></strong></div>)}</div>:<EmptyState label="Pairs appearing in two or more of your films will show here."/>}</div>
 </>;
}
function DNA({films}:{films:Film[]}) {
 const genres=rankGenres(films);const countries=rankCountries(films);const languages=rankLanguages(films);
 const known=films.filter(f=>f.metadata).length;const stats=getStats(films);
 const top=genres[0];
 return <><SectionHeading eyebrow="05 / CINEMATIC DNA" title="Your taste, decoded" description="Every genre, language and era leaves a mark on the way you watch." side={<TinyTag accent>{percent(known,films.length)}% COVERAGE</TinyTag>}/>
 <div className="dna-feature"><div className="eyebrow">YOUR SIGNATURE GENRE</div><div className="dna-feature-row"><div><h2>{top?.name??'Still a mystery'}</h2><p>{top?`${top.count} of ${known} enriched films explore this genre. The pattern says something about what draws you in.`:'Movie metadata will reveal your signature genre.'}</p></div><div className="dna-big-number">{top?.percent??'—'}<span>{top?'%':''}</span></div></div><div className="dna-grain"/></div>
 <div className="grid-two"><div className="panel"><div className="panel-head"><div><div className="eyebrow">GENRE AFFINITIES</div><h3>The stories you choose</h3></div></div>{genres.length?<VerticalBars data={genres.slice(0,9).map(g=>({name:g.name,count:g.count}))}/>:<EmptyState label="TMDB enrichment needed."/>}<p className="fine-print">One film can belong to multiple genres.</p></div>
 <div className="panel"><div className="panel-head"><div><div className="eyebrow">BORDERS & BEYOND</div><h3>Countries of production</h3></div></div>{countries.length?<VerticalBars data={countries.slice(0,9).map(g=>({name:g.name,count:g.count}))}/>:<EmptyState label="TMDB enrichment needed."/>}<p className="fine-print">Co-productions appear under each country.</p></div></div>
 <div className="grid-two"><div className="panel"><div className="panel-head"><div><div className="eyebrow">ORIGINAL LANGUAGE</div><h3>Languages in your library</h3></div></div>{languages.length?<div className="language-cloud">{languages.slice(0,12).map((l,i)=><div key={l.name} className={i===0?'lang-feature':''}><strong>{l.name.toUpperCase()}</strong><span>{l.count} films</span></div>)}</div>:<EmptyState label="TMDB enrichment needed."/>}</div>
 <div className="panel"><div className="panel-head"><div><div className="eyebrow">RELEASE ERAS</div><h3>Decades you travel to</h3></div></div><FilmBars data={stats.decades.slice(-8)} height={235}/></div></div>
 <div className="notice"><Info size={16}/> Genres, countries and language are calculated from matched TMDB films only. Counts are not extrapolated to films without metadata.</div>
 </>;
}
function Timeline({films}:{films:Film[]}) {
 const stats=getStats(films);
 const years=stats.viewingYears;
 const month=stats.viewingMonths.slice(-18);
 const total=stats.diaryEntries;
 return <><SectionHeading eyebrow="06 / THE TIMELINE" title="When films became memories" description="A history of what you logged watching, one diary entry at a time." side={<TinyTag accent>{total} DATED WATCHES</TinyTag>}/>
 <div className="timeline-banner"><div><span className="eyebrow">LOGGED VIEWINGS</span><h2>{prettyNumber(total)} <span>movie moments</span></h2><p>Only entries with a valid “Watched Date” count here. Simply marking a film as watched does not imply when it was viewed.</p></div><CalendarDays size={72} strokeWidth={1}/></div>
 <div className="grid-two"><div className="panel"><div className="panel-head"><div><div className="eyebrow">YEAR OVER YEAR</div><h3>Your viewing years</h3></div></div><FilmArea data={years} height={260}/></div>
 <div className="panel"><div className="panel-head"><div><div className="eyebrow">RECENT VIEWING HISTORY</div><h3>Monthly rhythm</h3></div></div><FilmArea data={month} height={260} color="#82c2b4"/></div></div>
 <div className="grid-two"><div className="panel"><div className="panel-head"><div><div className="eyebrow">MONDAY TO SUNDAY</div><h3>When you watch</h3></div></div><FilmBars data={[...stats.weekday.slice(1),stats.weekday[0]]} height={245}/></div>
 <div className="panel"><div className="panel-head"><div><div className="eyebrow">DIARY BREAKDOWN</div><h3>The habit in numbers</h3></div></div><div className="timeline-mini"><div><span>Viewing years recorded</span><strong>{years.length}</strong></div><div><span>Diary watches</span><strong>{total}</strong></div><div><span>Reported rewatches</span><strong>{films.reduce((a,f)=>a+f.rewatches,0)}</strong></div><div><span>Most active year</span><strong>{[...years].sort((a,b)=>b.count-a.count)[0]?.name||'—'}</strong></div></div></div></div>
 </>;
}
function Wrapped({films,demo}:{films:Film[];demo:boolean}) {
 const stats=getStats(films);const genres=rankGenres(films), directors=rankPeople(films,'directors');
 const favorite=stats.sortedFavorites[0];
 const copy = async()=>{
  const s=`My Frameprint 🎞️\n${stats.total} films · ${stats.rated} ratings · ${fRating(stats.avgRating)} average\nTop genre: ${genres[0]?.name||'N/A'}\nTop director: ${directors[0]?.name||'N/A'}\nFavorite film: ${favorite?.title||'N/A'}\nMade with Frameprint`;
  try { await navigator.clipboard.writeText(s); alert('Your cinematic summary was copied!'); } catch { window.prompt('Copy your summary:',s); }
 };
 const savePng = () => {
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const bg=ctx.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#101f25');bg.addColorStop(1,'#060d11');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
  ctx.fillStyle='#d5ef76';ctx.beginPath();ctx.arc(940,180,230,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#101f25';ctx.beginPath();ctx.arc(940,180,170,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#d5ef76';ctx.font='bold 30px sans-serif';ctx.fillText('FRAMEPRINT   /   MY MOVIE DNA',70,110);
  ctx.fillStyle='#fafaf4';ctx.font='bold 92px sans-serif';ctx.fillText('Every film tells',66,325);ctx.fillText('my story.',66,422);
  ctx.fillStyle='#9aa9a7';ctx.font='26px sans-serif';ctx.fillText('A portrait of my cinema universe',70,487);
  ctx.strokeStyle='#526260';ctx.beginPath();ctx.moveTo(70,540);ctx.lineTo(1010,540);ctx.stroke();
  const line=(name:string,value:string,y:number)=>{ctx.fillStyle='#879a9d';ctx.font='26px sans-serif';ctx.fillText(name.toUpperCase(),72,y);ctx.fillStyle='#fafaf4';ctx.font='bold 57px sans-serif';ctx.fillText(value,72,y+70,930);};
  line('Films watched',String(stats.total),612);line('Average rating',fRating(stats.avgRating),790);line('Signature genre',genres[0]?.name||'Unknown',968);
  ctx.fillStyle='#d5ef76';ctx.font='26px sans-serif';ctx.fillText(`TOP DIRECTOR  ${directors[0]?.name||'N/A'}`,70,1215,930);
  const a=document.createElement('a');a.download='my-frameprint.png';a.href=canvas.toDataURL('image/png');a.click();
 };
 return <><SectionHeading eyebrow="07 / YOUR FRAMEPRINT" title="A little bit of movie magic" description="A snapshot of your watching personality, ready to share." side={<TinyTag accent>{demo?'PREVIEW MODE':'MADE FROM YOUR DATA'}</TinyTag>}/>
 <div className="wrapped-layout"><div className="wrapped-card"><div className="wrapped-orbit"/><div className="wrapped-header"><span><Clapperboard size={19}/> FRAMEPRINT</span><small>MY CINEMATIC DNA</small></div><div className="wrapped-main"><div className="eyebrow">A PORTRAIT IN FRAMES</div><h2>Every film<br/>tells <em>my story.</em></h2><p>Here's what the movies say about me.</p></div>
 <div className="wrapped-metrics"><div><strong>{stats.total}</strong><span>FILMS WATCHED</span></div><div><strong>{stats.avgRating?.toFixed(2)??'—'}<small>★</small></strong><span>AVERAGE RATING</span></div></div>
 <div className="wrapped-footer"><div><span>MY TOP GENRE</span><strong>{genres[0]?.name||'Unknown'}</strong></div><div><span>DIRECTOR OF MY LIFE</span><strong>{directors[0]?.name||'Unknown'}</strong></div></div><span className="wrapped-bottom">A cinematic fingerprint, uniquely yours. ◈</span></div>
 <div className="wrapped-side"><div className="eyebrow">MAKE IT YOURS</div><h2>Your movie taste deserves a spotlight.</h2><p>Save this summary as an image, or copy the highlights to share with friends. Your upload remains in your browser.</p>
 <button className="primary-btn" onClick={savePng}><Download size={17}/> Download share card</button><button className="soft-btn" onClick={copy}><ArrowDownToLine size={17}/> Copy my highlights</button>
 <div className="wrapped-highlights"><div><span>FAVORITE FILM</span><strong>{favorite?.title||'No ratings yet'}</strong></div><div><span>HIGHEST-RATED MOVIES</span><strong>{stats.ratedFive} perfect 5★ ratings</strong></div><div><span>TOP DIRECTOR</span><strong>{directors[0]?.name||'Needs metadata'}</strong></div></div></div></div>
 </>;
}
function UploadDialog({onClose,onImport,busy,error}:{onClose:()=>void;onImport:(f:File)=>Promise<void>;busy:boolean;error:string|null}) {
 const [drag,setDrag]=useState(false); const fileInput=useRef<HTMLInputElement>(null);
 return <div className="modal-scrim" onMouseDown={onClose}><section className="upload-dialog" role="dialog" aria-modal="true" aria-label="Import Letterboxd data" onMouseDown={e=>e.stopPropagation()}><button className="icon-btn modal-close" aria-label="Close upload" onClick={onClose}><X size={19}/></button>
 <div className="upload-logo"><UploadCloud size={27}/></div><div className="eyebrow">YOUR DATA, YOUR STORY</div><h2>Let's find your frameprint.</h2><p>Export your data from Letterboxd, then drop the ZIP file here. We'll do the rest.</p>
 {error&&<div role="alert" className="upload-error">{error}</div>}
 <div className={`dropzone ${drag?'is-dragging':''}`} onDragEnter={e=>{e.preventDefault();setDrag(true)}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{e.preventDefault();setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)void onImport(f)}} onClick={()=>fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')fileInput.current?.click()}}>
 <FolderOpen size={34}/><strong>{busy?'Reading your export…':'Drag & drop your Letterboxd export'}</strong><span>or click to browse files</span><small>ZIP export or a watched/ratings/diary CSV · Max 25 MB</small>
 <input ref={fileInput} type="file" hidden accept=".zip,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)void onImport(file);e.target.value='';}}/></div>
 <div className="upload-steps"><span>01</span> Open <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener noreferrer">Letterboxd → Data settings <ExternalLink size={12}/></a><span>02</span> Export Your Data <span>03</span> Upload ZIP here</div>
 <div className="privacy-line"><ShieldCheck size={17}/> We process your ZIP locally. Only movie titles and release years are sent for TMDB lookup.</div>
 </section></div>;
}
export default function App(){
 const [films,setFilms]=useState<Film[]>(demoFilms);
 const [demo,setDemo]=useState(true);
 const [screen,setScreen]=useState<Screen>('overview');
 const [selected,setSelected]=useState<Film|null>(null);
 const [uploadOpen,setUploadOpen]=useState(false);
 const [navOpen,setNavOpen]=useState(false);
 const [isImporting,setIsImporting]=useState(false);
 const [watchlistCount,setWatchlistCount]=useState(0);
 const [warnings,setWarnings]=useState<string[]>([]);
 const [error,setError]=useState<string|null>(null);
 const [enrich,setEnrich]=useState({running:false,done:0,total:0,message:''});
 const aborter=useRef<AbortController|null>(null);
 const importing=useRef(false);
 const attempted=useRef(new Set<string>());
 const filmsRef=useRef(films);
 useEffect(()=>{filmsRef.current=films;},[films]);
 useEffect(()=>()=>aborter.current?.abort(),[]);
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelected(null);setUploadOpen(false);setNavOpen(false);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 const stats=useMemo(()=>getStats(films),[films]);
 const runEnrich=useCallback(async(input:Film[])=>{
  if(!hasApi) return;
  aborter.current?.abort();const controller=new AbortController();aborter.current=controller;
  const queue=input.filter(f=>!f.metadata&&!attempted.current.has(f.key));
  if(!queue.length) return;
  setEnrich({running:true,done:0,total:queue.length,message:'Matching films with TMDB…'});
  try{
   for(let pos=0;pos<queue.length;pos+=8){
    if(controller.signal.aborted)break;
    const batch=queue.slice(pos,pos+8);
    const items=await enrichBatch(batch,controller.signal);
    if(controller.signal.aborted)break;
    const map=new Map(items.map(x=>[x.key,x]));
    for(const item of items)if(!item.retryable)attempted.current.add(item.key);
    setFilms(old=>{const newer=old.map(f=>{const found=map.get(f.key);return found?.metadata?{...f,metadata:found.metadata}:f;});filmsRef.current=newer;return newer;});
    setEnrich({running:true,done:pos+batch.length,total:queue.length,message:'Building your cinematic portrait…'});
    if(pos+8<queue.length)await waitFor(3100,controller.signal);
   }
   if(!controller.signal.aborted)setEnrich(old=>({...old,running:false,message:'Metadata pass complete.'}));
  }catch(e){if(controller.signal.aborted)return;setError((e as Error).message);setEnrich(old=>({...old,running:false,message:'Enrichment paused. Resume when ready.'}));}
 },[]);
 const onImport=async(file:File)=>{
  if(importing.current)return;
  importing.current=true;
  setIsImporting(true);setError(null);aborter.current?.abort();
  setEnrich(old=>({...old,running:false}));
  try{
   const parsed:ImportResult=await importInWorker(file);
   attempted.current.clear();filmsRef.current=parsed.films;setFilms(parsed.films);setWarnings(parsed.warnings);setWatchlistCount(parsed.watchlistCount);setDemo(false);setSelected(null);setScreen('overview');setUploadOpen(false);setNavOpen(false);
   setEnrich({running:false,done:0,total:0,message:''});
   if(hasApi)void runEnrich(parsed.films);
  }catch(e){setError((e as Error).message)}finally{importing.current=false;setIsImporting(false)}
 };
 const resetDemo=()=>{aborter.current?.abort();attempted.current.clear();setDemo(true);setWatchlistCount(0);setSelected(null);setFilms(demoFilms);filmsRef.current=demoFilms;setScreen('overview');setError(null);setWarnings([]);setEnrich({running:false,done:0,total:0,message:''});};
 const remaining=films.filter(f=>!f.metadata&&!attempted.current.has(f.key)).length;
 const downloadData=()=>{
  const data={source:'Frameprint',demo,generatedAt:new Date().toISOString(),stats,topGenres:rankGenres(films),topDirectors:rankPeople(films,'directors'),films};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='frameprint-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const navigate=(id:Screen)=>{setScreen(id);setNavOpen(false);window.scrollTo({top:0,behavior:'smooth'});};
 return <div className="app-shell">
  <aside className={`sidebar ${navOpen?'sidebar-open':''}`}><a className="brand" href="#" onClick={e=>{e.preventDefault();navigate('overview')}}><span className="brand-icon"><Clapperboard size={24}/></span><span>frameprint<small>YOUR CINEMATIC DNA</small></span></a>
  <div className="sidebar-section-label">YOUR WORLD</div><nav className="nav-list" aria-label="Main navigation">{features.map(({id,label,icon:Icon})=><button key={id} className={`nav-item ${screen===id?'nav-active':''}`} onClick={()=>navigate(id)}><Icon size={18}/><span>{label}</span>{screen===id&&<span className="nav-active-dot"/>}</button>)}</nav>
  <div className="sidebar-bottom"><div className="side-callout"><span className="callout-mark">✳</span><strong>It's all about your stories.</strong><p>One upload. A whole universe of insights.</p><button onClick={()=>setUploadOpen(true)}>Analyze my films <ArrowRight size={14}/></button></div>
  <div className="sidebar-credit"><div>MADE FOR FILM LOVERS <Heart size={12}/></div><span>Not affiliated with Letterboxd</span></div></div></aside>
  {navOpen&&<button aria-label="Close navigation" className="mobile-scrim" onClick={()=>setNavOpen(false)}/>}
  <div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setNavOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><span className="breadcrumbs">YOUR FRAMEPRINT <span>/</span> {sections[screen].toUpperCase()}</span></div><div className="topbar-right"><div className={`status-pill ${demo?'status-demo':'status-live'}`}><span className="live-dot"/>{demo?'DEMO DATA':'PERSONAL LIBRARY'}</div><button className="icon-btn topbar-download" title="Download analysis JSON" aria-label="Download analysis" onClick={downloadData}><Download size={18}/></button><button aria-label="Import data" className="topbar-import" onClick={()=>setUploadOpen(true)}><UploadCloud size={16}/><span>Import data</span></button></div></header>
   <main className="content">
    {error&&<div role="alert" className="notice error-notice"><Info size={17}/><span>{error}</span><button onClick={()=>setError(null)} aria-label="Dismiss error"><X size={16}/></button></div>}
    {demo&&screen!=='overview'&&screen!=='discover'&&<div className="demo-note"><Sparkles size={16}/> You're exploring a fictional sample library. <button onClick={()=>setUploadOpen(true)}>Upload your own export <ArrowRight size={14}/></button></div>}
    {!demo&&!hasApi&&<div className="notice"><Info size={17}/> Your import is ready. Movie details are temporarily unavailable; your ratings, library and diary statistics still work.</div>}
    {!demo&&hasApi&&(enrich.running||remaining>0)&&<div className="enrich-banner"><div className="enrich-info"><span className="enrich-dot"/><div><strong>{enrich.running?'Enriching your movie library…':`${remaining} films still need metadata`}</strong><p>{enrich.running?`${enrich.done} of ${enrich.total} films in this pass · ${stats.metadataCount} of ${films.length} enriched overall`:'Continue loading movie details. Titles without a confident match are left unmatched.'}</p></div></div><div className="enrich-controls">{enrich.running?<><div className="progress-track"><span style={{width:`${percent(enrich.done,enrich.total)}%`}}/></div><button className="soft-btn btn-small" onClick={()=>{aborter.current?.abort();setEnrich(old=>({...old,running:false}))}}><Pause size={13}/> Pause</button></>:<button className="soft-btn btn-small" onClick={()=>{setError(null);void runEnrich(filmsRef.current)}}><Play size={13}/> Continue enrichment</button>}</div></div>}
    {!demo&&warnings.length>0&&<details className="warning-details"><summary>{warnings.length} import note{warnings.length>1?'s':''} <ChevronDown size={14}/></summary><ul>{warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
    {screen==='overview'&&<Overview films={films} onFilm={setSelected} openUpload={()=>setUploadOpen(true)} onDiscover={()=>navigate('discover')} demo={demo} watchlist={watchlistCount}/>}
    {screen==='discover'&&<Discover onSelectFilm={setSelected}/>}
    {screen==='library'&&<Library films={films} onFilm={setSelected}/>}
    {screen==='people'&&<People films={films}/>}
    {screen==='dna'&&<DNA films={films}/>}
    {screen==='timeline'&&<Timeline films={films}/>}
    {screen==='wrapped'&&<Wrapped films={films} demo={demo}/>}
    <footer className="footer"><div className="footer-logo"><Clapperboard size={17}/> frameprint <span>© {new Date().getFullYear()}</span></div><div className="footer-links"><button onClick={resetDemo}>Explore sample</button><button onClick={()=>navigate('discover')}>Discover Movies & TV</button><button onClick={downloadData}>Export JSON</button><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB <ExternalLink size={12}/></a></div><p className="tmdb-credit"><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="Visit TMDB"><img width="93" height="25" alt="TMDB logo" src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" /></a><span>This product uses the TMDB API but is not endorsed or certified by TMDB. Movie metadata and imagery: <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">The Movie Database</a>.</span></p></footer>
   </main>
  </div>
  {selected&&<FilmDetail film={selected} onClose={()=>setSelected(null)}/>}
  {uploadOpen&&<UploadDialog onClose={()=>setUploadOpen(false)} onImport={onImport} busy={isImporting} error={error}/>}
 </div>;
}
