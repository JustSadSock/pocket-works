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
const audio = createBellforgeAudio(); audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality.tier !== 'low', stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(Math.min(2, Math.max(1, devicePixelRatio * (quality.scale / 2))));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.055, 0.085, 0.095, 1);
scene.fogMode = Scene.FOGMODE_EXP2; scene.fogColor = new Color3(0.17, 0.22, 0.21); scene.fogDensity = quality.tier === 'low' ? 0.007 : 0.0052;
scene.collisionsEnabled = true; scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.toneMappingEnabled = true; scene.imageProcessingConfiguration.exposure = 1.06; scene.imageProcessingConfiguration.contrast = 1.16;

const camera = new UniversalCamera('MaraCamera', new Vector3(0, 2.0, -58), scene);
camera.inputs.clear(); camera.minZ = 0.06; camera.maxZ = 320; camera.fov = 0.9; camera.checkCollisions = true; camera.applyGravity = true;
camera.ellipsoid = new Vector3(0.36, 0.82, 0.36); camera.ellipsoidOffset = new Vector3(0, -0.05, 0); camera.inertia = 0;
scene.activeCamera = camera; scene.gravity = new Vector3(0, -0.42, 0);
const checkpoint = { arrival:[0,2,-58], market:[0,2,-33], foundry:[0,2,-20], archive:[0,2,18], chase:[0,2,24], tower:[0,2,38], ascent:[0,2,45], finale:[0,9,57], complete:[0,9,57] }[run.stage] || [0,2,-58];
camera.position.set(...checkpoint);

const hemi = new HemisphericLight('SkyFill', new Vector3(-0.25, 1, 0.15), scene); hemi.intensity = 0.58; hemi.diffuse = new Color3(0.48, 0.58, 0.55); hemi.groundColor = new Color3(0.08, 0.06, 0.045);
const sun = new DirectionalLight('DuskSun', new Vector3(-0.52, -0.82, 0.34), scene); sun.position.set(34, 54, -42); sun.intensity = 1.28; sun.diffuse = new Color3(1, 0.72, 0.46);
const shadows = new ShadowGenerator(quality.shadows, sun); shadows.usePercentageCloserFiltering = true; shadows.bias = 0.0015; shadows.normalBias = 0.02;
const glow = new GlowLayer('ResonanceGlow', scene, { blurKernelSize: quality.tier === 'high' ? 48 : 28 }); glow.intensity = 0.5;

const lampLights = [
  new PointLight('MarketLamp', new Vector3(-4, 4.5, -28), scene),
  new PointLight('FoundryLamp', new Vector3(5, 4.2, 14), scene),
  new PointLight('TowerLamp', new Vector3(0, 8, 44), scene)
];
lampLights.forEach((light, i) => { light.diffuse = i === 2 ? new Color3(0.45, 0.95, 0.83) : new Color3(1, 0.52, 0.22); light.intensity = 0.22; light.range = 18; });

const input = createInput({ canvas, joystick: ui.joystick, knob: ui.knob, lookZone: ui.lookZone, actionButton: ui.action });
let subtitleTimer = 0, locationTimer = 0, activeInteraction = null, puzzleMode = null, freezePlayer = false, lastStep = 0, chaseStarted = false, chaseGrace = 0, warden = null;
const named = new Map();
const npc = {};

function loading(percent, title, text) {
  ui.loadingBar.style.width = `${percent}%`; ui.loadingPercent.textContent = `${percent}%`; ui.loadingTitle.textContent = title; ui.loadingText.textContent = text;
}
function persist() { write(RUN_KEY, run); }
function subtitle(text, ms = 2600) {
  ui.subtitle.textContent = text; ui.subtitle.classList.add('show'); clearTimeout(subtitleTimer); subtitleTimer = setTimeout(() => ui.subtitle.classList.remove('show'), ms);
}
function showLocation(name) {
  ui.locationName.textContent = name; ui.locationCard.classList.add('show'); clearTimeout(locationTimer); locationTimer = setTimeout(() => ui.locationCard.classList.remove('show'), 1800);
}
function pulse(pattern = 18) { if (navigator.vibrate) navigator.vibrate(pattern); }
function syncSound() { ui.sound.textContent = settings.muted ? 'MUTED' : 'SOUND'; ui.sound.classList.toggle('muted', settings.muted); }
function syncStoryUI() { const stage = stageFor(run); ui.chapter.textContent = stage.chapter; ui.objective.textContent = stage.objective; }
function advance(event) { const before = run.stage; run = applyStoryEvent(run, event); if (run.stage !== before) { persist(); syncStoryUI(); pulse([18, 36, 18]); } }
function fadeTransition(callback) { ui.fade.classList.add('on'); setTimeout(() => { callback(); ui.fade.classList.remove('on'); }, reduced ? 10 : 480); }

