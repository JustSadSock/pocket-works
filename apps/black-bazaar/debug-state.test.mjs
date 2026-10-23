import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEBUG_ITEMS,DEBUG_ROLES,DEBUG_FX,DEBUG_SCENES,createDebugState,debugItem,debugSetItem,debugCommand} from './debug-state.js';
import {DEBUG_VIEWPORTS} from './debug-console.js';

test('All visual modes have deterministic, usable state and no network identities',()=>{
 assert.equal(DEBUG_SCENES.length,14);
 const cases=new Set(DEBUG_SCENES.map(x=>x[0]));
 for(const id of ['home','lobby','two','four','six','buyer','seller','bids','black','deals','urgent','event','bankrupt','done'])assert.ok(cases.has(id));
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
 r=debugCommand(s,{type:'bid',offer:{gold:55,crystals:0,parts:0}});
 assert.ok(r.state.bids.some(b=>b.buyer==='debug-0'));
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
test('Five true iframe viewport sizes, including portrait and landscape',()=>{
 assert.deepEqual(DEBUG_VIEWPORTS.map(x=>[x[2],x[3]]),[
  [390,844],[844,390],[820,1024],[1024,768],[1440,900]
 ]);
});

test('Mobile portrait CSS keeps content panels scrollable without expanding page',()=>{
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.match(css,/\.sheet-page\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.sheet-content\{flex:1 1 auto;overflow-y:auto\}/);
 assert.match(css,/max-height:670px/);
});

test('Mobile audit checks collisions and clipped scrolling content',()=>{const ui=readFileSync(new URL('./app.js',import.meta.url),'utf8');assert.match(ui,/Стол перекрывает вкладки/);assert.match(ui,/Задание перекрывает ресурсы/);assert.match(ui,/Содержимое боковой панели обрезано/);});

test('Workshop batch audit enumerates every debug scene at each viewport',()=>{const source=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(source,/data-debug-audit-matrix/);assert.match(source,/DEBUG_SCENES\.flatMap/);assert.match(source,/requestAnimationFrame\(\(\)=>requestAnimationFrame/);});

test('Workshop awaits scene-ready and ignores stale viewport measurements',()=>{const source=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(source,/scene-ready/);assert.match(source,/d\.step!==auditStep/);assert.match(source,/data-debug-copy-report/);});

test('QA matrix includes small and short phones and prioritizes failures',()=>{const src=readFileSync(new URL('./debug-console.js',import.meta.url),'utf8');assert.match(src,/320,568/);assert.match(src,/375,667/);assert.match(src,/failures=results.filter/);assert.match(src,/if\(!auditQueue&&d.run!=null\)return/);});
