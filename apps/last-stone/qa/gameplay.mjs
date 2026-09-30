import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const servers=new Set();process.on('exit',()=>{for(const child of servers)child.kill('SIGTERM');});
async function startOfflineServer(){
 const child=spawn('python3',['-u','-m','http.server','0','--bind','127.0.0.1'],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),stdio:['ignore','pipe','pipe']});servers.add(child);child.once('exit',()=>servers.delete(child));
 const url=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('QA server did not start')),5000);child.on('error',reject);child.stdout.on('data',data=>{log+=data;const port=log.match(/port (\d+)/);if(port){clearTimeout(timeout);resolve(`http://127.0.0.1:${port[1]}`);}});});
 return {url,async stop(){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}};
}
const artifactDir=process.env.LAST_STONE_QA_DIR||'/tmp/last-stone-qa';await mkdir(artifactDir,{recursive:true});
const reports=[];
for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await browserType.launch({headless:true});
 for(const [orientation,viewport] of [['landscape',{width:844,height:390}],['portrait',{width:390,height:844}]]){
  const offlineServer=engine==='webkit'?await startOfflineServer():null;const baseURL=offlineServer?.url||'http://127.0.0.1:4173';
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();
  const errors=[],failed=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});page.on('requestfailed',r=>failed.push(r.url()));
  const tag=`${engine}-${orientation}`;const state=()=>page.evaluate(()=>window.__AI_TEST_STATE__);
  const shot=async(name)=>page.screenshot({path:`${artifactDir}/${tag}-${name}.png`});
  const tile=async(x,z)=>{const s=await state();const cell=s.grid.find(c=>c.x===x&&c.z===z);assert(cell,`missing tile ${x}:${z}`);await page.touchscreen.tap(cell.screen.x,cell.screen.y);await page.waitForTimeout(50);assert.deepEqual((await state()).pending,[x,z],`tap failed ${x}:${z}`);};
  const place=async(kind,x,z)=>{await page.locator(`[data-kind="${kind}"]`).click();await tile(x,z);assert.equal(await page.locator('#confirm-build').isEnabled(),true);await page.locator('#confirm-build').click();assert.equal((await state()).pending,null);};
  await page.goto(`${baseURL}/apps/last-stone/?qa=1`);await page.waitForFunction(()=>window.__AI_TEST_STATE__?.grid?.length===121);await page.waitForTimeout(2600);await shot('start');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await tile(5,5);assert.equal(await page.locator('#confirm-build').isEnabled(),false);await shot('invalid');await page.locator('#cancel-build').click();
  await tile(4,3);await shot('preview');assert.equal((await state()).pieces.length,0);await page.locator('#cancel-build').click();assert.equal((await state()).stone,200);
  await place('wall',4,3);assert.equal((await state()).stone,192);
  await page.locator('#undo').click();assert.equal((await state()).pieces.length,0);assert.equal((await state()).stone,200);
  for(let z=3;z<=7;z++)for(let x=3;x<=7;x++)if(x===3||x===7||z===3||z===7){const kind=(x===3||x===7)&&(z===3||z===7)?'tower':x===5&&z===3?'gate':'wall';await place(kind,x,z);}
  await shot('castle');assert.equal((await state()).pieces.length,16);
  await page.locator('#help').click();await page.locator('#modal-primary').click();assert.equal(await page.locator('#modal-backdrop').isVisible(),false);assert.equal(await page.locator('#start').isEnabled(),true);
  await page.reload();await page.waitForFunction(()=>window.__AI_TEST_STATE__?.pieces?.length===16);await page.waitForTimeout(500);
  await page.locator('#start').click();assert.equal((await state()).phase,'siege');assert.equal(await page.locator('#dock').isVisible(),false);assert.equal(await page.locator('#placement').isVisible(),false);
  await page.waitForTimeout(2500);await page.locator('#pause').click();const stopped=(await state()).elapsed;await page.waitForTimeout(250);assert.equal((await state()).elapsed,stopped);await page.locator('#pause').click();await page.locator('#speed').click();
  const frames=[];let observedDamage=false,observedBreak=false;
  for(let i=0;i<80;i++){await page.waitForTimeout(500);const s=await state();assert.deepEqual(errors,[]);frames.push(s.fps);observedDamage ||=s.pieces.some(p=>p.hp<(p.kind==='wall'?95:p.kind==='gate'?90:p.kind==='tower'?160:45));observedBreak ||=s.pieces.length<16;if(i===8)await shot('siege');if(s.phase!=='siege')break;}
  const result=await state();assert.equal(result.phase,'build',JSON.stringify({phase:result.phase,elapsed:result.elapsed,keep:result.keep,enemies:result.enemyPositions,fps:result.fps}));assert.equal(result.wave,2);assert.equal(result.enemies,0);assert.equal(observedDamage,true);assert.equal(observedBreak,true);await shot('aftermath');
  await page.locator('#modal-primary').click();assert.equal(await page.locator('#dock').isVisible(),true);
  const damaged=result.pieces.find(p=>p.hp<(p.kind==='wall'?95:p.kind==='gate'?90:p.kind==='tower'?160:45));
  if(damaged){await page.locator('#repair').click();await tile(damaged.x,damaged.z);await page.locator('#confirm-build').click();}
  const tower=(await state()).pieces.find(p=>p.kind==='tower');await page.locator('#upgrade').click();await tile(tower.x,tower.z);await page.locator('#confirm-build').click();assert.equal((await state()).pieces.find(p=>p.x===tower.x&&p.z===tower.z).level,2);
  const breach=[];for(let z=3;z<=7;z++)for(let x=3;x<=7;x++)if((x===3||x===7||z===3||z===7)&&!(await state()).pieces.some(p=>p.x===x&&p.z===z))breach.push([x,z]);
  for(const [x,z] of breach)await place('wall',x,z);
  await shot('repaired');await page.reload();await page.waitForFunction(()=>window.__AI_TEST_STATE__?.wave===2);assert.equal((await state()).pieces.find(p=>p.x===tower.x&&p.z===tower.z).level,2);
  // Confirm offline navigation after the isolated SW takes control.
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  // Stop the actual server for WebKit: its inspector offline API bypasses SW navigation.
  if(offlineServer)await offlineServer.stop();else await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__AI_TEST_STATE__?.wave===2);
  if(!offlineServer)await context.setOffline(false);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({tag,piecesBefore:16,piecesAfter:result.pieces.length,keep:result.keep,observedDamage,observedBreak,offlineMode:engine==='webkit'?'server-stopped':'context-offline',fps:frames,errors,failed});console.log(reports.at(-1));
  await context.close();
 }
 await browser.close();
}
await writeFile(`${artifactDir}/report.json`,JSON.stringify(reports,null,2));
