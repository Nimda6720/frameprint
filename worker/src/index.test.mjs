import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { selectMatch, shapeMetadata, shapeDiscoveryItem } from './index.mjs';

test('exact title/year wins remakes', () => {
 const result = selectMatch([{id:1,title:'Dune',release_date:'1984-01-01'},{id:2,title:'Dune',release_date:'2021-10-01'}],'Dune',2021);
 assert.equal(result.id,2);
});
test('rejects unsupported loose title matches',()=>assert.equal(selectMatch([{id:1,title:'Gone'}],'Gone Girl',2014),null));
test('metadata extracts director and composer independently',()=>{
 const metadata = shapeMetadata({id:1,title:'Test',genres:[{name:'Drama'}],production_countries:[],credits:{cast:[],crew:[{id:1,name:'A',job:'Director'},{id:2,name:'B',job:'Original Music Composer'}]}});
 assert.equal(metadata.directors[0].name,'A'); assert.equal(metadata.composers[0].name,'B');
});
test('cross-origin requests cannot access worker', async()=>{
 const res = await handler.fetch(new Request('https://api.example/api/enrich',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{ALLOWED_ORIGINS:'https://good.example'},{});
 assert.equal(res.status,403);
});

test('health reports whether TMDB is configured without disclosing the token', async () => {
 const res = await handler.fetch(new Request('https://api.example/health'), { TMDB_READ_TOKEN:'private-token' }, {});
 assert.equal(res.status, 200);
 assert.deepEqual(await res.json(), {status:'ok',configured:true});
 assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});
test('rejects invalid payloads before contacting TMDB', async () => {
 const res = await handler.fetch(new Request('https://api.example/api/enrich',{method:'POST',headers:{Origin:'https://good.example','Content-Type':'application/json'},body:JSON.stringify({films:[{key:'x',title:'Inception',year:'2010'}]})}),
   {ALLOWED_ORIGINS:'https://good.example', TMDB_READ_TOKEN:'private-token'}, {});
 assert.equal(res.status, 400);
});
test('returns clear message when API token has not been configured', async () => {
 const res = await handler.fetch(new Request('https://api.example/api/enrich',{method:'POST',headers:{Origin:'https://good.example','Content-Type':'application/json'},body:'{}'}),
   {ALLOWED_ORIGINS:'https://good.example'}, {});
 assert.equal(res.status, 503);
});

test('preserves non-Latin title identity and rejects unrelated titles',()=>{
 assert.equal(selectMatch([{id:1,title:'大阪',release_date:'2020-01-01'}],'東京',2020),null);
 assert.equal(selectMatch([{id:2,title:'東京',release_date:'2020-01-01'}],'東京',2020).id,2);
});
test('rejects unknown release dates and tied matches',()=>{
 assert.equal(selectMatch([{id:1,title:'Dune',release_date:''}],'Dune',2021),null);
 assert.equal(selectMatch([{id:1,title:'Dune',release_date:'2021-01-01'},{id:2,title:'Dune',release_date:'2021-02-01'}],'Dune',2021),null);
});
const origin='https://nimda6720.github.io';
const validFilm={key:'arrival|2016',title:'Arrival',year:2016};
const environment={ALLOWED_ORIGINS:origin,TMDB_READ_TOKEN:'test-only-placeholder',API_RATE_LIMITER:{limit:async()=>({success:true})}};
const post=(body,headers={})=>new Request('https://api.example/api/enrich',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('null entries return 400 instead of crashing',async()=>{
 assert.equal((await handler.fetch(post({films:[null]}),environment,{})).status,400);
});
test('rejects oversized streamed payloads without trusting Content-Length',async()=>{
 assert.equal((await handler.fetch(post({films:[],padding:'x'.repeat(25000)}),environment,{})).status,413);
});
test('rate limit and missing limiter fail closed',async()=>{
 const limited=await handler.fetch(post({films:[validFilm]}),{...environment,API_RATE_LIMITER:{limit:async()=>({success:false})}},{});
 assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
 assert.equal((await handler.fetch(post({films:[validFilm]}),{...environment,API_RATE_LIMITER:null},{})).status,503);
});
test('preflight and method restrictions',async()=>{
 const preflight=await handler.fetch(new Request('https://api.example/api/enrich',{method:'OPTIONS',headers:{Origin:origin}}),environment,{});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await handler.fetch(new Request('https://api.example/api/enrich',{headers:{Origin:origin}}),environment,{})).status,405);
});
test('metadata caching reuses TMDB results without leaking secrets or keys',async(t)=>{
 const cached=new Map();const pending=[];let requests=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests++;assert.equal(options.headers.Authorization,`Bearer ${environment.TMDB_READ_TOKEN}`);
  return Response.json(String(url).includes('/search/')?{results:[{id:1,title:'Arrival',release_date:'2016-01-01'}]}:{id:1,title:'Arrival',release_date:'2016-01-01',runtime:116,credits:{cast:[],crew:[]}});
 });
 const previous=globalThis.caches;
 globalThis.caches={default:{match:async r=>cached.get(r.url)?.clone(),put:async(r,res)=>{cached.set(r.url,res)}}};
 try{
  const ctx={waitUntil:p=>pending.push(p)};
  const first=await handler.fetch(post({films:[validFilm]}),environment,ctx);
  assert.equal(first.status,200);assert.equal((await first.json()).items[0].metadata.runtime,116);
  await Promise.all(pending);
  const second=await handler.fetch(post({films:[{...validFilm,key:'different-client-key'}]}),environment,ctx);
  const text=await second.text();assert.ok(text.includes('different-client-key'));assert.ok(!text.includes(environment.TMDB_READ_TOKEN));assert.equal(requests,2);
 }finally{globalThis.caches=previous;}
});
test('upstream failures remain retryable and are never cached',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('unavailable',{status:503}));
 const previous=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{throw Error('must not cache errors')}}};
 try{
  const result=await handler.fetch(post({films:[validFilm]}),environment,{waitUntil:()=>{}});
  const data=await result.json();assert.equal(data.items[0].retryable,true);assert.equal(data.items[0].metadata,null);
 }finally{globalThis.caches=previous;}
});
test('cast deduplicates an actor credited in multiple roles',()=>{
 const data=shapeMetadata({id:1,title:'Test',credits:{cast:[{id:3,name:'Actor',order:1},{id:3,name:'Actor',order:2}],crew:[]}});
 assert.equal(data.cast.length,1);
});
test('shapes TV series metadata and discovery items with genres and creators',()=>{
 const tvMeta=shapeMetadata({id:95396,name:'Severance',first_air_date:'2022-02-17',episode_run_time:[55],number_of_seasons:2,number_of_episodes:19,created_by:[{id:10,name:'Dan Erickson'}],genres:[{name:'Drama'}],production_countries:[{name:'United States'}],credits:{cast:[{id:20,name:'Adam Scott',order:0}],crew:[]}},'tv');
 assert.equal(tvMeta.title,'Severance');
 assert.equal(tvMeta.year,2022);
 assert.equal(tvMeta.mediaType,'tv');
 assert.equal(tvMeta.runtime,55);
 assert.equal(tvMeta.seasons,2);
 assert.equal(tvMeta.directors[0].name,'Dan Erickson');
 const disc=shapeDiscoveryItem({id:95396,media_type:'tv',name:'Severance',first_air_date:'2022-02-17',vote_average:8.42,genre_ids:[18,10765]});
 assert.equal(disc.mediaType,'tv');
 assert.deepEqual(disc.genres,['Drama','Sci-Fi & Fantasy']);
});
test('discover, search, and details endpoints validate parameters and return shaped TMDB data',async(t)=>{
 t.mock.method(globalThis,'fetch',async(url)=>{
  const u=String(url);
  if(u.includes('/trending/'))return Response.json({results:[{id:693134,media_type:'movie',title:'Dune: Part Two',release_date:'2024-02-27',vote_average:8.4,genre_ids:[878,12]}]});
  if(u.includes('/search/'))return Response.json({results:[{id:95396,media_type:'tv',name:'Severance',first_air_date:'2022-02-17',vote_average:8.5,genre_ids:[18]}]});
  return Response.json({id:95396,name:'Severance',first_air_date:'2022-02-17',number_of_seasons:2,number_of_episodes:19,created_by:[{id:10,name:'Dan Erickson'}],genres:[{name:'Drama'}],production_countries:[],credits:{cast:[],crew:[]}});
 });
 const previous=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
 try{
  const badDiscover=await handler.fetch(new Request('https://api.example/api/discover?type=invalid',{headers:{Origin:origin}}),environment,{});
  assert.equal(badDiscover.status,400);
  const okDiscover=await handler.fetch(new Request('https://api.example/api/discover?type=all&window=week',{headers:{Origin:origin}}),environment,{});
  assert.equal(okDiscover.status,200);
  const discData=await okDiscover.json();
  assert.equal(discData.items[0].title,'Dune: Part Two');
  const okSearch=await handler.fetch(new Request('https://api.example/api/search?q=Severance&type=multi',{headers:{Origin:origin}}),environment,{});
  assert.equal(okSearch.status,200);
  assert.equal((await okSearch.json()).items[0].mediaType,'tv');
  const okDetails=await handler.fetch(new Request('https://api.example/api/details?type=tv&id=95396',{headers:{Origin:origin}}),environment,{});
  assert.equal(okDetails.status,200);
  assert.equal((await okDetails.json()).metadata.seasons,2);
 }finally{globalThis.caches=previous;}
});