ui.retry.onclick = () => location.reload();
ui.sound.onclick = () => { settings.muted = !settings.muted; audio.ensure(); audio.setMuted(settings.muted); write(SETTINGS_KEY, settings); syncSound(); };
ui.restart.onclick = () => { write(RUN_KEY, { stage: 'arrival', marketAligned: [0,0,0], pressure: 0, towerAligned: [0,0,0], choice: null, completedRuns: run.completedRuns }); location.reload(); };
syncSound(); syncStoryUI();

function fallbackMaterial(name, color, emissive = null) { const m = new StandardMaterial(name, scene); m.diffuseColor = color; m.specularColor = new Color3(0.08,0.07,0.06); if (emissive) m.emissiveColor = emissive; return m; }
const fallbackMats = {
  stone: fallbackMaterial('FallbackStone', new Color3(0.36,0.29,0.23)), plaster: fallbackMaterial('FallbackPlaster', new Color3(0.67,0.35,0.22)),
  copper: fallbackMaterial('FallbackCopper', new Color3(0.23,0.48,0.45)), wood: fallbackMaterial('FallbackWood', new Color3(0.22,0.12,0.07)),
  glow: fallbackMaterial('FallbackGlow', new Color3(0.18,0.58,0.52), new Color3(0.08,0.42,0.36))
};
function box(name, pos, size, material, collision = true) { const mesh = MeshBuilder.CreateBox(name, { width:size[0], height:size[1], depth:size[2] }, scene); mesh.position.set(...pos); mesh.material = material; mesh.checkCollisions = collision; mesh.receiveShadows = true; return mesh; }
function buildFallbackCity() {
  box('FallbackRoad',[0,-0.4,4],[11,0.8,138],fallbackMats.stone,true);
  for (let i=0;i<14;i++) { const z=-53+i*9.5, side=i%2?-1:1, h=5+(i%4)*1.4; box(`FallbackHouse${i}`,[side*7,h/2-0.2,z],[5.5,h,7],i%3===0?fallbackMats.plaster:fallbackMats.stone,true); }
  box('FallbackMarketGate',[0,2.4,-22],[10,4.8,1],fallbackMats.copper,true); box('FallbackFoundry',[4,3,14],[7,6,9],fallbackMats.plaster,true);
  const tower=box('FallbackTower',[0,9,48],[9,18,11],fallbackMats.stone,true); tower.receiveShadows=true;
  box('FallbackRamp',[0,2.2,54],[6,0.5,22],fallbackMats.wood,true).rotation.x=-0.28;
  const bell=MeshBuilder.CreateTorus('FallbackGreatBell',{diameter:6,thickness:1.4,tessellation:24},scene); bell.position.set(0,14,62); bell.rotation.x=Math.PI/2; bell.material=fallbackMats.copper; shadows.addShadowCaster(bell);
}

function indexMeshes(result) {
  for (const mesh of result.meshes) {
    named.set(mesh.name, mesh);
    if (mesh.name.startsWith('COL_')) { mesh.isVisible = false; mesh.visibility = 0; mesh.checkCollisions = true; mesh.isPickable = false; continue; }
    mesh.checkCollisions = false; mesh.receiveShadows = true;
    if (/CAST_|Bell|Awning|Bridge|Crane|Gear|Warden/i.test(mesh.name)) shadows.addShadowCaster(mesh);
    if (/Glow|Resonator|Ceramic|LampCore|Signal/i.test(mesh.name)) glow.addIncludedOnlyMesh(mesh);
  }
}
function playGroup(result, names, loop = true, speed = 1) {
  const group = result.animationGroups.find((candidate) => names.some((name) => candidate.name.toLowerCase().includes(name.toLowerCase())));
  if (group) { result.animationGroups.forEach((g) => { if (g !== group) g.stop(); }); group.start(loop, speed); }
  return group;
}
async function loadCharacter(file, name, position, tint = null, scale = 1) {
  const result = await SceneLoader.ImportMeshAsync('', './models/', file, scene);
  const root = new TransformNode(name, scene); root.position.copyFrom(position); root.scaling.setAll(scale);
  result.meshes.filter((mesh) => !mesh.parent).forEach((mesh) => { mesh.parent = root; });
  result.meshes.forEach((mesh) => { mesh.receiveShadows = true; shadows.addShadowCaster(mesh); if (tint && mesh.material && /cloth|coat|fabric/i.test(mesh.material.name)) { const mat=mesh.material.clone(`${mesh.material.name}-${name}`); if ('albedoColor' in mat) mat.albedoColor = tint; if ('diffuseColor' in mat) mat.diffuseColor = tint; mesh.material=mat; } });
  playGroup(result, ['Idle'], true, 1);
  return { root, result, play: (names, loop=true, speed=1) => playGroup(result, names, loop, speed) };
}

