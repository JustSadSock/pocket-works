import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBattleState,stepBattle,simulateBattle} from '../spatial-core-engine.js';

const player={field:'gules',ordinary:'pale',main:'lion',secondary:'sun',command:'helmet',motto:'breach',axis:'center'};
const enemy={field:'argent',ordinary:'fess',main:'tower',secondary:'rose',command:'crown',motto:'together',axis:'right'};

test('spatial core indexes every fighter and advances without broad lookup state',()=>{
  const state=createBattleState(player,enemy,1337,{captureReplay:false});
  assert.ok(state.__spatial);
  assert.equal(state.__spatial.membersById.size,96);
  assert.equal(state.__spatial.squadsById.size,16);
  const before=state.__spatial.rebuilds;
  for(let index=0;index<40;index++)stepBattle(state,.05);
  assert.ok(state.time>=2);
  assert.ok(state.__spatial.rebuilds>before);
  assert.ok(state.__spatial.grids.player.all.used.length>0);
  assert.ok(state.__spatial.grids.enemy.all.used.length>0);
});

test('spatial simulation stays deterministic for a fixed seed',()=>{
  const first=simulateBattle(player,enemy,424242,110);
  const second=simulateBattle(player,enemy,424242,110);
  assert.deepEqual(
    {winner:first.winner,duration:first.duration,player:first.playerRemaining,enemy:first.enemyRemaining,reason:first.finishReason},
    {winner:second.winner,duration:second.duration,player:second.playerRemaining,enemy:second.enemyRemaining,reason:second.finishReason}
  );
});

test('renderer contains field, heraldry and adaptive effect caches',async()=>{
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  for(const token of ['buildFieldLayer','emblemCache','liveryCache','updateRenderBudget','arrowStride','blazonFx'])assert.ok(source.includes(token),`missing ${token}`);
  assert.ok(source.includes('lastHudPaint'));
  assert.ok(source.includes('fieldLayer=buildFieldLayer()'));
});
