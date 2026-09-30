import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEAL_LIMIT, createProfile, createRun as createFreshRun, createBattle, playCard, sacrificeUnit, endTurn,
  resolveNode, chooseCardReward, chooseRelic, chooseItem, hearthUpgrade, altarSelect,
  afterBattleVictory, cardById, cloneCard, rollCardChoices, rollRelicChoices, useItem, hydrateRun
} from '../game-core.js';

function createRun(...args){const run=createFreshRun(...args);run.pending=null;return run}

test('run is deterministic and contains three rule-changing bosses',()=>{
  const a=createRun(12345,createProfile()),b=createRun(12345,createProfile());
  assert.equal(a.maxDepth,9);assert.equal(a.trail.length,9);
  assert.deepEqual(a.trail.map(s=>s.map(n=>[n.type,n.elite,n.bossId||null])),b.trail.map(s=>s.map(n=>[n.type,n.elite,n.bossId||null])));
  assert.deepEqual(a.trail.filter(s=>s[0]?.type==='boss').map(s=>s[0].bossId),['warden','bellkeeper','prior']);
  assert.equal(a.items.length,2);
});

test('direct damage breaks independent enemy seals and wins at six',()=>{
  const run=createRun(7,createProfile()),battle=createBattle(run);run.battle=battle;
  battle.seals.player=SEAL_LIMIT-2;battle.seals.enemy=4;battle.enemy.fill(null);battle.intent=[];
  battle.hand=[cloneCard('wolf')];battle.ember=9;
  const wolf=battle.hand[0];assert.equal(playCard(run,battle,wolf.instanceId,0).ok,true);
  const r=endTurn(run,battle);
  assert.equal(r.ended,true);assert.equal(r.winner,'player');assert.equal(battle.seals.player,SEAL_LIMIT);assert.equal(battle.seals.enemy,4);
  assert.ok(r.events.some(e=>e.type==='attack'&&e.direct));
  assert.ok(r.events.some(e=>e.type==='seal'&&e.side==='player'&&e.amount===2));
  assert.equal(r.events.at(-1).type,'battle-end');
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

  const prior=createBattle(run,'prior');prior.seals.player=SEAL_LIMIT;
  const p=endTurn(run,prior);assert.equal(p.phase,true);assert.equal(prior.phase,2);assert.equal(prior.ended,false);assert.deepEqual(prior.seals,{player:0,enemy:0});
  assert.ok(p.events.some(e=>e.type==='phase'));
});

test('combat timeline reports attack damage death and next round in order',()=>{
  const run=createRun(91,createProfile()),battle=createBattle(run);run.battle=battle;battle.intent=[];battle.enemy.fill(null);
  battle.hand=[cloneCard('wolf')];battle.ember=9;const wolf=battle.hand[0];playCard(run,battle,wolf.instanceId,0);
  battle.enemy[0]={...cloneCard('hare'),side:'enemy',instanceId:'timeline-target',atk:0,hp:1,maxHp:1,sigils:[]};
  const r=endTurn(run,battle),types=r.events.map(e=>e.type);
  const attack=types.indexOf('attack'),damage=types.indexOf('damage'),death=types.indexOf('death'),round=types.lastIndexOf('round');
  assert.ok(attack>=0&&damage>attack&&death>damage&&round>death);
  assert.equal(r.events[damage].amount,2);
});

