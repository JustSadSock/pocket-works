import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../server/module.ts');
const pinned=read('../../../pocketnet/module-versions/fog-of-conquest/v9.ts');
const prior=read('../../../pocketnet/module-versions/fog-of-conquest/v8.ts');
const rules=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const a={id:'a',name:'Alpha'},b={id:'b',name:'Beta'};
function match(size='medium',seed=222){
 let room=rules.default.createRoom({player:a}).state;
 room=rules.default.onJoin({state:room,player:b,players:[a,b]}).state;
 room=rules.default.onMessage({state:room,player:a,players:[a,b],
   payload:{type:'start',size,seed,requestId:'start'}}).state;
 return room;
}
function act(room,actor,action,id){
 return rules.default.onMessage({state:room,player:actor,players:[a,b],
   payload:{type:'act',revision:room.game.revision,requestId:id,action}});
}
test('v8 is immutable and does not modify historical rooms',()=>{
 assert.equal(source,pinned);
 assert.match(prior,/RULESET_VERSION=8;/);
 assert.match(source,/RULESET_VERSION=8;/);
 const lock=JSON.parse(read('../../../pocketnet/modules.lock.json'));
 assert.equal(lock['fog-of-conquest'].current,'v9');
 assert.deepEqual(lock['fog-of-conquest'].versions,['v1','v2','v3','v4','v5','v6','v7','v8','v9']);
});
test('battle journal does not expose hidden enemy movement or ownership',()=>{
 let state=match();
 const m=rules.default;
 const next=act(state,a,{type:'end'},'turn-a');
 assert.equal(next.state.game.battleHistory[1].length,1);
 assert.equal(next.state.game.battleHistory[2].length,1);
 state=next.state;
 const u=state.game.units.find(x=>x.owner===2&&x.type==='swordsman');
 const moves=[[0,-1],[-1,0],[1,0],[0,1]];
 let changed=null;
 for(const [dr,dc] of moves){
  const target={r:u.r+dr,c:u.c+dc};
  if(state.game.state.fog[1]?.[target.r]?.[target.c]===false)continue;
  const result=act(state,b,{type:'move',unit:u.id,...target},'southern-move');
  if(!result.events.some(e=>e.type==='notice')){changed=result;break;}
 }
 assert.ok(changed,'south side has a legal concealed move');
 assert.ok(changed.events.some(e=>e.type==='battle_event'&&e.to===b.id));
 assert.equal(changed.events.some(e=>e.type==='battle_event'&&e.to===a.id),false);
 const va=m.viewForPlayer({state:changed.state,player:a});
 const vb=m.viewForPlayer({state:changed.state,player:b});
 assert.equal(va.game.battleHistory[1].length,1);
 assert.equal(va.game.battleHistory[2],undefined);
 assert.equal(vb.game.battleHistory[2].length,2);
 assert.equal(vb.game.battleHistory[1],undefined);
 assert.equal(va.game.units.some(x=>x.owner===2),false);
 assert.equal(JSON.stringify(va).includes('"southern-move"'),false);
 assert.ok(!JSON.stringify(va).includes('"battleHistory":{"2"'));
});
test('visible own move yields bounded replayable single-step observation',()=>{
 let s=match('small',12);
 const u=s.game.units.find(x=>x.owner===1&&x.type==='swordsman');
 const r=act(s,a,{type:'move',unit:u.id,r:1,c:3},'move-1');
 assert.ok(!r.events.some(e=>e.type==='notice'));
 const packet=r.events.find(e=>e.type==='battle_event'&&e.to===a.id);
 assert.equal(packet.payload.kind,'move');
 assert.deepEqual(packet.payload.from,{r:1,c:2});
 assert.deepEqual(packet.payload.at,{r:1,c:3});
 assert.ok(!('hp' in packet.payload));
 assert.equal(r.state.game.battleHistory[1][0].revision,r.state.game.revision);
 const duplicate=rules.default.onMessage({state:r.state,player:a,players:[a,b],
  payload:{type:'act',requestId:'move-1',revision:s.game.revision,
    action:{type:'move',unit:u.id,r:1,c:3}}});
 assert.equal(duplicate.state.game.battleHistory[1].length,1);
 assert.equal(duplicate.events.some(e=>e.type==='battle_event'),false);
});
test('a private journal never grows beyond 96 events and sync is read-only',()=>{
 let s=match('small',9);
 for(let i=0;i<210;i++){
  const player=s.game.state.currentPlayer===1?a:b;
  const result=act(s,player,{type:'end'},'end-'+i);
  assert.ok(!result.events.some(e=>e.type==='notice'));
  s=result.state;
 }
 assert.equal(s.game.battleHistory[1].length,96);
 assert.equal(s.game.battleHistory[2].length,96);
 const projection=rules.default.viewForPlayer({state:s,player:a});
 assert.equal(projection.game.battleHistory[1][95].kind,'end');
 assert.equal(projection.game.battleHistory[1][95].turn,s.game.state.turn);
 assert.ok(projection.game.battleHistory[1][0].seq<projection.game.battleHistory[1][95].seq);
 const sync=rules.default.onMessage({state:s,player:a,players:[a,b],payload:{type:'sync'}});
 assert.equal(sync.state.revision,s.revision);
 assert.equal(sync.events[0].to,a.id);
});
test('finished matches keep only the own-side replay',()=>{
 let s=match();
 s=rules.default.onMessage({state:s,player:b,players:[a,b],payload:{type:'resign',requestId:'resign'}}).state;
 assert.equal(s.phase,'finished');
 const sideA=rules.default.viewForPlayer({state:s,player:a});
 const sideB=rules.default.viewForPlayer({state:s,player:b});
 assert.deepEqual(Object.keys(sideA.game.battleHistory),['1']);
 assert.deepEqual(Object.keys(sideB.game.battleHistory),['2']);
});
