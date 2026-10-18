import {test,expect} from '@playwright/test';

async function openGallery(page){
 await page.goto('/apps/crossline-5x5/',{waitUntil:'domcontentloaded'});
 await page.locator('header [data-workshop-trigger]').click();
 await expect(page.locator('#arenaDevGallery')).toBeVisible();
}
async function scene(page,id){
 await page.evaluate(sceneId=>{
  const button=document.querySelector('[data-arena-scene="'+sceneId+'"]');
  if(!button)throw Error('Unknown QA scene '+sceneId);
  button.click();
 },id);
 const frame=page.frameLocator('.arena-dev__frame');
 await expect.poll(()=>frame.locator('body').evaluate((el,key)=>el.ownerDocument.defaultView.location.search.includes('__arena_dev='+key),id)).toBe(true);
 return frame;
}
test('all 11 sound cues are interactive and the sound lab reports the chosen real cue',async({page})=>{
 await openGallery(page);
 const frame=await scene(page,'sounds');
 await expect(frame.locator('#arenaDevSoundLab [data-arena-audio]')).toHaveCount(11);
 for(const kind of ['move','attack','shield','block','hit','collapse','fall']){
  await frame.locator('[data-arena-audio="'+kind+'"]').click();
  await expect(frame.locator('#arenaDevSoundLab output')).toContainText(kind);
 }
});
test('round 4 actually drops 16 perimeter slabs, leaving center tiles intact',async({page})=>{
 await openGallery(page);
 const frame=await scene(page,'anim-collapse');
 await expect.poll(()=>frame.locator('#board>.cell.shatter').count(),{timeout:10000}).toBe(16);
 const transform=await frame.locator('#board>.cell.shatter').first().evaluate(cell=>{
  const pseudo=getComputedStyle(cell,'::before');
  return {name:pseudo.animationName,duration:pseudo.animationDuration,content:pseudo.content};
 });
 expect(transform.name).toContain('arenaSlabGravity');
 expect(transform.content).not.toBe('none');
 await expect.poll(()=>frame.locator('#board>.cell.shatter').count(),{timeout:8000}).toBe(0);
 await expect(frame.locator('#board>.cell.void')).toHaveCount(16);
 await expect(frame.locator('#board>.cell:not(.void)')).toHaveCount(9);
});
test('motion-disabled collapse resolves immediately to an empty rim without decorative slab artifacts',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await openGallery(page);
 const frame=await scene(page,'fx-fall');
 await expect(frame.locator('#board>.cell.void')).toHaveCount(16);
 const pseudo=await frame.locator('#board>.cell.shatter').first().evaluate(cell=>getComputedStyle(cell,'::before').display);
 expect(pseudo).toBe('none');
});
