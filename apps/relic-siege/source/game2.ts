import {
  AbstractMesh,
  AnimationGroup,
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Ray,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

type Phase = 'loading' | 'gate' | 'courtyard' | 'wings' | 'bridge' | 'sanctum' | 'boss' | 'won' | 'lost';
type EnemyKind = 'raider' | 'brute' | 'seer' | 'boss';
type ZoneName = 'gate' | 'courtyard' | 'archive' | 'forge' | 'approach' | 'bridge' | 'sanctum';

type Enemy = {
  id: number;
  kind: EnemyKind;
  zone: ZoneName;
  root: TransformNode;
  visual: AbstractMesh | null;
  visualBaseY: number;
  telegraph: Mesh;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  nextAttack: number;
  resolveAttackAt: number;
  staggerUntil: number;
  projectileAt: number;
  grounded: boolean;
  dead: boolean;
};

type Projectile = {
  mesh: Mesh;
  velocity: Vector3;
  damage: number;
  source: Enemy;
  expires: number;
};

type ArenaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
const startPanel = document.querySelector<HTMLElement>('#startPanel')!;
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const healthBar = document.querySelector<HTMLElement>('#healthBar')!;
const relicBar = document.querySelector<HTMLElement>('#relicBar')!;
const objective = document.querySelector<HTMLElement>('#objective')!;
const zoneLabel = document.querySelector<HTMLElement>('#zoneLabel')!;
const shardState = document.querySelector<HTMLElement>('#shardState')!;
const emberState = document.querySelector<HTMLElement>('#emberState')!;
const message = document.querySelector<HTMLElement>('#message')!;
const joystick = document.querySelector<HTMLElement>('#joystick')!;
const stick = document.querySelector<HTMLElement>('#stick')!;
const lookZone = document.querySelector<HTMLElement>('#lookZone')!;
const attackButton = document.querySelector<HTMLButtonElement>('#attackButton')!;
const guardButton = document.querySelector<HTMLButtonElement>('#guardButton')!;
const relicButton = document.querySelector<HTMLButtonElement>('#relicButton')!;
const bossHud = document.querySelector<HTMLElement>('#bossHud')!;
const bossBar = document.querySelector<HTMLElement>('#bossBar')!;
const ending = document.querySelector<HTMLElement>('#ending')!;
const endingTitle = document.querySelector<HTMLElement>('#endingTitle')!;
const endingCopy = document.querySelector<HTMLElement>('#endingCopy')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restartButton')!;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: true });
engine.setHardwareScalingLevel(Math.max(1, Math.min(1.65, window.devicePixelRatio >= 3 ? 1.5 : window.devicePixelRatio >= 2 ? 1.28 : 1)));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.014, 0.022, 0.04, 1);
scene.ambientColor = new Color3(0.12, 0.13, 0.19);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0078;
scene.fogColor = new Color3(0.035, 0.045, 0.072);
scene.collisionsEnabled = true;

const camera = new ArcRotateCamera('camera', Math.PI, 1.02, 8.4, new Vector3(0, 1.4, -44), scene);
camera.lowerRadiusLimit = 6.7;
camera.upperRadiusLimit = 10.2;
camera.lowerBetaLimit = 0.7;
camera.upperBetaLimit = 1.32;
camera.fov = 0.84;
camera.inputs.clear();

const pipeline = new DefaultRenderingPipeline('relic-pipeline-2', true, scene, [camera]);
pipeline.fxaaEnabled = true;
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.78;
pipeline.bloomWeight = 0.22;
pipeline.bloomKernel = 38;

const hemi = new HemisphericLight('night-fill', new Vector3(-0.2, 1, 0.12), scene);
hemi.intensity = 0.42;
hemi.diffuse = new Color3(0.36, 0.47, 0.72);
hemi.groundColor = new Color3(0.09, 0.05, 0.07);

const moon = new DirectionalLight('moon-key', new Vector3(-0.38, -1, 0.24), scene);
moon.position = new Vector3(32, 46, -24);
moon.intensity = 1.12;
moon.diffuse = new Color3(0.58, 0.68, 0.95);

const shadowGenerator = new ShadowGenerator(1024, moon);
shadowGenerator.bias = 0.0008;
shadowGenerator.normalBias = 0.03;
shadowGenerator.usePercentageCloserFiltering = true;

function makeMaterial(name: string, diffuse: Color3, emissive = Color3.Black(), alpha = 1) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.specularColor = new Color3(0.07, 0.07, 0.09);
  material.alpha = alpha;
  return material;
}

const fallbackStone = makeMaterial('fallback-stone', new Color3(0.14, 0.12, 0.16));
const keeperMat = makeMaterial('keeper-fallback', new Color3(0.055, 0.12, 0.25));
const bronzeMat = makeMaterial('bronze-fallback', new Color3(0.56, 0.28, 0.08), new Color3(0.08, 0.02, 0));
const ashMat = makeMaterial('ash-fallback', new Color3(0.09, 0.075, 0.105));
const emberMat = makeMaterial('ember-fallback', new Color3(0.42, 0.045, 0.018), new Color3(0.85, 0.06, 0.01));
const seerMat = makeMaterial('seer-fallback', new Color3(0.07, 0.12, 0.2), new Color3(0.02, 0.12, 0.3));
const telegraphMat = makeMaterial('telegraph', new Color3(0.92, 0.12, 0.025), new Color3(1, 0.045, 0.005), 0.78);
const parryMat = makeMaterial('parry', new Color3(1, 0.62, 0.1), new Color3(1, 0.38, 0.02), 0.9);
const relicMat = makeMaterial('relic', new Color3(0.95, 0.55, 0.12), new Color3(1, 0.28, 0.03), 0.92);

const playerCollider = MeshBuilder.CreateCapsule('player-collider', { height: 1.8, radius: 0.42, tessellation: 8 }, scene);
playerCollider.position.set(0, 1.08, -46);
playerCollider.visibility = 0;
playerCollider.isPickable = false;
playerCollider.checkCollisions = true;
playerCollider.ellipsoid = new Vector3(0.42, 0.88, 0.42);
playerCollider.ellipsoidOffset = new Vector3(0, 0.02, 0);

const playerMount = new TransformNode('keeper-mount', scene);
playerMount.parent = playerCollider;
playerMount.position.y = -0.44;

let playerVisual: AbstractMesh | null = null;
let playerAnimationGroups: AnimationGroup[] = [];
let playerAnimationState = '';
let raiderTemplate: AbstractMesh | null = null;
let raiderAnimationGroups: AnimationGroup[] = [];
let wardenTemplate: AbstractMesh | null = null;
let wardenAnimationGroups: AnimationGroup[] = [];

