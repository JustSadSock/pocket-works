import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
// Playwright WebKit setOffline rejects service-worker navigation (microsoft/playwright#42775).
// Real origin shutdown instead: same cached URL, new page, negative uncached network control.
async function disposableOrigin(){
 const root=process.cwd(),mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname);if(pathname==='/__offline_probe'){res.writeHead(200,{'Cache-Control':'no-store'});res.end('online');return}if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');let body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end('Not found')}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));let addr=server.address();if(!addr||typeof addr==='string')throw Error('address');let base='http://127.0.0.1:'+addr.port;
 return {base,stop:async()=>{if(!server.listening)return;await new Promise<void>((r,j)=>{server.close(e=>e?j(e):r());server.closeAllConnections()})}}
}
test('Living Battlefield: four terrain choices, fog, sector overlays, three camera scales, offline save and replay',async({page,context,browserName},info)=>{
 test.setTimeout(120000);const origin=browserName==='webkit'?await disposableOrigin():null;const url=(origin?.base||'')+'/apps/banners-of-war/';try{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.locator('#landscape').selectOption('ridge');await page.locator('#visibility').selectOption('fog');await page.locator('#objective').selectOption('territory');await page.locator('#start').click();
 await expect(page.locator('#phase')).toContainText('Развёртывание');await expect(page.locator('#red')).toContainText('в обзоре 0');await page.screenshot({path:info.outputPath('living-strategic.png')});
 await page.locator('#confirm').click();await page.locator('#plus').click();await page.locator('#plus').click();await page.waitForTimeout(180);await page.screenshot({path:info.outputPath('living-tactical.png')});
 await page.locator('#focus').click();await page.waitForTimeout(200);await page.screenshot({path:info.outputPath('living-warriors.png')});
 await page.locator('#layer').selectOption('pressure');await page.locator('#layer').selectOption('contacts');await page.locator('#layer').selectOption('visibility');await page.waitForTimeout(150);await page.screenshot({path:info.outputPath('living-visibility.png')});
 await page.locator('#fit').click();await page.locator('#layer').selectOption('normal');await page.locator('#confirm').click();await page.locator('#confirm').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();await expect(page.locator('#round')).toContainText('2');
 await page.reload();await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:15000});if(origin){expect(await (await fetch(origin.base+'/__offline_probe')).text()).toBe('online');await origin.stop();await expect(fetch(origin.base+'/__offline_probe')).rejects.toThrow();}else await context.setOffline(true);await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');await page.locator('#replay').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();if(!origin)await context.setOffline(false);
 expect(errors).toEqual([]);
 }finally{await origin?.stop();if(!origin)await context.setOffline(false)}
});
