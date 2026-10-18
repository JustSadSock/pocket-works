import {test,expect} from '@playwright/test';
async function seedArchive(page){
 await page.goto('/apps/crossline-5x5/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const {initialMatch,simulateRound}=await import('/apps/crossline-5x5/engine.js');
  const g=initialMatch();g.units.A={x:2,y:2,alive:true};g.units.B={x:2,y:3,alive:true};
  const A=[{type:'attack',dirs:['down']},'up','left','right','shield'];
  const B=['up','down','left','right','shield'];
  const match=simulateRound(g,{A,B}).match;
  const entry={id:'local:qa-replay',savedAt:Date.now(),mode:'solo',players:['Синий','ИИ'],score:{A:1,B:0},match};
  localStorage.setItem('pocket-works:crossline-5x5:history',JSON.stringify([entry]));
 });
 await page.reload({waitUntil:'domcontentloaded'});
}
test('saved replay opens after menu reload, reveals both commands and exports entire match',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seedArchive(page);
 await expect(page.locator('#archiveOpen')).toContainText('1');
 await page.locator('#archiveOpen').click();
 await expect(page.locator('.archive-row')).toHaveCount(1);
 await expect(page.locator('.archive-row')).toContainText('Победа синего');
 await page.screenshot({path:info.outputPath('archive-filled.png')});
 await page.locator('[data-archive-play="0"]').click();
 await expect(page.locator('#replayAnalysis .analysis-side')).toHaveCount(2);
 await expect(page.locator('.analysis-side.a .analysis-beat')).toHaveCount(5);
 await expect(page.locator('.analysis-side.b .analysis-beat')).toHaveCount(5);
 await page.locator('#replayStepForward').click();
 await expect(page.locator('#replaySeek')).toHaveValue('1');
 await expect(page.locator('.analysis-side.a .analysis-beat').first()).toHaveClass(/is-current/);
 await expect(page.locator('.analysis-side.b .analysis-side-head')).toContainText('Получил удар');
 await page.screenshot({path:info.outputPath('replay-dual-plan.png')});
 const promise=page.waitForEvent('download');
 await page.locator('#replaySave').click();
 const download=await promise;
 expect(download.suggestedFilename()).toContain('.json');
 const file=await download.path();expect(file).not.toBeNull();
 const {readFile}=await import('node:fs/promises');
 const raw=JSON.parse(await readFile(file,'utf8'));
 expect(raw.match.replays).toHaveLength(1);
 expect(raw.match.replays[0].plans.A[0].type).toBe('attack');
 await page.locator('#replayBack').click();
 await expect(page.locator('#archive')).toBeVisible();
 await page.locator('[data-archive-remove="0"]').click();
 await expect(page.locator('#modal')).toBeVisible();
 await page.locator('#modalMain').click();
 await expect(page.locator('.archive-row')).toHaveCount(1);
 await page.locator('[data-archive-remove="0"]').click();
 await page.locator('#modalAlt').click();
 await expect(page.locator('#archiveEmpty')).toBeVisible();
 await page.locator('#archiveBack').click();
 await expect(page.locator('#archiveOpen')).not.toContainText(' · 1');
 expect(errors).toEqual([]);
});
for(const {label,width,height} of [{label:'portrait',width:390,height:844},{label:'landscape',width:844,height:390}]){
 test('archived match replay fits '+label+' touchscreen',async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await seedArchive(page);
   await page.locator('#archiveOpen').click();await page.locator('[data-archive-play="0"]').click();
   await expect(page.locator('#replayAnalysis .analysis-side')).toHaveCount(2);
   await page.locator('#replayStepForward').click();
   const bounds=await page.evaluate(()=>{
    const ids=['replayBoard','replayAnalysis','replaySeek','replaySave','replayBack'],out={};
    for(const id of ids){const box=document.getElementById(id).getBoundingClientRect();
     out[id]={x:box.x,y:box.y,right:box.right,bottom:box.bottom,w:box.width,h:box.height};}
    return {width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,out};
   });
   expect(bounds.scrollW).toBeLessThanOrEqual(bounds.width+3);
   expect(bounds.scrollH).toBeLessThanOrEqual(bounds.height+3);
   for(const [id,box] of Object.entries(bounds.out)){
    expect(box.w,id).toBeGreaterThan(0);expect(box.h,id).toBeGreaterThan(0);
    expect(box.right,id).toBeLessThanOrEqual(width+3);
    expect(box.bottom,id).toBeLessThanOrEqual(height+3);
   }
   await page.screenshot({path:info.outputPath('replay-'+label+'.png')});
   expect(errors).toEqual([]);
  }finally{await context.close()}
 });
}
