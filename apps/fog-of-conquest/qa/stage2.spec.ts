import {test,expect} from '@playwright/test';

test('mobile atlas: pinch-scale equivalent zoom keeps tactical hit testing exact',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#summary')).toBeHidden();
  await page.locator('#fogRulesToggle').click();
  await expect(page.locator('#summary')).toBeVisible();
  await page.locator('#fogRulesToggle').click();
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  await expect(page.locator('#fogAtlas')).toBeVisible();
  const old=await page.locator('#canvas').evaluate((el:HTMLCanvasElement)=>el.getBoundingClientRect().width);
  await page.locator('#fogZoomIn').click();
  const now=await page.locator('#canvas').evaluate((el:HTMLCanvasElement)=>el.getBoundingClientRect().width);
  expect(now).toBeGreaterThan(old);
  await page.evaluate(()=>{
    const canvas=document.getElementById('canvas') as HTMLCanvasElement;
    const click=(r:number,c:number)=>{
      const box=canvas.getBoundingClientRect(),cols=(window as any).COLS,rows=(window as any).ROWS;
      canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,
        clientX:box.left+(c+.5)*box.width/cols,clientY:box.top+(r+.5)*box.height/rows}));
    };
    click(1,2);click(1,3);
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).units.find((u:any)=>u.owner===1&&u.type==='swordsman')?.c)).toBe(3);
  await page.locator('#fogFindArmy').click();
  await page.locator('#fogToggleMini').click();
  await expect(page.locator('#fogMini')).toBeHidden();
  await page.locator('#fogToggleMini').click();
  await expect(page.locator('#fogMini')).toBeVisible();
  expect(errors).toEqual([]);
});

test('minimap cannot reveal unexplored enemy bases',async({page})=>{
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  await expect(page.locator('#fogMini')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
    const mini=document.getElementById('fogMini') as HTMLCanvasElement;
    return mini.width>0&&mini.height>0;
  })).toBe(true);
  const unknown=await page.evaluate(()=>{
    const w=window as any,b=w.buildings.find((x:any)=>x.owner===2&&x.type==='base');
    if(!w.state.fog[1][b.r][b.c]||w.state.seen[1][b.r][b.c])
      throw Error('Enemy location was unexpectedly explored');
    const mini=document.getElementById('fogMini') as HTMLCanvasElement;
    const rgba=mini.getContext('2d')!.getImageData(b.c*4+1,b.r*4+1,1,1).data;
    return [...rgba.slice(0,3)];
  });
  expect(unknown).toEqual([25,35,30]);
});

test('hot-seat handoff is opaque and must be acknowledged before viewing',async({page})=>{
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  await page.locator('#endTurnBtn').click();
  await expect(page.locator('#overlay')).toBeVisible();
  await page.locator('#yesBtn').click();
  await expect(page.locator('#fogHandOff')).toBeVisible();
  await expect(page.locator('#fogNextSide')).toContainText('2');
  expect(await page.evaluate(()=>(window as any).state.currentPlayer)).toBe(2);
  const cover=await page.evaluate(()=>{
    const el=document.elementFromPoint(innerWidth/2,innerHeight/2);
    return Boolean(el?.closest('#fogHandOff'));
  });
  expect(cover).toBe(true);
  await page.locator('#fogAcceptSide').click();
  await expect(page.locator('#fogHandOff')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.getElementById('battleViewport')!.scrollTop)).toBeGreaterThan(0);
});

test('tiny phone is focus-first, accessible and without document overflow',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  await expect(page.locator('#infoPanel')).toHaveClass(/collapsed/);
  const fit=await page.evaluate(()=>{
    const v=document.getElementById('battleViewport')!.getBoundingClientRect();
    const controls=[...document.querySelectorAll('#controls button')].filter(
      x=>getComputedStyle(x).display!=='none').map(x=>x.getBoundingClientRect());
    return {width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,
      scrollH:document.documentElement.scrollHeight,mapH:v.height,controls:controls.map(r=>({
        left:r.left,right:r.right,height:r.height}))};
  });
  expect(fit.scrollW).toBeLessThanOrEqual(fit.width+2);
  expect(fit.scrollH).toBeLessThanOrEqual(fit.height+2);
  expect(fit.mapH).toBeGreaterThan(400);
  for(const b of fit.controls){
    expect(b.left).toBeGreaterThanOrEqual(-2);
    expect(b.right).toBeLessThanOrEqual(fit.width+2);
    expect(b.height).toBeGreaterThanOrEqual(42);
  }
});
