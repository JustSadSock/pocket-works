import {
  Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, MeshBuilder, ParticleSystem,
  PointLight, Scene, SceneLoader, ShadowGenerator, StandardMaterial, Texture, TransformNode, UniversalCamera, Vector3
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyStoryEvent, clamp, createRun, damp, nearestInteractable, qualityProfile, ringSolved, stageFor } from './core.js';
import { createInput } from './input.js';
import { createBellforgeAudio } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#renderCanvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('BELLFORGE canvas missing');

const ui = {
  loading: $('#loadingPanel'), loadingTitle: $('#loadingTitle'), loadingText: $('#loadingText'), loadingBar: $('#loadingBar'), loadingPercent: $('#loadingPercent'),
  error: $('#errorPanel'), errorText: $('#errorText'), retry: $('#retryButton'), chapter: $('#chapterLabel'), objective: $('#objectiveText'), subtitle: $('#subtitle'),
  locationCard: $('#locationCard'), locationName: $('#locationName'), joystick: $('#joystick'), knob: $('#joystickKnob'), lookZone: $('#lookZone'),
  action: $('#actionButton'), actionGlyph: $('#actionGlyph'), actionLabel: $('#actionLabel'), actionHint: $('#actionHint'), sound: $('#soundButton'),
  puzzle: $('#puzzlePanel'), puzzleTitle: $('#puzzleTitle'), closePuzzle: $('#closePuzzle'), ringButtons: [...document.querySelectorAll('.ring-button')],
  ringValues: [$('#ring0'), $('#ring1'), $('#ring2')], choice: $('#choicePanel'), ringChoice: $('#ringChoice'), silenceChoice: $('#silenceChoice'),
  finish: $('#finishPanel'), finishTitle: $('#finishTitle'), finishText: $('#finishText'), restart: $('#restartButton'), fade: $('#sceneFade')
};

const RUN_KEY = 'pocket-works:bellforge-last-chime:run';
const SETTINGS_KEY = 'pocket-works:bellforge-last-chime:settings';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
let run = createRun(read(RUN_KEY, {}));
const settings = read(SETTINGS_KEY, { muted: false });
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const quality = qualityProfile(navigator.hardwareConcurrency || 4, Math.min(innerWidth, innerHeight));
const audio = createBellforgeAudio();
audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality.tier !== 'low', stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(Math.min(2, Math.max(1, devicePixelRatio * (quality.scale / 2))));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.055, 0.085, 0.095, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.17, 0.22, 0.21);
scene.fogDensity = quality.tier === 'low' ? 0.007 : 0.0052;
scene.collisionsEnabled = true;
scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.exposure = 1.06;
scene.imageProcessingConfiguration.contrast = 1.16;

const stageCheckpoint = (stage = run.stage) => ({
  arrival:[0,2,-58], market:[0,2,-33], foundry:[0,2,-20], archive:[0,2,18],
  chase:[0,2,24], tower:[0,2,38], ascent:[0,2,45], finale:[0,9,57], complete:[0,9,57]
}[stage] || [0,2,-58]);

const camera = new UniversalCamera('MaraCamera', new Vector3(...stageCheckpoint()), scene);
camera.inputs.clear();
camera.minZ = 0.06;
camera.maxZ = 320;
camera.fov = 0.9;
camera.checkCollisions = true;
camera.applyGravity = true;
camera.ellipsoid = new Vector3(0.36, 0.82, 0.36);
camera.ellipsoidOffset = new Vector3(0, -0.05, 0);
camera.inertia = 0;
scene.activeCamera = camera;
scene.gravity = new Vector3(0, -0.42, 0);

