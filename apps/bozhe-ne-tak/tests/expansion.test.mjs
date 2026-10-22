import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEMS,TREATMENTS,RITES,DOCTRINES,VOWS,PATRONS,INCIDENTS} from '../content.js';
import {ITEMS as INVENTORY,TREATMENTS as METHODS,RITES as SIGNS,DOCTRINES as LAWS,
 createGame,setAction,getRite,getIncident,evaluateRite,getBestPossible,commitRite,
 continueFromJudgment,chooseDoctrine,loadGame} from '../engine.js';
import {offeringArt,godArt,treatmentArt,incidentArt} from '../art.js';

const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const immutable=await readFile(new URL('../../../pocketnet/module-versions/bozhe-ne-tak/v3.ts',import.meta.url),'utf8');
const internal=source.replace('export const MIN_PLAYERS','const MIN_PLAYERS').replace('export default game;',
 'return {game,RULESET_VERSION,ITEMS,TREATMENTS,RITES,DOCTRINES,INCIDENTS,VOWS,PATRONS,createGame,getRite,getIncident,evaluateRite};');
const server=Function(internal)();

test('v3 source and immutable module are identical and have a playable expanded catalogue',()=>{
 assert.equal(source,immutable);
 assert.equal(server.RULESET_VERSION,3);
 assert.equal(INVENTORY.length,28);
 assert.equal(METHODS.length,5);
 assert.equal(SIGNS.length,26);
 assert.equal(LAWS.length,26);
 assert.equal(INCIDENTS.length,16);
 assert.equal(VOWS.length,3);
 assert.equal(PATRONS.length,3);
 assert.equal(new Set(INVENTORY.map(x=>x.id)).size,INVENTORY.length);
 assert.equal(new Set(SIGNS.map(x=>x.id)).size,SIGNS.length);
 assert.equal(new Set(LAWS.map(x=>x.id)).size,LAWS.length);
});
test('all offerings and events have original SVG artwork',()=>{
 for(const item of INVENTORY)assert.match(offeringArt(item.id),/<svg[\s\S]+<\/svg>/);
 for(const method of METHODS)assert.match(treatmentArt(method.id),/<svg[\s\S]+<\/svg>/);
 for(const event of INCIDENTS)assert.match(incidentArt(event.id),/<svg[\s\S]+<\/svg>/);
 for(const deity of PATRONS)assert.match(godArt(deity.id),/<svg[\s\S]+<\/svg>/);
 assert.notEqual(godArt('krak'),godArt('sivilla'));
});
test('a seeded match has distinct incidents and divine identity after reload',()=>{
 for(let seed=1;seed<=300;seed++){
  const game=createGame(seed);
  const ids=new Set();
  for(let i=0;i<5;i++)ids.add(getIncident({...game,round:i}).id);
  assert.equal(ids.size,5,'incident repetition at seed '+seed);
  assert.equal(loadGame(JSON.parse(JSON.stringify(game)))?.patronId,game.patronId);
 }
});
test('three risk vows change faith, not score, in predictable directions',()=>{
 const rite=SIGNS.find(x=>x.id==='white');
 const action={itemId:'egg',treatment:'wash',bell:2,height:'low'};
 const blessed=VOWS.map(v=>evaluateRite(rite,{...action,vow:v.id}).faithDelta);
 assert.deepEqual(blessed,[2,3,1]);
 const bad={itemId:'book',treatment:'smoke',bell:3,height:'high'};
 assert.deepEqual(VOWS.map(v=>evaluateRite(rite,{...bad,vow:v.id}).faithDelta),[-2,-3,-1]);
});
test('patrons are three actual score rules',()=>{
 const rite=SIGNS.find(x=>x.id==='white'),action={itemId:'goose',treatment:'wash',bell:2,height:'low'};
 const ogo=evaluateRite(rite,action,[],null,'ogo'),krak=evaluateRite(rite,action,[],null,'krak');
 assert.equal(ogo.score,krak.score+1);
 const book={...action,itemId:'scroll'};
 assert.equal(evaluateRite(rite,book,[],null,'sivilla').score,
   evaluateRite(rite,book,[],null,'krak').score+1);
});
test('contradictory church law never makes a five-round ceremony impossible',()=>{
 for(let seed=1;seed<=300;seed++){
  let match=createGame(seed);
  for(let round=0;round<5;round++){
   match={...match,round,doctrines:LAWS.slice(seed%24,seed%24+3).map(d=>d.id)};
   assert.ok(getBestPossible(match)>=4,seed+' round '+round);
  }
 }
});
test('server and browser evaluate each incident and vow identically',()=>{
 for(let seed=1;seed<=270;seed++){
  const match=createGame(seed),rite=getRite(match),event=getIncident(match);
  const item=INVENTORY[(seed*7)%INVENTORY.length];
  const action={itemId:item.id,treatment:METHODS[seed%METHODS.length].id,
   bell:1+seed%3,height:seed%2?'high':'low',vow:VOWS[seed%VOWS.length].id};
  const laws=LAWS.slice(seed%24,seed%24+3).map(x=>x.id);
  const local=evaluateRite(rite,action,laws,event,match.patronId);
  const remote=server.evaluateRite(server.getRite(match),action,laws,server.getIncident(match),match.patronId);
  assert.deepEqual(local,remote,'divergent seed '+seed);
 }
});
test('every player sees a public event and patron but no private seeds',()=>{
 const a={id:'p1',name:'One'},b={id:'p2',name:'Two'};
 let state=server.game.createRoom({player:a}).state;
 state=server.game.onJoin({state,players:[a,b]}).state;
 state=server.game.onMessage({state,player:a,payload:{type:'start'}}).state;
 for(const player of [a,b]){
  const view=server.game.viewForPlayer({state,player});
  assert.ok(INCIDENTS.some(x=>x.id===view.match.incident.id));
  assert.ok(PATRONS.some(x=>x.id===view.match.patronId));
  assert.equal(JSON.stringify(view).includes('"seed"'),false);
  assert.equal(JSON.stringify(view).includes('"order"'),false);
 }
});
