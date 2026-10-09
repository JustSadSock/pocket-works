import { test, expect } from '@playwright/test';

test('diagnose iPhone library geometry before release', async ({ page }) => {
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#deck-bottom-nav')).toBeVisible();
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  const report=await page.evaluate(async()=>{
    const names=['#sort-button','#refresh-button','#update-installed-button','#deck-organize-start','[data-deck-density="micro"]','.app-entry__select','.command-deck','.deck-library-head'];
    const samples=[];
    for(let i=0;i<18;i++){
      const points=Object.fromEntries(names.map(name=>{
        const el=document.querySelector(name);
        const rect=el?.getBoundingClientRect();
        const css=el&&getComputedStyle(el);
        return [name,rect?{x:+rect.x.toFixed(1),y:+rect.y.toFixed(1),w:+rect.width.toFixed(1),h:+rect.height.toFixed(1),
          display:css.display,position:css.position,animation:css.animationName,transform:css.transform}:null];
      }));
      samples.push({t:i*120,y:window.scrollY,scrollHeight:document.documentElement.scrollHeight,
        visualHeight:window.visualViewport?.height,innerHeight:window.innerHeight,points});
      await new Promise(resolve=>setTimeout(resolve,120));
    }
    const moves=Object.fromEntries(names.map(name=>{
      const positions=samples.map(s=>s.points[name]).filter(Boolean);
      const unique=[...new Set(positions.map(p=>[p.x,p.y,p.w,p.h].join(',')))];
      return [name,{unique:unique.slice(0,15),transitions:unique.length}];
    }));
    return {viewport:innerWidth,apps:document.querySelectorAll('#app-list .app-entry').length,moves,
      samples:samples.filter((_,i)=>[0,4,8,12,17].includes(i)),documentHeight:document.documentElement.scrollHeight,
      errors:window.__deckDiagnosticErrors||[]};
  });
  console.log('DECK_GEOMETRY_DIAGNOSTIC '+JSON.stringify(report));
  expect(report.apps).toBeGreaterThan(20);
});
