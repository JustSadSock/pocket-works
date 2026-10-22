import {test,expect} from '@playwright/test';
test('real fire + electric projectile reaction renders a readable combat burst',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 const summary=await page.evaluate(async()=>{
  const {tick,STEP}=await import('/apps/perekos/core.mjs'),s=window.__perekosTest.state;
  const a=s.actors[0],b=s.actors[1];a.x=165;a.y=320;b.x=230;b.y=320;
  a.runes=['on_cast','ball','as_storm'];
  for(let i=0;i<35;i++)tick(s,{x:0,y:0,attack:true,aim:{x:b.x,y:b.y}},STEP,{x:0,y:0,attack:false,aim:{x:a.x,y:a.y}});
  return {count:s.elementCombos[0],reactions:a.reactionsDone,mark:b.mark,life:b.markLife,health:b.hp};
 });
 expect(summary.count).toBeGreaterThan(0);
 // Subsequent fire hits legitimately replace the latest elemental mark.
 // Assert a confirmed combined reaction instead of the transient last-hit tag.
 expect(summary.reactions).toBeGreaterThan(0);
 expect(['fire','storm']).toContain(summary.mark);
 expect(summary.health).toBeLessThan(100);
 await expect(page.locator('#world')).toBeVisible();
 await info.attach('fire-electric-reaction',{body:await page.screenshot(),contentType:'image/png'});
 const layout=await page.evaluate(()=>({outer:innerWidth,document:document.documentElement.scrollWidth}));
 expect(layout.document).toBeLessThanOrEqual(layout.outer+1);
 expect(errors).toEqual([]);
});
test('actual rune workshop previews reachable cross-school reaction',async({page},info)=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.actors[0].runes=['on_cast','ball','as_storm'];s.remaining=.00001;window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('#chemistry-preview')).toContainText('Пар');
 await expect(page.locator('#chemistry-preview')).toHaveClass(/has-reaction/);
 await expect(page.locator('#spell-index button')).toHaveCount(3);
 await info.attach('three-spell-reaction-preview',{body:await page.screenshot(),contentType:'image/png'});
 await expect(page.locator('#bench-fight')).toBeInViewport({ratio:.9});
});