function makeFallbackKeeper() {
  const root = new TransformNode('keeper-fallback-root', scene);
  root.parent = playerMount;

  const body = MeshBuilder.CreateCapsule('keeper-fallback-body', { height: 1.7, radius: 0.34, tessellation: 8 }, scene);
  body.parent = root;
  body.position.y = 0.94;
  body.material = keeperMat;

  const head = MeshBuilder.CreateSphere('keeper-fallback-head', { diameter: 0.55, segments: 8 }, scene);
  head.parent = root;
  head.position.y = 1.92;
  head.material = bronzeMat;

  const glaive = MeshBuilder.CreateBox('keeper-fallback-glaive', { width: 0.1, height: 1.7, depth: 0.1 }, scene);
  glaive.parent = root;
  glaive.position.set(0.58, 1.03, 0.04);
  glaive.rotation.z = -0.2;
  glaive.material = bronzeMat;

  shadowGenerator.addShadowCaster(body);
  shadowGenerator.addShadowCaster(head);
  return root as unknown as AbstractMesh;
}

const fallbackKeeper = makeFallbackKeeper();

let phase: Phase = 'loading';
let started = false;
let worldReady = false;
let health = 100;
let relicCharge = 0;
let hasArchiveShard = false;
let hasForgeEmber = false;
let courtyardEncounterStarted = false;
let courtyardEncounterCleared = false;
let archiveEncounterStarted = false;
let archiveEncounterCleared = false;
let forgeEncounterStarted = false;
let forgeEncounterCleared = false;
let bridgeEncounterStarted = false;
let bridgeEncounterCleared = false;
let bossStarted = false;
let currentZone: ZoneName = 'gate';
let enemies: Enemy[] = [];
let projectiles: Projectile[] = [];
let enemyId = 0;
let lastAttack = -9999;
let lastComboAt = -9999;
let combo = 0;
let guarding = false;
let guardStarted = -9999;
let lastRelic = -9999;
let verticalVelocity = 0;
let grounded = false;
let lastGroundDistance = 99;
let lastFootstep = -9999;
let messageTimer = 0;
let blenderWorldLoaded = false;
let keeperLoaded = false;
let raiderLoaded = false;
let wardenLoaded = false;
let worldCollisionCount = 0;
const assetErrors: string[] = [];

const audioFiles = {
  ambience: './audio/generated/wind.ogg',
  theme: './audio/generated/theme.ogg',
  combat: './audio/generated/combat.ogg',
  swing: './audio/generated/strike.ogg',
  hit: './audio/generated/hit.ogg',
  parry: './audio/generated/parry.ogg',
  relic: './audio/generated/pylon.ogg',
  enemy: './audio/generated/enemy.ogg',
  boss: './audio/generated/boss.ogg',
  step: './audio/generated/step-stone.ogg'
};

const audios = new Map<string, HTMLAudioElement>();
for (const [name, src] of Object.entries(audioFiles)) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = name === 'theme' ? 0.23 : name === 'combat' ? 0.3 : name === 'ambience' ? 0.18 : name === 'step' ? 0.28 : 0.5;
  if (name === 'theme' || name === 'combat' || name === 'ambience') audio.loop = true;
  audios.set(name, audio);
}

function playAudio(name: string, variation = 0) {
  const base = audios.get(name);
  if (!base) return;
  if (base.loop) {
    void base.play().catch(() => {});
    return;
  }
  const shot = base.cloneNode(true) as HTMLAudioElement;
  shot.volume = Math.max(0, Math.min(1, base.volume * (0.9 + variation * 0.08)));
  shot.playbackRate = Math.max(0.84, Math.min(1.17, 1 + variation * 0.055));
  void shot.play().catch(() => {});
}

function setCombatMusic(active: boolean) {
  const theme = audios.get('theme');
  const combat = audios.get('combat');
  if (!theme || !combat) return;
  if (active) {
    theme.volume = 0.08;
    combat.volume = 0.3;
    void combat.play().catch(() => {});
  } else {
    theme.volume = 0.23;
    combat.pause();
    combat.currentTime = 0;
  }
}

function updateZoneAudio(zone: ZoneName) {
  const ambience = audios.get('ambience');
  if (!ambience) return;
  ambience.volume = zone === 'archive' ? 0.12 : zone === 'forge' ? 0.2 : zone === 'bridge' ? 0.24 : zone === 'sanctum' ? 0.15 : 0.18;
  ambience.playbackRate = zone === 'archive' ? 0.9 : zone === 'forge' ? 1.06 : zone === 'bridge' ? 1.12 : 1;
}

const archiveLight = new PointLight('archive-blue', new Vector3(-20, 8, -8), scene);
archiveLight.diffuse = new Color3(0.12, 0.45, 1);
archiveLight.intensity = 1.35;
archiveLight.range = 17;

const forgeLight = new PointLight('forge-orange', new Vector3(20, 8, -8), scene);
forgeLight.diffuse = new Color3(1, 0.19, 0.04);
forgeLight.intensity = 1.75;
forgeLight.range = 18;

const sanctumLight = new PointLight('sanctum-gold', new Vector3(0, 13, 35), scene);
sanctumLight.diffuse = new Color3(1, 0.55, 0.16);
sanctumLight.intensity = 1.05;
sanctumLight.range = 30;

const bridgeBarrier = MeshBuilder.CreateBox('bridge-seal', { width: 8, height: 5.6, depth: 0.35 }, scene);
bridgeBarrier.position.set(0, 7.45, 1.8);
bridgeBarrier.material = relicMat;
bridgeBarrier.visibility = 0.66;
bridgeBarrier.checkCollisions = true;

const arenaBounds: Record<ZoneName, ArenaBounds> = {
  gate: { minX: -7.6, maxX: 7.6, minZ: -51, maxZ: -33.5 },
  courtyard: { minX: -12, maxX: 12, minZ: -31, maxZ: -13 },
  archive: { minX: -27.5, maxX: -13, minZ: -15.5, maxZ: -0.3 },
  forge: { minX: 13, maxX: 27.5, minZ: -15.5, maxZ: -0.3 },
  approach: { minX: -7.4, maxX: 7.4, minZ: -11, maxZ: 2 },
  bridge: { minX: -3.6, maxX: 3.6, minZ: 3.2, maxZ: 21.4 },
  sanctum: { minX: -11.5, maxX: 11.5, minZ: 24.8, maxZ: 41.5 }
};

