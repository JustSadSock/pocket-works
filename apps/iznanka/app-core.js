const {
  VERSION, STORAGE_KEY, TILE, LAYERS, PALETTES, ZONES, ENEMY_TYPES, RELICS,
  createInitialSave, validateSave, addXp, computeHitDamage, computeRuptureDamage,
  questObjective, requirementMet, isBlocked, isHazard, distance, normalize,
  createZoneEnemies, randomUpgradeChoices, applyUpgrade, applyChestReward, sealForBoss,
  hashString, seeded
} = globalThis.IznankaEngine;

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loading = $('loading');
const loadingBar = $('loadingBar');
const loadingText = $('loadingText');
const titleScreen = $('titleScreen');
const continueButton = $('continueButton');
const newGameButton = $('newGameButton');
const titleSettingsButton = $('titleSettingsButton');
const hud = $('hud');
const controls = $('controls');
const healthBar = $('healthBar');
const healthText = $('healthText');
const resolveBar = $('resolveBar');
const questChapter = $('questChapter');
const questText = $('questText');
const layerBadge = $('layerBadge');
const bossBar = $('bossBar');
const bossName = $('bossName');
const bossHealth = $('bossHealth');
const pauseButton = $('pauseButton');
const potionButton = $('potionButton');
const potionCount = $('potionCount');
const contextButton = $('contextButton');
const modalRoot = $('modalRoot');
const toastEl = $('toast');
const seamTransition = $('seamTransition');
const joystick = $('joystick');
const stick = $('stick');
const attackButton = $('attackButton');
const skillButton = $('skillButton');
const dashButton = $('dashButton');
const shiftButton = $('shiftButton');
const interactButton = $('interactButton');

const VIEW = { width: 360, height: 640, dpr: 1 };
const keys = new Set();
const input = { x:0, y:0, joystickPointer:null, joystickCenter:{x:0,y:0} };
const camera = { x:0, y:0, shake:0, shakeX:0, shakeY:0 };
const runtime = {
  mode:'loading', save:null, zone:null, enemies:[], projectiles:[], particles:[], floaters:[],
  lastTime:performance.now(), startedAt:0, saveAccumulator:0, nearby:null, toastTimer:0,
  comboWindow:0, combo:0, shiftCooldown:0, skillCooldown:0, dashCooldown:0, attackCooldown:0,
  hazardTick:0, finalStarted:false, endingPending:false, pausedByVisibility:false,
  renderTime:0, ambientSeeds:new Map(), frameCount:0, pendingLevels:0
};

const player = {
  x:0,y:0,radius:8,vx:0,vy:0,facingX:0,facingY:1,speed:92,
  invuln:0,dashing:0,attackFlash:0,skillFlash:0,shiftEmpower:0,
  hurtFlash:0,dead:false
};

const DIALOGUES = {
  mira: {
    intro: [
      ['МИРА', 'Не пугайся трещины под ногами. Это не земля расходится — это город вспоминает, что у него две стороны.'],
      ['МИРА', 'Ты умеешь проходить сквозь шов. Значит, умеешь и ранить через него. Ударь врага на Лице, смени слой и ударь снова — реальности потянут его в разные стороны.'],
      ['МИРА', 'Коснись Святилища, расправься с тремя Безголосыми и сделай хотя бы один Разрыв. Потом решим, заслуживает ли этот город спасения.']
    ],
    ready: [
      ['МИРА', 'Теперь ты слышишь натяжение нитей. На востоке Сад Костей держит Печать Корня. Внизу Паромщик прячет Печать Глубины.'],
      ['МИРА', 'Не верь тем, кто говорит, будто один слой настоящий, а второй — ошибка. Ошибки редко умеют страдать.']
    ],
    waiting: [['МИРА', 'Святилище. Три Безголосых. Один Разрыв. Я не издеваюсь — просто город убивает тех, кто пропускает обучение.']],
    later: [['МИРА', 'Каждая Печать делает Башню ближе. И каждый твой выбор делает финал менее невинным.']]
  },
  rag: [['РАГ', 'Нити не деньги. Деньги хотя бы притворяются, что у них есть смысл. Но за сорок нитей я продам тебе настой.']],
  oss: [['ОСС', 'Сад не выращивает кости. Он выращивает формы, в которые люди когда-нибудь согласятся лечь. Садовник забыл меру.']],
  'root-child': [['КОРНЕВОЙ РЕБЁНОК', 'На Лице у меня нет рта. На Изнанке нет имени. Поэтому я честнее большинства взрослых.']],
  evra: [['ЭВРА', 'Вода помнит обе стороны сразу. Потому и тонут здесь дважды: сначала тело, потом отражение. Паромщик ждёт внизу.']],
  bellman: [['ЗВОНАРЬ', 'Колокол разбит, но звон остался. Смешная штука память: предмета уже нет, а шум всё ещё мешает спать.']],
  scribe: [['ПИСЕЦ', 'Архивариус хранит не книги, а варианты людей, которыми они не стали. Не читай долго — начнёшь скучать по чужой жизни.']],
  'echo-mira': [['ЭХО МИРЫ', 'Она сказала, что оба слоя равны? Разумеется. Тюремщик всегда называет стены домом, когда боится открыть дверь.']],
  'weaver-before': [
    ['ПЕРВЫЙ ШОВ', 'Ты принёс три Печати. Корень, Глубину и Имя — три способа убедить мир, что он существует.'],
    ['ПЕРВЫЙ ШОВ', 'Я сшил два города, чтобы спасти хотя бы один. Теперь шов гниёт, потому что оба требуют быть настоящими.'],
    ['ПЕРВЫЙ ШОВ', 'Покажи, что твои решения весили больше моих.']
  ]
};

