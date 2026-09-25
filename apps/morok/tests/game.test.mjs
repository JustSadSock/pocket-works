import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE_LIMIT, createProfile, createRun, createBattle, playCard, sacrificeUnit, endTurn,
  resolveNode, chooseCardReward, chooseRelic, chooseItem, hearthUpgrade, altarSelect,
  afterBattleVictory, cardById, cloneCard, rollCardChoices, rollRelicChoices, useItem, hydrateRun
} from '../game-core.js';

test('run is deterministic and contains three rule-changing bosses',()=>{
  const a=createRun(12345,createProfile()),b=createRun(12345,createProfile());
  assert.equal(a.maxDepth,9);assert.equal(a.trail.length,9);
  assert.deepEqual(a.trail.map(s=>s.map(n=>[n.type,n.elite,n.bossId||null])),b.trail.map(s=>s.map(n=>[n.type,n.elite,n.bossId||null])));
  assert.deepEqual(a.trail.filter(s=>s[0]?.type==='boss').map(s=>s[0].bossId),['warden','bellkeeper','prior']);
  assert.equal(a.items.length,2);
});

test('direct damage moves the physical balance and wins at six',()=>{
  const run=createRun(7,createProfile()),battle=createBattle(run);run.battle=battle;
  battle.balance=BALANCE_LIMIT-2;battle.enemy.fill(null);battle.intent=[];
  battle.hand=[cloneCard('wolf')];battle.ember=9;
  const wolf=battle.hand[0];assert.equal(playCard(run,battle,wolf.instanceId,0).ok,true);
  const r=endTurn(run,battle);
  assert.equal(r.ended,true);assert.equal(r.winner,'player');assert.ok(battle.balance>=BALANCE_LIMIT);
});

test('sacrifice passes heritage and black thread can pass it twice',()=>{
  const run=createRun(42,createProfile());run.items=['thread'];const battle=createBattle(run);run.battle=battle;
  assert.equal(useItem(run,battle,'thread').ok,true);
  battle.hand=[cloneCard('wolf'),cloneCard('hare'),cloneCard('hare')];battle.ember=9;
  const wolf=battle.hand.find(c=>c.id==='wolf');assert.equal(playCard(run,battle,wolf.instanceId,0).ok,true);
  assert.equal(sacrificeUnit(run,battle,0,'pack').ok,true);
  const hares=battle.hand.filter(c=>c.id==='hare');assert.equal(playCard(run,battle,hares[0].instanceId,0).ok,true);assert.equal(playCard(run,battle,hares[1].instanceId,1).ok,true);
  assert.ok(battle.player[0].sigils.includes('pack'));assert.ok(battle.player[1].sigils.includes('pack'));assert.equal(battle.heritage,null);
});

test('warden locks a lane and prior changes phase instead of instantly losing',()=>{
  const run=createRun(11,createProfile()),warden=createBattle(run,'warden');run.battle=warden;
  warden.round=2;warden.intent=[];warden.enemy.fill(null);warden.player.fill(null);endTurn(run,warden);
  assert.equal(warden.round,3);assert.notEqual(warden.lockedLane,null);

  const prior=createBattle(run,'prior');prior.balance=BALANCE_LIMIT;
  const p=endTurn(run,prior);assert.equal(p.phase,true);assert.equal(prior.phase,2);assert.equal(prior.ended,false);assert.equal(prior.balance,0);
});

test('cabinet gives a consumable item and using it removes it',()=>{
  const run=createRun(19,createProfile());run.items=[];
  resolveNode(run,{id:'cabinet',type:'item'});assert.equal(run.pending.type,'item-choice');
  const item=run.pending.choices[0];assert.equal(chooseItem(run,item.id).ok,true);assert.ok(run.items.includes(item.id));
  run.battle=createBattle(run);const before=run.items.length;
  const usable=run.items.find(id=>id!=='knife')||'bell';
  if(!run.items.includes(usable))run.items.push(usable);
  const r=useItem(run,run.battle,usable);assert.equal(r.ok,true);assert.equal(run.items.length,before-(usable===item.id?1:0));
});

test('second hearth scar mutates a creature with a new sigil',()=>{
  const run=createRun(18,createProfile()),card=run.deck.find(c=>c.type==='creature'),baseSigils=card.sigils.length;
  run.pending={type:'hearth'};assert.equal(hearthUpgrade(run,card.instanceId,'fang').ok,true);
  run.pending={type:'hearth'};assert.equal(hearthUpgrade(run,card.instanceId,'hide').ok,true);
  assert.equal(card.upgrades,2);assert.equal(card.mutationLevel,1);assert.ok(card.sigils.length>baseSigils);assert.match(card.name,/Мутировавший/);
});

test('altar permanently transfers a sigil and removes donor',()=>{
  const run=createRun(22,createProfile());run.deck=[cloneCard('wolf'),cloneCard('boar')];run.pending={type:'altar',donor:null};
  const donor=run.deck[0],receiver=run.deck[1];assert.equal(altarSelect(run,donor.instanceId).stage,'receiver');
  assert.equal(altarSelect(run,receiver.instanceId).ok,true);assert.equal(run.deck.length,1);assert.ok(run.deck[0].sigils.includes('pack'));
});

test('boss trophy advances exactly one depth and final prior ends run',()=>{
  const run=createRun(55,createProfile());run.depth=2;run.battle=createBattle(run,'warden');run.battle.ended=true;run.battle.winner='player';
  const a=afterBattleVictory(run);assert.equal(a.boss,true);assert.equal(run.depth,2);assert.equal(run.pending.type,'relic-choice');
  const relic=run.pending.choices[0];assert.equal(chooseRelic(run,relic.id).ok,true);assert.equal(run.depth,3);

  const finalRun=createRun(56,createProfile());finalRun.depth=8;finalRun.battle=createBattle(finalRun,'prior');finalRun.battle.ended=true;finalRun.battle.winner='player';
  const b=afterBattleVictory(finalRun);assert.equal(b.won,true);assert.equal(finalRun.result,'won');assert.equal(finalRun.pending.type,'run-win');
});

test('ordinary card reward advances one depth and choices are unique',()=>{
  const run=createRun(77,createProfile());resolveNode(run,{id:'cache',type:'cache'});const before=run.deck.length,depth=run.depth;
  const ids=run.pending.choices.map(c=>c.id);assert.equal(new Set(ids).size,ids.length);assert.equal(chooseCardReward(run,run.pending.choices[0].instanceId).ok,true);
  assert.equal(run.deck.length,before+1);assert.equal(run.depth,depth+1);
  const cards=rollCardChoices(run,3,'test');cards.forEach(c=>assert.ok(cardById(c.id)));assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  const relics=rollRelicChoices(run,3);assert.equal(new Set(relics.map(r=>r.id)).size,relics.length);
});

test('v1 saves migrate into v2 without keeping stale battle state',()=>{
  const old=createRun(88,createProfile());old.version=1;delete old.items;old.battle={stale:true};old.pending={type:'battle'};
  const migrated=hydrateRun(JSON.stringify(old));assert.equal(migrated.version,2);assert.ok(Array.isArray(migrated.items));assert.equal(migrated.battle,null);assert.equal(migrated.pending,null);assert.deepEqual(migrated.secrets,{});
});