test('thorn damage is emitted against the attacker before its death if lethal',()=>{
  const run=createRun(92,createProfile()),battle=createBattle(run);run.battle=battle;battle.intent=[];battle.enemy.fill(null);
  battle.hand=[cloneCard('hare',{atk:1,hp:1,sigils:[]})];battle.ember=9;playCard(run,battle,battle.hand[0].instanceId,0);
  battle.enemy[0]={...cloneCard('boar'),side:'enemy',instanceId:'thorn-target',atk:0,hp:4,maxHp:4,sigils:['thorn']};
  const r=endTurn(run,battle);
  const thornIndex=r.events.findIndex(e=>e.type==='damage'&&e.source==='thorn'&&e.side==='player');
  const deathIndex=r.events.findIndex(e=>e.type==='death'&&e.side==='player');
  assert.ok(thornIndex>=0&&deathIndex>thornIndex);
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

test('active v2 balance saves migrate to independent seals',()=>{
  const run=createRun(93,createProfile());run.battle=createBattle(run);delete run.battle.seals;run.battle.balance=-3;run.battle.balanceLimit=6;
  const migrated=hydrateRun(JSON.stringify(run));assert.deepEqual(migrated.battle.seals,{player:0,enemy:3});assert.equal('balance' in migrated.battle,false);
});

test('new runs start with a reward and preparation rooms lead into battle without advancing depth',()=>{
  const r=createFreshRun(101);assert.equal(r.pending.opening,true);chooseCardReward(r,r.pending.choices[0].instanceId);assert.equal(r.depth,0);assert.equal(r.pending,null);
  const room=r.trail[0].find(n=>n.type==='cache');assert.ok(room);resolveNode(r,room);chooseCardReward(r,r.pending.choices[0].instanceId);assert.equal(r.depth,0);assert.equal(r.pending.type,'battle');assert.ok(r.battle);
});
test('rituals, sacrifices and items return independent timelines and ended battles reject changes',()=>{
  const r=createRun(102),b=createBattle(r);r.battle=b;b.hand=[cloneCard('moth'),cloneCard('salt')];b.ember=9;
  const spawn=playCard(r,b,b.hand[0].instanceId,0);assert.equal(spawn.events[0].type,'spawn');
  const sacrifice=sacrificeUnit(r,b,0);assert.deepEqual(sacrifice.events.map(e=>e.type),['death','spawn']);
  r.items=['teeth'];const item=useItem(r,b,'teeth');assert.deepEqual(item.events.map(e=>e.type),['seal']);assert.deepEqual(sacrifice.events.map(e=>e.type),['death','spawn']);
  b.ended=true;assert.equal(useItem(r,b,'teeth').ok,false);assert.equal(sacrificeUnit(r,b,0).ok,false);assert.equal(playCard(r,b,b.hand[0].instanceId,0).ok,false);
});
test('zero attack neither consumes a ward nor triggers thorn retaliation',()=>{
  const r=createRun(103),b=createBattle(r);r.battle=b;b.intent=[];b.hand=[cloneCard('hare',{sigils:[]})];playCard(r,b,b.hand[0].instanceId,0);
  b.enemy[0]={...cloneCard('boar'),atk:0,hp:4,maxHp:4,sigils:['ward','thorn'],wardUsed:false};endTurn(r,b);assert.equal(b.player[0].hp,1);assert.equal(b.enemy[0].wardUsed,false);
});
test('prior phase transition immediately reduces resources and advances the turn',()=>{
  const r=createRun(104),b=createBattle(r,'prior');r.battle=b;b.seals.player=6;b.ember=9;b.sacrificedThisTurn=true;
  const result=endTurn(r,b);assert.equal(result.phase,true);assert.equal(b.ember,2);assert.equal(b.maxEmber,2);assert.equal(b.round,2);assert.equal(b.sacrificedThisTurn,false);
});
test('mirror refuses empty targets without spending the item',()=>{
  const r=createRun(105),b=createBattle(r);r.items=['mirror'];b.enemy.fill(null);assert.equal(useItem(r,b,'mirror').ok,false);assert.deepEqual(r.items,['mirror']);
});

test('dead creatures recycle while Echo never accumulates the root health bonus',()=>{
  const r=createRun(106),b=createBattle(r);r.battle=b;b.hand=[cloneCard('wolf'),cloneCard('hare',{sigils:['echo','root']})];b.ember=9;
  playCard(r,b,b.hand[0].instanceId,0);sacrificeUnit(r,b,0);assert.ok(b.discard.some(c=>c.id==='wolf'));
  b.sacrificedThisTurn=false;playCard(r,b,b.hand[0].instanceId,0);assert.equal(b.player[0].hp,3);sacrificeUnit(r,b,0);b.sacrificedThisTurn=false;
  playCard(r,b,b.hand[0].instanceId,0);assert.equal(b.player[0].hp,3);
});
test('warden chain suspends attacks in its lane',()=>{
  const r=createRun(107),b=createBattle(r,'warden');r.battle=b;b.hand=[cloneCard('wolf')];b.enemy.fill(null);b.intent=[];playCard(r,b,b.hand[0].instanceId,0);b.lockedLane=0;const result=endTurn(r,b);assert.equal(result.events.some(e=>e.type==='attack'&&e.lane===0),false);
});
