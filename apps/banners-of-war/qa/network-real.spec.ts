import {test,expect,devices} from '@playwright/test';
test('two real Pocket ID clients complete and reconnect',async({browser},info)=>{
 const origin=info.project.use.baseURL!;let suffix=Date.now().toString(36)+info.project.name.slice(-2);let {defaultBrowserType,...device}=devices[info.project.name.includes('webkit')?'iPhone 13':'Pixel 7'];let A=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true}),B=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true});try{
 const accounts:string[]=[];
 for(const [ctx,name] of [[A,'BWAlpha'+suffix],[B,'BWBeta'+suffix]] as const){
  const page=await ctx.newPage();
  try {
   await page.goto('/');
   const registered=await page.evaluate(async nickname=>{
    const response=await fetch('/pocket-id/register',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({nickname,avatar:'clay'})});
    const body=await response.json();
    return {status:response.status,id:body.user?.id};
   },name);
   expect(registered.status).toBe(201);
   expect(registered.id).toBeTruthy();
   const me=await page.evaluate(async()=>{
    const response=await fetch('/pocket-id/me',{credentials:'same-origin'});
    const body=await response.json();
    return {status:response.status,id:body.user?.id};
   });
   expect(me).toEqual({status:200,id:registered.id});
   const session=(await ctx.cookies(origin)).find(c=>c.name==='__Host-pw-id');
   expect(session).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax',path:'/'});
   accounts.push(registered.id);
  } finally {await page.close()}
 }
 expect(new Set(accounts).size).toBe(2);
 let a=await A.newPage(),b=await B.newPage(),errors:string[]=[];for(let p of [a,b])p.on('pageerror',e=>errors.push(e.message));await a.goto('/apps/banners-of-war/');await a.locator('#network').click();await expect(a.locator('#net-status')).toContainText('Pocket ID');await a.locator('#net-length').fill('60');await a.locator('#net-time').selectOption('0');await a.locator('#net-create').click();await expect(a.locator('#net-status')).toContainText('Комната');let code=(await a.locator('#net-status').textContent())!.match(/[0-9A-F]{16}/)![0];await a.screenshot({path:info.outputPath('room-host.png')});await b.goto('/apps/banners-of-war/?battle='+code);await expect(b.locator('#net-accept')).toBeEnabled();await expect(a.locator('#net-accept')).toBeEnabled({timeout:15000});await Promise.all([a.locator('#net-accept').click(),b.locator('#net-accept').click()]);
 for(let round=1;round<=2;round++){for(let p of [a,b]){await expect(p.locator('#net-ready')).toBeVisible({timeout:20000});await p.locator('#net-all').click();await p.locator('#net-hold').click();p.once('dialog',d=>d.accept());await p.locator('#net-ready').click()}if(round===1){await expect(a.locator('#net-replay-done')).toBeVisible({timeout:30000});await expect(b.locator('#net-replay-done')).toBeVisible({timeout:30000});await a.screenshot({path:info.outputPath('round-replay.png')});await B.setOffline(true);await b.reload().catch(()=>{});await B.setOffline(false);await b.goto('/apps/banners-of-war/?battle='+code);await expect(b.locator('#net-replay-done')).toBeVisible({timeout:20000});await Promise.all([a.locator('#net-replay-done').click(),b.locator('#net-replay-done').click()])}}
 await expect(a.locator('#net-desk h3')).toBeVisible({timeout:30000});await expect(b.locator('#net-desk h3')).toBeVisible({timeout:30000});await a.locator('#net-round-select').selectOption('1');await expect(a.locator('#net-export')).toBeVisible({timeout:10000});await a.screenshot({path:info.outputPath('finished-archive.png')});expect(errors).toEqual([]);
 }finally{await A.close();await B.close()}
});