async function loadWorld() {
  loading(8,'BELLFORGE','Открываем нижние ворота…');
  let cityLoaded = false;
  try {
    const city = await SceneLoader.ImportMeshAsync('', './models/', 'bellforge-city.glb', scene); indexMeshes(city); cityLoaded = true;
  } catch (error) { console.warn('BELLFORGE authored city unavailable, using playable fallback', error); buildFallbackCity(); }
  loading(47,'BELLFORGE','Заводим городские механизмы…');
  try { const props = await SceneLoader.ImportMeshAsync('', './models/', 'bellforge-machinery.glb', scene); indexMeshes(props); } catch (error) { console.warn('Machinery GLB unavailable', error); }
  loading(68,'BELLFORGE','Будим жителей…');
  try {
    npc.riya = await loadCharacter('bellwright.glb','Riya',new Vector3(-2.3,0,-31),new Color3(0.52,0.18,0.12),0.98); npc.riya.root.rotation.y=Math.PI;
    npc.iven = await loadCharacter('bellwright.glb','Iven',new Vector3(3.1,0,22),new Color3(0.12,0.34,0.31),1.03); npc.iven.root.rotation.y=Math.PI*0.72;
    warden = await loadCharacter('warden.glb','Warden',new Vector3(0,0,7),null,1.08); warden.root.setEnabled(false);
  } catch (error) { console.warn('Authored character GLB unavailable', error); }
  loading(92,'BELLFORGE','Настраиваем Последний Удар…');
  setupSparks(); setupInteractables(); restoreWorldState();
  loading(100,'BELLFORGE','Город готов.');
  if (!cityLoaded) subtitle('Предупреждение: Blender-город не загрузился, запущен резервный игровой layout.', 5000);
  setTimeout(() => ui.loading.classList.add('done'), 260);
  setTimeout(() => { ui.loading.classList.add('hidden'); if(run.stage==='complete') showEnding(); else introSequence(); }, 780);
}

const interactables = [];
function addInteraction(id, position, label, hint, condition, action) { interactables.push({ id, position, label, hint, enabled:true, condition, action }); }
function setupInteractables() {
  addInteraction('riya',new Vector3(-2.3,1.2,-31),'ПОГОВОРИТЬ','Рия — звонарка',()=>run.stage==='arrival'||run.stage==='market',()=>talkRiya());
  addInteraction('market-resonator',new Vector3(0,1.1,-25),'НАСТРОИТЬ','Рыночный резонатор',()=>run.stage==='market',()=>openPuzzle('market'));
  addInteraction('foundry-valve',new Vector3(4,1.2,14),'ПОВЕРНУТЬ','Главный клапан',()=>run.stage==='foundry',()=>turnFoundryValve());
  addInteraction('iven',new Vector3(3.1,1.2,22),'ПОГОВОРИТЬ','Ивен — архивист',()=>run.stage==='archive',()=>talkIven());
  addInteraction('tower-resonator',new Vector3(0,2.0,43),'НАСТРОИТЬ','Башенный резонатор',()=>run.stage==='tower',()=>openPuzzle('tower'));
  addInteraction('tower-lift',new Vector3(0,1.2,48),'ПОДНЯТЬСЯ','Старый башенный лифт',()=>run.stage==='ascent',()=>rideLift());
  addInteraction('great-bell',new Vector3(0,9.0,61),'РЕШИТЬ','Сердце Великого Колокола',()=>run.stage==='finale',()=>openChoice());
}
function syncInteraction() {
  const candidates = interactables.map((entry) => ({ ...entry, enabled: entry.condition() }));
  const nearest = nearestInteractable(camera.position, candidates, 3.15); activeInteraction = nearest?.item || null;
  ui.action.classList.toggle('disabled', !activeInteraction || puzzleMode || !ui.choice.classList.contains('hidden') || !ui.finish.classList.contains('hidden'));
  if (activeInteraction) { ui.actionLabel.textContent=activeInteraction.label; ui.actionHint.textContent=activeInteraction.hint; ui.actionGlyph.textContent=activeInteraction.id.includes('resonator')?'◉':activeInteraction.id.includes('valve')?'↻':'◇'; }
  else { ui.actionLabel.textContent='ОСМОТРЕТЬ'; ui.actionHint.textContent='Подойди ближе'; ui.actionGlyph.textContent='◇'; }
}