const hemi = new HemisphericLight('SkyFill', new Vector3(-0.25, 1, 0.15), scene);
hemi.intensity = 0.58;
hemi.diffuse = new Color3(0.48, 0.58, 0.55);
hemi.groundColor = new Color3(0.08, 0.06, 0.045);
const sun = new DirectionalLight('DuskSun', new Vector3(-0.52, -0.82, 0.34), scene);
sun.position.set(34, 54, -42);
sun.intensity = 1.28;
sun.diffuse = new Color3(1, 0.72, 0.46);
const shadows = new ShadowGenerator(quality.shadows, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.0015;
shadows.normalBias = 0.02;
const glow = new GlowLayer('ResonanceGlow', scene, { blurKernelSize: quality.tier === 'high' ? 48 : 28 });
glow.intensity = 0.5;

const lampLights = [
  new PointLight('MarketLamp', new Vector3(-4, 4.5, -28), scene),
  new PointLight('FoundryLamp', new Vector3(5, 4.2, 14), scene),
  new PointLight('TowerLamp', new Vector3(0, 8, 44), scene)
];
lampLights.forEach((light, index) => {
  light.diffuse = index === 2 ? new Color3(0.45, 0.95, 0.83) : new Color3(1, 0.52, 0.22);
  light.intensity = 0.22;
  light.range = quality.tier === 'low' ? 13 : 18;
  if (quality.tier === 'low' && index === 0) light.setEnabled(false);
});

const input = createInput({ canvas, joystick: ui.joystick, knob: ui.knob, lookZone: ui.lookZone, actionButton: ui.action });
canvas.addEventListener('pointerdown', () => audio.ensure(), { once: true, passive: true });

let subtitleTimer = 0;
let locationTimer = 0;
let activeInteraction = null;
let puzzleMode = null;
let freezePlayer = false;
let lastStep = 0;
let chaseStarted = false;
let chaseGrace = 0;
let rescueCooldown = 0;
let warden = null;
let liftRide = null;
let bellStrike = 0;
const named = new Map();
const npc = {};
const dynamic = { slowGears:[], fastGears:[], fans:[], pendulums:[], flags:[] };

function loading(percent, title, text) {
  ui.loadingBar.style.width = `${percent}%`;
  ui.loadingPercent.textContent = `${percent}%`;
  ui.loadingTitle.textContent = title;
  ui.loadingText.textContent = text;
}
function persist() { write(RUN_KEY, run); }
function subtitle(text, ms = 2600) {
  ui.subtitle.textContent = text;
  ui.subtitle.classList.add('show');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => ui.subtitle.classList.remove('show'), ms);
}
function showLocation(name) {
  ui.locationName.textContent = name;
  ui.locationCard.classList.add('show');
  clearTimeout(locationTimer);
  locationTimer = setTimeout(() => ui.locationCard.classList.remove('show'), 1800);
}
function pulse(pattern = 18) { if (navigator.vibrate) navigator.vibrate(pattern); }
function syncSound() {
  ui.sound.textContent = settings.muted ? 'MUTED' : 'SOUND';
  ui.sound.classList.toggle('muted', settings.muted);
}
function syncStoryUI() {
  const stage = stageFor(run);
  ui.chapter.textContent = stage.chapter;
  ui.objective.textContent = stage.objective;
}
function advance(event) {
  const before = run.stage;
  run = applyStoryEvent(run, event);
  if (run.stage !== before) {
    persist();
    syncStoryUI();
    pulse([18,36,18]);
  }
}
function fadeTransition(callback) {
  ui.fade.classList.add('on');
  setTimeout(() => {
    callback();
    requestAnimationFrame(() => ui.fade.classList.remove('on'));
  }, reduced ? 10 : 440);
}

ui.retry.onclick = () => location.reload();
ui.sound.onclick = () => {
  settings.muted = !settings.muted;
  audio.ensure();
  audio.setMuted(settings.muted);
  write(SETTINGS_KEY, settings);
  syncSound();
};
ui.restart.onclick = () => {
  write(RUN_KEY, { stage:'arrival', marketAligned:[0,0,0], pressure:0, towerAligned:[0,0,0], choice:null, completedRuns:run.completedRuns });
  location.reload();
};
syncSound();
syncStoryUI();

