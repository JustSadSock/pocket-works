import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS,ORDINARIES,MAINS,SECONDARIES,COMMANDS,MOTTOS,
  createCampaign,generateOffers,applyOffer,prepareBattle,createBattleState,
  stepBattle,simulateBattle,summarizeBattle,botAudit,recordBattle,WORLD_WIDTH,WORLD_HEIGHT
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

test('archers release coordinated volleys instead of isolated cooldown shots',()=>{
  const a={field:'gules',ordinary:'fess',main:'lion',secondary:'sun',command:'crown',motto:'volley',axis:'center'};
  const b={field:'argent',ordinary:'chevron',main:'tower',secondary:'rose',command:'helmet',motto:'banner',axis:'center'};
  const s=createBattleState(a,b,808);
  for(let i=0;i<900&&s.status==='running';i++)stepBattle(s,.05);
  const volleys=s.events.filter(e=>e.rule==='volley'&&e.side==='player');
  assert.ok(volleys.length>0);
  assert.ok(s.metrics.player.volleys>0);
  assert.ok(s.arrows.some(a=>a.volleyId)||s.metrics.player.arrowHits>0);
});

test('battle captures replay snapshots and key moments for result reading',()=>{
  const a={field:'azure',ordinary:'bend',main:'boar',secondary:'eagle',command:'helmet',motto:'breach',axis:'left'};
  const b={field:'sable',ordinary:'pale',main:'tower',secondary:'sun',command:'chain',motto:'together',axis:'center'};
  const s=createBattleState(a,b,909);
  for(let i=0;i<2200&&s.status==='running';i++)stepBattle(s,.05);
  const summary=summarizeBattle(s);
  assert.ok(summary.replay.length>10);
  assert.ok(summary.moments.length>=2);
  assert.ok(summary.analysis.length>=2);
  assert.ok(summary.analysis.every(item=>item.title&&item.summary));
});

test('campaign persistence strips heavy replay frames',()=>{
  const c=createCampaign('gules','pale',12);
  const next=recordBattle(c,{winner:'player',duration:42,replay:[{time:1,units:[1,2,3]}],analysis:[],moments:[],events:[],decisive:[]});
  assert.equal(next.lastResult.replay,undefined);
});
