import {test,expect} from '@playwright/test';

test('last observed enemy building is frozen in both renderers',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  await expect(page.locator('canvas').first()).toBeVisible();
  const values=await page.evaluate(()=>{
    const w=window as any;
    const enemy=w.buildings.find((b:any)=>b.owner===2&&b.type==='base');
    if(!enemy)throw Error('Enemy original base not found');
    const key=enemy.r+','+enemy.c;
    w.state.lastSeen[1][key]={id:enemy.id,r:enemy.r,c:enemy.c,
      owner:2,type:enemy.type,hp:1,gen:enemy.gen};
    w.state.seen[1][enemy.r][enemy.c]=true;
    w.state.fog[1][enemy.r][enemy.c]=true;
    enemy.hp=4;
    const shown=w.FogVisibleBuildings().find((b:any)=>b.r===enemy.r&&b.c===enemy.c);
    w.redraw();
    return {current:enemy.hp,remembered:shown?.hp,stale:shown?.stale};
  });
  expect(values).toEqual({current:4,remembered:1,stale:true});
  expect(errors).toEqual([]);
});
