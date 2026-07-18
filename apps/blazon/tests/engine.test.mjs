import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS, ORDINARIES, MAINS, SECONDARIES, COMMANDS, MOTTOS,
  createCampaign, generateOffers, applyOffer, prepareBattle,
  createBattleState, stepBattle, simulateBattle, botAudit, recordBattle
} from '../engine.js';

test('doctrine catalog remains bounded',()=>{
  assert.equal(Object.keys(FIELDS).length,4);assert.equal(Object.keys(ORDINARIES).length,4);
  assert.equal(Object.keys(MAINS).length,4);assert.equal(Object.keys(SECONDARIES).length,4);
  assert.equal(Object.keys(COMMANDS).length,3);assert.equal(Object.keys(MOTTOS).length,4);
});
test('campaign reward flow remains compatible',()=>{
  const c=createCampaign('gules','pale',9);const loss=recordBattle(c,{winner:'enemy',duration:60,events:[],decisive:[]});
  assert.equal(loss.integrity,2);assert.equal(loss.battleIndex,1);assert.equal(loss.offers.length,3);
  const next=applyOffer(loss,loss.offers[0]);assert.equal(next.doctrine.main,loss.offers[0].id);
});
test('battle has squads made of individual warriors',()=>{
  const c=prepareBattle(createCampaign('azure','chevron',42));const s=createBattleState(c.doctrine,c.currentEnemy,c.currentSeed);
  assert.equal(s.player.infantry.length,4);assert.equal(s.player.archers.length,4);
  assert.equal(s.player.infantry.flatMap(q=>q.members).length,32);
  assert.equal(s.player.archers.flatMap(q=>q.members).length,16);
  assert.notEqual(s.player.infantry[0].members[0].x,s.player.infantry[0].members[1].x);
});
test('individual warriors move relative to their squad slots',()=>{
  const c=prepareBattle(createCampaign('argent','fess',55));const s=createBattleState(c.doctrine,c.currentEnemy,c.currentSeed);
  const squad=s.player.infantry[0],before=squad.members.map(m=>[m.x,m.y]);
  for(let i=0;i<40;i++)stepBattle(s,.05);
  assert.ok(squad.members.some((m,i)=>Math.hypot(m.x-before[i][0],m.y-before[i][1])>.5));
  assert.ok(squad.members.every(m=>Number.isFinite(m.slotX)&&Number.isFinite(m.slotY)));
});
test('casualties are individual rather than decrementing a squad token',()=>{
  const a={field:'gules',ordinary:'pale',main:'lion',secondary:'sun',command:'crown',motto:'breach',axis:'center'};
  const b={field:'azure',ordinary:'chevron',main:'stag',secondary:'eagle',command:'helmet',motto:'banner',axis:'left'};
  const s=createBattleState(a,b,321);
  for(let i=0;i<1600&&s.status==='running';i++)stepBattle(s,.05);
  const fallen=[...s.player.infantry,...s.player.archers,...s.enemy.infantry,...s.enemy.archers].flatMap(q=>q.members).filter(m=>m.state==='fallen');
  assert.ok(fallen.length>0);assert.ok(fallen.every(m=>m.fallenAt!==null));
});
test('battle terminates and summary counts warriors',()=>{
  const c=prepareBattle(createCampaign('gules','bend',77));const r=simulateBattle(c.doctrine,c.currentEnemy,c.currentSeed);
  assert.ok(['player','enemy'].includes(r.winner));assert.ok(r.duration<=101);
  assert.ok(r.playerRemaining>=0&&r.playerRemaining<=48);assert.ok(r.enemyRemaining>=0&&r.enemyRemaining<=48);
});
test('same seed remains deterministic',()=>{
  const a={field:'gules',ordinary:'pale',main:'lion',secondary:'sun',command:'crown',motto:'breach',axis:'center'};
  const b={field:'azure',ordinary:'chevron',main:'stag',secondary:'eagle',command:'helmet',motto:'banner',axis:'left'};
  assert.deepEqual(simulateBattle(a,b,123),simulateBattle(a,b,123));
});
test('mirrored bot audit has bounded side bias',()=>{
  const audit=botAudit(30,100);assert.equal(audit.player+audit.enemy,60);
  assert.ok(Math.abs(audit.player-audit.enemy)<=18);assert.ok(audit.averageDuration<100);
});
