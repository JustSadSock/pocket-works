import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

type Phase = 'intro' | 'pylons' | 'wave' | 'boss' | 'won' | 'lost';
type Enemy = { mesh: TransformNode; hp: number; speed: number; hitAt: number; boss: boolean };

type Pylon = {
  position: Vector3;
  root: TransformNode;
  core: Mesh;
  ring: Mesh;
  light: PointLight;
  active: boolean;
};

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
const startPanel = document.querySelector<HTMLElement>('#startPanel')!;
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const healthBar = document.querySelector<HTMLElement>('#healthBar')!;
const objective = document.querySelector<HTMLElement>('#objective')!;
const pylonCount = document.querySelector<HTMLElement>('#pylonCount')!;
const message = document.querySelector<HTMLElement>('#message')!;
const joystick = document.querySelector<HTMLElement>('#joystick')!;
const stick = document.querySelector<HTMLElement>('#stick')!;
const lookZone = document.querySelector<HTMLElement>('#lookZone')!;
const actionButton = document.querySelector<HTMLButtonElement>('#actionButton')!;
const ending = document.querySelector<HTMLElement>('#ending')!;
const endingTitle = document.querySelector<HTMLElement>('#endingTitle')!;
const endingCopy = document.querySelector<HTMLElement>('#endingCopy')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restartButton')!;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: true });
engine.setHardwareScalingLevel(Math.max(1, Math.min(1.6, window.devicePixelRatio > 2 ? 1.35 : 1)));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.045, 0.038, 0.055, 1);
scene.ambientColor = new Color3(0.2, 0.17, 0.22);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.018;
scene.fogColor = new Color3(0.08, 0.065, 0.09);

const camera = new ArcRotateCamera('camera', Math.PI * 1.5, 1.06, 12.5, new Vector3(0, 1.8, 0), scene);
camera.lowerRadiusLimit = 9;
camera.upperRadiusLimit = 15;
camera.lowerBetaLimit = 0.72;
camera.upperBetaLimit = 1.32;
camera.fov = 0.9;
camera.inputs.clear();

const hemi = new HemisphericLight('moon', new Vector3(0.1, 1, -0.35), scene);
hemi.intensity = 0.52;
hemi.diffuse = new Color3(0.5, 0.56, 0.72);
hemi.groundColor = new Color3(0.16, 0.09, 0.08);
const sun = new DirectionalLight('relic-light', new Vector3(-0.4, -1, 0.2), scene);
sun.position = new Vector3(12, 24, -10);
sun.intensity = 1.35;
sun.diffuse = new Color3(1, 0.57, 0.24);

function mat(name: string, diffuse: Color3, emissive = Color3.Black(), rough = 0.9) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.specularColor = new Color3(0.06 + (1 - rough) * 0.15, 0.06, 0.05);
  return material;
}

const stone = mat('basalt', new Color3(0.16, 0.135, 0.15));
const darkStone = mat('dark-basalt', new Color3(0.075, 0.065, 0.075));
const gold = mat('sun-metal', new Color3(0.52, 0.31, 0.13), new Color3(0.05, 0.015, 0));
const ember = mat('ember', new Color3(0.72, 0.22, 0.08), new Color3(0.55, 0.08, 0.015));
const litGold = mat('lit-gold', new Color3(0.92, 0.55, 0.18), new Color3(0.9, 0.33, 0.05));
const ashMat = mat('ash', new Color3(0.12, 0.1, 0.13), new Color3(0.09, 0.025, 0.02));
const robeMat = mat('robe', new Color3(0.17, 0.19, 0.22));

// Runtime collision/gameplay foundation. Blender adds authored detail over this layer.
const floor = MeshBuilder.CreateCylinder('arena-floor', { diameter: 39, height: 1.2, tessellation: 48 }, scene);
floor.position.y = -0.65;
floor.material = stone;
const altar = MeshBuilder.CreateCylinder('altar', { diameter: 5.3, height: 0.75, tessellation: 12 }, scene);
altar.position.y = 0.38;
altar.material = darkStone;
const altarRing = MeshBuilder.CreateTorus('altar-ring', { diameter: 4.2, thickness: 0.13, tessellation: 32 }, scene);
altarRing.rotation.x = Math.PI / 2;
altarRing.position.y = 0.82;
altarRing.material = gold;
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const buttress = MeshBuilder.CreateBox(`buttress-${i}`, { width: 2.2, height: 2.4 + (i % 3) * 0.55, depth: 3.8 }, scene);
  buttress.position = new Vector3(Math.cos(a) * 18.5, 0.7, Math.sin(a) * 18.5);
  buttress.rotation.y = -a + Math.PI / 2;
  buttress.material = darkStone;
}

