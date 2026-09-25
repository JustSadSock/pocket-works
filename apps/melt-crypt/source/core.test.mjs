import assert from 'node:assert/strict';
import { ROOM_MODULES, RELICS, generateDungeon, makeRng, mapLookDelta, rollLoot } from './core.js';
import {
  ARM_MODULES, DEFENSES, ENEMY_BODIES, HEADS, LOCOMOTIONS, MUTATIONS,
  generateEnemyBlueprint, signatureDistance
} from './enemy-generator.js';
import { WEAPON_CORES, WEAPON_HEADS, WEAPON_SKILLS, generateWeapon } from './weapon-generator.js';
import { STARTER_WEAPON, attackTiming } from './combat-motion.js';
import { EncounterDirector, buildEncounterPlan } from './encounter-director.js';
import { CapsuleController } from './player-controller.js';

const rngA = makeRng(12345);
const rngB = makeRng(12345);
for (let i = 0; i < 20; i += 1) assert.equal(rngA(), rngB(), 'seeded RNG must be deterministic');

assert.ok(mapLookDelta(0, -12, 0.0032, 1).y < 0, 'upward drag must produce upward camera pitch');
assert.ok(mapLookDelta(0, 12, 0.0032, 1).y > 0, 'downward drag must produce downward camera pitch');

assert.equal(ENEMY_BODIES.length, 6, 'first grammar release must expose six body types');
assert.equal(LOCOMOTIONS.length, 5, 'first grammar release must expose five locomotion systems');
assert.equal(ARM_MODULES.length, 8, 'first grammar release must expose eight arm/weapon modules');
assert.equal(DEFENSES.length, 6, 'first grammar release must expose six defensive traits');
assert.equal(MUTATIONS.length, 8, 'first grammar release must expose eight visible mutations');
assert.ok(HEADS.length >= 6, 'heads must be a meaningful readable module');
assert.equal(WEAPON_CORES.length, 6, 'weapon grammar must expose six cores');
assert.equal(WEAPON_HEADS.length, 10, 'weapon grammar must expose ten working heads');
assert.equal(WEAPON_SKILLS.length, 8, 'weapon grammar must expose eight skills');
assert.equal(ROOM_MODULES.length, 26, 'the crypt should vary architecture without changing biome');