function fallbackMaterial(name, color, emissive = null) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.08,0.07,0.06);
  material.specularPower = 24;
  if (emissive) material.emissiveColor = emissive;
  return material;
}
const fallbackMats = {
  stone:fallbackMaterial('FallbackStone',new Color3(0.36,0.29,0.23)),
  plaster:fallbackMaterial('FallbackPlaster',new Color3(0.67,0.35,0.22)),
  copper:fallbackMaterial('FallbackCopper',new Color3(0.23,0.48,0.45)),
  wood:fallbackMaterial('FallbackWood',new Color3(0.22,0.12,0.07)),
  glow:fallbackMaterial('FallbackGlow',new Color3(0.18,0.58,0.52),new Color3(0.08,0.42,0.36))
};
function box(name, pos, size, material, collision = true) {
  const mesh = MeshBuilder.CreateBox(name, { width:size[0], height:size[1], depth:size[2] }, scene);
  mesh.position.set(...pos);
  mesh.material = material;
  mesh.checkCollisions = collision;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  return mesh;
}
function buildFallbackCity() {
  box('FallbackRoad',[0,-0.4,4],[11,0.8,138],fallbackMats.stone,true);
  box('FallbackWestRail',[-5.45,1.0,4],[0.25,2,138],fallbackMats.copper,true);
  box('FallbackEastRail',[5.45,1.0,4],[0.25,2,138],fallbackMats.copper,true);
  for (let i=0;i<14;i++) {
    const z=-53+i*9.5, side=i%2?-1:1, h=5+(i%4)*1.4;
    box(`FallbackHouse${i}`,[side*7.8,h/2-0.2,z],[4.2,h,7],i%3===0?fallbackMats.plaster:fallbackMats.stone,true);
  }
  box('FallbackMarketArchL',[-4.2,2.4,-22],[1.1,4.8,1],fallbackMats.copper,true);
  box('FallbackMarketArchR',[4.2,2.4,-22],[1.1,4.8,1],fallbackMats.copper,true);
  box('FallbackMarketArchTop',[0,4.5,-22],[9.5,0.8,1],fallbackMats.copper,false);
  box('FallbackFoundry',[7.8,3,14],[4.4,6,9],fallbackMats.plaster,true);
  box('FallbackTowerWest',[-4.5,7,48],[1.0,14,13],fallbackMats.stone,true);
  box('FallbackTowerEast',[4.5,7,48],[1.0,14,13],fallbackMats.stone,true);
  box('FallbackTowerFloor',[0,-0.12,47],[8.2,0.35,13],fallbackMats.wood,true);
  box('FallbackUpperDeck',[0,7.2,59],[8.4,0.4,16],fallbackMats.wood,true);
  box('FallbackUpperWest',[-4.4,9,59],[0.35,4,16],fallbackMats.copper,true);
  box('FallbackUpperEast',[4.4,9,59],[0.35,4,16],fallbackMats.copper,true);
}
function buildFallbackMachinery() {
  for (const [prefix, position, scale] of [['Market',[0,1.55,-25],0.72],['Tower',[0,2.6,43],0.9]]) {
    const core = MeshBuilder.CreateSphere(`${prefix}_Core`,{diameter:0.9*scale,segments:16},scene);
    core.position.set(...position); core.material=fallbackMats.glow; named.set(`${prefix}_Core`,core); glow.addIncludedOnlyMesh(core);
    [1.05,1.45,1.88].forEach((radius,index) => {
      const ring=MeshBuilder.CreateTorus(`MECH_${prefix}Ring${index}`,{diameter:radius*2*scale,thickness:.13*scale,tessellation:28},scene);
      ring.position.set(...position); ring.rotation.x=Math.PI/2; ring.material=fallbackMats.copper; named.set(ring.name,ring);
    });
  }
  const valve=MeshBuilder.CreateTorus('MECH_FoundryValve',{diameter:1.45,thickness:.14,tessellation:24},scene);
  valve.position.set(4.05,1.25,14); valve.rotation.y=Math.PI/2; valve.material=fallbackMats.copper; named.set(valve.name,valve);
  const door=box('MECH_FoundryDoor',[4.75,1.55,18],[.32,3.1,3.4],fallbackMats.copper,false); named.set(door.name,door);
  const lift=box('MECH_TowerLift',[0,.3,48],[5.5,.35,4.2],fallbackMats.wood,false); named.set(lift.name,lift);
  const bell=MeshBuilder.CreateTorus('MECH_GreatBell',{diameter:5.2,thickness:1.1,tessellation:32},scene);
  bell.position.set(0,12,61); bell.rotation.x=Math.PI/2; bell.material=fallbackMats.copper; named.set(bell.name,bell); shadows.addShadowCaster(bell);
}

