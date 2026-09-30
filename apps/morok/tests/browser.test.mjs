// Run against a served production-like tree. PLAYWRIGHT_PACKAGE may point to a local Playwright installation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRun,createBattle,cloneCard,chooseCardReward} from '../game-core.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PACKAGE||'@playwright/test');
const base=process.env.MOROK_QA_URL||'http://127.0.0.1:8765/apps/morok/';
const out=process.env.MOROK_QA_OUTPUT||'/tmp/morok-regression';await mkdir(out,{recursive:true});
const key='pocket-works:morok:run:v2';
function fixture(kind='battle'){
  const r=createRun(101);chooseCardReward(r,r.pending.choices[0].instanceId);r.battle=createBattle(r);r.pending={type:'battle'};
  const b=r.battle;b.intent=[];b.enemy.fill(null);b.hand=['wolf','moth','salt','bark'].map(cloneCard);
  if(kind==='combat'){b.hand=[];b.player[0]={...cloneCard('wolf'),hp:2,maxHp:2,atk:3,side:'player'};b.enemy[0]={...cloneCard('crow'),hp:1,maxHp:1,atk:1,side:'enemy'};}
  if(kind==='win'){b.seals.player=6;b.ended=true;b.winner='player'}
  if(kind==='prior'){r.depth=8;r.battle=createBattle(r,'prior');r.battle.seals.player=4;r.battle.ember=3;r.battle.hand=[cloneCard('milk')];r.battle.intent=[]}
  return r;
}
for(const [engineName,engine]of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true,args:engineName==='chromium'?['--no-sandbox']:[]});
  for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932}]){
    const context=await browser.newContext({viewport:size,isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.click('#newRunBtn');await page.locator('#eventChoices .choice-button').first().click();assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.mode),'route');
    await page.locator('.route-node').filter({hasText:'Схватка'}).first().click();assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.mode),'battle');
    await page.screenshot({path:`${out}/${engineName}-${size.width}-start.png`});
    assert.equal(await page.locator('#turnForecast').isVisible(),true);const intent=page.locator('#intentRack button').first();const intentBox=await intent.boundingBox();assert.ok(intentBox.height>=44);await intent.click();assert.match(await page.locator('#focusText').textContent(),/со следующего/);await page.click('#focusClose');
    // Fixture is a valid persisted save; all actions after loading use the real UI.
    await page.goto(new URL('icons/icon.svg',base).href);await page.evaluate(([key,r])=>localStorage.setItem(key,JSON.stringify(r)),[key,fixture()]);await page.goto(base);await page.waitForFunction(()=>window.__AI_TEST_STATE__);if(await page.evaluate(()=>window.__AI_TEST_STATE__.mode==='menu'))await page.click('#continueBtn');
    const card=page.locator('#hand .game-card').first();let holdBox=await card.boundingBox();await page.mouse.move(holdBox.x+20,holdBox.y+25);await page.mouse.down();await page.locator('#cardFocus').waitFor({state:'visible'});await page.mouse.up();assert.equal(await page.locator('#cardFocus').isVisible(),true);await page.click('#focusClose');
    let cr=await card.boundingBox(),slot=await page.locator('#playerRow .lane').first().boundingBox();
    // Pointer drag, then actual move-to-slot and release. Neither uses force clicks.
    await page.mouse.move(cr.x+20,cr.y+25);await page.mouse.down();await page.mouse.move(slot.x+slot.width/2,slot.y+slot.height/2,{steps:10});await page.mouse.up();
    await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy&&window.__AI_TEST_STATE__.player[0]);
    assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.player[0].name),'Серый волк');
    // Drop on an occupied cell rejects the action and keeps the card in hand.
    const before=await page.locator('#hand .game-card').count();const second=page.locator('#hand .game-card').first();cr=await second.boundingBox();await page.mouse.move(cr.x+20,cr.y+20);await page.mouse.down();await page.mouse.move(slot.x+slot.width/2,slot.y+slot.height/2,{steps:8});await page.mouse.up();assert.equal(await page.locator('#hand .game-card').count(),before);
    await page.click('#cancelCard');await page.locator('#playerRow .lane').nth(0).click();assert.equal(await page.locator('#playerRow .lane.valid').count(),1);await page.locator('#playerRow .lane').nth(1).click();await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy);assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.player[0]),null);assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.player[1].name),'Серый волк');await page.locator('#playerRow .lane').nth(1).click();assert.equal(await page.locator('#playerRow .lane.valid').count(),0);await page.click('#cancelCard');await page.click('#settingsBtn');await page.click('#soundToggle');await page.click('#settingsClose');
    await page.click('#endTurnBtn');await page.evaluate(()=>{for(let i=0;i<12;i++)document.querySelector('#endTurnBtn').click()});await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy);assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.round),2);
    await page.reload();await page.waitForFunction(()=>window.__AI_TEST_STATE__);if(await page.evaluate(()=>window.__AI_TEST_STATE__.mode==='menu'))await page.click('#continueBtn');assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.round),2);
    const footprint=await page.locator('#hand .game-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().bottom));assert.ok(footprint.every(bottom=>bottom<=size.height),'hand cards stay on screen');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    await page.waitForTimeout(250);await page.screenshot({path:`${out}/${engineName}-${size.width}-played.png`});
    // Target sizes and hand footprint must survive the smallest phone.
    for(const selector of ['#endTurnBtn','#playerRow .lane','#settingsBtn']){const box=await page.locator(selector).first().boundingBox();assert.ok(box.width>=44&&box.height>=44,selector)}
    assert.deepEqual(errors,[]);await context.close();console.log(`${engineName} ${size.width}×${size.height}: drag, invalid drop, turn, persistence, layout OK`);
  }
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  async function load(r){await page.goto(new URL('icons/icon.svg',base).href);await page.evaluate(([k,r])=>localStorage.setItem(k,JSON.stringify(r)),[key,r]);await page.goto(base);await page.waitForFunction(()=>window.__AI_TEST_STATE__);if(await page.evaluate(()=>window.__AI_TEST_STATE__.mode==='menu'))await page.click('#continueBtn')}
  await load(fixture('combat'));assert.equal(await page.locator('#enemyRow .will-die').count(),1);await page.waitForTimeout(250);await page.screenshot({path:`${out}/${engineName}-forecast.png`});await page.click('#endTurnBtn');await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy);assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.enemy[0]),null);await page.screenshot({path:`${out}/${engineName}-death.png`});
  await load(fixture('prior'));await page.locator('#hand .game-card').click();await page.click('#castBtn');await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy);const phased=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).battle,key);assert.equal(phased.phase,2);assert.equal(phased.ember,1);assert.equal(phased.maxEmber,2);
  await load(fixture('win'));assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.mode),'event');await page.locator('#eventChoices .choice-button').first().click();assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.depth),1);
  // Chromium simulates offline through the browser. WebKit's Playwright transport returns
  // an internal navigation error with setOffline; a stopped real server tests its SW fallback.
  if(engineName==='chromium'){
    await page.waitForFunction(()=>navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__AI_TEST_STATE__);assert.ok(await page.evaluate(()=>window.__AI_TEST_STATE__.mode!=='menu')||await page.locator('#continueBtn').isVisible());await context.setOffline(false);
  }else{
    const root=process.env.MOROK_QA_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
    const server=createServer(async(request,response)=>{try{let file=path.join(root,new URL(request.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw new Error('path');if((await stat(file)).isDirectory())file=path.join(file,'index.html');const data=await readFile(file);const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};response.setHeader('Content-Type',mime[path.extname(file)]||'text/html');response.end(data)}catch{response.writeHead(404);response.end()}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const offlineContext=await browser.newContext({viewport:{width:390,height:844}});const offlinePage=await offlineContext.newPage();
    try{
      await offlinePage.goto(`http://127.0.0.1:${server.address().port}/apps/morok/`);await offlinePage.waitForFunction(()=>navigator.serviceWorker.controller);await offlinePage.waitForTimeout(300);await offlinePage.click('#newRunBtn');
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await offlinePage.reload();await offlinePage.waitForFunction(()=>window.__AI_TEST_STATE__);assert.ok(await offlinePage.evaluate(()=>window.__AI_TEST_STATE__.mode!=='menu')||await offlinePage.locator('#continueBtn').isVisible());
    }finally{if(server.listening){server.closeAllConnections();server.close()}await offlineContext.close()}
  }
  assert.deepEqual(errors,[]);await context.close();await browser.close();console.log(`${engineName}: lethal attack, prior phase, victory recovery, reward, offline OK`);
}