const safeAnchors: Record<ZoneName, Vector3> = {
  gate: new Vector3(0, 1.08, -46),
  courtyard: new Vector3(0, 3.08, -25),
  archive: new Vector3(-17, 5.08, -10),
  forge: new Vector3(17, 5.08, -10),
  approach: new Vector3(0, 6.08, -7),
  bridge: new Vector3(0, 7.08, 7),
  sanctum: new Vector3(0, 9.08, 27)
};

function zoneTitle(zone: ZoneName) {
  return ({
    gate: 'Внешние ворота',
    courtyard: 'Двор хранителей',
    archive: 'Звёздный архив',
    forge: 'Пепельная кузня',
    approach: 'Врата солнца',
    bridge: 'Солнечный мост',
    sanctum: 'Верхнее святилище'
  })[zone];
}

function zoneFromPosition(p: Vector3): ZoneName {
  if (p.z < -32) return 'gate';
  if (p.z < -12 && Math.abs(p.x) < 14) return 'courtyard';
  if (p.x < -12 && p.z < 1.5) return 'archive';
  if (p.x > 12 && p.z < 1.5) return 'forge';
  if (p.z < 3) return 'approach';
  if (p.z < 23) return 'bridge';
  return 'sanctum';
}

function showMessage(text: string, seconds = 1.8) {
  message.textContent = text;
  message.classList.add('show');
  messageTimer = performance.now() + seconds * 1000;
}

function setObjective(text: string) {
  objective.textContent = text;
}

function updateHud() {
  healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
  relicBar.style.width = `${Math.max(0, Math.min(100, relicCharge))}%`;
  shardState.classList.toggle('done', hasArchiveShard);
  emberState.classList.toggle('done', hasForgeEmber);
  zoneLabel.textContent = zoneTitle(currentZone);

  const boss = enemies.find(enemy => enemy.kind === 'boss' && !enemy.dead);
  bossHud.hidden = !boss;
  if (boss) bossBar.style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
}

function isCollisionMesh(mesh: AbstractMesh) {
  return mesh.name.startsWith('COL_');
}

function pickFloor(x: number, y: number, z: number, rise = 5, drop = 12) {
  const origin = new Vector3(x, y + rise, z);
  return scene.pickWithRay(new Ray(origin, Vector3.Down(), rise + drop), mesh => isCollisionMesh(mesh));
}

function floorYAt(position: Vector3, rise = 5, drop = 12) {
  const hit = pickFloor(position.x, position.y, position.z, rise, drop);
  return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
}

function setPlayerAnimation(name: 'Idle' | 'Walk' | 'Attack') {
  if (!playerAnimationGroups.length || playerAnimationState === name) return;
  const group = playerAnimationGroups.find(animation => animation.name.toLowerCase().includes(name.toLowerCase()));
  if (!group) return;
  playerAnimationGroups.forEach(animation => animation.stop());
  group.start(name !== 'Attack', 1, group.from, group.to, false);
  playerAnimationState = name;
}

function makeFallbackEnemyVisual(root: TransformNode, kind: EnemyKind) {
  const body = MeshBuilder.CreatePolyhedron(`enemy-body-${enemyId}`, {
    type: kind === 'boss' ? 2 : 1,
    size: kind === 'brute' ? 1 : kind === 'boss' ? 1.45 : 0.7
  }, scene);
  body.parent = root;
  body.position.y = kind === 'boss' ? 1.9 : kind === 'brute' ? 1.3 : 1.05;
  body.scaling.y = kind === 'boss' ? 1.5 : 1.25;
  body.material = kind === 'seer' ? seerMat : kind === 'boss' ? emberMat : ashMat;

  const head = MeshBuilder.CreateSphere(`enemy-head-${enemyId}`, { diameter: kind === 'boss' ? 0.78 : 0.46, segments: 7 }, scene);
  head.parent = root;
  head.position.y = kind === 'boss' ? 3.28 : kind === 'brute' ? 2.32 : 1.94;
  head.material = emberMat;

  shadowGenerator.addShadowCaster(body);
  shadowGenerator.addShadowCaster(head);
  return body;
}

function cloneRaider(root: TransformNode, kind: EnemyKind) {
  if (!raiderTemplate || kind === 'boss') return null;
  const clone = raiderTemplate.clone(`raider-${enemyId}`, root, false);
  if (!clone) return null;
  clone.setEnabled(true);
  clone.position.set(0, 0.58, 0);
  const scale = kind === 'brute' ? 0.92 : kind === 'seer' ? 0.72 : 0.78;
  clone.scaling.setAll(scale);
  if (kind === 'seer') clone.scaling.y *= 1.08;
  clone.getChildMeshes(false).forEach(mesh => shadowGenerator.addShadowCaster(mesh));
  return clone;
}

function cloneWarden(root: TransformNode) {
  if (!wardenTemplate) return null;
  const clone = wardenTemplate.clone(`warden-${enemyId}`, root, false);
  if (!clone) return null;
  clone.setEnabled(true);
  clone.position.set(0, 0.62, 0);
  clone.scaling.setAll(0.9);
  clone.getChildMeshes(false).forEach(mesh => shadowGenerator.addShadowCaster(mesh));
  return clone;
}

function makeEnemy(position: Vector3, kind: EnemyKind): Enemy {
  enemyId += 1;
  const root = new TransformNode(`enemy-${kind}-${enemyId}`, scene);
  root.position.copyFrom(position);
  const floor = floorYAt(root.position, 8, 18);
  if (floor !== null) root.position.y = floor;

  const visual = kind === 'boss' ? cloneWarden(root) : cloneRaider(root, kind);
  if (!visual) makeFallbackEnemyVisual(root, kind);

  const telegraph = MeshBuilder.CreateTorus(`telegraph-${enemyId}`, {
    diameter: kind === 'boss' ? 4.8 : kind === 'brute' ? 2.9 : 2.1,
    thickness: kind === 'boss' ? 0.12 : 0.08,
    tessellation: 30
  }, scene);
  telegraph.parent = root;
  telegraph.position.y = 0.08;
  telegraph.rotation.x = Math.PI / 2;
  telegraph.material = telegraphMat;
  telegraph.visibility = 0;

  const stats = kind === 'raider'
    ? { hp: 4, speed: 2.3, damage: 9, range: 1.65 }
    : kind === 'brute'
      ? { hp: 10, speed: 1.38, damage: 18, range: 2.05 }
      : kind === 'seer'
        ? { hp: 5, speed: 1.58, damage: 11, range: 8 }
        : { hp: 46, speed: 1.72, damage: 22, range: 2.65 };

  return {
    id: enemyId,
    kind,
    zone: zoneFromPosition(root.position),
    root,
    visual,
    visualBaseY: visual?.position.y ?? 0,
    telegraph,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    damage: stats.damage,
    range: stats.range,
    nextAttack: performance.now() + 650 + Math.random() * 500,
    resolveAttackAt: 0,
    staggerUntil: 0,
    projectileAt: 0,
    grounded: floor !== null,
    dead: false
  };
}

