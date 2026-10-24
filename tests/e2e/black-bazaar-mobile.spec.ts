import {test,expect} from '@playwright/test';

const game='/apps/black-bazaar/preview.html?debugPreview=1';

async function scene(page:any,id:string){
 await page.evaluate((name:string)=>{
  window.postMessage({source:'bazaar-debug-console',type:'scene',id:name},location.origin);
 },id);
 await expect(page.locator('.play-screen')).toBeVisible();
}

test('Black Bazaar fits compact phones with urgent notice and keeps actions reachable',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:320,height:568});
 const response=await page.goto(game);
 expect(response?.ok()).toBeTruthy();
 await expect(page.locator('.entry-screen')).toBeVisible();

 for(const [width,height] of [[320,568],[375,667],[390,844]]){
  await page.setViewportSize({width,height});
  await scene(page,'urgent');
  await page.locator('#status').evaluate(el=>{
   el.textContent='Соединение восстанавливается. Торги и предметы сохранены.';
   el.className='error';
  });
  const layout=await page.evaluate(()=>{
   const rect=(selector:string)=>document.querySelector(selector)?.getBoundingClientRect()||null;
   const shell=rect('main.app-shell')!;
   const play=rect('.play-screen')!;
   const field=rect('.play-field')!;
   const panel=rect('.workspace-panel')!;
   const tabs=rect('.workspace-tabs')!;
   const end=rect('.bottom-ribbon .action-end')!;
   const lastTab=rect('.workspace-tab:last-child')!;
   const content=rect('.sheet-content')!;
   const measuredHeight=window.visualViewport?.height||innerHeight;
   const surfaces: Array<[string, DOMRect | null]>=[['screen',play],['field',field],['workspace',panel],['tabs',tabs],['end',end],['last tab',lastTab]];
   const outside=surfaces
    .filter(([,box])=>!box||box.width<1||box.height<1||box.left<shell.left-3||box.right>shell.right+3||box.top<shell.top-3||box.bottom>shell.bottom+3)
    .map(([name])=>name);
   return {
    measuredHeight,shellBottom:shell.bottom,viewportWidth:document.documentElement.clientWidth,
    documentWidth:document.documentElement.scrollWidth,
    outside,overlap:Math.min(field.right,panel.right)-Math.max(field.left,panel.left)>4
      &&Math.min(field.bottom,panel.bottom)-Math.max(field.top,panel.top)>4,
    tabHeights:[...document.querySelectorAll('.workspace-tab')].map(el=>el.getBoundingClientRect().height),
    seatRightPadding:parseFloat(getComputedStyle(document.querySelector('.player-seats')!).paddingRight),
    contentHeight:content.height
   };
  });
  expect(layout.outside,JSON.stringify({width,height,layout})).toEqual([]);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth+2);
  expect(layout.overlap).toBe(false);
  expect(Math.min(...layout.tabHeights)).toBeGreaterThanOrEqual(43);
  expect(layout.seatRightPadding).toBeLessThanOrEqual(1);
  expect(layout.contentHeight).toBeGreaterThan(35);
  expect(layout.shellBottom).toBeLessThanOrEqual(layout.measuredHeight+4);
  await page.locator('.workspace-tab[data-sheet="market"]').click();
  await expect(page.locator('[data-sheet-page="market"]')).toBeVisible();
  await page.locator('.workspace-tab[data-sheet="deals"]').click();
  await expect(page.locator('[data-sheet-page="deals"]')).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('Black Bazaar tabletop and workspace remain separate in landscape',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.goto(game);
 await expect(page.locator('.entry-screen')).toBeVisible();
 await scene(page,'six');
 const positions=await page.evaluate(()=>{
  const field=document.querySelector('.play-field')!.getBoundingClientRect();
  const panel=document.querySelector('.workspace-panel')!.getBoundingClientRect();
  const body=document.querySelector('.play-body')!.getBoundingClientRect();
  const end=document.querySelector('.bottom-ribbon')!.getBoundingClientRect();
  return {fieldRight:field.right,panelLeft:panel.left,fieldBottom:field.bottom,bodyBottom:body.bottom,endBottom:end.bottom,
   viewportWidth:document.documentElement.clientWidth,documentWidth:document.documentElement.scrollWidth};
 });
 expect(positions.fieldRight).toBeLessThanOrEqual(positions.panelLeft+3);
 expect(positions.fieldBottom).toBeLessThanOrEqual(positions.bodyBottom+3);
 expect(positions.endBottom).toBeLessThanOrEqual(positions.fieldBottom+3);
 expect(positions.documentWidth).toBeLessThanOrEqual(positions.viewportWidth+2);
 await page.locator('.workspace-tab[data-sheet="inventory"]').click();
 await expect(page.locator('[data-sheet-page="inventory"]')).toBeVisible();
});

test('host can open offline player menu without allowing an exchange',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await page.goto(game);
 await expect(page.locator('.entry-screen')).toBeVisible();
 await scene(page,'offline');
 const guest=page.locator('.seat[data-player="debug-1"]');
 await expect(guest).toBeEnabled();
 await guest.click();
 await expect(page.locator('.player-popover')).toContainText('Обмен недоступен');
 await expect(page.locator('.player-popover .kick-player')).toBeVisible();
});


test('pending connection is cancellable and a late rejection cannot cancel a retry',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 // Mock the app's fetch boundary instead of intercepting the network at
 // Playwright's router: service-worker routing differs in mobile WebKit.
 await page.addInitScript(()=>{
  const originalFetch=window.fetch.bind(window);
  const pending:Array<()=>void>=[];
  (window as any).__bazaarSessionPending=pending;
  window.fetch=(input,init)=>{
   const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
   if(new URL(url,location.href).pathname==='/pocketnet/session'){
    return new Promise<Response>(resolve=>pending.push(()=>resolve(
     new Response('{}',{status:503,headers:{'content-type':'application/json'}})
    )));
   }
   return originalFetch(input,init);
  };
 });
 try{
  await page.goto('/apps/black-bazaar/');
  await expect(page.locator('.entry-screen')).toBeVisible();
  await page.locator('[data-action="create"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bazaarSessionPending.length)).toBe(1);
  await expect(page.locator('[data-action="create"]')).toBeDisabled();
  await expect(page.locator('[data-action="cancel-connect"]')).toBeVisible();
  await page.locator('[data-action="cancel-connect"]').click();
  await expect(page.locator('[data-action="create"]')).toBeEnabled();
  await expect(page.locator('[data-action="cancel-connect"]')).toHaveCount(0);
  await page.locator('[data-action="create"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bazaarSessionPending.length)).toBe(2);
  await page.evaluate(()=>(window as any).__bazaarSessionPending[0]());
  await expect(page.locator('[data-action="cancel-connect"]')).toBeVisible();
  await expect(page.locator('[data-action="create"]')).toBeDisabled();
  await page.evaluate(()=>(window as any).__bazaarSessionPending[1]());
  await expect(page.locator('[data-action="create"]')).toBeEnabled();
  await expect(page.locator('#status')).toContainText('Нет соединения');
 }finally{
  await page.evaluate(()=>{for(const release of (window as any).__bazaarSessionPending||[])release();}).catch(()=>{});
 }
});