const playerRoot = new TransformNode('keeper', scene);
playerRoot.position = new Vector3(0, 0, -2.8);
const body = MeshBuilder.CreateCapsule('keeper-body', { height: 2.15, radius: 0.42, tessellation: 10 }, scene);
body.parent = playerRoot;
body.position.y = 1.08;
body.material = robeMat;
const hood = MeshBuilder.CreateSphere('keeper-hood', { diameter: 0.82, segments: 10 }, scene);
hood.parent = playerRoot;
hood.position.y = 2.03;
hood.material = darkStone;
const staff = MeshBuilder.CreateCylinder('keeper-staff', { diameter: 0.11, height: 2.5, tessellation: 8 }, scene);
staff.parent = playerRoot;
staff.position.set(0.62, 1.25, 0.1);
staff.rotation.z = -0.12;
staff.material = gold;
const staffCore = MeshBuilder.CreateSphere('keeper-staff-core', { diameter: 0.34, segments: 8 }, scene);
staffCore.parent = playerRoot;
staffCore.position.set(0.62, 2.54, 0.1);
staffCore.material = litGold;

const pylonPositions = [new Vector3(0, 0, 12), new Vector3(10.4, 0, -6), new Vector3(-10.4, 0, -6)];
const pylons: Pylon[] = pylonPositions.map((position, index) => {
  const root = new TransformNode(`pylon-${index + 1}`, scene);
  root.position.copyFrom(position);
  const plinth = MeshBuilder.CreateCylinder(`pylon-plinth-${index}`, { diameter: 3.1, height: 0.65, tessellation: 10 }, scene);
  plinth.parent = root;
  plinth.position.y = 0.32;
  plinth.material = darkStone;
  const core = MeshBuilder.CreateCylinder(`pylon-core-${index}`, { diameterTop: 0.44, diameterBottom: 0.88, height: 3.7, tessellation: 6 }, scene);
  core.parent = root;
  core.position.y = 2.3;
  core.material = ember;
  const ring = MeshBuilder.CreateTorus(`pylon-ring-${index}`, { diameter: 2, thickness: 0.09, tessellation: 28 }, scene);
  ring.parent = root;
  ring.position.y = 2.55;
  ring.rotation.x = Math.PI / 2;
  ring.material = gold;
  const light = new PointLight(`pylon-light-${index}`, new Vector3(position.x, 2.8, position.z), scene);
  light.diffuse = new Color3(1, 0.28, 0.06);
  light.intensity = 0.45;
  light.range = 7;
  return { position, root, core, ring, light, active: false };
});

const relicLight = new PointLight('central-relic-light', new Vector3(0, 3.5, 0), scene);
relicLight.diffuse = new Color3(1, 0.56, 0.18);
relicLight.intensity = 0.5;
relicLight.range = 14;

let phase: Phase = 'intro';
let health = 100;
let activePylons = 0;
let waveIndex = 0;
let enemies: Enemy[] = [];
let started = false;
let lastStrike = -9999;
let messageTimer = 0;
let guardianAsset: TransformNode | null = null;
let guardianAnimations: { start: (loop?: boolean) => unknown; stop: () => unknown; name: string }[] = [];
let blenderWorldLoaded = false;
let guardianLoaded = false;

const audioFiles = {
  theme: './audio/generated/theme.ogg',
  wind: './audio/generated/wind.ogg',
  strike: './audio/generated/strike.ogg',
  pylon: './audio/generated/pylon.ogg',
  hit: './audio/generated/hit.ogg',
  boss: './audio/generated/boss.ogg'
};
const audios = new Map<string, HTMLAudioElement>();
for (const [name, src] of Object.entries(audioFiles)) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = name === 'theme' ? 0.28 : name === 'wind' ? 0.2 : 0.48;
  if (name === 'theme' || name === 'wind') audio.loop = true;
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
  shot.volume = Math.max(0, Math.min(1, base.volume * (0.92 + variation * 0.08)));
  shot.playbackRate = Math.max(0.86, Math.min(1.15, 1 + variation * 0.05));
  void shot.play().catch(() => {});
}

