import {test,expect} from '@playwright/test';

// No routeWebSocket, no fake REST sessions: both browsers use the real local
// Cloudflare Worker, its WebSocket hub and SQLite-backed Durable Object.
test('two independent browsers: private battle, ten reconnects and final replay',async({browser})=>{
 test.setTimeout(160000);
 const errors:string[]=[];
 const north=await browser.newContext({viewport:{width:1100,height:830},serviceWorkers:'block'});
 const south=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const a=await north.newPage(),b=await south.newPage();
 a.on('pageerror',err=>errors.push('north: '+err.message));
 b.on('pageerror',err=>errors.push('south: '+err.message));
 const url='/apps/fog-of-conquest/';
 try{
  await a.goto(url,{waitUntil:'domcontentloaded'});
  await a.locator('#newGameBtn').click();await a.locator('#onlineBtn').click();
  await a.locator('#createRoomBtn').click();
  await expect(a.locator('#onlineStatus')).toContainText(/[A-F0-9]{8}/);
  const code=(await a.locator('#onlineStatus').innerText()).match(/[A-F0-9]{8}/)?.[0];
  expect(code).toMatch(/^[A-F0-9]{8}$/);
  await b.goto(url,{waitUntil:'domcontentloaded'});
  await b.locator('#newGameBtn').click();await b.locator('#onlineBtn').click();
  await b.locator('#roomIdInput').fill(code!);await b.locator('#joinRoomBtn').click();
  await expect(a.locator('#onlineLobbyControls button').first()).toBeEnabled();
  await a.locator('#onlineLobbyControls button').first().click();
  await expect.poll(()=>a.evaluate(()=>window.FogPocketNet?.phase)).toBe('battle');
  await expect.poll(()=>b.evaluate(()=>window.FogPocketNet?.phase)).toBe('battle');
  expect(await a.evaluate(()=>window.units.some(u=>u.owner===2))).toBe(false);
  expect(await b.evaluate(()=>window.units.some(u=>u.owner===1))).toBe(false);
  const click=async(page:typeof a,r:number,c:number)=>{
   await page.evaluate(({r,c})=>{
    const canvas=document.getElementById('canvas') as HTMLCanvasElement;
    const box=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,
      clientX:box.left+(c+.5)*box.width/window.COLS,
      clientY:box.top+(r+.5)*box.height/window.ROWS}));
   },{r,c});
  };
  await click(a,1,2);await click(a,1,3);
  await expect.poll(()=>a.evaluate(()=>window.units.find(u=>u.owner===1&&u.type==='swordsman')?.c)).toBe(3);
  await expect(a.locator('#fogBattleHistoryButton')).toBeVisible();
  await a.locator('#fogBattleHistoryButton').click();
  await expect(a.locator('#fogBattleEntries')).toContainText('Перемещение');
  await a.locator('#fogBattleClose').click();
  // Each reload exercises a real reconnect to the same token-bound durable seat.
  for(let i=0;i<10;i++){
   const page=i%2===0?b:a;
   await page.reload({waitUntil:'domcontentloaded'});
   await expect.poll(()=>page.evaluate(()=>window.FogPocketNet?.phase),{timeout:16000}).toBe('battle');
   const expected=i%2===0?2:1;
   await expect.poll(()=>page.evaluate(()=>window.FogPocketNet?.side)).toBe(expected);
   expect(await page.evaluate(()=>window.units.some(u=>u.owner!==window.FogPocketNet?.side))).toBe(false);
  }
  await a.locator('#endTurnBtn').click();await a.locator('#yesBtn').click();
  await expect.poll(()=>b.evaluate(()=>window.FogPocketNet?.canIssue())).toBe(true);
  // Conclude a live two-seat game through the application's network action;
  // the other browser receives the immutable authoritative outcome.
  await b.evaluate(()=>window.FogPocketNet.leave());
  await expect.poll(()=>a.evaluate(()=>window.FogPocketNet?.phase)).toBe('finished');
  await expect(a.locator('#fogBattleVictoryHistory')).toBeVisible();
  await a.locator('#fogBattleVictoryHistory').click();
  await expect(a.locator('#fogBattleHistory')).toBeVisible();
  await expect(a.locator('#fogBattleEntries')).toContainText('Перемещение');
  await a.locator('#fogBattleReplay').click();
  await expect(a.locator('#fogBattleStop')).toBeVisible();
  await a.locator('#fogBattleStop').click();
  await expect(a.locator('#fogBattleStop')).toBeHidden();
  expect(errors).toEqual([]);
 }finally{
  await north.close();await south.close();
 }
});
