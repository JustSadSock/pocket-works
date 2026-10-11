import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newGame,validState,enactEdict,enactLaw,research,foreignAction,choosePetition,endTurn,scoreState} from '../core-v2.js';

test('starting conditions and provincial taxes are causal',()=>{
 const s=newGame('crown',1234);
 assert.ok(validState(s));assert.equal(s.ap,2);assert.equal(s.provinces.length,7);
 const before=s.treasury;
 assert.equal(enactEdict(s,'capital','levy').ok,true);
 assert.equal(s.treasury,before+18);assert.equal(s.ap,1);
 assert.equal(enactEdict(s,'missing','levy').ok,false);
 assert.equal(s.ap,1);
 assert.equal(enactLaw(s,'charter').ok,true);
 assert.equal(s.ap,0);assert.ok(s.laws.includes('charter'));
 assert.equal(enactLaw(s,'royal').ok,false);
 assert.equal(endTurn(s).ok,true);assert.equal(s.turn,2);assert.equal(s.ap,2);
});
test('technologies enforce prerequisites and change rules',()=>{
 const s=newGame('league',2345);
 assert.equal(research(s,'messengers').ok,false);
 assert.equal(research(s,'survey').ok,true);
 assert.equal(research(s,'survey').ok,false);
 assert.equal(s.ap,1);
 assert.equal(research(s,'messengers').ok,true);
 assert.equal(s.ap,0);
 const old=s.diplomacy.east;
 assert.equal(foreignAction(s,'east','envoy').ok,false);
 endTurn(s);
 assert.equal(foreignAction(s,'east','envoy').ok,true);
 assert.ok(s.diplomacy.east>old+10);
});
test('resource costs, public policy and local cap are respected',()=>{
 const s=newGame('abbey',781);
 s.grain=0;
 assert.equal(enactEdict(s,'valley','granary').ok,false);
 assert.equal(s.ap,2);
 s.provinces[0].fort=5;
 assert.equal(enactEdict(s,'march','watch').ok,false);
 assert.equal(s.ap,2);
 const before=s.treasury;
 assert.equal(enactEdict(s,'ford','fair').ok,true);
 assert.equal(s.treasury,before-14);
});
test('seeded seasons, petitions, and final campaign are deterministic',()=>{
 const a=newGame('crown',444),b=newGame('crown',444);
 for(let step=0;step<25;step++){
  if(a.phase==='finished')break;
  assert.equal(Boolean(a.petition),Boolean(b.petition));
  if(a.petition){assert.equal(choosePetition(a,0).ok,true);assert.equal(choosePetition(b,0).ok,true);}
  if(a.treasury<35){enactEdict(a,'capital','levy');enactEdict(b,'capital','levy');}
  endTurn(a);endTurn(b);
 }
 assert.deepEqual(a,b);
 assert.equal(a.phase,'finished');
 assert.ok(a.log.length>30);
 assert.ok(scoreState(a)>=0&&scoreState(a)<=100);
});
test('all three governments support a complete campaign',()=>{
 for(const government of ['crown','league','abbey']){
  const s=newGame(government,3333);
  for(let count=0;count<30&&s.phase==='play';count++){
   if(s.petition)choosePetition(s,count%2);
   if(s.treasury<35)enactEdict(s,'capital','levy');
   endTurn(s);
  }
  assert.equal(s.phase,'finished',government);
  assert.ok(s.summary.length>10);
 }
});
test('atlas UI starts, navigates, applies edict/research and resolves council petition',()=>{
 const source=readFileSync(new URL('../atlas-v2.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
 const engine=readFileSync(new URL('../core-v2.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const events={},storage=new Map();
 const root={html:'',set innerHTML(v){this.html=v},get innerHTML(){return this.html},
  addEventListener(type,handler){events[type]=handler},
  querySelector(selector){return selector==='.toast'?{textContent:'',classList:{add(){},remove(){}}}:{scrollTop:0}}};
 const document={getElementById(){return root},addEventListener(){}};
 const window={addEventListener(){},AudioContext:null,__AI_TEST_STATE__:null};
 const localStorage={getItem(key){return storage.get(key)||null},setItem(key,value){storage.set(key,value)},removeItem(key){storage.delete(key)}};
 const factory=new Function('document','window','localStorage','navigator','installMobileRuntime','setTimeout','clearTimeout','createWorkshopMode',engine+'\n'+source+'\nreturn {getState:()=>state,root};');
 const ui=factory(document,window,localStorage,{},()=>{},()=>1,()=>{},()=>({open(){}}));
 const click=dataset=>events.click({target:{closest:()=>({dataset,hasAttribute:key=>Object.hasOwn(dataset,key.replace('data-','').replace(/-([a-z])/g,(_,c)=>c))})}});
 assert.match(root.html,/Семь земель/);
 click({start:'league'});assert.equal(ui.getState().realm,'league');assert.equal(storage.size,1);
 click({region:'march'});assert.equal(window.__AI_TEST_STATE__.selected,'march');
 const before=ui.getState().treasury;
 click({edict:'levy'});assert.equal(ui.getState().treasury,before+18);
 click({tab:'council'});assert.match(root.html,/data-research="survey"/);
 click({research:'survey'});assert.ok(ui.getState().technologies.includes('survey'));
 click({next:''});assert.equal(ui.getState().turn,2);
 for(let j=0;j<3;j++){
  if(ui.getState().petition)click({petition:'0'});
  click({next:''});
 }
 assert.equal(ui.getState().turn,5);
 assert.equal(ui.getState().petition,null);
});
