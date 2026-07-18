import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS,ORDINARIES,MAINS,SECONDARIES,COMMANDS,MOTTOS,
  createCampaign,generateOffers,applyOffer,createBattleState,
  stepBattle,simulateBattle,botAudit,recordBattle,WORLD_WIDTH,WORLD_HEIGHT
} from '../engine.js';

const fullA={field:'gules',ordinary:'pale',main:'lion',secondary:'sun',command:'crown',motto:'breach',axis:'center'};
const fullB={field:'azure',ordinary:'chevron',main:'stag',secondary:'eagle',command:'helmet',motto:'banner',axis:'left'};

test('catalog remains bounded',()=>{
  assert.deepEqual([Object.keys(FIELDS).length,Object.keys(ORDINARIES).length,Object.keys(MAINS).length,Object.keys(SECONDARIES).length,Object.keys(COMMANDS).length,Object.keys(MOTTOS).length],[4,4,4,4,3,4]);
});

test('campaign progression is preserved',()=>{
  const c=createCampaign('argent','fess',42);c.battleIndex=1;
  const offers=generateOffers(c);assert.equal(offers.length,3);assert.ok(offers.every(o=>o.slot==='main'));
  const n=applyOffer(c,offers[0]);assert.equal(n.doctrine.main,offers[0].id);
  const r=recordBattle(n,{winner:'player'});assert.equal(r.battleIndex,2);
});

test('battle uses vertical battlefield and equal individual armies',()=>{
  const s=createBattleState(fullA,fullB,77);
  assert.equal(WORLD_WIDTH,720);assert.equal(WORLD_HEIGHT,1120);
  assert.ok(s.player.banner.y>s.enemy.banner.y);
  assert.equal(s.player.infantry.flatMap(q=>q.members).length,32);
  assert.equal(s.player.archers.flatMap(q=>q.members).length,16);
  const py=s.player.infantry.reduce((n,q)=>n+q.y,0)/4;
  const ey=s.enemy.infantry.reduce((n,q)=>n+q.y,0)/4;
  assert.ok(py>ey);
});

test('members receive unique soft slots and repack after a casualty',()=>{
  const s=createBattleState(fullA,fullB,19);
  for(let i=0;i<20;i++)stepBattle(s,.05);
  const squad=s.player.infantry[0];
  const before=new Set(squad.members.filter(m=>m.state!=='fallen').map(m=>`${m.slotX.toFixed(2)}:${m.slotY.toFixed(2)}`));
  assert.equal(before.size,8);
  squad.members[2].state='fallen';squad.members[2].hp=0;
  for(let i=0;i<20;i++)stepBattle(s,.05);
  const alive=squad.members.filter(m=>m.state!=='fallen');
  const after=new Set(alive.map(m=>m.slotIndex));
  assert.equal(after.size,alive.length);
});

test('battle reaches individual contact without unit teleportation',()=>{
  const s=createBattleState(fullA,fullB,123);
  for(let i=0;i<1600&&s.status==='running'&&!s.firstContact;i++)stepBattle(s,.05);
  assert.equal(s.firstContact,true);
  const all=[...s.player.infantry,...s.enemy.infantry].flatMap(q=>q.members).filter(m=>m.state!=='fallen');
  assert.ok(all.every(m=>m.x>=18&&m.x<=WORLD_WIDTH-18&&m.y>=28&&m.y<=WORLD_HEIGHT-28));
});

test('simulation is deterministic',()=>{
  assert.deepEqual(simulateBattle(fullA,fullB,555),simulateBattle(fullA,fullB,555));
});

test('battle terminates and keeps useful duration',()=>{
  const r=simulateBattle(fullA,fullB,91);
  assert.ok(['player','enemy'].includes(r.winner));
  assert.ok(r.duration<=105.1);
  assert.ok(r.playerRemaining>=0&&r.playerRemaining<=48);
});

test('mirrored audit avoids catastrophic side bias',()=>{
  const a=botAudit(30,1000);
  assert.equal(a.player+a.enemy,60);
  assert.ok(Math.abs(a.player-a.enemy)<=18,JSON.stringify(a));
  assert.ok(a.averageDuration<105,JSON.stringify(a));
});