function talkRiya() {
  audio.ensure(); npc.riya?.play(['Talk','Gesture'],true,0.95);
  if (run.stage === 'arrival') subtitle('Рия: «Часы мертвы. Если молчит Рыночный резонатор — дальше город даже двери не откроет.»',4200);
  else subtitle('Рия: «Не ищи цифры. Слушай три кольца: низкий, высокий, снова низкий. Машина любит интервалы.»',4200);
}
function turnFoundryValve() {
  audio.ensure(); audio.mechanism(); pulse(14); run.pressure=clamp(run.pressure+0.26,0,1); persist();
  const wheel=named.get('MECH_FoundryValve'); if(wheel) wheel.rotation.z += Math.PI*.45;
  const door=named.get('MECH_FoundryDoor'); if(door) door.position.y=damp(door.position.y,3.2,5,.2);
  subtitle(`Давление: ${Math.round(run.pressure*100)}%`,1100);
  if(run.pressure>=0.99){ advance('foundry-pressurized'); lampLights[1].intensity=1.15; audio.resonance(.8); subtitle('Литейная оживает. За стеной запускается старый подъёмник.',3200); }
}
function talkIven() {
  npc.iven?.play(['Talk','Gesture'],true,1); subtitle('Ивен: «Смотритель остановил Колокол не из страха. Каждый удар стирает из города одну ночь памяти. Он решил оборвать цикл.»',5200);
  setTimeout(()=>{ advance('archive-met'); startChase(); },3200);
}
function openPuzzle(mode) { puzzleMode=mode; freezePlayer=true; ui.puzzle.classList.remove('hidden'); ui.puzzleTitle.textContent=mode==='market'?'РЫНОЧНЫЙ РЕЗОНАТОР':'БАШЕННЫЙ РЕЗОНАТОР'; syncPuzzle(); audio.ensure(); }
function closePuzzle() { puzzleMode=null; freezePlayer=false; ui.puzzle.classList.add('hidden'); }
ui.closePuzzle.onclick=closePuzzle;
ui.ringButtons.forEach((button,index)=>button.onclick=()=>{
  if(!puzzleMode)return; const values=puzzleMode==='market'?run.marketAligned:run.towerAligned; values[index]=(Number(values[index]) + 1)%8; persist(); audio.mechanism(); pulse(8);
  const mesh=named.get(`MECH_${puzzleMode==='market'?'Market':'Tower'}Ring${index}`); if(mesh) mesh.rotation.z += Math.PI/4;
  syncPuzzle(); const target=puzzleMode==='market'?[2,5,1]:[6,2,4];
  if(ringSolved(values,target)){ audio.resonance(1); pulse([22,35,22]); if(puzzleMode==='market'){advance('market-solved');lampLights[0].intensity=1.05;subtitle('Резонатор отвечает чистым аккордом. Ворота Литейной раскрываются.',3600);}else{advance('tower-solved');lampLights[2].intensity=1.35;subtitle('Вся башня входит в резонанс. Лифт к Великому Колоколу разблокирован.',3600);} setTimeout(closePuzzle,650); }
});
function syncPuzzle(){ if(!puzzleMode)return; const values=puzzleMode==='market'?run.marketAligned:run.towerAligned; values.forEach((value,i)=>ui.ringValues[i].textContent=String(value)); }
function rideLift(){
  freezePlayer=true; audio.mechanism(); subtitle('Противовес срывается вниз. Кабина поднимает тебя сквозь пустой часовой механизм.',3300);
  const lift=named.get('MECH_TowerLift'); if(lift) lift.position.y=7.1;
  fadeTransition(()=>{camera.position.set(0,9.0,54.5);camera.rotation.set(0,0,0);freezePlayer=false;showLocation('ВЕРХНИЙ ЗВОН');});
}
function openChoice(){ freezePlayer=true; ui.choice.classList.remove('hidden'); }
function makeChoice(choice){ run.choice=choice; persist(); ui.choice.classList.add('hidden'); if(choice==='ring'){ audio.bell(); scene.fogColor=new Color3(.22,.27,.22); sun.intensity=1.65; named.get('MECH_GreatBell')?.rotation.set(0.1,0,0.18); }else{ audio.resonance(.4); sun.intensity=.62; lampLights.forEach(light=>light.intensity=.12); }
  advance('final-choice'); setTimeout(showEnding,choice==='ring'?2200:900); }
