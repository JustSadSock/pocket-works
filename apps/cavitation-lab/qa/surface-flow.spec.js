import {test,expect} from '@playwright/test';

test('surface model: computed wall-directed deformation, optical toggle and persistence',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.goto('/apps/cavitation-lab/');
 await expect(page.locator('#shape-toggle')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#shape-gain')).toContainText('×3');
 await page.locator('[data-preset="wall"]').click();
 await page.locator('#launch').click();
 await page.locator('#pause').click();
 const graphWidth=await page.locator('#trace').evaluate(el=>el.getBoundingClientRect().width);
 await page.locator('#trace').click({position:{x:Math.round(graphWidth*.34),y:23}});
 await expect.poll(async()=>Number((await page.locator('#deform-now').innerText()).replace('%','').replace(',','.'))).toBeGreaterThan(0);
 await expect(page.locator('#flow-direction')).toContainText('стенке');
 await page.locator('#shape-gain').click();
 await expect(page.locator('#shape-gain')).toContainText('×1');
 await page.locator('#shape-toggle').click();
 await expect(page.locator('#shape-toggle')).toHaveAttribute('aria-pressed','false');
 await page.reload();
 await expect(page.locator('#shape-toggle')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#shape-gain')).toContainText('×1');
 await page.locator('#shape-toggle').click();
 await expect(page.locator('#shape-toggle')).toHaveAttribute('aria-pressed','true');
 expect(failures).toEqual([]);
});
test('surface model: multi-bubble deformation follows selected center and model dialog explains limits',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/cavitation-lab/');
 await page.locator('[data-cloud="cluster"]').click();
 await page.locator('#launch').click();
 await page.locator('#pause').click();
 await page.locator('#trace').click({position:{x:90,y:22}});
 const first=await page.locator('#deform-now').innerText();
 const selection=await page.evaluate(async()=>{
  const [{cloudViewport},{simulateCloud}]=await Promise.all([
   import('/apps/cavitation-lab/cloud-render.js'),
   import('/apps/cavitation-lab/coupling.js')
  ]);
  const st=JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1'));
  const area=document.querySelector('#field').getBoundingClientRect();
  return cloudViewport(area.width,area.height,simulateCloud(st.config,st.cloud)).bubbles[1];
 });
 await page.locator('#field').click({position:{x:selection.x,y:selection.y}});
 await expect(page.locator('#radius-label')).toHaveText('РАДИУС R2');
 await expect(page.locator('#deform-now')).not.toHaveText(first);
 await page.locator('#science').click();
 await expect(page.locator('#science-panel')).toContainText('Это приближённая кинематическая модель');
 await page.locator('#science-done').click();
 expect(errors).toEqual([]);
});