function addDynamic(mesh) {
  const name = mesh.name;
  if (name.startsWith('MECH_SlowGear')) dynamic.slowGears.push(mesh);
  else if (name.startsWith('MECH_FastGear')) dynamic.fastGears.push(mesh);
  else if (name.startsWith('MECH_Fan')) dynamic.fans.push(mesh);
  else if (name.startsWith('MECH_Pendulum')) dynamic.pendulums.push(mesh);
  else if (name.startsWith('FX_Flag')) dynamic.flags.push(mesh);
}
function indexMeshes(result) {
  const frozenMaterials = new Set();
  for (const mesh of result.meshes) {
    named.set(mesh.name, mesh);
    if (mesh.name.startsWith('COL_')) {
      mesh.isVisible = false;
      mesh.visibility = 0;
      mesh.checkCollisions = true;
      mesh.isPickable = false;
      if (mesh.getTotalVertices?.() > 0) mesh.freezeWorldMatrix();
      continue;
    }
    mesh.checkCollisions = false;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    addDynamic(mesh);
    const isDynamic = /^MECH_|^FX_/.test(mesh.name);
    if (!isDynamic && !mesh.skeleton && mesh.getTotalVertices?.() > 0) mesh.freezeWorldMatrix();
    if (mesh.material && !frozenMaterials.has(mesh.material.uniqueId)) {
      frozenMaterials.add(mesh.material.uniqueId);
      mesh.material.freeze?.();
    }
    const cast = quality.tier === 'high'
      ? /GreatBell|Awning|Bridge|Crane|Gear|TowerCopper/i.test(mesh.name)
      : /GreatBell|Awning|Bridge|Crane/i.test(mesh.name);
    if (cast) shadows.addShadowCaster(mesh);
    if (/Glow|Resonator|Ceramic|LampCore|Signal|_Core/i.test(mesh.name)) glow.addIncludedOnlyMesh(mesh);
  }
}
function playGroup(result, names, loop = true, speed = 1) {
  const group = result.animationGroups.find((candidate) => names.some((name) => candidate.name.toLowerCase().includes(name.toLowerCase())));
  if (group) {
    result.animationGroups.forEach((entry) => { if (entry !== group) entry.stop(); });
    group.start(loop, speed);
  }
  return group;
}
function playTransient(actor, names, duration = 1450, speed = 1) {
  if (!actor) return;
  actor.play(names, false, speed);
  clearTimeout(actor.idleTimer);
  actor.idleTimer = setTimeout(() => actor.play(['Idle'], true, 1), duration);
}
async function loadCharacter(file, name, position, tint = null, scale = 1) {
  const result = await SceneLoader.ImportMeshAsync('', './models/', file, scene);
  const root = new TransformNode(name, scene);
  root.position.copyFrom(position);
  root.scaling.setAll(scale);
  result.meshes.filter((mesh) => !mesh.parent).forEach((mesh) => { mesh.parent = root; });
  result.meshes.forEach((mesh) => {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    shadows.addShadowCaster(mesh);
    if (tint && mesh.material && /cloth|coat|fabric/i.test(mesh.material.name)) {
      const material = mesh.material.clone(`${mesh.material.name}-${name}`);
      if ('albedoColor' in material) material.albedoColor = tint;
      if ('diffuseColor' in material) material.diffuseColor = tint;
      mesh.material = material;
      material.freeze?.();
    }
  });
  playGroup(result,['Idle'],true,1);
  return { root, result, idleTimer:0, play:(names,loop=true,speed=1)=>playGroup(result,names,loop,speed) };
}
async function tryCharacter(file, name, position, tint, scale) {
  try { return await loadCharacter(file,name,position,tint,scale); }
  catch (error) { console.warn(`${name} GLB unavailable`, error); return null; }
}

async function loadWorld() {
  loading(8,'BELLFORGE','Открываем нижние ворота…');
  let cityLoaded = false;
  try {
    const city = await SceneLoader.ImportMeshAsync('', './models/', 'bellforge-city.glb', scene);
    indexMeshes(city);
    cityLoaded = true;
  } catch (error) {
    console.warn('BELLFORGE authored city unavailable, using playable fallback', error);
    buildFallbackCity();
  }

  loading(46,'BELLFORGE','Заводим городские механизмы…');
  try {
    const machinery = await SceneLoader.ImportMeshAsync('', './models/', 'bellforge-machinery.glb', scene);
    indexMeshes(machinery);
  } catch (error) {
    console.warn('Machinery GLB unavailable, using fallback mechanisms', error);
    buildFallbackMachinery();
  }

  loading(68,'BELLFORGE','Будим жителей…');
  npc.riya = await tryCharacter('bellwright.glb','Riya',new Vector3(-2.3,0,-31),new Color3(0.52,0.18,0.12),0.98);
  npc.iven = await tryCharacter('bellwright.glb','Iven',new Vector3(3.1,0,22),new Color3(0.12,0.34,0.31),1.03);
  warden = await tryCharacter('warden.glb','Warden',new Vector3(0,0,7),null,1.08);
  if (npc.riya) npc.riya.root.rotation.y = Math.PI;
  if (npc.iven) npc.iven.root.rotation.y = Math.PI * 0.72;
  if (warden) warden.root.setEnabled(false);

  loading(90,'BELLFORGE','Настраиваем Последний Удар…');
  setupSparks();
  setupInteractables();
  restoreWorldState();
  scene.blockMaterialDirtyMechanism = true;

  loading(100,'BELLFORGE','Город готов.');
  if (!cityLoaded) subtitle('Blender-город не загрузился: включён резервный, полностью проходимый layout.', 5000);
  setTimeout(() => ui.loading.classList.add('done'), 220);
  setTimeout(() => {
    ui.loading.classList.add('hidden');
    if (run.stage === 'complete') showEnding();
    else introSequence();
  }, 680);
}