ui.ringChoice.onclick=()=>makeChoice('ring'); ui.silenceChoice.onclick=()=>makeChoice('silence');
function showEnding(){ ui.finish.classList.remove('hidden'); freezePlayer=true; if(run.choice==='ring'){ui.finishTitle.textContent='БЕЛЛФОРДЖ СНОВА ЗВУЧИТ';ui.finishText.textContent='Колокол ударил. Мосты поднялись, мастерские ожили, тысячи окон вспыхнули разом. Наутро никто не смог вспомнить эту ночь — кроме Мары. Теперь только она знает цену следующего удара.';}else{ui.finishTitle.textContent='ГОРОД, КОТОРЫЙ ВЫБРАЛ ТИШИНУ';ui.finishText.textContent='Мара вынула сердечник. Великая машина впервые за столетия осталась неподвижной. Защитные створки погасли, зато жители сохранили эту ночь — и впервые начали строить утро, которое не было предусмотрено механизмом.';} }

function introSequence(){ showLocation('НИЖНИЕ ВОРОТА'); subtitle('Беллфордж · 23:58. Главные часы остановились две минуты назад.',3900); }
function startChase(){ if(chaseStarted)return; chaseStarted=true; chaseGrace=2.8; audio.alarm(); subtitle('Смотритель: «Отойди от башни. Я не позволю городу забыть ещё одну ночь.»',4200); if(warden){warden.root.setEnabled(true);warden.root.position.set(camera.position.x,camera.position.y-1.7,camera.position.z-11);warden.play(['Run','Walk'],true,1.25);} showLocation('СЕРВИСНЫЕ КРЫШИ'); }
function updateChase(dt){ if(run.stage!=='chase')return; if(!chaseStarted)startChase(); chaseGrace-=dt; if(warden){const delta=camera.position.subtract(warden.root.position);delta.y=0;const d=delta.length();if(d>.01){delta.normalize();warden.root.position.addInPlace(delta.scale(dt*(chaseGrace>0?2.2:4.35)));warden.root.rotation.y=Math.atan2(delta.x,delta.z);}}
  if(camera.position.z>36){advance('chase-escaped');if(warden)warden.root.setEnabled(false);audio.resonance(.55);subtitle('Ты отрываешься от Смотрителя. Башенная дверь захлопывается за спиной.',3200);}
  else if(chaseGrace<=0 && warden && Vector3.Distance(camera.position,warden.root.position)<2.1){pulse([80,40,80]);audio.alarm();fadeTransition(()=>{camera.position.set(0,2,24);camera.rotation.set(0,0,0);warden.root.position.set(0,0,13);chaseGrace=2.2;});subtitle('Смотритель перехватил тебя. Ещё попытка.',2200);}
}

function restoreWorldState(){ if(['foundry','archive','chase','tower','ascent','finale','complete'].includes(run.stage))lampLights[0].intensity=1.05;if(['archive','chase','tower','ascent','finale','complete'].includes(run.stage))lampLights[1].intensity=1.15;if(['ascent','finale','complete'].includes(run.stage))lampLights[2].intensity=1.35;if(run.stage==='complete'&&run.choice==='ring')sun.intensity=1.65; }
function setupSparks(){
  const tex=new Texture('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iNSIgZmlsbD0iI2ZmYzU2ZiIvPjwvc3ZnPg==',scene); tex.hasAlpha=true;
  const ps=new ParticleSystem('FoundrySparks',Math.round(190*quality.particles),scene);ps.particleTexture=tex;ps.emitter=new Vector3(5,2.5,13);ps.minEmitBox=new Vector3(-.5,0,-.5);ps.maxEmitBox=new Vector3(.5,1,.5);ps.direction1=new Vector3(-1,2,-.4);ps.direction2=new Vector3(1,4,.4);ps.minLifeTime=.25;ps.maxLifeTime=.7;ps.minSize=.035;ps.maxSize=.09;ps.emitRate=quality.tier==='low'?15:35;ps.gravity=new Vector3(0,-5,0);ps.color1=new Color4(1,.55,.18,1);ps.color2=new Color4(1,.2,.05,.5);ps.start();
}

