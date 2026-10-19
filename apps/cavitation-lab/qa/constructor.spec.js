import {test,expect} from '@playwright/test';

test('constructor: choose layout, add, undo, change individual radius and persist',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/cavitation-lab/');
 await page.locator('[data-cloud="custom"]').click();
 await expect(page.locator('#constructor-panel')).toBeVisible();
 await expect(page.locator('#experiment-title')).toContainText('05');
 await page.locator('#add-bubble').click();
 await expect(page.locator('#experiment-title')).toContainText('06');
 await page.locator('#undo-bubble').click();
 await expect(page.locator('#experiment-title')).toContainText('05');
 await page.locator('[data-layout="arc"]').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1')).cloud.bubbles[1].y)).toBe(2.4);
 const hit=await page.evaluate(async()=>{
   const [{cloudViewport},{simulateCloud}]=await Promise.all([
    import('/apps/cavitation-lab/cloud-render.js'),
    import('/apps/cavitation-lab/coupling.js')
   ]);
   const st=JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1'));
   const box=document.querySelector('#field').getBoundingClientRect();
   return cloudViewport(box.width,box.height,simulateCloud(st.config,st.cloud)).bubbles[1];
 });
 await page.locator('#field').click({position:{x:hit.x,y:hit.y}});
 await expect(page.locator('#radius-label')).toHaveText('РАДИУС R2');
 await page.locator('#edit-size').evaluate(el=>{
   el.value='0.69';
   el.dispatchEvent(new Event('input',{bubbles:true}));
   el.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1')).cloud.bubbles[1].s)).toBe(.69);
 await page.reload();
 await expect(page.locator('[data-cloud="custom"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#radius-label')).toHaveText('РАДИУС R2');
 await expect(page.locator('#edit-size-val')).toContainText('0,69');
 await page.locator('#launch').click();
 await expect(page.locator('#phase-label')).not.toHaveText('ГОТОВ К ИМПУЛЬСУ');
 await page.locator('#pause').click();
 await expect(page.locator('#phase-label')).toHaveText('ОПЫТ НА ПАУЗЕ');
 expect(errors).toEqual([]);
});

test('constructor: touch target supports dragging without leaking controls behind graph',async({page})=>{
 await page.goto('/apps/cavitation-lab/');
 await page.locator('[data-cloud="custom"]').click();
 const hit=await page.evaluate(async()=>{
  const [{cloudViewport},{simulateCloud}]=await Promise.all([
   import('/apps/cavitation-lab/cloud-render.js'),
   import('/apps/cavitation-lab/coupling.js')
  ]);
  const st=JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1'));
  const rect=document.querySelector('#field').getBoundingClientRect();
  const b=cloudViewport(rect.width,rect.height,simulateCloud(st.config,st.cloud)).bubbles[0];
  return {x:b.x+rect.left,y:b.y+rect.top};
 });
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1')).cloud.bubbles[0].y);
 await page.mouse.move(hit.x,hit.y);
 await page.mouse.down();
 await page.mouse.move(hit.x,hit.y-15,{steps:6});
 await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:cavitation-lab:state:v1')).cloud.bubbles[0].y)).toBeGreaterThan(initial);
 await expect(page.locator('#launch')).toBeInViewport();
 await expect(page.locator('#speed')).toBeInViewport();
});