function showMessage(text: string, seconds = 2.2) {
  message.textContent = text;
  message.classList.add('show');
  messageTimer = performance.now() + seconds * 1000;
}

function setObjective(text: string) { objective.textContent = text; }
function updateHud() {
  healthBar.style.width = `${Math.max(0, health)}%`;
  pylonCount.textContent = `${activePylons} / 3`;
}

function nearestInactivePylon() {
  let best: Pylon | null = null;
  let distance = Infinity;
  for (const pylon of pylons) {
    if (pylon.active) continue;
    const d = Vector3.Distance(playerRoot.position, pylon.position);
    if (d < distance) { distance = d; best = pylon; }
  }
  return { pylon: best, distance };
}

function makeEnemy(position: Vector3, boss = false): Enemy {
  const root = new TransformNode(boss ? 'ash-warden-runtime' : 'ash-raider', scene);
  root.position.copyFrom(position);
  const torso = MeshBuilder.CreatePolyhedron(`enemy-body-${Math.random()}`, { type: boss ? 2 : 1, size: boss ? 1.3 : 0.7 }, scene);
  torso.parent = root;
  torso.position.y = boss ? 1.7 : 1.05;
  torso.scaling.y = boss ? 1.45 : 1.25;
  torso.material = boss ? ember : ashMat;
  const head = MeshBuilder.CreateSphere(`enemy-head-${Math.random()}`, { diameter: boss ? 0.72 : 0.46, segments: 7 }, scene);
  head.parent = root;
  head.position.y = boss ? 3.15 : 1.95;
  head.material = boss ? litGold : ember;
  if (boss && guardianAsset) {
    torso.setEnabled(false);
    head.setEnabled(false);
    guardianAsset.position.copyFrom(position);
    guardianAsset.setEnabled(true);
    root.parent = guardianAsset;
    root.position.set(0, 0, 0);
    guardianAnimations[0]?.start(true);
  }
  return { mesh: root, hp: boss ? 12 : 2, speed: boss ? 1.55 : 2 + Math.random() * 0.6, hitAt: 0, boss };
}

function spawnWave(count: number) {
  phase = 'wave';
  enemies.forEach(e => e.mesh.dispose());
  enemies = [];
  const ring = 14.5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + waveIndex * 0.43;
    enemies.push(makeEnemy(new Vector3(Math.cos(a) * ring, 0, Math.sin(a) * ring)));
  }
  setObjective(`Волна ${waveIndex}: уничтожь пепельных стражей (${count})`);
  showMessage(`ПЕПЕЛ ПОДНЯЛСЯ — ВОЛНА ${waveIndex}`, 1.8);
}

function spawnBoss() {
  phase = 'boss';
  const boss = makeEnemy(new Vector3(0, 0, 10.5), true);
  enemies = [boss];
  setObjective('Победи Пепельного Стража');
  showMessage('ПЕПЕЛ ПОМНИТ СВОЕГО СТРАЖА', 2.8);
  playAudio('boss');
}

function activatePylon(pylon: Pylon) {
  if (pylon.active || enemies.length > 0 || phase === 'boss') return;
  pylon.active = true;
  activePylons += 1;
  pylon.core.material = litGold;
  pylon.ring.material = litGold;
  pylon.light.diffuse = new Color3(1, 0.63, 0.2);
  pylon.light.intensity = 2.2;
  playAudio('pylon');
  updateHud();
  showMessage(`ОБЕЛИСК ${activePylons} ЗАЖЖЁН`, 1.6);
  waveIndex = activePylons;
  setTimeout(() => spawnWave(3 + waveIndex), 700);
}

function win() {
  phase = 'won';
  enemies.forEach(e => e.mesh.dispose());
  enemies = [];
  relicLight.intensity = 8;
  sun.intensity = 3;
  sun.diffuse = new Color3(1, 0.74, 0.4);
  endingTitle.textContent = 'Цитадель проснулась';
  endingCopy.textContent = 'Три обелиска снова связаны. Пепельный Страж рассыпается, и солнечный реликт впервые за столетие пробивает бурю золотым светом.';
  ending.hidden = false;
  setObjective('Осада окончена');
}

function lose() {
  if (phase === 'lost' || phase === 'won') return;
  phase = 'lost';
  endingTitle.textContent = 'Реликт погас';
  endingCopy.textContent = 'Пепел добрался до алтаря раньше рассвета. Но цитадель помнит путь — попробуй зажечь обелиски снова.';
  ending.hidden = false;
  setObjective('Хранитель пал');
}