const interactables = [];
function addInteraction(id, position, label, hint, condition, action) {
  interactables.push({ id, position, label, hint, enabled:true, condition, action });
}
function setupInteractables() {
  addInteraction('riya',new Vector3(-2.3,1.2,-31),'ПОГОВОРИТЬ','Рия — звонарка',()=>run.stage==='arrival'||run.stage==='market',talkRiya);
  addInteraction('market-resonator',new Vector3(0,1.1,-25),'НАСТРОИТЬ','Рыночный резонатор',()=>run.stage==='market',()=>openPuzzle('market'));
  addInteraction('foundry-valve',new Vector3(4,1.2,14),'ПОВЕРНУТЬ','Главный клапан',()=>run.stage==='foundry',turnFoundryValve);
  addInteraction('iven',new Vector3(3.1,1.2,22),'ПОГОВОРИТЬ','Ивен — архивист',()=>run.stage==='archive',talkIven);
  addInteraction('tower-resonator',new Vector3(0,2.0,43),'НАСТРОИТЬ','Башенный резонатор',()=>run.stage==='tower',()=>openPuzzle('tower'));
  addInteraction('tower-lift',new Vector3(0,1.2,48),'ПОДНЯТЬСЯ','Старый башенный лифт',()=>run.stage==='ascent'&&!liftRide,rideLift);
  addInteraction('great-bell',new Vector3(0,9.0,61),'РЕШИТЬ','Сердце Великого Колокола',()=>run.stage==='finale',openChoice);
}
function syncInteraction() {
  const candidates = interactables.map((entry) => ({ ...entry, enabled:entry.condition() }));
  const nearest = nearestInteractable(camera.position,candidates,3.15);
  activeInteraction = nearest?.item || null;
  const blocked = !activeInteraction || puzzleMode || !ui.choice.classList.contains('hidden') || !ui.finish.classList.contains('hidden');
  ui.action.classList.toggle('disabled',blocked);
  if (activeInteraction) {
    ui.actionLabel.textContent = activeInteraction.label;
    ui.actionHint.textContent = activeInteraction.hint;
    ui.actionGlyph.textContent = activeInteraction.id.includes('resonator') ? '◉' : activeInteraction.id.includes('valve') ? '↻' : '◇';
  } else {
    ui.actionLabel.textContent = 'ОСМОТРЕТЬ';
    ui.actionHint.textContent = 'Подойди ближе';
    ui.actionGlyph.textContent = '◇';
  }
}

function talkRiya() {
  audio.ensure();
  audio.voice('warm',-0.18);
  playTransient(npc.riya,['Talk','Gesture'],1500,0.95);
  if (run.stage === 'arrival') {
    subtitle('Рия: «Часы мертвы. Если молчит Рыночный резонатор — дальше город даже двери не откроет.»',4200);
  } else {
    subtitle('Рия: «Не ищи цифры. Слушай три кольца: низкий, высокий, снова низкий. Машина любит интервалы.»',4200);
  }
}
function turnFoundryValve() {
  audio.ensure();
  audio.mechanism(0.38);
  pulse(14);
  run.pressure = clamp(run.pressure + 0.26,0,1);
  persist();
  const wheel = named.get('MECH_FoundryValve');
  if (wheel) wheel.rotation.z += Math.PI * 0.45;
  const door = named.get('MECH_FoundryDoor');
  if (door) door.position.y = 1.55 + run.pressure * 2.7;
  subtitle(`Давление: ${Math.round(run.pressure*100)}%`,1100);
  if (run.pressure >= 0.99) {
    advance('foundry-pressurized');
    lampLights[1].intensity = 1.15;
    audio.resonance(0.8,0.25);
    subtitle('Литейная оживает. За стеной запускается старый подъёмник.',3200);
  }
}
function talkIven() {
  audio.voice('old',0.2);
  playTransient(npc.iven,['Talk','Gesture'],1550,1);
  subtitle('Ивен: «Смотритель остановил Колокол не из страха. Каждый удар стирает из города одну ночь памяти. Он решил оборвать цикл.»',5200);
  setTimeout(() => { advance('archive-met'); startChase(); }, 3200);
}

function openPuzzle(mode) {
  puzzleMode = mode;
  freezePlayer = true;
  ui.puzzle.classList.remove('hidden');
  ui.puzzleTitle.textContent = mode === 'market' ? 'РЫНОЧНЫЙ РЕЗОНАТОР' : 'БАШЕННЫЙ РЕЗОНАТОР';
  syncPuzzle();
  audio.ensure();
}
function closePuzzle() {
  puzzleMode = null;
  freezePlayer = false;
  ui.puzzle.classList.add('hidden');
}
ui.closePuzzle.onclick = closePuzzle;
ui.ringButtons.forEach((button,index) => button.onclick = () => {
  if (!puzzleMode) return;
  const values = puzzleMode === 'market' ? run.marketAligned : run.towerAligned;
  values[index] = (Number(values[index]) + 1) % 8;
  persist();
  audio.mechanism((index-1)*0.22);
  pulse(8);
  const prefix = puzzleMode === 'market' ? 'Market' : 'Tower';
  const mesh = named.get(`MECH_${prefix}Ring${index}`);
  if (mesh) mesh.rotation.z += Math.PI / 4;
  syncPuzzle();
  const target = puzzleMode === 'market' ? [2,5,1] : [6,2,4];
  if (!ringSolved(values,target)) return;
  audio.resonance(1);
  pulse([22,35,22]);
  if (puzzleMode === 'market') {
    advance('market-solved');
    lampLights[0].setEnabled(true);
    lampLights[0].intensity = 1.05;
    subtitle('Резонатор отвечает чистым аккордом. Ворота Литейной раскрываются.',3600);
  } else {
    advance('tower-solved');
    lampLights[2].intensity = 1.35;
    subtitle('Вся башня входит в резонанс. Лифт к Великому Колоколу разблокирован.',3600);
  }
  setTimeout(closePuzzle,650);
});
function syncPuzzle() {
  if (!puzzleMode) return;
  const values = puzzleMode === 'market' ? run.marketAligned : run.towerAligned;
  values.forEach((value,index) => { ui.ringValues[index].textContent = String(value); });
}

