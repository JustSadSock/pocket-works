import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEBUG_ITEMS,DEBUG_ROLES,DEBUG_FX,DEBUG_SCENES,createDebugState,debugItem,debugSetItem,debugCommand} from './debug-state.js';
import {DEBUG_VIEWPORTS} from './debug-console.js';

test('All visual modes have deterministic, usable state and no network identities',()=>{
 assert.equal(DEBUG_SCENES.length,15);
 const cases=new Set(DEBUG_SCENES.map(x=>x[0]));
 for(const id of ['home','lobby','two','four','six','buyer','seller','bids','black','deals','urgent','event','bankrupt','done','offline'])assert.ok(cases.has(id));
 for(const [id] of DEBUG_SCENES){
  const state=createDebugState(id);
  if(id==='home'){assert.equal(state,null);continue;}
  assert.ok(state.players?.length>=2,'participants present: '+id);
  assert.ok(state.players.every(p=>p.id.startsWith('debug-')),'not a PocketNet player: '+id);
  if(id==='lobby'){assert.equal(state.phase,'lobby');continue;}
  assert.equal(state.you.id,'debug-0');
  assert.equal(state.rounds,9);
  assert.ok(state.players.length<=6);
 }
});
test('All item types and nine characters are browsable',()=>{
 const offline=createDebugState('offline');
 assert.equal(offline.players[1].connected,false);
 assert.equal(offline.players[0].connected,true);
 assert.equal(DEBUG_ITEMS.length,13);
 assert.equal(DEBUG_ROLES.length,6);
 assert.equal(DEBUG_FX.length,15);
 const item=createDebugState('four');
 for(let index=0;index<DEBUG_ITEMS.length;index++){
  for(const kind of ['inventory','listing','black','broker']){
   const s=structuredClone(item);debugSetItem(s,index,kind);
   assert.ok(kind==='inventory'?s.you.items.some(i=>i.id==='debug-selected-'+index):
    kind==='listing'?s.listing?.id==='debug-selected-'+index:
    kind==='broker'?s.broker?.id==='debug-selected-'+index:
    s.blackLots.some(l=>l.id==='selected-black'));
  }
 }
});
test('Debug commands exercise purchase, bid, inspection, work, barter and turn without PocketNet',()=>{
 const s=createDebugState('four');
 let r=debugCommand(s,{type:'work',resource:'gold'});
 assert.equal(r.state.you.resources.gold,425);
 s.listing=null;
 r=debugCommand(s,{type:'post',itemId:'owned-gear',ask:{gold:60,crystals:0,parts:0}});
 assert.equal(r.state.listing.id,'owned-gear');
 r=debugCommand(s,{type:'bid',buyer:'debug-1',offer:{gold:55,crystals:0,parts:0}});
 assert.ok(r.state.bids.some(b=>b.buyer==='debug-1'));
 r=debugCommand(s,{type:'inspect'});
 assert.equal(r.state.you.inspections.length,1);
 r=debugCommand(s,{type:'deal_propose',to:'debug-1',give:{gold:10,crystals:0,parts:0},want:{gold:0,crystals:1,parts:0}});
 assert.equal(r.state.deals.length,1);
 r=debugCommand(s,{type:'end'});
 assert.equal(r.state.turnId,'debug-1');
});
test('Preview boot prevents real PocketNet sessions and writes',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./preview.html',import.meta.url),'utf8');
 assert.match(app,/if\(debugPreview\)\{\s*const before=structuredClone\(state\)/);
 assert.match(app,/if\(!debugPreview\)try\{const saved=/);
 assert.match(app,/if\(!debugPreview\)createWorkshopMode/);
 assert.match(app,/if\(!debugPreview\)try\{localStorage\.setItem/);
 assert.match(app,/if\(debugPreview\)\{\s*state=createDebugState\('lobby'\)/);
 assert.doesNotMatch(html,/update-manager\.js/);
 assert.doesNotMatch(html,/service-worker|registerSW/i);
});
test('Seven true iframe viewport sizes, including small portrait and landscape',()=>{
 assert.deepEqual(DEBUG_VIEWPORTS.map(x=>[x[2],x[3]]),[
  [320,568],[375,667],[390,844],[844,390],[820,1024],[1024,768],[1440,900]
 ]);
});

test('Mobile portrait CSS keeps content panels scrollable without expanding page',()=>{
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.match(css,/\.sheet-page\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.sheet-content\{flex:1 1 auto;overflow-y:auto\}/);
 assert.match(css,/max-height:670px/);
});

test('Mobile audit checks collisions and clipped scrolling content',()=>{const ui=readFileSync(new URL('./app.js',import.meta.url),'utf8');assert.match(ui,/Стол перекрывает вкладки/);assert.match(ui,/Задание перекрывает ресурсы/);assert.match(ui,/Содержимое боковой панели обрезано/);});

test('Workshop batch audit enumerates every debug scene at each viewport',()=>{const source=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(source,/data-debug-audit-matrix/);assert.match(source,/DEBUG_SCENES\.flatMap/);assert.match(source,/scene-ready/);});

test('Workshop awaits scene-ready and ignores stale viewport measurements',()=>{const source=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(source,/scene-ready/);assert.match(source,/d\.step!==auditStep/);assert.match(source,/data-debug-copy-report/);});

test('QA matrix includes small and short phones and prioritizes failures',()=>{const src=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(src,/320,568/);assert.match(src,/375,667/);assert.match(src,/failures=results.filter/);assert.match(src,/if\(!auditQueue&&d.run!=null\)return/);});

test('Public auction settles buyer and seller balances, item ownership and first-sale bonus',()=>{
 const s=createDebugState('four');
 s.listing=null;
 const itemId=s.you.items[0].id,offer={gold:70,crystals:2,parts:0};
 const sellerBefore={...s.you.resources},buyerBefore={...s.players[1].resources};
 const buyerCount=s.players[1].items;
 assert.ok(!debugCommand(s,{type:'post',itemId,ask:offer}).error);
 assert.equal(s.listing.id,itemId);
 assert.ok(!debugCommand(s,{type:'bid',buyer:'debug-1',offer}).error);
 assert.equal(s.bids.length,1);
 assert.ok(!debugCommand(s,{type:'accept',buyer:'debug-1',bidId:s.bids[0].id}).error);
 assert.equal(s.listing,null);
 assert.equal(s.bids.length,0);
 assert.equal(s.you.items.some(i=>i.id===itemId),false);
 assert.equal(s.players[1].inventory.some(i=>i.id===itemId),true);
 assert.equal(s.players[1].items,buyerCount+1);
 assert.equal(s.you.resources.gold,sellerBefore.gold+70);
 assert.equal(s.you.resources.crystals,sellerBefore.crystals+2);
 assert.equal(s.you.resources.parts,sellerBefore.parts+1);
 assert.equal(s.players[1].resources.gold,buyerBefore.gold-70);
 assert.equal(s.players[1].resources.crystals,buyerBefore.crystals-2);
 assert.equal(s.you.marketDeals,1);
});
test('Public auction rejects invalid and stale bids without moving resources',()=>{
 const s=createDebugState('four');
 s.listing=null;
 debugCommand(s,{type:'post',itemId:s.you.items[0].id,ask:{gold:70,crystals:0,parts:0}});
 const walletBefore={...s.players[1].resources};
 assert.ok(debugCommand(s,{type:'bid',buyer:'debug-0',offer:{gold:70}}).error,'seller cannot bid');
 assert.ok(debugCommand(s,{type:'bid',buyer:'debug-1',offer:{gold:99999}}).error,'insufficient resources');
 assert.ok(debugCommand(s,{type:'accept',buyer:'debug-1'}).error,'no valid bid');
 assert.deepEqual(s.players[1].resources,walletBefore);
 assert.ok(s.listing,'the unfilled listing remains');
});

test('Mobile browser QA checks public auction settlement and presentation',()=>{
 const src=readFileSync(new URL('../../scripts/qa-black-bazaar-mobile.mjs',import.meta.url),'utf8');
 assert.match(src,/scene==='seller'/);
 assert.match(src,/type:'post'/);
 assert.match(src,/type:'bid',buyer:'debug-1'/);
 assert.match(src,/acceptButton\.click\(\)/);
 assert.ok(src.includes('button[data-action="accept"]'));
 assert.match(src,/auction payment or first-sale bonus incorrect/);
});

test('Workshop rejects a repriced offer with the old immutable ID',()=>{
 const s=createDebugState('four');s.listing=null;
 assert.ok(!debugCommand(s,{type:'post',itemId:s.you.items[0].id,ask:{gold:40}}).error);
 assert.ok(!debugCommand(s,{type:'bid',buyer:'debug-1',offer:{gold:40}}).error);
 const prior=s.bids[0].id;
 assert.ok(!debugCommand(s,{type:'bid',buyer:'debug-1',offer:{gold:1}}).error);
 assert.notEqual(s.bids[0].id,prior);
 assert.ok(debugCommand(s,{type:'accept',buyer:'debug-1',bidId:prior}).error);
 assert.ok(!debugCommand(s,{type:'accept',buyer:'debug-1',bidId:s.bids[0].id}).error);
});

test('Workshop avatar picker changes only the local seat and carries choice into game',()=>{
 const room=createDebugState('lobby');
 assert.equal(room.players.length,4);
 assert.ok(room.players.every(p=>p.name===p.character));
 assert.ok(debugCommand(room,{type:'select_avatar',avatarId:'made_up'}).error);
 assert.ok(!debugCommand(room,{type:'select_avatar',avatarId:'old_man'}).error);
 assert.equal(room.players[0].avatarId,'old_man');
 assert.equal(room.players[1].avatarId,'mushroom');
 const started=debugCommand(room,{type:'start'});
 assert.equal(started.state.phase,'play');
 assert.equal(started.state.players[0].avatarId,'old_man');
 assert.equal(started.state.you.avatarId,'old_man');
 assert.ok(debugCommand(started.state,{type:'select_avatar',avatarId:'mage'}).error);
});
