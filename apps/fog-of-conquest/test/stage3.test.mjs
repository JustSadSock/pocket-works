import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const source=read('../server/module.ts'), pinned=read('../../../pocketnet/module-versions/fog-of-conquest/v9.ts');
const old=read('../../../pocketnet/module-versions/fog-of-conquest/v8.ts');
const lock=JSON.parse(read('../../../pocketnet/modules.lock.json'));
const rules=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const mod=rules.default;
const a={id:'seat-a',name:'Север'},b={id:'seat-b',name:'Юг'},c={id:'seat-c',name:'Новый'};
const make=()=>{
  let s=mod.createRoom({player:a}).state;
  s=mod.onJoin({state:s,player:b,players:[a,b]}).state;
  return s;
};
const start=(s=make(),requestId='begin-1')=>mod.onMessage({
  state:s,player:a,players:[a,b],
  payload:{type:'start',size:'small',requestId}
});
test('immutable v9 and earlier match rules remain pinned',()=>{
  assert.equal(source,pinned);
  assert.match(old,/RULESET_VERSION=7;/);
  assert.match(source,/RULESET_VERSION=8;/);
  assert.equal(lock['fog-of-conquest'].current,'v9');
  assert.deepEqual(lock['fog-of-conquest'].versions,['v1','v2','v3','v4','v5','v6','v7','v8','v9']);
});
test('exiting host in lobby transfers host and never strands remaining guest',()=>{
  let s=make();
  s=mod.onLeave({state:s,player:a,players:[b]}).state;
  assert.equal(s.phase,'lobby');assert.equal(s.host,b.id);
  assert.deepEqual(s.seats.map(p=>p.id),[b.id]);
  s=mod.onJoin({state:s,player:c,players:[b,c]}).state;
  assert.equal(s.host,b.id);
  assert.deepEqual(s.seats.map(p=>p.id),[b.id,c.id]);
  const p=mod.onMessage({state:s,player:b,players:[b,c],payload:{type:'start',requestId:'new-host'}});
  assert.equal(p.state.phase,'battle');
  assert.equal(p.state.game.state.currentPlayer,1);
  assert.equal(mod.viewForPlayer({state:p.state,player:b}).side,1);
  assert.equal(mod.viewForPlayer({state:p.state,player:c}).side,2);
});
test('disconnect is not a forfeit: ten same-token joins preserve authority and seat',()=>{
  let s=start().state;
  const before=s.game.revision,turn=s.game.state.currentPlayer;
  for(let n=0;n<10;n++){
    // The hub does not call onLeave when WebSocket disconnects. On rejoin
    // the existing authenticated seat is projected without mutating it.
    const view=mod.viewForPlayer({state:s,player:b});
    assert.equal(view.side,2);
    assert.equal(view.game.revision,before);
    assert.equal(view.game.state.currentPlayer,turn);
    assert.equal(view.game.state.gold[1],undefined);
    assert.equal(view.game.seed,undefined);
  }
  assert.equal(s.phase,'battle');
  assert.equal(s.game.winner,null);
});
test('accepted command has private ack, lost duplicate never applies twice',()=>{
  let s=start().state;
  const u=s.game.units.find(u=>u.owner===1&&u.type==='swordsman');
  const rev=s.game.revision;
  const cmd={type:'act',revision:rev,requestId:'once-222',action:{type:'move',unit:u.id,r:1,c:3}};
  const first=mod.onMessage({state:s,player:a,players:[a,b],payload:cmd});
  assert.equal(first.state.game.revision,rev+1);
  assert.equal(first.state.game.units.find(x=>x.id===u.id).c,3);
  assert.deepEqual(first.events.map(e=>e.type),['state','battle_event','ack']);
  assert.equal(first.events[1].to,a.id);
  assert.equal(first.events[1].payload.kind,'move');
  assert.equal(first.events[2].to,a.id);
  assert.equal(first.events[2].revision,rev+1);
  const serialized=JSON.stringify(first.state);
  const duplicate=mod.onMessage({state:first.state,player:a,players:[a,b],payload:cmd});
  assert.equal(JSON.stringify(duplicate.state),serialized);
  assert.equal(duplicate.events[0].to,a.id);
  assert.equal(duplicate.events[1].status,'duplicate');
  assert.equal(duplicate.events[1].to,a.id);
});
test('stale revisions, malformed IDs and wrong player cannot forge moves',()=>{
  let s=start().state;
  const rev=s.game.revision,u=s.game.units.find(x=>x.owner===1&&x.type==='swordsman');
  const mutation={type:'act',revision:rev,requestId:'secure-1',action:{type:'move',unit:u.id,r:1,c:3}};
  const wrong=mod.onMessage({state:s,player:b,players:[a,b],payload:mutation});
  assert.equal(wrong.state.game.revision,rev);
  const bad=mod.onMessage({state:s,player:a,players:[a,b],payload:{...mutation,requestId:' '.repeat(70)}});
  assert.equal(bad.state.game.revision,rev);
  const updated=mod.onMessage({state:s,player:a,players:[a,b],payload:mutation}).state;
  const stale=mod.onMessage({state:updated,player:a,players:[a,b],payload:{...mutation,requestId:'secure-2'}});
  assert.equal(stale.state.game.revision,rev+1);
  assert.equal(stale.events[0].to,a.id);
  assert.equal(stale.events[1].type,'state');
  assert.equal(stale.events[1].to,a.id);
  assert.ok(!stale.state.commandHistory.some(x=>x.requestId==='secure-2'));
});
test('64 most recent receipts are retained, no unbounded growth',()=>{
  let s=start().state;
  for(let i=0;i<145;i++){
    const current=s.game.state.currentPlayer;
    const who=current===1?a:b;
    const out=mod.onMessage({state:s,player:who,players:[a,b],
      payload:{type:'act',revision:s.game.revision,requestId:'turn-'+i,action:{type:'end'}}});
    assert.ok(!out.events.some(x=>x.type==='notice'),JSON.stringify(out.events));
    s=out.state;
    assert.ok(s.commandHistory.length<=64);
  }
  assert.equal(s.commandHistory.length,64);
  assert.equal(s.game.state.turn,145);
});
test('a voluntary departure ends battle once, survivor stays in room to see result',()=>{
 let s=start().state;
 s=mod.onLeave({state:s,player:b,players:[a]}).state;
 assert.equal(s.phase,'finished');assert.equal(s.game.winner,1);
 const view=mod.viewForPlayer({state:s,player:a});
 assert.equal(view.game.winner,1);assert.equal(view.game.phase,'finished');
 assert.equal(view.game.state.gold[2],undefined);
});
test('sync is private and never changes revision or shares unseen army',()=>{
 const s=start().state;
 const result=mod.onMessage({state:s,player:b,players:[a,b],payload:{type:'sync'}});
 assert.equal(result.state.revision,s.revision);
 assert.deepEqual(result.events.map(e=>[e.type,e.to]),[['state',b.id]]);
 const view=mod.viewForPlayer({state:result.state,player:b});
 assert.equal(view.game.units.some(x=>x.owner===1),false);
});