function spawnEncounter(label: string, specs: Array<[EnemyKind, Vector3]>) {
  for (const [kind, position] of specs) enemies.push(makeEnemy(position, kind));
  setCombatMusic(true);
  showMessage(label, 1.8);
  playAudio('enemy', Math.random() * 0.5);
  updateHud();
}

function destroyEnemy(enemy: Enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.telegraph.dispose();
  enemy.root.dispose(false, true);
  relicCharge = Math.min(100, relicCharge + (enemy.kind === 'boss' ? 35 : enemy.kind === 'brute' ? 22 : 14));
  updateHud();
}

function applyPlayerDamage(amount: number, source: Enemy | null, now: number) {
  if (guarding) {
    const parry = now - guardStarted <= 285;
    if (parry) {
      if (source) {
        source.staggerUntil = now + 1100;
        source.resolveAttackAt = 0;
        source.telegraph.material = parryMat;
        source.telegraph.visibility = 0.95;
      }
      relicCharge = Math.min(100, relicCharge + 28);
      playAudio('parry', Math.random() * 0.5);
      showMessage('ПАРИРОВАНИЕ', 0.75);
      updateHud();
      return;
    }
    amount *= 0.3;
  }

  health -= amount;
  playAudio('hit', -0.35);
  updateHud();
  if (health <= 0) lose();
}

function chooseAimTarget(maxDistance = 4.2) {
  let best: Enemy | null = null;
  let bestScore = Infinity;
  const forward = new Vector3(Math.sin(playerCollider.rotation.y), 0, Math.cos(playerCollider.rotation.y));

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const delta = enemy.root.position.subtract(playerCollider.position);
    delta.y = 0;
    const distance = delta.length();
    if (distance > maxDistance) continue;
    const dot = distance < 0.01 ? 1 : Vector3.Dot(forward, delta.normalize());
    const score = distance + (1 - dot) * 2.1;
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

function meleeAttack() {
  if (!started || phase === 'won' || phase === 'lost') return;
  const now = performance.now();
  if (now - lastAttack < 295) return;

  combo = now - lastComboAt < 720 ? (combo + 1) % 3 : 0;
  lastComboAt = now;
  lastAttack = now;

  const damage = combo === 2 ? 4 : 2;
  const reach = combo === 2 ? 3.4 : 2.85;
  const dotLimit = combo === 2 ? -0.16 : 0.06;
  const target = chooseAimTarget();
  if (target) {
    const delta = target.root.position.subtract(playerCollider.position);
    playerCollider.rotation.y = Math.atan2(delta.x, delta.z);
  }

  setPlayerAnimation('Attack');
  playAudio('swing', combo * 0.45 - 0.35);

  const forward = new Vector3(Math.sin(playerCollider.rotation.y), 0, Math.cos(playerCollider.rotation.y));
  let hitSomething = false;

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const offset = enemy.root.position.subtract(playerCollider.position);
    offset.y = 0;
    const distance = offset.length();
    if (distance > reach) continue;
    const direction = distance < 0.01 ? forward : offset.normalize();
    if (Vector3.Dot(forward, direction) < dotLimit) continue;

    enemy.hp -= damage;
    enemy.staggerUntil = now + (combo === 2 ? 560 : 280);
    enemy.resolveAttackAt = 0;
    enemy.root.position.addInPlace(direction.scale(combo === 2 ? 0.75 : 0.32));
    relicCharge = Math.min(100, relicCharge + 7);
    hitSomething = true;
    playAudio('hit', Math.random() * 1.1 - 0.55);
  }

  if (hitSomething) updateHud();
}

function checkWingsComplete() {
  updateHud();
  if (hasArchiveShard && hasForgeEmber) {
    bridgeBarrier.setEnabled(false);
    phase = 'bridge';
    sanctumLight.intensity = 2.35;
    setObjective('Вернись к Вратам солнца и пересеките мост');
    showMessage('ПЕЧАТЬ МОСТА СНЯТА', 2.2);
  } else {
    phase = 'wings';
    setObjective(hasArchiveShard ? 'Добудь жар Пепельной кузни' : 'Верни Звёздный осколок из Архива');
  }
}

function useRelicOrInteract() {
  if (!started || phase === 'won' || phase === 'lost') return;
  const p = playerCollider.position;
  const archiveTarget = new Vector3(-20, 5.1, -2.5);
  const forgeTarget = new Vector3(20, 5.1, -2.5);

  if (!hasArchiveShard && archiveEncounterCleared && Vector3.Distance(p, archiveTarget) < 3.35) {
    hasArchiveShard = true;
    health = Math.min(100, health + 22);
    playAudio('relic');
    showMessage('ЗВЁЗДНЫЙ ОСКОЛОК ВОЗВРАЩЁН', 2);
    checkWingsComplete();
    return;
  }

  if (!hasForgeEmber && forgeEncounterCleared && Vector3.Distance(p, forgeTarget) < 3.35) {
    hasForgeEmber = true;
    health = Math.min(100, health + 22);
    playAudio('relic', 0.3);
    showMessage('ЖАР КУЗНИ СНОВА ЖИВ', 2);
    checkWingsComplete();
    return;
  }

  if (relicCharge < 100 || performance.now() - lastRelic < 900) return;
  lastRelic = performance.now();
  relicCharge = 0;
  playAudio('relic', 0.6);

  const pulse = MeshBuilder.CreateTorus(`relic-pulse-${lastRelic}`, { diameter: 2, thickness: 0.11, tessellation: 36 }, scene);
  pulse.position = playerCollider.position.add(new Vector3(0, -0.65, 0));
  pulse.rotation.x = Math.PI / 2;
  pulse.material = relicMat;

  const born = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const t = Math.min(1, (performance.now() - born) / 520);
    pulse.scaling.setAll(1 + t * 7.5);
    pulse.visibility = 1 - t;
    if (t >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      pulse.dispose();
    }
  });

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const distance = Vector3.Distance(enemy.root.position, playerCollider.position);
    if (distance >= 7.6) continue;
    enemy.hp -= enemy.kind === 'boss' ? 7 : 9;
    enemy.staggerUntil = performance.now() + 1250;
    enemy.resolveAttackAt = 0;
    const push = enemy.root.position.subtract(playerCollider.position);
    push.y = 0;
    if (push.lengthSquared() > 0.01) enemy.root.position.addInPlace(push.normalize().scale(1.15));
  }
  updateHud();
}

