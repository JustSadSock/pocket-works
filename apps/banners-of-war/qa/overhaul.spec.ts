import { test, expect } from '@playwright/test';
const url='/apps/banners-of-war/research/overhaul/prototype.html';
for(const concept of ['A','B','C']){
 test('overhaul '+concept+' real engine and spatial draft',async({page},info)=>{
  test.setTimeout(100000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=> (window as any).prototypeQA?.state().engine===true);
  await page.locator('.concepts [data-concept="'+concept+'"]').click();
  await page.screenshot({path:info.outputPath(concept+'-menu.png')});
  await page.locator('#start').click();await page.screenshot({path:info.outputPath(concept+'-deployment.png')});
  await page.locator('#commit').click();await expect(page.locator('#phase')).toHaveText('Замысел');
  await page.locator('#foot').click();await expect(page.locator('#unitTitle')).toHaveText('4 полков');
  await page.locator('#line').click();
  const point=async(x:number,y:number)=>page.evaluate(([x,y])=>(window as any).prototypeQA.project({x,y}),[x,y]);
  const a=await point(540,250),b=await point(540,520);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  const state=()=>page.evaluate(()=>(window as any).prototypeQA.state());
  await expect.poll(async()=>Object.keys((await state()).orders).length).toBe(4);
  const before=(await state()).orders;
  await page.screenshot({path:info.outputPath(concept+'-front.png')});
  await page.locator('#form').selectOption('column');await expect.poll(async()=> (await state()).orders[0].form).toBe('column');
  await page.locator('#undo').click();expect((await state()).orders).toEqual(before);
  await page.locator('#redo').click();expect((await state()).orders[0].form).toBe('column');
  await page.locator('#addStage').click();await page.locator('#condition').selectOption('time');await page.locator('#seconds').fill('15');await page.locator('#nextStage').click();
  const c=await point(560,440);await page.mouse.click(c.x,c.y);
  await expect.poll(async()=> (await state()).orders[0].stages.length).toBe(2);
  await page.screenshot({path:info.outputPath(concept+'-stages.png')});
  await page.locator('#fold').click();await expect(page.locator('#tools')).toBeHidden();await page.locator('#fold').click();
  await page.locator('#commit').click();await page.locator('#runRound').click();await expect(page.locator('#phase')).toHaveText('Запись боя',{timeout:45000});
  await expect.poll(async()=>+(await page.locator('#scrub').getAttribute('max')||0)).toBeGreaterThan(2);
  await page.locator('#replayEnd').click();await page.screenshot({path:info.outputPath(concept+'-replay.png')});
  await page.locator('#showReport').click();await expect(page.locator('#reportDescription')).toContainText('вашего раунда');
  await page.screenshot({path:info.outputPath(concept+'-result.png')});
  expect(errors).toEqual([]);
 });
}