function rideLift() {
  if (liftRide) return;
  freezePlayer = true;
  camera.checkCollisions = false;
  camera.position.x = 0;
  camera.position.z = 48;
  camera.rotation.set(0,0,0);
  audio.lift();
  subtitle('Противовес срывается вниз. Кабина поднимает тебя сквозь пустой часовой механизм.',3300);
  const lift = named.get('MECH_TowerLift');
  liftRide = { time:0, duration:reduced?0.25:2.65, lift, startLiftY:lift?.position.y ?? 0.3 };
}
function updateLift(dt) {
  if (!liftRide) return;
  liftRide.time += dt;
  const raw = clamp(liftRide.time / liftRide.duration,0,1);
  const eased = raw * raw * (3 - 2 * raw);
  camera.position.y = 1.9 + eased * 7.05;
  if (liftRide.lift) liftRide.lift.position.y = liftRide.startLiftY + eased * 7.0;
  if (raw < 1) return;
  const completedLift = liftRide.lift;
  liftRide = null;
  fadeTransition(() => {
    camera.position.set(0,9.0,54.5);
    camera.rotation.set(0,0,0);
    camera.checkCollisions = true;
    if (completedLift) completedLift.position.y = 7.3;
    freezePlayer = false;
    showLocation('ВЕРХНИЙ ЗВОН');
  });
}

function openChoice() {
  freezePlayer = true;
  ui.choice.classList.remove('hidden');
}
function makeChoice(choice) {
  run.choice = choice;
  persist();
  ui.choice.classList.add('hidden');
  if (choice === 'ring') {
    audio.bell();
    bellStrike = 3.8;
    scene.fogColor = new Color3(0.22,0.27,0.22);
    sun.intensity = 1.65;
    lampLights.forEach((light) => { light.setEnabled(true); light.intensity = Math.max(light.intensity,1.0); });
  } else {
    audio.resonance(0.4);
    scene.fogColor = new Color3(0.12,0.16,0.18);
    sun.intensity = 0.62;
    glow.intensity = 0.14;
    lampLights.forEach((light) => { light.intensity = 0.12; });
  }
  advance('final-choice');
  setTimeout(showEnding,choice === 'ring' ? 2600 : 1000);
}
ui.ringChoice.onclick = () => makeChoice('ring');
ui.silenceChoice.onclick = () => makeChoice('silence');

function showEnding() {
  ui.finish.classList.remove('hidden');
  freezePlayer = true;
  if (run.choice === 'ring') {
    ui.finishTitle.textContent = 'БЕЛЛФОРДЖ СНОВА ЗВУЧИТ';
    ui.finishText.textContent = 'Колокол ударил. Мосты поднялись, мастерские ожили, тысячи окон вспыхнули разом. Наутро никто не смог вспомнить эту ночь — кроме Мары. Теперь только она знает цену следующего удара.';
  } else {
    ui.finishTitle.textContent = 'ГОРОД, КОТОРЫЙ ВЫБРАЛ ТИШИНУ';
    ui.finishText.textContent = 'Мара вынула сердечник. Великая машина впервые за столетия осталась неподвижной. Защитные створки погасли, зато жители сохранили эту ночь — и впервые начали строить утро, которое не было предусмотрено механизмом.';
  }
}