function guardStart() {
  if (!started || phase === 'won' || phase === 'lost') return;
  guarding = true;
  guardStarted = performance.now();
  guardButton.classList.add('active');
}

function guardEnd() {
  guarding = false;
  guardButton.classList.remove('active');
}

attackButton.addEventListener('pointerdown', event => {
  event.preventDefault();
  meleeAttack();
});

guardButton.addEventListener('pointerdown', event => {
  event.preventDefault();
  guardButton.setPointerCapture(event.pointerId);
  guardStart();
});
guardButton.addEventListener('pointerup', guardEnd);
guardButton.addEventListener('pointercancel', guardEnd);

relicButton.addEventListener('pointerdown', event => {
  event.preventDefault();
  useRelicOrInteract();
});

let movePointer: number | null = null;
let moveX = 0;
let moveY = 0;

function updateJoystick(clientX: number, clientY: number) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const max = rect.width * 0.34;
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, max / length);
  const px = dx * scale;
  const py = dy * scale;
  moveX = Math.max(-1, Math.min(1, px / max));
  moveY = Math.max(-1, Math.min(1, py / max));
  stick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
}

joystick.addEventListener('pointerdown', event => {
  movePointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event.clientX, event.clientY);
});
joystick.addEventListener('pointermove', event => {
  if (event.pointerId === movePointer) updateJoystick(event.clientX, event.clientY);
});

function resetMove(event?: PointerEvent) {
  if (event && movePointer !== null && event.pointerId !== movePointer) return;
  movePointer = null;
  moveX = 0;
  moveY = 0;
  stick.style.transform = 'translate(-50%, -50%)';
}

joystick.addEventListener('pointerup', resetMove);
joystick.addEventListener('pointercancel', resetMove);

let lookPointer: number | null = null;
let lookLastX = 0;
let lookLastY = 0;

lookZone.addEventListener('pointerdown', event => {
  lookPointer = event.pointerId;
  lookLastX = event.clientX;
  lookLastY = event.clientY;
  lookZone.setPointerCapture(event.pointerId);
});

lookZone.addEventListener('pointermove', event => {
  if (event.pointerId !== lookPointer) return;
  const dx = event.clientX - lookLastX;
  const dy = event.clientY - lookLastY;
  lookLastX = event.clientX;
  lookLastY = event.clientY;
  camera.alpha -= dx * 0.0068;
  camera.beta = Math.max(0.7, Math.min(1.32, camera.beta + dy * 0.0042));
});

function clearLook(event: PointerEvent) {
  if (event.pointerId === lookPointer) lookPointer = null;
}
lookZone.addEventListener('pointerup', clearLook);
lookZone.addEventListener('pointercancel', clearLook);

const keys = new Set<string>();
window.addEventListener('keydown', event => {
  keys.add(event.code);
  if (event.code === 'Space') {
    event.preventDefault();
    meleeAttack();
  }
  if (event.code === 'KeyQ') guardStart();
  if (event.code === 'KeyE') useRelicOrInteract();
});
window.addEventListener('keyup', event => {
  keys.delete(event.code);
  if (event.code === 'KeyQ') guardEnd();
});

function createProjectile(enemy: Enemy, now: number) {
  const mesh = MeshBuilder.CreateSphere(`ash-bolt-${enemy.id}-${now}`, {
    diameter: enemy.kind === 'boss' ? 0.72 : 0.43,
    segments: 8
  }, scene);
  mesh.position.copyFrom(enemy.root.position.add(new Vector3(0, enemy.kind === 'boss' ? 2.15 : 1.48, 0)));
  mesh.material = emberMat;
  const direction = playerCollider.position.add(new Vector3(0, 0.45, 0)).subtract(mesh.position).normalize();
  projectiles.push({
    mesh,
    velocity: direction.scale(enemy.kind === 'boss' ? 8.6 : 6.7),
    damage: enemy.damage,
    source: enemy,
    expires: now + 4200
  });
}

function resolveEnemyAttack(enemy: Enemy, now: number) {
  enemy.telegraph.visibility = 0;
  enemy.telegraph.material = telegraphMat;
  enemy.telegraph.scaling.setAll(1);
  enemy.resolveAttackAt = 0;
  enemy.nextAttack = now + (enemy.kind === 'boss' ? 1450 : enemy.kind === 'brute' ? 1850 : 1350) + Math.random() * 450;

  if (enemy.kind === 'seer') {
    createProjectile(enemy, now);
    return;
  }

  if (enemy.kind === 'boss' && Vector3.Distance(enemy.root.position, playerCollider.position) > 4.9) {
    createProjectile(enemy, now);
    return;
  }

  const distance = Vector3.Distance(enemy.root.position, playerCollider.position);
  if (distance <= enemy.range + 0.65) applyPlayerDamage(enemy.damage, enemy, now);
}

function clampEnemyToArena(enemy: Enemy) {
  const bounds = arenaBounds[enemy.zone];
  enemy.root.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, enemy.root.position.x));
  enemy.root.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, enemy.root.position.z));
}

function snapEnemyToGround(enemy: Enemy) {
  const floor = floorYAt(enemy.root.position, 6, 14);
  if (floor === null) {
    enemy.grounded = false;
    return;
  }
  enemy.grounded = true;
  const delta = floor - enemy.root.position.y;
  enemy.root.position.y += Math.max(-0.32, Math.min(0.32, delta));
}

function updateEnemy(enemy: Enemy, dt: number, now: number) {
  if (enemy.dead) return;
  if (enemy.hp <= 0) {
    destroyEnemy(enemy);
    return;
  }

  clampEnemyToArena(enemy);
  snapEnemyToGround(enemy);

  if (enemy.visual) {
    const bob = Math.sin(now * 0.006 + enemy.id) * (enemy.kind === 'brute' ? 0.018 : 0.03);
    enemy.visual.position.y = enemy.visualBaseY + bob;
  }

  if (enemy.staggerUntil > now) {
    enemy.telegraph.visibility = Math.min(0.7, (enemy.staggerUntil - now) / 700);
    return;
  }

  if (enemy.resolveAttackAt > 0) {
    const remaining = enemy.resolveAttackAt - now;
    const window = enemy.kind === 'boss' ? 940 : enemy.kind === 'brute' ? 780 : enemy.kind === 'seer' ? 700 : 520;
    enemy.telegraph.visibility = Math.max(0.22, Math.min(1, 1 - remaining / window));
    enemy.telegraph.scaling.setAll(1 + Math.max(0, 1 - remaining / window) * 0.35);
    if (now >= enemy.resolveAttackAt) resolveEnemyAttack(enemy, now);
    return;
  }

  const toPlayer = playerCollider.position.subtract(enemy.root.position);
  toPlayer.y = 0;
  const distance = toPlayer.length();
  const direction = distance > 0.01 ? toPlayer.normalize() : Vector3.Zero();
  enemy.root.rotation.y = Math.atan2(direction.x, direction.z);

  if (enemy.kind === 'seer') {
    if (distance < 5.2) enemy.root.position.addInPlace(direction.scale(-enemy.speed * dt));
    else if (distance > 8.1) enemy.root.position.addInPlace(direction.scale(enemy.speed * dt));
    if (now > enemy.nextAttack) enemy.resolveAttackAt = now + 690;
    return;
  }

  if (enemy.kind === 'boss' && distance > 5.4 && now > enemy.projectileAt) {
    enemy.projectileAt = now + 3100;
    enemy.resolveAttackAt = now + 930;
    return;
  }

  if (distance > enemy.range) {
    enemy.root.position.addInPlace(direction.scale(enemy.speed * dt));
  } else if (now > enemy.nextAttack) {
    enemy.resolveAttackAt = now + (enemy.kind === 'boss' ? 900 : enemy.kind === 'brute' ? 760 : 500);
  }
}

