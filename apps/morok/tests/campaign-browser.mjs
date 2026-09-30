import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createRun,canPlay} from '../game-core.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'@playwright/test');
const base=process.env.MOROK_QA_URL||'http://127.0.0.1:8765/apps/morok/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(new URL('icons/icon.svg',base).href);await page.evaluate(r=>localStorage.setItem('pocket-works:morok:run:v2',JSON.stringify(r)),createRun(4));await page.goto(base);await page.click('#continueBtn');
let turns=0,visited=new Set();
async function ready(){await page.waitForFunction(()=>!window.__AI_TEST_STATE__.busy)}
async function tapCard(id){const card=page.locator(`#hand [data-card="${id}"]`);const box=await card.boundingBox();await page.mouse.click(box.x+20,box.y+24)}
for(let guard=0;guard<250;guard++){
await ready();const state=await page.evaluate(()=>window.__AI_TEST_STATE__),r=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:morok:run:v2')));
if(state.mode==='menu'){await page.click('#continueBtn');continue}
if(state.mode==='result'){assert.equal(state.result,'won');break}
if(state.mode==='route'){const stage=r.trail[r.depth],node=stage.find(n=>n.type==='hearth')||stage.find(n=>n.type==='cache')||stage.find(n=>n.type==='item')||stage.find(n=>n.type==='battle')||stage[0];await page.locator('.route-node').nth(stage.indexOf(node)).click();continue}
if(state.mode==='event'){
 const p=r.pending;if(p.type==='card-choice'){const c=[...p.choices].sort((a,b)=>(b.atk*2+b.hp*.3-b.cost*.3)-(a.atk*2+a.hp*.3-a.cost*.3))[0];await page.locator('#eventChoices .choice-button').nth(p.choices.findIndex(x=>x.instanceId===c.instanceId)).click()}
 else if(p.type==='hearth'){const c=r.deck.filter(c=>c.type==='creature'&&c.costType==='ember').sort((a,b)=>b.atk-a.atk)[0];await page.locator('#eventChoices .choice-button').nth(r.deck.filter(c=>c.type==='creature').findIndex(x=>x.instanceId===c.instanceId)).click();await page.locator('#eventChoices .choice-button').first().click()}
 else await page.locator('#eventChoices .choice-button').first().click();continue;
}
assert.equal(state.mode,'battle');visited.add(r.depth);
let acted=false;const b=r.battle;
const hand=[...b.hand].sort((a,b)=>(b.atk*2+b.hp*.15-b.cost*.2)-(a.atk*2+a.hp*.15-a.cost*.2));
for(const card of hand){
 if(card.type==='creature'){
  const lanes=[0,1,2,3].sort((a,d)=>{const score=l=>(b.enemy[l]?-b.enemy[l].hp*.3:2)+(b.player[l-1]?1:0)+(b.player[l+1]?1:0)+(b.seals.enemy+b.enemy.filter(Boolean).reduce((n,u)=>n+u.atk,0)>=6&&b.enemy[l]?5:0);return score(d)-score(a)});
  const lane=lanes.find(l=>canPlay(r,b,card,l).ok);if(lane!==undefined){await tapCard(card.instanceId);await page.locator('#playerRow .lane').nth(lane).click();acted=true;break}
 }else{const lane=[0,1,2,3].find(l=>canPlay(r,b,card,null,l).ok);if(lane!==undefined){await tapCard(card.instanceId);if(['milk','whisper','lash'].includes(card.rite))await page.click('#castBtn');else await page.locator(card.rite==='salt'?'#enemyRow .lane':'#playerRow .lane').nth(lane).click();acted=true;break}}
}
if(!acted){await page.click('#endTurnBtn');turns++}
}
await ready();assert.equal(await page.evaluate(()=>window.__AI_TEST_STATE__.result),'won');assert.equal(visited.size,9);assert.deepEqual(errors,[]);await page.screenshot({path:process.env.MOROK_CAMPAIGN_SCREENSHOT||'/tmp/morok-regression/campaign-victory.png'});console.log(`Complete UI campaign: 9 battles, 3 bosses, ${turns} turns, rewards and final victory OK`);
}finally{await browser.close()}