function introSequence() {
  if (run.stage === 'arrival') {
    showLocation('НИЖНИЕ ВОРОТА');
    subtitle('Беллфордж · 23:58. Главные часы остановились две минуты назад.',3900);
  } else {
    updateLocations();
    subtitle('Беллфордж помнит, где ты остановился. Механизм продолжает ждать.',3000);
  }
}
function startChase() {
  if (chaseStarted) return;
  chaseStarted = true;
  chaseGrace = 2.8;
  audio.alarm();
  audio.voice('warden');
  subtitle('Смотритель: «Отойди от башни. Я не позволю городу забыть ещё одну ночь.»',4200);
  if (warden) {
    warden.root.setEnabled(true);
    warden.root.position.set(camera.position.x,camera.position.y-1.7,camera.position.z-11);
    warden.play(['Run','Walk'],true,1.25);
  }
  showLocation('СЕРВИСНЫЕ КРЫШИ');
}
function updateChase(dt) {
  if (run.stage !== 'chase') return;
  if (!chaseStarted) startChase();
  chaseGrace -= dt;
  if (warden) {
    const delta = camera.position.subtract(warden.root.position);
    delta.y = 0;
    const distance = delta.length();
    if (distance > 0.01) {
      delta.normalize();
      warden.root.position.addInPlace(delta.scale(dt * (chaseGrace > 0 ? 2.2 : 4.35)));
      warden.root.rotation.y = Math.atan2(delta.x,delta.z);
    }
  }
  if (camera.position.z > 36) {
    advance('chase-escaped');
    if (warden) warden.root.setEnabled(false);
    audio.resonance(0.55);
    subtitle('Ты отрываешься от Смотрителя. Башенная дверь захлопывается за спиной.',3200);
  } else if (chaseGrace <= 0 && warden && Vector3.Distance(camera.position,warden.root.position) < 2.1) {
    pulse([80,40,80]);
    audio.alarm();
    fadeTransition(() => {
      camera.position.set(0,2,24);
      camera.rotation.set(0,0,0);
      warden.root.position.set(0,0,13);
      chaseGrace = 2.2;
    });
    subtitle('Смотритель перехватил тебя. Ещё попытка.',2200);
  }
}

function setRingState(prefix, values) {
  values.forEach((value,index) => {
    const mesh = named.get(`MECH_${prefix}Ring${index}`);
    if (mesh) mesh.rotation.z += value * Math.PI / 4;
  });
}
function restoreWorldState() {
  setRingState('Market',run.marketAligned);
  setRingState('Tower',run.towerAligned);
  const valve = named.get('MECH_FoundryValve');
  if (valve) valve.rotation.z += run.pressure * Math.PI * 1.8;
  const door = named.get('MECH_FoundryDoor');
  if (door) door.position.y = 1.55 + run.pressure * 2.7;

  if (['foundry','archive','chase','tower','ascent','finale','complete'].includes(run.stage)) {
    lampLights[0].setEnabled(true);
    lampLights[0].intensity = 1.05;
  }
  if (['archive','chase','tower','ascent','finale','complete'].includes(run.stage)) lampLights[1].intensity = 1.15;
  if (['ascent','finale','complete'].includes(run.stage)) lampLights[2].intensity = 1.35;
  if (run.stage === 'complete' && run.choice === 'ring') {
    sun.intensity = 1.65;
    scene.fogColor = new Color3(0.22,0.27,0.22);
  } else if (run.stage === 'complete' && run.choice === 'silence') {
    sun.intensity = 0.62;
    scene.fogColor = new Color3(0.12,0.16,0.18);
    glow.intensity = 0.14;
    lampLights.forEach((light) => { light.intensity = 0.12; });
  }
}
function setupSparks() {
  const texture = new Texture('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNSIgZmlsbD0iI2ZmYzU2ZiIvPjwvc3ZnPg==',scene);
  texture.hasAlpha = true;
  const sparks = new ParticleSystem('FoundrySparks',Math.round(190*quality.particles),scene);
  sparks.particleTexture = texture;
  sparks.emitter = new Vector3(5,2.5,13);
  sparks.minEmitBox = new Vector3(-0.5,0,-0.5);
  sparks.maxEmitBox = new Vector3(0.5,1,0.5);
  sparks.direction1 = new Vector3(-1,2,-0.4);
  sparks.direction2 = new Vector3(1,4,0.4);
  sparks.minLifeTime = 0.25;
  sparks.maxLifeTime = 0.7;
  sparks.minSize = 0.035;
  sparks.maxSize = 0.09;
  sparks.emitRate = quality.tier === 'low' ? 15 : 35;
  sparks.gravity = new Vector3(0,-5,0);
  sparks.color1 = new Color4(1,0.55,0.18,1);
  sparks.color2 = new Color4(1,0.2,0.05,0.5);
  sparks.start();
}