function updateProjectiles(dt: number, now: number) {
  for (const projectile of projectiles) {
    projectile.mesh.position.addInPlace(projectile.velocity.scale(dt));
    if (Vector3.Distance(projectile.mesh.position, playerCollider.position.add(new Vector3(0, 0.4, 0))) < 0.82) {
      applyPlayerDamage(projectile.damage, projectile.source, now);
      projectile.expires = 0;
    }
  }

  const expired = projectiles.filter(projectile => projectile.expires <= now);
  expired.forEach(projectile => projectile.mesh.dispose());
  projectiles = projectiles.filter(projectile => projectile.expires > now);
}

function detectGrounded() {
  const origin = playerCollider.position.add(new Vector3(0, 0.32, 0));
  const hit = scene.pickWithRay(new Ray(origin, Vector3.Down(), 1.72), mesh => isCollisionMesh(mesh));
  if (!hit?.hit || !hit.pickedPoint) {
    grounded = false;
    lastGroundDistance = 99;
    return false;
  }
  lastGroundDistance = origin.y - hit.pickedPoint.y;
  grounded = lastGroundDistance <= 1.62;
  return grounded;
}

function respawnFromFall() {
  const anchor = safeAnchors[currentZone];
  playerCollider.position.copyFrom(anchor);
  verticalVelocity = 0;
  health = Math.max(20, health - 12);
  updateHud();
  showMessage('ПРОПАСТЬ ОТБРОСИЛА ТЕБЯ НАЗАД', 1.5);
}

function updateMovement(dt: number, now: number) {
  let ix = moveX;
  let iy = moveY;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;

  ix = Math.max(-1, Math.min(1, ix));
  iy = Math.max(-1, Math.min(1, iy));
  const inputLength = Math.hypot(ix, iy);
  let moving = false;

  if (inputLength > 0.08) {
    moving = true;
    ix /= Math.max(1, inputLength);
    iy /= Math.max(1, inputLength);

    const camForward = new Vector3(Math.sin(camera.alpha), 0, Math.cos(camera.alpha));
    const camRight = new Vector3(camForward.z, 0, -camForward.x);
    const direction = camRight.scale(ix).add(camForward.scale(-iy)).normalize();
    const speed = guarding ? 2.45 : 5.65 * Math.min(1, Math.max(0.36, inputLength));
    playerCollider.moveWithCollisions(direction.scale(speed * dt));
    playerCollider.rotation.y = Math.atan2(direction.x, direction.z);
  }

  const onGround = detectGrounded();
  if (onGround && verticalVelocity <= 0) verticalVelocity = -0.35;
  else verticalVelocity = Math.max(-14, verticalVelocity - 20 * dt);
  playerCollider.moveWithCollisions(new Vector3(0, verticalVelocity * dt, 0));

  if (moving && grounded && now - lastFootstep > (guarding ? 520 : 390)) {
    lastFootstep = now;
    playAudio('step', Math.random() * 1.6 - 0.8);
  }

  if (playerCollider.position.y < -8) respawnFromFall();
  if (now - lastAttack > 540) setPlayerAnimation(moving ? 'Walk' : 'Idle');
}

function updateStory() {
  const zone = zoneFromPosition(playerCollider.position);
  if (zone !== currentZone) {
    currentZone = zone;
    updateZoneAudio(zone);
    updateHud();
    showMessage(zoneTitle(zone).toUpperCase(), 1.1);
  }

  if (!courtyardEncounterStarted && currentZone === 'courtyard') {
    courtyardEncounterStarted = true;
    phase = 'courtyard';
    spawnEncounter('ДВОР НЕ ПУСТ', [
      ['raider', new Vector3(-5, 2, -21)],
      ['raider', new Vector3(5, 2, -22)],
      ['brute', new Vector3(0, 2, -16)]
    ]);
    setObjective('Очисти двор хранителей');
  }

  if (courtyardEncounterStarted && !courtyardEncounterCleared && phase === 'courtyard' && enemies.length === 0) {
    courtyardEncounterCleared = true;
    phase = 'wings';
    setCombatMusic(false);
    setObjective('Верни Звёздный осколок и жар Пепельной кузни');
    showMessage('ДВА КРЫЛА. ДВЕ ЧАСТИ ПЕЧАТИ.', 2);
  }

  if (courtyardEncounterCleared && currentZone === 'archive' && !archiveEncounterStarted) {
    archiveEncounterStarted = true;
    spawnEncounter('АРХИВ ПРОСНУЛСЯ', [
      ['seer', new Vector3(-23, 4, -12)],
      ['raider', new Vector3(-16, 4, -7)],
      ['raider', new Vector3(-24, 4, -4)]
    ]);
    setObjective('Уничтожь стражей Архива');
  }

  if (archiveEncounterStarted && !archiveEncounterCleared && enemies.length === 0) {
    archiveEncounterCleared = true;
    setCombatMusic(false);
    setObjective('Забери Звёздный осколок у дальней святыни');
  }

  if (courtyardEncounterCleared && currentZone === 'forge' && !forgeEncounterStarted) {
    forgeEncounterStarted = true;
    spawnEncounter('КУЗНЯ ДЫШИТ ПЕПЛОМ', [
      ['brute', new Vector3(23, 4, -11)],
      ['raider', new Vector3(16, 4, -7)],
      ['seer', new Vector3(22, 4, -3)]
    ]);
    setObjective('Погаси пепельную охрану Кузни');
  }

  if (forgeEncounterStarted && !forgeEncounterCleared && enemies.length === 0) {
    forgeEncounterCleared = true;
    setCombatMusic(false);
    setObjective('Разожги жар у дальней святыни');
  }

  if (hasArchiveShard && hasForgeEmber && currentZone === 'bridge' && !bridgeEncounterStarted) {
    bridgeEncounterStarted = true;
    phase = 'bridge';
    spawnEncounter('НА МОСТЕ НЕКУДА ОТСТУПАТЬ', [
      ['raider', new Vector3(-2.4, 6, 10)],
      ['brute', new Vector3(1.8, 6, 15)],
      ['seer', new Vector3(0, 6, 20)]
    ]);
    setObjective('Прорви оборону Солнечного моста');
  }

  if (bridgeEncounterStarted && !bridgeEncounterCleared && enemies.length === 0) {
    bridgeEncounterCleared = true;
    setCombatMusic(false);
    phase = 'sanctum';
    setObjective('Поднимись в Верхнее святилище');
    showMessage('СТРАЖ ЖДЁТ НАВЕРХУ', 2);
  }

  if (bridgeEncounterCleared && currentZone === 'sanctum' && !bossStarted) {
    bossStarted = true;
    phase = 'boss';
    spawnEncounter('ПЕПЕЛ ПОМНИТ СВОЕГО КОРОЛЯ', [['boss', new Vector3(0, 8, 34)]]);
    setObjective('Победи Пепельного Стража');
    playAudio('boss');
    sanctumLight.intensity = 3.8;
  }
}