class SoundEngine {
  constructor() { this.context=null; this.enabled=true; }
  sync() { this.enabled = runtime.save?.settings.sound !== false; }
  unlock() {
    if (!this.enabled) return;
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') this.context.resume().catch(()=>{});
  }
  tone(freq=220, duration=.08, type='square', volume=.035, slide=0) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;
    const now=this.context.currentTime;
    const osc=this.context.createOscillator();
    const gain=this.context.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),now+duration);
    gain.gain.setValueAtTime(volume,now);
    gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now); osc.stop(now+duration+.02);
  }
  hit(rupture=false){ this.tone(rupture?95:150, rupture?.16:.06, 'square', rupture?.07:.03, rupture?180:-35); }
  shift(){ this.tone(110,.22,'sawtooth',.035,260); setTimeout(()=>this.tone(330,.12,'triangle',.025,-150),55); }
  hurt(){ this.tone(85,.14,'sawtooth',.05,-40); }
  pickup(){ this.tone(520,.08,'square',.025,180); }
  boss(){ this.tone(60,.35,'sawtooth',.055,40); }
  ui(){ this.tone(280,.045,'square',.018,30); }
}
const sound = new SoundEngine();

function vibrate(pattern=10) {
  if (runtime.save?.settings.haptics !== false && navigator.vibrate) navigator.vibrate(pattern);
}

function resizeCanvas() {
  const rect=canvas.getBoundingClientRect();
  VIEW.dpr=Math.min(2,window.devicePixelRatio||1);
  VIEW.width=Math.max(320,rect.width);
  VIEW.height=Math.max(480,rect.height);
  canvas.width=Math.round(rect.width*VIEW.dpr);
  canvas.height=Math.round(rect.height*VIEW.dpr);
  ctx.setTransform(VIEW.dpr,0,0,VIEW.dpr,0,0);
  ctx.imageSmoothingEnabled=false;
}

function loadStoredSave() {
  try { return validateSave(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return null; }
}

function hasStoredSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

function persistSave(force=false) {
  if (!runtime.save || runtime.mode==='title' || runtime.mode==='loading') return;
  runtime.save.updatedAt=Date.now();
  runtime.save.zone=runtime.zone.id;
  runtime.save.layer=runtime.save.layer;
  runtime.save.position={x:player.x,y:player.y};
  runtime.save.stats.hp=Math.max(1,runtime.save.stats.hp);
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(runtime.save)); }
  catch { if(force) showToast('Сохранение не записалось: хранилище недоступно'); }
}

function setMode(mode) {
  runtime.mode=mode;
  const playing=mode==='playing';
  hud.classList.toggle('is-visible',playing);
  controls.classList.toggle('is-visible',playing);
  hud.setAttribute('aria-hidden',String(!playing));
  controls.setAttribute('aria-hidden',String(!playing));
}

function showTitle() {
  persistSave();
  setMode('title');
  titleScreen.classList.add('is-visible');
  loading.classList.remove('is-visible');
  modalRoot.innerHTML=''; modalRoot.classList.remove('is-active');
  continueButton.disabled=!hasStoredSave();
}

function startGame(save) {
  runtime.save=validateSave(save);
  sound.sync();
  titleScreen.classList.remove('is-visible');
  loading.classList.remove('is-visible');
  loadZone(runtime.save.zone,runtime.save.position,false);
  runtime.startedAt=performance.now();
  runtime.lastTime=performance.now();
  runtime.finalStarted=!!runtime.save.world.talked['weaver-before'];
  player.dead=false;
  setMode('playing');
  updateHud();
  persistSave(true);
  showToast(runtime.save.quest.stage===0 ? 'Найди Миру у костра' : `Возвращение: ${runtime.zone.name}`);
}

function newGame() {
  const begin=()=>{
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    startGame(createInitialSave());
  };
  if (hasStoredSave()) confirmPanel('Начать заново?', 'Текущее прохождение будет удалено. Отменить это уже не получится.', begin);
  else begin();
}

function loadZone(zoneId, position=null, saveNow=true) {
  const zone=ZONES[zoneId]||ZONES.threshold;
  runtime.zone=zone;
  runtime.enemies=createZoneEnemies(zone.id,runtime.save);
  runtime.projectiles=[]; runtime.particles=[]; runtime.floaters=[];
  const spawn=position||zone.spawn;
  player.x=spawn.x; player.y=spawn.y; player.vx=0; player.vy=0;
  runtime.save.zone=zone.id; runtime.save.position={x:player.x,y:player.y};
  camera.x=player.x-VIEW.width/2; camera.y=player.y-VIEW.height/2;
  runtime.nearby=null;
  if(saveNow) persistSave();
  updateHud();
}
