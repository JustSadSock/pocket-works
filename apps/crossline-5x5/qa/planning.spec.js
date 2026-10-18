import {test,expect} from '@playwright/test';

async function startSolo(page){
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/crossline-5x5/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#solo')).toBeVisible();
 await page.locator('#solo').click();
 await page.locator('[data-difficulty-choice="easy"]').click();
 await expect(page.locator('#play')).toBeVisible();
 await expect(page.locator('#board>.cell')).toHaveCount(25);
 return errors;
}
const direction=(page,name)=>page.locator('[data-dir="'+name+'"]').click();
test('real planning journey: each stop, swap, delete, replace and blocked attack conflict',async({page},info)=>{
 const errors=await startSolo(page);
 await direction(page,'right');await direction(page,'left');
 await direction(page,'right');await direction(page,'left');
 await page.locator('#shield').click();
 await expect(page.locator('#planCount')).toHaveText('5 / 5');
 await expect(page.locator('.arena-route-stop')).toHaveCount(5);
 const steps=await page.locator('.arena-route-stop text').allTextContents();
 expect(steps).toEqual(['1','2','3','4','5']);
 await page.locator('[data-slot="2"]').click();
 await expect(page.locator('#editBar')).toBeVisible();
 await page.locator('#moveEarlier').click();
 await expect(page.locator('[data-slot="1"]')).toHaveText('→');
 await expect(page.locator('[data-slot="2"]')).toHaveText('←');
 await page.locator('#removeSelected').click();
 await expect(page.locator('#planCount')).toHaveText('4 / 5');
 await expect(page.locator('[data-slot="3"]')).toHaveText('▣');
 await direction(page,'up');
 await expect(page.locator('#planCount')).toHaveText('5 / 5');
 await page.locator('[data-slot="4"]').click();
 await page.locator('#attack').click();
 await direction(page,'up');
 await page.locator('#attack').click();
 await expect(page.locator('[data-slot="4"]')).toContainText('⚔');
 await page.locator('[data-slot="1"]').click();
 await page.keyboard.press('ArrowUp');
 await expect(page.locator('#planFeedback')).toContainText('направление');
 await expect(page.locator('[data-slot="1"]')).toHaveText('←');
 await page.locator('#endEdit').click();
 await expect(page.locator('#submit')).toBeEnabled();
 await page.screenshot({path:info.outputPath('arena-five-plan.png')});
 expect(errors).toEqual([]);
});
for(const {label,width,height} of [
 {label:'portrait',width:390,height:844},
 {label:'landscape',width:844,height:390}
]){
 test('touch planning layout '+label+' fits without scroll or covered commands',async({browser},info)=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();
  try{
   const errors=await startSolo(page);
   await direction(page,'right');
   await direction(page,'left');
   await page.locator('[data-slot="0"]').click();
   await expect(page.locator('#editBar')).toBeVisible();
   const visible=await page.evaluate(()=>{
    const ids=['board','slots','editBar','controls','submit'],rects={};
    for(const id of ids){const r=document.getElementById(id).getBoundingClientRect();
     rects[id]={x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}
    return {scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,w:innerWidth,h:innerHeight,rects};
   });
   expect(visible.scrollW).toBeLessThanOrEqual(visible.w+3);
   expect(visible.scrollH).toBeLessThanOrEqual(visible.h+3);
   for(const [id,r] of Object.entries(visible.rects)){
    expect(r.h,id).toBeGreaterThan(0);
    expect(r.x,id).toBeGreaterThanOrEqual(-1);
    expect(r.right,id).toBeLessThanOrEqual(width+2);
    expect(r.bottom,id).toBeLessThanOrEqual(height+2);
   }
   await page.locator('#moveLater').click();
   await expect(page.locator('[data-slot="1"]')).toHaveAttribute('aria-pressed','true');
   await page.screenshot({path:info.outputPath('arena-touch-'+label+'.png')});
   expect(errors).toEqual([]);
  }finally{await context.close()}
 });
}