function updateContextButton() {
  const p = playerCollider.position;
  if (!hasArchiveShard && archiveEncounterCleared && Vector3.Distance(p, new Vector3(-20, 5.1, -2.5)) < 3.35) {
    relicButton.textContent = 'ВЗЯТЬ';
    relicButton.classList.add('context');
    return;
  }
  if (!hasForgeEmber && forgeEncounterCleared && Vector3.Distance(p, new Vector3(20, 5.1, -2.5)) < 3.35) {
    relicButton.textContent = 'РАЗЖЕЧЬ';
    relicButton.classList.add('context');
    return;
  }
  relicButton.classList.remove('context');
  relicButton.textContent = relicCharge >= 100 ? 'RELIC!' : `RELIC ${Math.floor(relicCharge)}%`;
}

function win() {
  phase = 'won';
  setCombatMusic(false);
  const ambience = audios.get('ambience');
  if (ambience) ambience.volume = 0.06;
  sanctumLight.intensity = 8;
  moon.intensity = 0.42;
  endingTitle.textContent = 'Цитадель снова видит солнце';
  endingCopy.textContent = 'Архив вернул память, Кузня — жар, а Солнечный мост связал их с реликтом. Пепельный Страж пал на вершине крепости, которую ты прошёл от ворот до святилища.';
  ending.hidden = false;
  setObjective('Ночь осады окончена');
}

function lose() {
  if (phase === 'lost' || phase === 'won') return;
  phase = 'lost';
  setCombatMusic(false);
  endingTitle.textContent = 'Пепел добрался до реликта';
  endingCopy.textContent = 'Последний хранитель пал. Путь к вершине уже открыт — следующая попытка начнётся у Внешних ворот.';
  ending.hidden = false;
  setObjective('Хранитель пал');
}

function publishTestState() {
  const livingEnemies = enemies.filter(enemy => !enemy.dead);
  (window as typeof window & { __AI_TEST_STATE__?: unknown }).__AI_TEST_STATE__ = {
    app: 'relic-siege',
    version: '2.0.0',
    currentScene: 'mountain-citadel-v2',
    phase,
    zone: currentZone,
    playerPosition: {
      x: +playerCollider.position.x.toFixed(2),
      y: +playerCollider.position.y.toFixed(2),
      z: +playerCollider.position.z.toFixed(2)
    },
    grounded,
    groundDistance: +lastGroundDistance.toFixed(2),
    hp: Math.max(0, +health.toFixed(1)),
    relicCharge: Math.round(relicCharge),
    activeEnemies: livingEnemies.length,
    groundedEnemies: livingEnemies.filter(enemy => enemy.grounded).length,
    archiveShard: hasArchiveShard,
    forgeEmber: hasForgeEmber,
    courtyardCleared: courtyardEncounterCleared,
    bridgeCleared: bridgeEncounterCleared,
    blenderWorldLoaded,
    worldCollisionCount,
    keeperLoaded,
    raiderLoaded,
    wardenLoaded,
    criticalAssetsReady: blenderWorldLoaded && keeperLoaded && raiderLoaded && wardenLoaded,
    assetErrors: [...assetErrors],
    playerAnimation: playerAnimationState,
    loadingState: worldReady ? (started ? 'ready' : 'awaiting-start') : 'loading-assets',
    fps: Math.round(engine.getFps())
  };
}

function buildFallbackLevel() {
  const pieces: Array<[string, Vector3, Vector3]> = [
    ['GateYard', new Vector3(0, -0.25, -43), new Vector3(8.5, 0.25, 10.5)],
    ['Courtyard', new Vector3(0, 1.75, -22), new Vector3(13.5, 0.25, 10)],
    ['Archive', new Vector3(-20, 3.75, -8), new Vector3(8.5, 0.25, 8.5)],
    ['Forge', new Vector3(20, 3.75, -8), new Vector3(8.5, 0.25, 8.5)],
    ['Approach', new Vector3(0, 4.75, -5), new Vector3(8, 0.25, 7)],
    ['Bridge', new Vector3(0, 5.75, 11), new Vector3(4.2, 0.25, 10.5)],
    ['Sanctum', new Vector3(0, 7.75, 31), new Vector3(13, 0.25, 11.5)]
  ];

  for (const [name, position, half] of pieces) {
    const floor = MeshBuilder.CreateBox(`COL_Fallback_${name}`, {
      width: half.x * 2,
      height: half.y * 2,
      depth: half.z * 2
    }, scene);
    floor.position.copyFrom(position);
    floor.material = fallbackStone;
    floor.visibility = 0.06;
    floor.checkCollisions = true;
    floor.isPickable = true;
  }

  const ramps: Array<[string, Vector3, Vector3, number]> = [
    ['GateRamp', new Vector3(0, 0.15, -33), new Vector3(0, 2, -29), 5.5],
    ['ArchiveRamp', new Vector3(-8.5, 2.05, -18), new Vector3(-14.2, 4.05, -11.5), 4],
    ['ForgeRamp', new Vector3(8.5, 2.05, -18), new Vector3(14.2, 4.05, -11.5), 4],
    ['ApproachRamp', new Vector3(0, 2.05, -12.5), new Vector3(0, 5.05, -10), 4.5],
    ['BridgeRamp', new Vector3(0, 5.05, 2), new Vector3(0, 6.05, 3), 3.8],
    ['SanctumRamp', new Vector3(0, 6.05, 21.5), new Vector3(0, 8.05, 24.5), 4.8]
  ];

  for (const [name, start, end, width] of ramps) {
    const delta = end.subtract(start);
    const length = Math.hypot(delta.x, delta.z);
    const ramp = MeshBuilder.CreateBox(`COL_Fallback_${name}`, { width, height: 0.38, depth: length }, scene);
    ramp.position = Vector3.Center(start, end).add(new Vector3(0, -0.14, 0));
    ramp.rotation.y = Math.atan2(delta.x, delta.z);
    ramp.rotation.x = -Math.atan2(delta.y, Math.max(0.001, length));
    ramp.material = fallbackStone;
    ramp.visibility = 0.06;
    ramp.checkCollisions = true;
    ramp.isPickable = true;
  }
}