function strike() {
  if (!started || phase === 'won' || phase === 'lost') return;
  const now = performance.now();
  if (now - lastStrike < 430) return;
  const near = nearestInactivePylon();
  if (enemies.length === 0 && near.pylon && near.distance < 3.25 && phase !== 'boss') {
    activatePylon(near.pylon);
    return;
  }
  lastStrike = now;
  playAudio('strike', Math.random() * 2 - 1);
  const forward = new Vector3(Math.sin(playerRoot.rotation.y), 0, Math.cos(playerRoot.rotation.y));
  const pulse = MeshBuilder.CreateTorus(`pulse-${now}`, { diameter: 1.6, thickness: 0.08, tessellation: 24 }, scene);
  pulse.position = playerRoot.position.add(new Vector3(0, 0.65, 0));
  pulse.rotation.x = Math.PI / 2;
  pulse.material = litGold;
  const born = performance.now();
  const obs = scene.onBeforeRenderObservable.add(() => {
    const t = Math.min(1, (performance.now() - born) / 260);
    pulse.scaling.setAll(1 + t * 3.6);
    pulse.visibility = 1 - t;
    if (t >= 1) { scene.onBeforeRenderObservable.remove(obs); pulse.dispose(); }
  });
  for (const enemy of enemies) {
    const offset = enemy.mesh.getAbsolutePosition().subtract(playerRoot.position);
    offset.y = 0;
    const d = offset.length();
    const facing = d < 0.01 ? 1 : Vector3.Dot(forward, offset.normalize());
    if (d < 4.7 && (d < 2.4 || facing > -0.1)) {
      enemy.hp -= 1;
      enemy.mesh.position.addInPlace(offset.normalize().scale(0.7));
      playAudio('hit', Math.random() * 2 - 1);
    }
  }
}

actionButton.addEventListener('pointerdown', (event) => { event.preventDefault(); strike(); });

let movePointer: number | null = null;
let moveX = 0;
let moveY = 0;
function updateJoystick(clientX: number, clientY: number) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
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
joystick.addEventListener('pointermove', event => { if (event.pointerId === movePointer) updateJoystick(event.clientX, event.clientY); });
function resetMove(event?: PointerEvent) {
  if (event && movePointer !== null && event.pointerId !== movePointer) return;
  movePointer = null; moveX = 0; moveY = 0; stick.style.transform = 'translate(-50%, -50%)';
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
  camera.alpha -= dx * 0.007;
  camera.beta = Math.max(0.72, Math.min(1.32, camera.beta + dy * 0.0045));
});
const clearLook = (event: PointerEvent) => { if (event.pointerId === lookPointer) lookPointer = null; };
lookZone.addEventListener('pointerup', clearLook);
lookZone.addEventListener('pointercancel', clearLook);

const keys = new Set<string>();
window.addEventListener('keydown', event => {
  keys.add(event.code);
  if (event.code === 'Space') { event.preventDefault(); strike(); }
});
window.addEventListener('keyup', event => keys.delete(event.code));

function updateActionHint() {
  const near = nearestInactivePylon();
  const canChannel = enemies.length === 0 && near.pylon && near.distance < 3.25 && phase !== 'boss';
  actionButton.textContent = canChannel ? 'IGNITE' : 'RELIC';
  actionButton.classList.toggle('channel', Boolean(canChannel));
}

