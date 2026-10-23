import {test,expect} from '@playwright/test';
const preview=id=>'/apps/chyepukha/index.html?chyepukha-preview='+id;

test('the editorial tray shows four authors and updates a new receipt without rerendering',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('waiting'));
 const tray=page.locator('.dispatch-room');
 await expect(tray).toBeVisible();
 await expect(page.locator('.dispatch-card')).toHaveCount(4);
 await expect(page.locator('.dispatch-card.is-ready')).toHaveCount(3);
 await expect(page.locator('.dispatch-count-value')).toHaveText('3 / 4');
 const result=await page.evaluate(async()=>{
  const root=document.querySelector('.dispatch-room');
  const module=await import('/apps/chyepukha/waiting-sync.js');
  const before=[{id:'qa-host',name:'Марта',submitted:true},{id:'qa-guest',name:'Назар',submitted:true},{id:'qa-third',name:'Софія',submitted:false},{id:'qa-fourth',name:'Ярина',submitted:true}];
  const after=before.map(p=>p.id==='qa-third'?{...p,submitted:true}:p);
  let cues=0;
  const updated=module.updateWaitingView(root,{round:1,players:before},{round:1,players:after},{sound:()=>cues++});
  return {updated,cues,headline:root.querySelector('.dispatch-heading').textContent};
 });
 expect(result.updated).toBe(true);
 expect(result.cues).toBe(1);
 expect(result.headline).toContain('Усі аркуші здано');
 await expect(page.locator('.dispatch-card.is-ready')).toHaveCount(4);
 await expect(page.locator('.dispatch-card.just-stamped')).toHaveCount(1);
 await expect(page.locator('.dispatch-track')).toHaveAttribute('aria-valuenow','4');
});

test('editorial waiting and leave action remain reachable on a small landscape device',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.goto(preview('waiting'));
 await expect(page.locator('.dispatch-room')).toBeVisible();
 await expect(page.locator('.dispatch-card')).toHaveCount(4);
 const viewport=await page.evaluate(()=>{
  const el=document.querySelector('.dispatch-room');
  const box=el.getBoundingClientRect();
  return {width:document.documentElement.scrollWidth,screen:innerWidth,boxRight:box.right,boxTop:box.top};
 });
 expect(viewport.width).toBeLessThanOrEqual(viewport.screen+3);
 expect(viewport.boxRight).toBeLessThanOrEqual(viewport.screen+3);
 await page.locator('.dispatch-room [data-act=leave]').click();
 await expect(page.locator('.comic-modal')).toBeVisible();
});

test('the print curtain dismisses itself and exposes the complete reader',async({page})=>{
 await page.goto(preview('reveal'));
 await expect(page.locator('.print-finale')).toHaveCount(1);
 await expect(page.locator('.story-paper')).toHaveCount(1);
 await expect(page.locator('.print-finale')).toHaveCount(0,{timeout:5000});
 await expect(page.locator('.reader-scroll')).toBeVisible();
 await page.locator('.chapter').nth(1).click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
});

test('skip button closes the finale immediately without changing selected story',async({page})=>{
 await page.goto(preview('reveal'));
 await page.locator('[data-act=skip-finale]').click();
 await expect(page.locator('.print-finale')).toHaveCount(0);
 await expect(page.locator('.story-pager')).toContainText('Історія 1 / 4');
});

test('reduced-motion readers never see a blocking finale overlay',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(preview('reveal'));
 await expect(page.locator('.print-finale')).toBeHidden();
 await expect(page.locator('.reader-scroll')).toBeVisible();
});

test('music and effects can be toggled independently without initializing audio on page load',async({page})=>{
 await page.goto(preview('home'));
 await page.locator('#sound').click();
 await expect(page.locator('input[name=musicEnabled]')).not.toBeChecked();
 await expect(page.locator('input[name=effectsEnabled]')).not.toBeChecked();
 await page.locator('input[name=musicEnabled]').check();
 await expect(page.locator('input[name=effectsEnabled]')).not.toBeChecked();
 await page.locator('input[name=musicEnabled]').uncheck();
 await page.locator('input[name=effectsEnabled]').check();
 await expect(page.locator('input[name=musicEnabled]')).not.toBeChecked();
 await page.locator('[data-act=close-audio]').click();
 await expect(page.locator('.home-cover')).toBeVisible();
});
