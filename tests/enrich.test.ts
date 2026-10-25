import { afterEach, expect, test, vi } from 'vitest';
import type { Film } from '../src/lib/types';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();vi.resetModules();});
const films=[{key:'a',title:'Arrival',year:2016},{key:'b',title:'Dune',year:2021}] as Film[];
test('429 retry preserves completed items and only resends unfinished titles',async()=>{
 vi.stubEnv('VITE_API_BASE_URL','https://metadata.example');vi.useFakeTimers();
 const request=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({items:[{key:'a',metadata:null}]}),{status:429,headers:{'Retry-After':'1'}})).mockResolvedValueOnce(Response.json({items:[{key:'b',metadata:null}]}));
 vi.stubGlobal('fetch',request);
 const {enrichBatch}=await import('../src/lib/enrich');
 const pending=enrichBatch(films);
 await vi.advanceTimersByTimeAsync(1100);
 expect(await pending).toHaveLength(2);
 expect(JSON.parse(request.mock.calls[1][1].body).films.map((f:Film)=>f.key)).toEqual(['b']);
});
test('aborting the wait prevents another metadata request',async()=>{
 vi.stubEnv('VITE_API_BASE_URL','https://metadata.example');
 const {waitFor}=await import('../src/lib/enrich');const controller=new AbortController();
 const pending=waitFor(60000,controller.signal);controller.abort();
 await expect(pending).rejects.toThrow('Aborted');
});
test('missing response entries remain retryable',async()=>{
 vi.stubEnv('VITE_API_BASE_URL','https://metadata.example');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({items:[]})));
 const {enrichBatch}=await import('../src/lib/enrich');
 expect((await enrichBatch(films)).every(item=>item.retryable)).toBe(true);
});
test('discovery helpers fetch trending, search, and detailed media metadata',async()=>{
 vi.stubEnv('VITE_API_BASE_URL','https://metadata.example');
 const mockItem={id:95396,mediaType:'tv',title:'Severance',year:2022,poster:null,backdrop:null,overview:'Work-life balance.',genres:['Drama'],tmdbRating:8.4,popularity:95};
 const mockMeta={id:95396,mediaType:'tv',title:'Severance',year:2022,poster:null,backdrop:null,overview:'Work-life balance.',runtime:50,genres:['Drama'],countries:['United States'],language:'en',cast:[],directors:[],writers:[],cinematographers:[],composers:[],tmdbRating:8.4,seasons:2,episodes:19};
 const request=vi.fn()
  .mockResolvedValueOnce(Response.json({items:[mockItem]}))
  .mockResolvedValueOnce(Response.json({items:[mockItem]}))
  .mockResolvedValueOnce(Response.json({metadata:mockMeta}));
 vi.stubGlobal('fetch',request);
 const {fetchTrending,searchTmdb,fetchMediaDetails}=await import('../src/lib/enrich');
 expect(await fetchTrending('tv','week')).toEqual([mockItem]);
 expect(await searchTmdb('Severance','multi')).toEqual([mockItem]);
 expect(await fetchMediaDetails('tv',95396)).toEqual(mockMeta);
});
