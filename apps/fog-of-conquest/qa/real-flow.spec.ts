import {test,expect} from '@playwright/test';

// The actual original DOM, sprites and move algorithm, NOT the abandoned remake.
test('original campaign: render, move, turn, autosave, restore and launcher link',async({page},info)=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#newGameBtn')).toBeVisible();
 await page.locator('#newGameBtn').click();
 await page.locator('#twoBtn').click();
 await expect(page.locator('#startPanel')).toBeHidden();
 await expect(page.locator('#canvas')).toBeVisible();
 await page.waitForFunction(()=>window.units?.length>=4&&window.map?.length===20);
 const rendering=await page.locator('#canvas').evaluate((canvas:HTMLCanvasElement)=>{
   const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
   const colors=new Set<string>();
   for(let i=0;i<data.length;i+=1600)colors.add(data[i]+','+data[i+1]+','+data[i+2]);
   return {width:canvas.width,height:canvas.height,colors:colors.size};
 });
 expect(rendering.width).toBeGreaterThan(360);
 expect(rendering.height).toBeGreaterThan(360);
 expect(rendering.colors).toBeGreaterThan(8);
 await page.screenshot({path:info.outputPath('01-original-map.png')});
 await page.evaluate(()=>{
   const canvas=document.getElementById('canvas') as HTMLCanvasElement;
   const rect=canvas.getBoundingClientRect();
   const c=canvas.width/30;
   const click=(r:number,col:number)=>canvas.dispatchEvent(new MouseEvent('click',{
     bubbles:true,cancelable:true,clientX:rect.left+(col+.5)*c,clientY:rect.top+(r+.5)*c}));
   click(1,2);click(1,3);
 });
 await expect.poll(()=>page.evaluate(()=>window.units.find(u=>u.owner===1&&u.type==='swordsman')?.c)).toBe(3);
 await page.locator('#endTurnBtn').click();
 await expect(page.locator('#overlay')).toBeVisible();
 await page.locator('#yesBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.state.currentPlayer)).toBe(2);
 expect(await page.evaluate(()=>Boolean(localStorage.getItem('focSave_autosave')))).toBe(true);
 await page.screenshot({path:info.outputPath('02-original-next-turn.png')});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loadBtn').click();
 await page.locator('#loadList .loadBtn').first().click();
 await expect.poll(()=>page.evaluate(()=>window.state.currentPlayer)).toBe(2);
 const dims=await page.evaluate(()=>({
   scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,
   w:innerWidth,h:innerHeight,buttons:[...document.querySelectorAll('#controls button')].map(el=>(el as HTMLElement).getBoundingClientRect().height)
 }));
 expect(dims.scrollW).toBeLessThanOrEqual(dims.w+2);
 // Some mobile browser safe-area rounding adds layout overflow even when
 // the document is clipped. Test whether the document can actually scroll.
 const documentScroll=await page.evaluate(async()=>{
   window.scrollTo(0,200);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   const overflowing=[...document.querySelectorAll('body *')].map(element=>{
     const r=element.getBoundingClientRect(),style=getComputedStyle(element);
     return {id:element.id,tag:element.tagName,top:Math.round(r.top),
       bottom:Math.round(r.bottom),height:Math.round(r.height),
       position:style.position,display:style.display};
   }).filter(x=>x.display!=='none'&&x.bottom>innerHeight+1).slice(0,15);
   return {scrollY:window.scrollY,innerHeight,scrollHeight:document.documentElement.scrollHeight,
     rootHeight:getComputedStyle(document.documentElement).height,
     bodyHeight:getComputedStyle(document.body).height,
     cssVariable:document.documentElement.style.getPropertyValue('--fog-window-height'),
     overflowing};
 });
 expect(documentScroll.scrollY,JSON.stringify(documentScroll)).toBe(0);
 expect(errors).toEqual([]);
});
test('menu: original settings, AI choices and PocketNet lobby are reachable',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await expect(page.locator('#aiBtn')).toBeVisible();
 await page.locator('#onlineBtn').click();
 await expect(page.locator('#lobbyPanel')).toBeVisible();
 await expect(page.locator('#onlineLobbyControls')).toBeVisible();
 await page.locator('#lobbyBackBtn').click();
 await expect(page.locator('#startPanel')).toBeVisible();
 await page.locator('#startSettingsBtn').click();
 await expect(page.locator('#settingsOverlay')).toBeVisible();
 await page.locator('#settingsCloseBtn').click();
 await expect(page.locator('#settingsOverlay')).toBeHidden();
 expect(errors).toEqual([]);
});
