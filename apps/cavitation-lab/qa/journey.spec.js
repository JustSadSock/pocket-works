import { test, expect } from '@playwright/test';

test('cavitation experiment: launch, pause, scrub, restart and persist input',async({page})=>{
 const failures=[];
 page.on('pageerror',error=>failures.push(error.message));
 await page.goto('/apps/cavitation-lab/');
 await expect(page.locator('#field')).toBeVisible();
 await expect(page.locator('#launch-label')).toHaveText('СХЛОПНУТЬ ПУЗЫРЁК');
 await page.locator('#pressure').evaluate(el=>{el.value='2.35';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('#pressure-val')).toContainText('2,35');
 await page.locator('#launch').click();
 await expect(page.locator('#phase-label')).not.toHaveText('ГОТОВ К ИМПУЛЬСУ');
 await page.waitForTimeout(1000);
 const time=await page.locator('#time-now').innerText();
 expect(time).not.toMatch(/^0\s/);
 await page.locator('#pause').click();
 await expect(page.locator('#phase-label')).toHaveText('ОПЫТ НА ПАУЗЕ');
 const before=await page.locator('#time-now').innerText();
 await page.waitForTimeout(250);
 expect(await page.locator('#time-now').innerText()).toBe(before);
 await page.locator('#trace').click({position:{x:40,y:25}});
 await page.locator('#science').click();
 await expect(page.locator('#science-panel')).toBeVisible();
 await page.locator('#science-done').click();
 await expect(page.locator('#science-panel')).toBeHidden();
 await page.reload();
 await expect(page.locator('#pressure-val')).toContainText('2,35');
 await expect(page.locator('#field')).toBeVisible();
 expect(failures).toEqual([]);
});

test('coupled cloud: switching modes, enabling and disabling wall, choosing bubbles and persistence',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/cavitation-lab/');
 await page.locator('[data-cloud="cluster"]').click();
 await expect(page.locator('[data-cloud="cluster"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#experiment-title')).toContainText('05');
 // Select bubble 2 using coordinates computed from the same rendered geometry.
 const hit=await page.evaluate(async()=>{
   const [{cloudViewport},{simulateCloud}]=await Promise.all([
     import('/apps/cavitation-lab/cloud-render.js'),
     import('/apps/cavitation-lab/coupling.js')
   ]);
   const rect=document.querySelector('#field').getBoundingClientRect();
   const model=simulateCloud({radiusMm:.9,pressureBar:1.8,standOff:1.65},{mode:'cluster',wall:true});
   const bubble=cloudViewport(rect.width,rect.height,model).bubbles[1];
   return {x:bubble.x,y:bubble.y};
 });
 await page.locator('#field').click({position:hit});
 await expect(page.locator('#radius-label')).toHaveText('РАДИУС R2');
 await expect(page.locator('#cloud-options')).toBeVisible();
 await page.locator('#wall-mode').click();
 await expect(page.locator('#wall-mode')).toHaveAttribute('aria-pressed','false');
 await page.locator('#pressure-view').click();
 await expect(page.locator('#pressure-view')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#pressure-legend')).toBeHidden();
 await page.locator('#pressure-view').click();
 await expect(page.locator('#pressure-legend')).toBeVisible();
 await page.locator('#launch').click();
 await expect(page.locator('#phase-label')).not.toHaveText('ГОТОВ К ИМПУЛЬСУ');
 await page.waitForTimeout(650);
 await page.locator('#pause').click();
 await expect(page.locator('#phase-label')).toHaveText('ОПЫТ НА ПАУЗЕ');
 await page.locator('#trace').click({position:{x:80,y:24}});
 await page.reload();
 await expect(page.locator('[data-cloud="cluster"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#wall-mode')).toHaveAttribute('aria-pressed','false');
 await page.locator('[data-cloud="pair"]').click();
 await expect(page.locator('#experiment-title')).toContainText('02');
 await page.locator('[data-cloud="single"]').click();
 await expect(page.locator('#cloud-options')).toBeHidden();
 expect(errors).toEqual([]);
});
