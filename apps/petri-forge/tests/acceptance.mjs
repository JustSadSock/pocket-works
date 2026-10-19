import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
let online=true;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{if(!online){req.socket.destroy();return;}let filename=path.join(process.cwd(),decodeURIComponent(new URL(req.url,'http://local').pathname));try{if((await fs.stat(filename)).isDirectory())filename=path.join(filename,'index.html');const data=await fs.readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4183,'127.0.0.1',r));
const dir='../petri-acceptance';await fs.mkdir(dir,{recursive:true});
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch();
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,hasTouch:true,recordVideo:{dir, size:viewport}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  online=true;await page.goto('http://127.0.0.1:4183/apps/petri-forge/');await page.waitForFunction(()=>window.render_game_to_text);
  const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
  assert.equal((await state()).steps,0);
  await page.locator('#generate').selectOption('5');assert((await state()).grid.flat().includes(1));
  const box=await page.locator('#cv').boundingBox();
  await page.locator('#tileSelect').selectOption('3');
  await page.touchscreen.tap(box.x+box.width*10.5/30,box.y+box.height*10.5/20);
  assert.equal((await state()).grid[10][10],3);
  await page.locator('#undo').click();assert.notEqual((await state()).grid[10][10],3);
  await page.locator('#redo').click();assert.equal((await state()).grid[10][10],3);
  await page.locator('#save').click();await page.reload();await page.waitForFunction(()=>window.render_game_to_text);
  assert.equal((await state()).grid[10][10],3);
  await page.locator('#step').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).steps===1);
  await page.locator('#agentSelect').selectOption('qlearning');await page.waitForTimeout(100);
  await page.locator('#playPause').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).steps>3);
  await page.locator('#playPause').click();assert.equal((await state()).running,false);
  await page.screenshot({path:`${dir}/${engine}-${viewport.width}.png`});
  await page.locator('#reset').click();assert.equal((await state()).steps,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForTimeout(400);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);online=false;await page.reload();await page.waitForFunction(()=>window.render_game_to_text);
  assert.equal((await state()).grid[10][10],3);
  assert.equal(await page.locator('a.exit').getAttribute('href'),'../../');
  assert.deepEqual(errors,[]);await context.close();console.log(engine,viewport.width,'passed');
 }
 await browser.close();
}
server.close();
