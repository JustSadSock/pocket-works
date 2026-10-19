import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('../crown-tests',{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch();const contexts=[];const pages=[];const errors=[];const frames=[];
 for(let i=0;i<2;i++){
  const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true});contexts.push(c);
  const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('websocket',s=>s.on('framereceived',m=>{try{frames.push({client:i,data:JSON.parse(m.payload)});}catch{}}));
  await p.goto('http://127.0.0.1:8788/apps/crown-laws/');await p.locator('[data-action=open-online]').click();
 }
 const [a,z]=pages;
 await a.locator('[data-action=create-room]').click();await a.locator('.room-wait-card__code').waitFor();const code=(await a.locator('.room-wait-card__code').textContent()).trim();
 await z.locator('[data-input=room-code]').fill(code);await z.locator('[data-action=join-room]').click();
 for(const p of pages)await p.locator('[data-card-id]').first().waitFor();
 const own=(await a.locator('[data-card-id]').first().getAttribute('data-card-id'));
 await a.locator('[data-card-id]').first().click();await a.locator('[data-action=confirm-choice]').click();await a.waitForTimeout(100);
 const updates=frames.filter(m=>m.client===1&&m.data.type==='game_event'&&m.data.event.type==='state');
 const view=updates.at(-1).data.event.payload;
 assert(view.state.players.p1.hand.every(x=>x==='hidden'));assert(view.state.players.p1.deck.every(x=>x==='hidden'));assert.equal(view.state.seed,'private');assert.equal(view.state.pendingChoices,null);assert(!JSON.stringify(view).includes('"cardId":"'+own+'"'));
 await z.locator('[data-card-id]').first().click();await z.locator('[data-action=confirm-choice]').click();
 for(const p of pages)await p.waitForFunction(()=>JSON.parse(render_game_to_text()).turn===2);
 await a.screenshot({path:`../crown-tests/${name}-network.png`});
 // A native reload rejoins the same room with the same player token.
 await a.reload();await a.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).turn===2);
 // Local AI scenario and persistent progress use a separate clean profile.
 const local=await b.newPage({viewport:{width:844,height:390},hasTouch:true});local.on('pageerror',e=>errors.push(e.message));await local.goto('http://127.0.0.1:8788/apps/crown-laws/');await local.locator('[data-action=start-ai]').click();await local.locator('[data-card-id]').first().click();await local.locator('[data-action=confirm-choice]').click();await local.waitForFunction(()=>JSON.parse(render_game_to_text()).turn===2);
 await local.reload();await local.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).turn===2);await local.screenshot({path:`../crown-tests/${name}-ai.png`});
 assert.deepEqual(errors,[]);await b.close();console.log(name,'network privacy, reveal, AI, persistence passed');
}
