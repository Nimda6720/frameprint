import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
async function navigate(page:Page,name:string){
 const menu=page.getByRole('button',{name:'Open navigation',exact:true});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
}
test('demo navigation, charts, library filters and PNG download',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');
 await expect(page.getByRole('heading',{name:/Every film tells/})).toBeVisible();
 await expect(page.locator('.heatmap-panel')).toBeVisible();
 await expect(page.locator('.recommendations-panel')).toBeVisible();
 const yearSelect=page.getByLabel('Filter dashboard by year');
 await expect(yearSelect).toBeVisible();
 await yearSelect.selectOption('2025');
 await expect(yearSelect).toHaveValue('2025');
 await yearSelect.selectOption('All time');
 await navigate(page,'Film library');
 await page.getByRole('textbox',{name:'Search films'}).fill('inception');
 await expect(page.locator('.library-item')).toHaveCount(1);
 await page.getByRole('button',{name:'View Inception details',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await navigate(page,'Cast & crew');
 await page.locator('.person-card-interactive').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 for(const name of ['Cinematic DNA','Timeline','Your wrapped']){
  await navigate(page,name);
  await expect(page.locator('main h2').first()).toBeVisible();
 }
 await page.getByRole('tab',{name:'05 · Cinema Personality'}).click();
 await expect(page.locator('.wrapped-card')).toContainText('CINEMA PERSONALITY');
 await page.getByRole('tab',{name:'01 · Total Watching'}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download share card'}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('my-frameprint.png');
 expect(await download.failure()).toBeNull();
 expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
test('ZIP import stays local; CSV imports and invalid files recover',async({page})=>{
 const uploadedBodies:string[]=[];
 page.on('request',r=>{if(r.method()==='POST')uploadedBodies.push(r.postData()||'');});
 // Deterministic import checks work whether the deployment has its API enabled.
 await page.route('**/api/enrich',route=>route.fulfill({json:{items:JSON.parse(route.request().postData()!).films.map((f:{key:string})=>({key:f.key,metadata:null}))}}));
 await page.goto('./');
 await page.getByRole('button',{name:'Import data',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')});
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('valid ZIP');
 await page.locator('input[type=file]').setInputFiles(path.resolve('examples/sample-letterboxd-export.zip'));
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.status-pill')).toHaveText('PERSONAL LIBRARY');
 await navigate(page,'Timeline');
 await expect(page.locator('.timeline-banner')).not.toContainText('0 movie moments');
 await page.getByRole('button',{name:'Import data',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'ratings.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Year,Rating\nMy Private Film,2020,4.5\n')});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.stats-grid .stat-card').first()).toContainText('1');
 await navigate(page,'Film library');
 await expect(page.locator('.library-item')).toHaveCount(1);
 await expect(page.locator('.library-item')).toContainText('My Private Film');
 for(const body of uploadedBodies){
  const data=JSON.parse(body);
  expect(Object.keys(data)).toEqual(['films']);
  for(const film of data.films)expect(Object.keys(film).sort()).toEqual(['key','title','year']);
 }
});

test('metadata fills runtime, genres, people and collaborations',async({page})=>{
 const metadata={id:1,title:'Test Film',year:2020,poster:null,backdrop:null,overview:'Movie metadata from the proxy.',runtime:120,genres:['Science Fiction'],countries:['Finland'],language:'fi',cast:[{id:2,name:'Test Actor'}],directors:[{id:3,name:'Test Director'}],writers:[],cinematographers:[],composers:[],tmdbRating:8};
 await page.route('**/api/enrich',route=>route.fulfill({json:{items:JSON.parse(route.request().postData()!).films.map((f:{key:string})=>({key:f.key,metadata}))}}));
 await page.goto('./');
 await page.getByRole('button',{name:'Import data',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'watched.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Year\nTest Film,2020\nAnother Film,2021\n')});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 test.skip(await page.getByText('Your import is ready. Movie details are temporarily unavailable;').isVisible(),'This build has no API endpoint configured.');
 await expect(page.locator('.stats-grid')).toContainText('4h');
 await navigate(page,'Cinematic DNA');
 await expect(page.locator('.dna-feature')).toContainText('Science Fiction');
 await expect(page.locator('.horizontal-bars')).toContainText(['Science Fiction','Finland']);
 await navigate(page,'Cast & crew');
 await expect(page.locator('.person-card').first()).toContainText('Test Director');
 await expect(page.locator('.collab-row')).toContainText('Test Actor');
 await page.getByRole('button',{name:'Actors',exact:true}).click();
 await expect(page.locator('.person-card').first()).toContainText('Test Actor');
});