function rootMeshOf(meshes: AbstractMesh[]) {
  return meshes.find(mesh => mesh.parent === null) ?? meshes[0] ?? null;
}

async function loadAuthoredAssets() {
  startButton.disabled = true;
  startButton.textContent = 'ЗАГРУЗКА ЦИТАДЕЛИ…';

  try {
    const world = await SceneLoader.ImportMeshAsync('', './models/', 'relic-fortress.glb', scene);
    world.meshes.forEach(mesh => {
      if (isCollisionMesh(mesh)) {
        mesh.visibility = 0;
        mesh.checkCollisions = true;
        mesh.isPickable = true;
        worldCollisionCount += 1;
      } else {
        mesh.receiveShadows = true;
      }
    });
    blenderWorldLoaded = worldCollisionCount >= 7;
    if (!blenderWorldLoaded) {
      assetErrors.push('world-collision-proxies-missing');
      buildFallbackLevel();
    }
  } catch (error) {
    console.warn('[RELIC SIEGE 2] Blender world unavailable; emergency route enabled.', error);
    assetErrors.push('world-load-failed');
    buildFallbackLevel();
  }

  try {
    const keeper = await SceneLoader.ImportMeshAsync('', './models/', 'keeper.glb', scene);
    playerVisual = rootMeshOf(keeper.meshes);
    if (!playerVisual) throw new Error('keeper-root-missing');
    playerVisual.parent = playerMount;
    playerVisual.position.set(0, 0.55, 0);
    playerVisual.scaling.setAll(0.72);
    keeper.meshes.forEach(mesh => shadowGenerator.addShadowCaster(mesh));
    playerAnimationGroups = keeper.animationGroups;
    fallbackKeeper.setEnabled(false);
    keeperLoaded = true;
    setPlayerAnimation('Idle');
  } catch (error) {
    console.warn('[RELIC SIEGE 2] Keeper GLB unavailable; fallback keeper remains.', error);
    assetErrors.push('keeper-load-failed');
  }

  try {
    const raider = await SceneLoader.ImportMeshAsync('', './models/', 'ash-raider.glb', scene);
    raiderTemplate = rootMeshOf(raider.meshes);
    if (!raiderTemplate) throw new Error('raider-root-missing');
    raiderTemplate.setEnabled(false);
    raiderAnimationGroups = raider.animationGroups;
    raiderAnimationGroups.forEach(group => {
      if (group.name.toLowerCase().includes('stalk')) group.start(true, 1, group.from, group.to, false);
      else group.stop();
    });
    raiderLoaded = true;
  } catch (error) {
    console.warn('[RELIC SIEGE 2] Raider GLB unavailable; procedural enemies remain.', error);
    assetErrors.push('raider-load-failed');
  }

  try {
    const warden = await SceneLoader.ImportMeshAsync('', './models/', 'ash-warden.glb', scene);
    wardenTemplate = rootMeshOf(warden.meshes);
    if (!wardenTemplate) throw new Error('warden-root-missing');
    wardenTemplate.setEnabled(false);
    wardenAnimationGroups = warden.animationGroups;
    wardenAnimationGroups.forEach(group => group.stop());
    wardenLoaded = true;
  } catch (error) {
    console.warn('[RELIC SIEGE 2] Warden GLB unavailable; procedural boss remains.', error);
    assetErrors.push('warden-load-failed');
  }

  worldReady = true;
  phase = 'gate';
  startButton.disabled = false;
  startButton.textContent = blenderWorldLoaded ? 'ВОЙТИ ВО ВНЕШНИЕ ВОРОТА' : 'ВОЙТИ В РЕЗЕРВНУЮ ГЕОМЕТРИЮ';
  publishTestState();
}

void loadAuthoredAssets();

startButton.addEventListener('click', () => {
  if (started || !worldReady) return;
  started = true;
  phase = 'gate';
  playerCollider.position.copyFrom(safeAnchors.gate);
  startPanel.hidden = true;
  hud.classList.add('active');
  setObjective('Пройди через Внешние ворота во двор хранителей');
  showMessage('НОЧЬ ПЕПЛА // ПОСЛЕДНИЙ ХРАНИТЕЛЬ', 2.5);
  updateHud();
  updateZoneAudio('gate');
  playAudio('theme');
  playAudio('ambience');
});

restartButton.addEventListener('click', () => location.reload());

let previous = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.045, Math.max(0, (now - previous) / 1000));
  previous = now;

  if (started && phase !== 'won' && phase !== 'lost') {
    updateMovement(dt, now);
    enemies.forEach(enemy => updateEnemy(enemy, dt, now));
    enemies = enemies.filter(enemy => !enemy.dead);
    updateProjectiles(dt, now);
    updateStory();
    updateContextButton();

    if (bossStarted && phase === 'boss' && !enemies.some(enemy => enemy.kind === 'boss' && !enemy.dead)) win();

    if (messageTimer && now > messageTimer) {
      message.classList.remove('show');
      messageTimer = 0;
    }

    const cameraTarget = playerCollider.position.add(new Vector3(0, 0.72, 0));
    camera.setTarget(Vector3.Lerp(camera.target, cameraTarget, Math.min(1, dt * 7.5)));
  }

  updateHud();
  publishTestState();
  scene.render();
});

window.addEventListener('resize', () => engine.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audios.get('theme')?.pause();
    audios.get('combat')?.pause();
    audios.get('ambience')?.pause();
    return;
  }
  if (started && phase !== 'lost' && phase !== 'won') {
    playAudio('theme');
    playAudio('ambience');
    if (enemies.length) setCombatMusic(true);
  }
});
