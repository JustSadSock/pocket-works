import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile, createRun, createBattle, playCard, sacrificeUnit, endTurn,
  resolveNode, chooseCardReward, chooseRelic, hearthUpgrade, altarSelect,
  afterBattleVictory, cardById, cloneCard, rollCardChoices, rollRelicChoices
} from '../game-core.js';

test('run generation is structurally deterministic and ends in boss',()=>{
  const a=createRun(12345,createProfile());
  const b=createRun(12345,createProfile());
  assert.equal(a.maxDepth,9);
  assert.equal(a.trail.length,9);
  assert.deepEqual(a.trail.map(s=>s.map(n=>[n.type,n.elite])),b.trail.map(s=>s.map(n=>[n.type,n.elite])));
  assert.equal(a.trail[8][0].type,'boss');
  assert.ok(a.deck.length>=10);
});

test('creature can be played, sacrificed and pass a sigil as heritage',()=>{
  const run=createRun(42,createProfile());
  run.deck=[cloneCard('wolf'),cloneCard('hare'),cloneCard('crow'),cloneCard('salt')];
  const battle=createBattle(run,false,false);
  run.battle=battle;
  const wolf=battle.hand.find(c=>c.id==='wolf');
  assert.ok(wolf,'wolf should be in opening hand with four-card deck');
  battle.ember=9;
  assert.equal(playCard(run,battle,wolf.instanceId,0).ok,true);
  const s=sacrificeUnit(run,battle,0,'pack');
  assert.equal(s.ok,true);
  assert.equal(battle.heritage,'pack');
  assert.ok(battle.remains>=1);
  const hare=battle.hand.find(c=>c.id==='hare');
  assert.ok(hare);
  assert.equal(playCard(run,battle,hare.instanceId,1).ok,true);
  assert.ok(battle.player[1].sigils.includes('pack'));
  assert.equal(battle.heritage,null);
});

test('battle turn advances, spawns intent and preserves resources',()=>{
  const run=createRun(7,createProfile());
  const battle=createBattle(run,false,false);run.battle=battle;
  const beforeRound=battle.round;
  const beforeIntent=battle.intent.length;
  assert.ok(beforeIntent>=1);
  const r=endTurn(run,battle);
  assert.equal(r.ok,true);
  if(!battle.ended){
    assert.equal(battle.round,beforeRound+1);
    assert.ok(battle.enemy.some(Boolean),'telegraphed enemy should enter the board');
    assert.ok(battle.intent.length>=1,'next enemy intent should be shown');
    assert.equal(battle.ember,battle.maxEmber);
  }
});

test('cache choice adds a card and advances exactly one depth',()=>{
  const run=createRun(10,createProfile());
  const node={id:'manual-cache',type:'cache'};
  assert.equal(resolveNode(run,node).ok,true);
  assert.equal(run.pending.type,'card-choice');
  const before=run.deck.length;
  const choice=run.pending.choices[0];
  assert.equal(chooseCardReward(run,choice.instanceId).ok,true);
  assert.equal(run.deck.length,before+1);
  assert.equal(run.depth,1);
  assert.equal(run.pending,null);
});

test('relic, hearth and altar permanently mutate the run',()=>{
  const run=createRun(18,createProfile());
  resolveNode(run,{id:'omen',type:'omen'});
  const relic=run.pending.choices[0];
  assert.equal(chooseRelic(run,relic.id).ok,true);
  assert.ok(run.relics.includes(relic.id));

  run.pending=null;
  resolveNode(run,{id:'fire',type:'hearth'});
  const creature=run.deck.find(c=>c.type==='creature');
  const atk=creature.atk;
  assert.equal(hearthUpgrade(run,creature.instanceId,'fang').ok,true);
  assert.equal(creature.atk,atk+1);

  run.pending=null;
  resolveNode(run,{id:'altar',type:'altar'});
  const donor=run.deck.find(c=>c.type==='creature'&&c.sigils.length);
  const receiver=run.deck.find(c=>c.type==='creature'&&c.instanceId!==donor.instanceId);
  const sig=donor.sigils[0];
  assert.equal(altarSelect(run,donor.instanceId).stage,'receiver');
  const res=altarSelect(run,receiver.instanceId);
  assert.equal(res.ok,true);
  assert.ok(!run.deck.some(c=>c.instanceId===donor.instanceId));
  assert.ok(receiver.sigils.includes(sig));
});

test('battle victory opens reward while boss victory ends run',()=>{
  const run=createRun(99,createProfile());
  run.battle=createBattle(run,false,false);run.battle.ended=true;run.battle.winner='player';
  assert.equal(afterBattleVictory(run).ok,true);
  assert.equal(run.pending.type,'card-choice');

  const bossRun=createRun(100,createProfile());
  bossRun.depth=8;bossRun.battle=createBattle(bossRun,true,true);bossRun.battle.ended=true;bossRun.battle.winner='player';
  const r=afterBattleVictory(bossRun);
  assert.equal(r.won,true);
  assert.equal(bossRun.result,'won');
  assert.equal(bossRun.pending.type,'run-win');
});

test('reward rolls are valid and unique within each choice set',()=>{
  const run=createRun(777,createProfile());
  const cards=rollCardChoices(run,3,'x');
  assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  cards.forEach(c=>assert.ok(cardById(c.id)));
  const relics=rollRelicChoices(run,3);
  assert.equal(new Set(relics.map(r=>r.id)).size,relics.length);
});