const seenModules = new Set();
for (let floor = 1; floor <= 14; floor += 1) {
  const dungeon = generateDungeon(0xdeadbeef ^ floor * 991, floor);
  assert.ok(dungeon.rooms.length >= 6, 'dungeon should have enough rooms');
  assert.ok(dungeon.requiredKills >= 3 && dungeon.requiredKills <= dungeon.totalMonsters, 'kill requirement must be attainable');
  const positions = new Set(dungeon.rooms.map((room) => `${room.gx},${room.gz}`));
  assert.equal(positions.size, dungeon.rooms.length, 'rooms must occupy unique grid cells');
  const seen = new Set([dungeon.startId]);
  const queue = [dungeon.startId];
  while (queue.length) {
    const id = queue.shift();
    for (const next of Object.values(dungeon.rooms[id].links)) {
      if (next !== null && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.equal(seen.size, dungeon.rooms.length, 'every room must be connected');
  assert.ok(seen.has(dungeon.gateId), 'exit room must be reachable');
  for (const room of dungeon.rooms) {
    seenModules.add(room.module);
    assert.ok(ROOM_MODULES.some((module) => module.id === room.module), 'room module must come from authored grammar');
    if (room.role !== 'room') {
      assert.ok(['none','ribs','gallery','hooks'].includes(room.obstacle), 'interactive room centers must stay structurally clear');
    }
    for (const [side, nextId] of Object.entries(room.links)) {
      if (nextId === null) continue;
      const next = dungeon.rooms[nextId];
      const span = side === 'e' || side === 'w'
        ? room.sizeX / 2 + next.sizeX / 2
        : room.sizeZ / 2 + next.sizeZ / 2;
      assert.ok(span < dungeon.spacing, 'linked room walls must never overlap');
    }
  }
}
assert.ok(seenModules.size >= 18, 'many authored room modules should appear across sampled runs');

const enemyHistory = [];
for (let i = 0; i < 36; i += 1) {
  const enemy = generateEnemyBlueprint(17011 + i * 7919, 7, 1.25, enemyHistory, 3);
  assert.ok(enemy.maxHp > 0 && enemy.speed > 0 && enemy.damage > 0);
  assert.equal(enemy.ability, enemy.rightArmSpec.attack, 'primary ability must be visible on the right arm');
  assert.equal(enemy.secondaryAbility, enemy.leftArmSpec.attack || null, 'secondary ability must match the visible off-hand');
  const visibleSpecials = Number(enemy.head !== 'bare') + Number(enemy.defense !== 'open') + Number(enemy.mutation !== 'none');
  assert.equal(visibleSpecials, 1, 'enemy should present exactly one dominant special feature beyond silhouette and main weapon');
  for (const signature of enemyHistory.slice(-30)) {
    assert.ok(signatureDistance(enemy.signature, signature) >= 5, 'recent enemies must differ in several meaningful components');
  }
  enemyHistory.push(enemy.signature);
}

const tierOneBodies = new Set();
const tierThreeBodies = new Set();
for (let i = 0; i < 180; i += 1) {
  tierOneBodies.add(generateEnemyBlueprint(i * 173 + 9, 5, 1, [], 1).body);
  tierThreeBodies.add(generateEnemyBlueprint(i * 173 + 9, 5, 1, [], 3).body);
}
assert.ok(tierOneBodies.size < tierThreeBodies.size, 'meta progression must expand enemy vocabulary');

const weaponHistory = [];
for (let i = 0; i < 50; i += 1) {
  const weapon = generateWeapon(8803 + i * 3571, 6, weaponHistory, 3);
  assert.ok(weapon.damage > 0 && weapon.reach > 0 && weapon.comboLength >= 1);
  assert.ok(weapon.magnetism >= 8 && weapon.magnetism <= 22);
  assert.ok(!weaponHistory.slice(-18).includes(weapon.signature), 'recent generated weapons must not repeat exactly');
  weaponHistory.push(weapon.signature);
}
const tierOneHeads = new Set(Array.from({ length: 160 }, (_, i) => generateWeapon(i * 733 + 1, 4, [], 1).head));
const tierThreeHeads = new Set(Array.from({ length: 160 }, (_, i) => generateWeapon(i * 733 + 1, 4, [], 3).head));
assert.ok(tierOneHeads.size < tierThreeHeads.size, 'meta progression must expand weapon vocabulary');


// The starter is authored, fast and deterministic rather than a random roll.
assert.equal(STARTER_WEAPON.name, 'GRAVE CLEAVER');
assert.equal(STARTER_WEAPON.core, 'cleaver');
assert.ok(attackTiming(STARTER_WEAPON,false,0,1).duration <= 0.31);
assert.ok(attackTiming(STARTER_WEAPON,false,1,1).duration <= 0.35);
assert.ok(attackTiming(STARTER_WEAPON,true,0,1).duration <= 0.73);

for (let i = 0; i < 120; i += 1) {
  const weapon = generateWeapon(0x5511 + i * 991, 8, [], 3);
  for (let combo = 0; combo < Math.max(1, weapon.comboLength); combo += 1) {
    const timing = attackTiming(weapon,false,combo,1);
    assert.ok(timing.duration >= 0.19 && timing.duration <= 0.78, 'generated light attacks must stay responsive');
  }
}

// First contact is staged and guarantees a weapon-choice reward.
const encounterRoom = { id: 4, monsterSeeds: [11], role: 'room' };
const plan = buildEncounterPlan(encounterRoom,1,0xfeed,{ firstCombat:true });
assert.equal(plan.waves.length,3);
assert.ok(plan.waves.every((wave)=>wave.length===1));
assert.equal(plan.reward,'weapon-choice');
const director = new EncounterDirector();
let events = director.begin(plan);
assert.equal(events[0].type,'cue');
events = director.tick(1,0);
assert.ok(events.some((event)=>event.type==='spawn'));
events = director.tick(0.1,0);
assert.ok(events.some((event)=>event.type==='cue'));

assert.ok(RELICS.length >= 8);
assert.ok(RELICS.every((relic) => relic.effect && !('stat' in relic)), 'relics must add mechanics instead of percentage stats');

for (let i = 0; i < 50; i += 1) {
  const loot = rollLoot(i * 991, 5);
  assert.ok(['relic','potion'].includes(loot.type));
  assert.ok(loot.item?.id && loot.item?.name);
}

// Swept controller must not tunnel through a thin wall during a dodge-sized movement.
const fakeCamera = { position: { set() {} } };
const wall = { minX: 0.9, maxX: 1.08, minY: -0.2, maxY: 3, minZ: -1, maxZ: 1 };
const controller = new CapsuleController(fakeCamera, () => [wall]);
controller.teleport(0, 0, 0);
controller.movePlanar(2.4, 0);
assert.ok(controller.position.x < 0.9 - controller.radius + 0.08, 'swept capsule must stop before a thin wall');

const lowStep = { minX: 0.35, maxX: 0.72, minY: -0.02, maxY: 0.22, minZ: -0.5, maxZ: 0.5 };
const stepController = new CapsuleController(fakeCamera, () => [lowStep]);
stepController.teleport(0, 0, 0);
stepController.movePlanar(0.6, 0);
assert.ok(stepController.position.x > 0.45, 'capsule should traverse a low step');
assert.ok(stepController.position.y > 0, 'step-height should lift the capsule over low geometry');

console.log('MELT//CRYPT Combat Rebuild invariants passed');