let lastLocation='';
function updateLocations(){ const z=camera.position.z; const loc=z<-36?'НИЖНИЕ ВОРОТА':z<-12?'РЫНОЧНЫЙ КВАРТАЛ':z<19?'ЛИТЕЙНАЯ':z<37?'СЕРВИСНЫЕ КРЫШИ':z<55?'БАШНЯ КОЛОКОЛА':'ВЕРХНИЙ ЗВОН'; if(loc!==lastLocation){lastLocation=loc;showLocation(loc);} }
function updateNarrativeTriggers(){ if(run.stage==='arrival' && camera.position.z>-34){advance('reach-market');subtitle('Рия машет тебе от погасшего резонатора.',2400);} if(run.stage==='ascent' && camera.position.z>57 && camera.position.y>5.2){advance('reach-bell');subtitle('Перед тобой — сердце машины. Один рычаг, и город снова войдёт в цикл.',3800);} }
function animateMechanisms(dt, time){
  for(const [name,mesh] of named){ if(name.startsWith('MECH_SlowGear'))mesh.rotation.z+=dt*.16;if(name.startsWith('MECH_FastGear'))mesh.rotation.z-=dt*.42;if(name.startsWith('MECH_Fan'))mesh.rotation.y+=dt*1.5;if(name.startsWith('MECH_Pendulum'))mesh.rotation.z=Math.sin(time*.7)*.28;if(name.startsWith('FX_Flag'))mesh.rotation.z=Math.sin(time*1.2+mesh.position.x)*.025; }
}
function updateNPCs(dt){
  const look=(actor,max=10)=>{if(!actor)return;const delta=camera.position.subtract(actor.root.position);delta.y=0;if(delta.length()<max)actor.root.rotation.y=damp(actor.root.rotation.y,Math.atan2(delta.x,delta.z),5,dt);};look(npc.riya,10);look(npc.iven,8);
}
function updatePlayer(dt){
  const sample=input.sample(); if(sample.action && activeInteraction && !freezePlayer && !puzzleMode){audio.ensure();activeInteraction.action();}
  if(freezePlayer||puzzleMode)return;
  camera.rotation.y -= sample.lookX * 0.00315; camera.rotation.x = clamp(camera.rotation.x - sample.lookY * 0.00265,-1.18,1.05);
  const forward=new Vector3(Math.sin(camera.rotation.y),0,Math.cos(camera.rotation.y));const right=new Vector3(forward.z,0,-forward.x);let direction=forward.scale(sample.moveY).add(right.scale(sample.moveX));const magnitude=Math.min(1,direction.length());if(magnitude>.01)direction.normalize();
  const speed=(sample.sprint?5.1:3.45)*magnitude; camera.cameraDirection.addInPlace(direction.scale(speed*dt));
  const now=performance.now()/1000;if(magnitude>.15 && now-lastStep>(sample.sprint?.28:.42)){lastStep=now;const surface=camera.position.z>4&&camera.position.z<25?'metal':camera.position.z>32?'wood':'stone';audio.step(surface);}
}

function tick(){
  const dt=Math.min(.033,engine.getDeltaTime()/1000), time=performance.now()/1000; updatePlayer(dt); syncInteraction(); updateNarrativeTriggers(); updateChase(dt); updateLocations(); updateNPCs(dt); animateMechanisms(dt,time); audio.setIntensity(run.stage==='chase'?1:run.stage==='finale'?.8:.25); scene.render();
}
engine.runRenderLoop(tick);
window.addEventListener('resize',()=>engine.resize());
document.addEventListener('visibilitychange',()=>{ if(document.hidden) engine.stopRenderLoop(); else engine.runRenderLoop(tick); });

void loadWorld().catch((error)=>{console.error(error);ui.loading.classList.add('hidden');ui.error.classList.remove('hidden');ui.errorText.textContent=String(error?.message||error);});