function updateGame(dt: number, now: number) {
  if (!started || phase === 'won' || phase === 'lost') return;
  let ix = moveX;
  let iy = moveY;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
  ix = Math.max(-1, Math.min(1, ix));
  iy = Math.max(-1, Math.min(1, iy));
  const inputLength = Math.hypot(ix, iy);
  if (inputLength > 0.08) {
    ix /= Math.max(1, inputLength);
    iy /= Math.max(1, inputLength);
    const camForward = new Vector3(Math.sin(camera.alpha), 0, Math.cos(camera.alpha));
    const camRight = new Vector3(camForward.z, 0, -camForward.x);
    const movement = camRight.scale(ix).add(camForward.scale(-iy));
    const speed = 5.4;
    playerRoot.position.addInPlace(movement.scale(speed * dt));
    const r = Math.hypot(playerRoot.position.x, playerRoot.position.z);
    if (r > 16.8) {
      playerRoot.position.x *= 16.8 / r;
      playerRoot.position.z *= 16.8 / r;
    }
    playerRoot.rotation.y = Math.atan2(movement.x, movement.z);
  }

  for (const enemy of enemies) {
    const pos = enemy.mesh.getAbsolutePosition();
    const toPlayer = playerRoot.position.subtract(pos);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    if (distance > 1.25) {
      const delta = toPlayer.normalize().scale(enemy.speed * dt);
      enemy.mesh.position.addInPlace(delta);
      if (!enemy.boss) enemy.mesh.rotation.y = Math.atan2(delta.x, delta.z);
    } else if (now > enemy.hitAt) {
      enemy.hitAt = now + (enemy.boss ? 650 : 900);
      health -= enemy.boss ? 14 : 8;
      updateHud();
      playAudio('hit', -0.7);
      if (health <= 0) lose();
    }
  }

  const dead = enemies.filter(enemy => enemy.hp <= 0);
  for (const enemy of dead) {
    if (enemy.boss && guardianAsset) guardianAsset.setEnabled(false);
    enemy.mesh.dispose();
  }
  if (dead.length) enemies = enemies.filter(enemy => enemy.hp > 0);

  if (phase === 'wave' && enemies.length === 0) {
    if (activePylons < 3) {
      phase = 'pylons';
      const next = activePylons + 1;
      setObjective(`Найди и зажги обелиск ${next}`);
      showMessage('ПУТЬ К СЛЕДУЮЩЕМУ ОБЕЛИСКУ ОТКРЫТ', 1.8);
    } else {
      spawnBoss();
    }
  } else if (phase === 'boss' && enemies.length === 0) {
    win();
  }

  for (const pylon of pylons) {
    pylon.ring.rotation.y += dt * (pylon.active ? 1.4 : 0.35);
    if (pylon.active) pylon.core.rotation.y += dt * 0.45;
  }
  altarRing.rotation.z += dt * (0.08 + activePylons * 0.05);
  relicLight.intensity = 0.55 + activePylons * 0.8 + Math.sin(now * 0.003) * 0.12;
  if (messageTimer && now > messageTimer) { message.classList.remove('show'); messageTimer = 0; }
  updateActionHint();

  const target = playerRoot.position.add(new Vector3(0, 1.45, 0));
  camera.setTarget(Vector3.Lerp(camera.target, target, Math.min(1, dt * 7)));

  (window as any).__AI_TEST_STATE__ = {
    app: 'relic-siege',
    currentScene: 'citadel',
    phase,
    playerPosition: { x: +playerRoot.position.x.toFixed(2), y: 0, z: +playerRoot.position.z.toFixed(2) },
    grounded: true,
    hp: Math.max(0, health),
    activeEnemies: enemies.length,
    pylons: activePylons,
    blenderWorldLoaded,
    guardianLoaded,
    loadingState: started ? 'ready' : 'awaiting-start',
    fps: Math.round(engine.getFps())
  };
}

startButton.addEventListener('click', () => {
  if (started) return;
  started = true;
  phase = 'pylons';
  startPanel.hidden = true;
  hud.classList.add('active');
  setObjective('Найди и зажги обелиск 1');
  showMessage('ТРИ ОБЕЛИСКА. ОДНА НОЧЬ.', 2.4);
  updateHud();
  playAudio('theme');
  playAudio('wind');
});
restartButton.addEventListener('click', () => location.reload());

async function loadAuthoredAssets() {
  try {
    await SceneLoader.ImportMeshAsync('', './models/', 'relic-fortress.glb', scene);
    blenderWorldLoaded = true;
  } catch (error) {
    console.warn('[RELIC SIEGE] Blender fortress unavailable; runtime foundation remains playable.', error);
  }
  try {
    const result = await SceneLoader.ImportMeshAsync('', './models/', 'ash-warden.glb', scene);
    const root = result.meshes[0] as unknown as TransformNode;
    guardianAsset = root;
    root.setEnabled(false);
    guardianAnimations = result.animationGroups as unknown as typeof guardianAnimations;
    guardianLoaded = true;
  } catch (error) {
    console.warn('[RELIC SIEGE] Blender warden unavailable; runtime boss fallback enabled.', error);
  }
}
void loadAuthoredAssets();

let previous = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  updateGame(dt, now);
  scene.render();
});
window.addEventListener('resize', () => engine.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audios.get('theme')?.pause();
    audios.get('wind')?.pause();
  } else if (started && phase !== 'lost' && phase !== 'won') {
    playAudio('theme');
    playAudio('wind');
  }
});