let lastLocation = '';
function locationForPosition() {
  const z = camera.position.z;
  return z < -36 ? 'НИЖНИЕ ВОРОТА' : z < -12 ? 'РЫНОЧНЫЙ КВАРТАЛ' : z < 19 ? 'ЛИТЕЙНАЯ' : z < 37 ? 'СЕРВИСНЫЕ КРЫШИ' : z < 55 ? 'БАШНЯ КОЛОКОЛА' : 'ВЕРХНИЙ ЗВОН';
}
function updateLocations() {
  const location = locationForPosition();
  if (location !== lastLocation) {
    lastLocation = location;
    showLocation(location);
  }
}
function updateNarrativeTriggers() {
  if (run.stage === 'arrival' && camera.position.z > -34) {
    advance('reach-market');
    subtitle('Рия машет тебе от погасшего резонатора.',2400);
  }
  if (run.stage === 'ascent' && camera.position.z > 57 && camera.position.y > 5.2) {
    advance('reach-bell');
    subtitle('Перед тобой — сердце машины. Один рычаг, и город снова войдёт в цикл.',3800);
  }
}
function animateMechanisms(dt,time) {
  dynamic.slowGears.forEach((mesh) => { mesh.rotation.z += dt * 0.16; });
  dynamic.fastGears.forEach((mesh) => { mesh.rotation.z -= dt * 0.42; });
  dynamic.fans.forEach((mesh) => { mesh.rotation.y += dt * 1.5; });
  dynamic.pendulums.forEach((mesh) => { mesh.rotation.z = Math.sin(time*0.7) * 0.28; });
  dynamic.flags.forEach((mesh) => { mesh.rotation.z = Math.sin(time*1.2 + mesh.position.x) * 0.025; });
  if (bellStrike > 0) {
    bellStrike = Math.max(0,bellStrike-dt);
    const bell = named.get('MECH_GreatBell');
    if (bell) bell.rotation.z = Math.sin((3.8-bellStrike)*5.2) * 0.24 * (bellStrike/3.8);
  }
}
function updateNPCs(dt) {
  const look = (actor,maxDistance=10) => {
    if (!actor) return;
    const delta = camera.position.subtract(actor.root.position);
    delta.y = 0;
    if (delta.length() < maxDistance) actor.root.rotation.y = damp(actor.root.rotation.y,Math.atan2(delta.x,delta.z),5,dt);
  };
  look(npc.riya,10);
  look(npc.iven,8);
}
function rescuePlayer() {
  if (rescueCooldown > 0) return;
  const invalid = !Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z);
  if (!invalid && camera.position.y > -7) return;
  rescueCooldown = 1.4;
  pulse([28,30,28]);
  fadeTransition(() => {
    camera.position.set(...stageCheckpoint());
    camera.rotation.set(0,0,0);
    camera.cameraDirection.set(0,0,0);
    camera.checkCollisions = true;
    liftRide = null;
    freezePlayer = false;
    if (run.stage === 'chase') {
      chaseStarted = false;
      if (warden) warden.root.setEnabled(false);
    }
  });
  subtitle('Мара цепляется за страховочную линию и возвращается на маршрут.',2400);
}
function updatePlayer(dt) {
  const sample = input.sample();
  if (sample.action && activeInteraction && !freezePlayer && !puzzleMode) {
    audio.ensure();
    activeInteraction.action();
  }
  if (freezePlayer || puzzleMode) return;
  camera.rotation.y -= sample.lookX * 0.00315;
  camera.rotation.x = clamp(camera.rotation.x - sample.lookY * 0.00265,-1.18,1.05);
  const forward = new Vector3(Math.sin(camera.rotation.y),0,Math.cos(camera.rotation.y));
  const right = new Vector3(forward.z,0,-forward.x);
  let direction = forward.scale(sample.moveY).add(right.scale(sample.moveX));
  const magnitude = Math.min(1,direction.length());
  if (magnitude > 0.01) direction.normalize();
  const speed = (sample.sprint ? 5.1 : 3.45) * magnitude;
  camera.cameraDirection.addInPlace(direction.scale(speed*dt));
  const now = performance.now()/1000;
  if (magnitude > 0.15 && now-lastStep > (sample.sprint ? 0.28 : 0.42)) {
    lastStep = now;
    const surface = camera.position.z > 4 && camera.position.z < 25 ? 'metal' : camera.position.z > 32 ? 'wood' : 'stone';
    audio.step(surface);
  }
}

function tick() {
  const dt = Math.min(0.033,engine.getDeltaTime()/1000);
  const time = performance.now()/1000;
  rescueCooldown = Math.max(0,rescueCooldown-dt);
  updatePlayer(dt);
  updateLift(dt);
  syncInteraction();
  updateNarrativeTriggers();
  updateChase(dt);
  updateLocations();
  updateNPCs(dt);
  animateMechanisms(dt,time);
  rescuePlayer();
  audio.setIntensity(run.stage === 'chase' ? 1 : run.stage === 'finale' ? 0.8 : run.stage === 'complete' && run.choice === 'silence' ? 0.06 : 0.25);
  scene.render();
}

engine.runRenderLoop(tick);
window.addEventListener('resize',() => engine.resize());
document.addEventListener('visibilitychange',() => {
  if (document.hidden) {
    engine.stopRenderLoop();
    audio.suspend();
  } else {
    engine.runRenderLoop(tick);
    audio.resume();
  }
});
window.addEventListener('pagehide',() => input.destroy(),{ once:true });

void loadWorld().catch((error) => {
  console.error(error);
  ui.loading.classList.add('hidden');
  ui.error.classList.remove('hidden');
  ui.errorText.textContent = String(error?.message || error);
});
