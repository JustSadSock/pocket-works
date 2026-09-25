import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  Scene,
  Vector3
} from '@babylonjs/core';
import {
  POTIONS,
  RELICS,
  clamp,
  generateDungeon,
  makeRng,
  rollLoot,
  roomByPoint
} from './core.js';
import { CryptInput } from './input.js';
import { CryptAudio } from './audio.js';
import { CryptVisuals, hslColor } from './world.js';
import { generateEnemyBlueprint } from './enemy-generator.js';
import { generateWeapon } from './weapon-generator.js';
import { CapsuleController } from './player-controller.js';
import { STARTER_WEAPON, attackTiming } from './combat-motion.js';
import { EncounterDirector, buildEncounterPlan } from './encounter-director.js';

const STORAGE_KEY = 'pocket-works:melt-crypt';
const ROOM_NAMES = [
  'VESTIBULE OF UNPAID MIRACLES',
  'CHAPEL OF BAD TIMING',
  'THE WET INDEX',
  'ROOM THAT KNOWS YOUR PASSWORD',
  'CHOIR STORAGE',
  'TAXONOMIC ACCIDENT',
  'CARPETLESS THRONE',
  'DEPARTMENT OF TEETH',
  'SIDEWAYS OSSUARY',
  'POLITE ABYSS',
  'MOTH ACCOUNTING',
  'HALL OF SLIGHTLY WRONG DOORS'
];
const ABILITY_COPY = {
  'heavy-sweep': 'huge hammer: slow wide hit, brutal stagger',
  flurry: 'claws: short reach, fast repeated attacks',
  thrust: 'long spear: narrow attack with extra reach',
  'shield-bash': 'shield arm: blocks that side and bashes up close',
  bolt: 'glowing arm growth: ranged projectile',
  'hook-pull': 'hook arm: catches and drags targets inward',
  slam: 'oversized fist: slow impact with heavy knockback',
  cleave: 'broad blade: readable mid-speed sweep'
};

function defaultMeta() {
  return {
    version: 2,
    settings: { quality: 'pixel', sensitivity: 1, psyche: true, sound: true },
    bestFloor: 0,
    runs: 0,
    deaths: 0,
    codex: [],
    lootCodex: [],
    weaponCodex: [],
    run: null
  };
}

function loadMeta() {
  const fallback = defaultMeta();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    const legacy = Number(parsed.version || 1) < 2;
    const legacyRun = parsed.run && typeof parsed.run === 'object'
      ? {
          ...parsed.run,
          damage: 1,
          speed: Math.max(5.05, Number(parsed.run.speed) || 0),
          crit: 0.05,
          lifesteal: 0,
          dashReduction: 0,
          relics: [],
          potions: [],
          weapon: null,
          recentEnemySignatures: [],
          recentWeaponSignatures: []
        }
      : null;
    return {
      ...fallback,
      ...parsed,
      version: 2,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      codex: legacy ? [] : Array.isArray(parsed.codex) ? parsed.codex.slice(0, 128) : [],
      lootCodex: legacy ? [] : Array.isArray(parsed.lootCodex) ? parsed.lootCodex.slice(0, 96) : [],
      weaponCodex: legacy ? [] : Array.isArray(parsed.weaponCodex) ? parsed.weaponCodex.slice(0, 128) : [],
      run: legacy ? legacyRun : parsed.run && typeof parsed.run === 'object' ? parsed.run : null
    };
  } catch {
    return fallback;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomSeed() {
  try {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 0x51c0ffee;
  } catch {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
}

function potionById(id) { return POTIONS.find((item) => item.id === id); }
function relicById(id) { return RELICS.find((item) => item.id === id); }
function weaponSafeDamage(weapon) { return Number(weapon?.damage) || 12; }

export class MeltCryptGame {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#render-canvas');
    this.el = {};
    [
      'psy-layer','damage-layer','hud','floor-label','health-fill','health-label','room-label','mutation-label','kill-label',
      'minimap','pause-button','reticle','weapon-readout','weapon-name','weapon-state','potion-readout','potion-name','potion-count',
      'context-prompt','context-label','context-copy','action-cluster','use-button-label','dash-meter','floor-banner',
      'floor-banner-top','floor-banner-main','floor-banner-copy','toast','discovery','discovery-name','discovery-copy',
      'loading','loading-text','loading-bar','title-screen','new-run-button','continue-button','title-settings-button',
      'title-exit-button','title-best','title-codex','pause-screen','pause-floor','pause-kills','pause-relics','resume-button',
      'pause-settings-button','abandon-button','pause-exit-button','settings-screen','settings-close','quality-select',
      'sensitivity-input','psy-toggle','sound-toggle','death-screen','death-floor','death-kills','death-discoveries',
      'death-new-button','death-exit-button','rotate-screen','error-screen','error-text','reload-button','error-exit-button'
    ].forEach((id) => { this.el[id] = root.querySelector('#' + id); });

    this.meta = loadMeta();
    this.phase = 'boot';
    this.settingsReturnPhase = 'title';
    this.run = null;
    this.dungeon = null;
    this.floorKills = 0;
    this.currentRoomId = null;
    this.contextTarget = null;
    this.enemies = [];
    this.projectiles = [];
    this.drops = [];
    this.fireCooldown = 0;
    this.dashCooldown = 0;
    this.skillCooldown = 0;
    this.skillAnim = 0;
    this.hitStop = 0;
    this.parryWindow = 0;
    this.wardTimer = 0;
    this.attackHold = 0;
    this.attackState = { active:false, timer:0, duration:0, heavy:false, combo:-1, hitDone:false, dashAttack:false };
    this.recentEnemySignatures = [];
    this.recentWeaponSignatures = [];
    this.dashTimer = 0;
    this.dashDirection = new Vector3(0, 0, 1);
    this.invulnerable = 0;
    this.effects = { warp: 0, slow: 0, speed: 0, rage: 0, haste: 0 };
    this.damageFlash = 0;
    this.elapsed = 0;
    this.runRng = Math.random;
    this.orientationBlocked = false;
    this.abandonArmed = false;
    this.discoveryTimer = 0;
    this.floorBannerTimer = 0;
    this.minimapTimer = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.cameraFx = { recoil: 0, hit: 0, dash: 0, step: 0, lean: 0 };
    this.roomTitleCache = new Map();
    this.encounterDirector = new EncounterDirector();
    this.combatActive = false;
    this.weaponBannerTimer = 0;
    this.attackCommitted = false;
  }

  async init(report = () => {}) {
    report('opening a hole in local reality…', 0.1);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    this.engine = new Engine(this.canvas, false, {
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: 'high-performance',
      antialias: false
    }, false);
    this.applyQuality();

    report('teaching the walls collision law…', 0.32);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.025, 0.055, 1);
    this.scene.collisionsEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.024;
    this.scene.fogColor = new Color3(0.09, 0.045, 0.12);
    this.scene.imageProcessingConfiguration.contrast = 1.04;
    this.scene.imageProcessingConfiguration.exposure = 0.98;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;

    this.camera = new FreeCamera('crypt-player', new Vector3(0, 1.58, 0), this.scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 90;
    this.camera.fov = 0.95;
    this.camera.inertia = 0;
    this.camera.checkCollisions = false;
    this.scene.activeCamera = this.camera;

    report('growing an inadvisable weapon…', 0.55);
    this.visuals = new CryptVisuals(this.scene, this.camera);
    this.controller = new CapsuleController(this.camera, () => this.visuals.collisionBoxes);
    this.input = new CryptInput(this.root, this.canvas, this.meta.settings.sensitivity);
    this.audio = new CryptAudio(this.meta.settings.sound);
    this.bindUi();
    this.updateSettingsUi();
    this.updateOrientation();

    report('checking the monster genome for spelling errors…', 0.82);
    this.engine.runRenderLoop(() => {
      const dt = Math.min(0.035, Math.max(0.001, this.engine.getDeltaTime() / 1000));
      this.tick(dt);
      this.scene.render();
    });
    this.onResize = () => { this.engine.resize(); this.updateOrientation(); };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);

    this.onVisibility = () => {
      if (document.hidden) {
        this.saveRun();
        if (this.phase === 'playing') this.pauseGame(true);
        this.audio.suspend();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', () => this.saveRun());

    report('the crypt has decided to cooperate…', 1);
    this.showTitle();
  }

  bindUi() {
    this.el['new-run-button'].addEventListener('click', () => this.startNewRun());
    this.el['continue-button'].addEventListener('click', () => this.continueRun());
    this.el['title-settings-button'].addEventListener('click', () => this.openSettings('title'));
    this.el['title-exit-button'].addEventListener('click', () => this.exitToLauncher());
    this.el['pause-button'].addEventListener('click', () => this.pauseGame());
    this.el['resume-button'].addEventListener('click', () => this.resumeGame());
    this.el['pause-settings-button'].addEventListener('click', () => this.openSettings('paused'));
    this.el['pause-exit-button'].addEventListener('click', () => this.exitToLauncher());

    this.el['abandon-button'].addEventListener('click', () => {
      if (!this.abandonArmed) {
        this.abandonArmed = true;
        this.el['abandon-button'].textContent = 'PRESS AGAIN TO ERASE RUN';
        setTimeout(() => {
          this.abandonArmed = false;
          this.el['abandon-button'].textContent = 'ABANDON RUN';
        }, 2400);
        return;
      }
      this.meta.run = null;
      this.run = null;
      this.saveMeta();
      this.abandonArmed = false;
      this.showTitle();
    });

    this.el['settings-close'].addEventListener('click', () => this.closeSettings());
    this.el['quality-select'].addEventListener('change', (event) => {
      this.meta.settings.quality = event.target.value;
      this.applyQuality();
      this.saveMeta();
    });
    this.el['sensitivity-input'].addEventListener('input', (event) => {
      this.meta.settings.sensitivity = Number(event.target.value);
      this.input.setSensitivity(event.target.value);
      this.saveMeta();
    });
    this.el['psy-toggle'].addEventListener('change', (event) => {
      this.meta.settings.psyche = event.target.checked;
      this.saveMeta();
      this.updatePsyche(0);
    });
    this.el['sound-toggle'].addEventListener('change', (event) => {
      this.meta.settings.sound = event.target.checked;
      this.audio.setEnabled(event.target.checked);
      this.saveMeta();
    });

    this.el['death-new-button'].addEventListener('click', () => this.startNewRun());
    this.el['death-exit-button'].addEventListener('click', () => this.exitToLauncher());
    this.el['reload-button'].addEventListener('click', () => location.reload());
    this.el['error-exit-button'].addEventListener('click', () => this.exitToLauncher());
  }

  saveMeta() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.meta)); } catch {}
  }

  saveRun() {
    if (this.run && (this.phase === 'playing' || this.phase === 'paused' || this.phase === 'transition' || this.phase === 'settings')) {
      this.meta.run = clone(this.run);
      this.saveMeta();
    }
  }

  applyQuality() {
    if (!this.engine) return;
    const levels = { crisp: 1.15, pixel: 1.9, raw: 2.55 };
    this.engine.setHardwareScalingLevel(levels[this.meta.settings.quality] || 1.9);
  }

  updateSettingsUi() {
    this.el['quality-select'].value = this.meta.settings.quality;
    this.el['sensitivity-input'].value = String(this.meta.settings.sensitivity);
    this.el['psy-toggle'].checked = Boolean(this.meta.settings.psyche);
    this.el['sound-toggle'].checked = Boolean(this.meta.settings.sound);
  }

  hideScreens() {
    this.root.querySelectorAll('.screen').forEach((screen) => { screen.hidden = true; });
  }

  setGameplayUi(visible) {
    ['hud','reticle','weapon-readout','action-cluster'].forEach((key) => { this.el[key].hidden = !visible; });
    this.el['potion-readout'].hidden = true;
    if (!visible) this.el['context-prompt'].hidden = true;
  }

  generatorTier() {
    const best = Number(this.meta.bestFloor) || 0;
    const runs = Number(this.meta.runs) || 0;
    const vocabulary = (this.meta.codex?.length || 0) + (this.meta.weaponCodex?.length || 0);
    if (best >= 4 || vocabulary >= 28) return 3;
    if (best >= 2 || runs >= 2 || vocabulary >= 10) return 2;
    return 1;
  }

  showTitle() {
    this.phase = 'title';
    this.input?.reset();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.hideScreens();
    this.setGameplayUi(false);
    this.el['title-screen'].hidden = false;
    const canContinue = Boolean(this.meta.run && Number(this.meta.run.hp) > 0 && Number(this.meta.run.floor) > 0);
    this.el['continue-button'].hidden = !canContinue;
    this.el['title-best'].textContent = 'BEST FLOOR ' + String(this.meta.bestFloor || 0).padStart(2, '0');
    this.el['title-codex'].textContent = 'GRAMMAR TIER ' + this.generatorTier() + ' · ' + this.meta.codex.length + ' enemies / ' + this.meta.weaponCodex.length + ' weapons';
    this.updatePsyche(0.04);
    this.updateOrientation();
  }

  startNewRun() {
    const seed = randomSeed();
    const starterWeapon = clone(STARTER_WEAPON);
    this.run = {
      seed,
      floor: 1,
      hp: 100,
      maxHp: 100,
      damage: 1,
      speed: 5.05,
      crit: 0.05,
      lifesteal: 0,
      dashReduction: 0,
      relics: [],
      potions: [],
      weapon: starterWeapon,
      recentEnemySignatures: [],
      recentWeaponSignatures: [starterWeapon.signature],
      firstCombatRewarded: false,
      totalKills: 0,
      discoveries: 0,
      startedAt: Date.now()
    };
    this.meta.runs += 1;
    this.meta.run = clone(this.run);
    this.saveMeta();
    void this.audio.ensure();
    this.loadFloor();
  }

  continueRun() {
    if (!this.meta.run) return;
    this.run = clone(this.meta.run);
    this.run.relics = Array.isArray(this.run.relics) ? this.run.relics : [];
    this.run.potions = Array.isArray(this.run.potions) ? this.run.potions : [];
    this.run.discoveries = Number(this.run.discoveries) || 0;
    this.run.weapon = this.run.weapon || clone(STARTER_WEAPON);
    this.run.firstCombatRewarded = Boolean(this.run.firstCombatRewarded);
    this.run.recentEnemySignatures = Array.isArray(this.run.recentEnemySignatures) ? this.run.recentEnemySignatures.slice(-30) : [];
    this.run.recentWeaponSignatures = Array.isArray(this.run.recentWeaponSignatures) ? this.run.recentWeaponSignatures.slice(-18) : [this.run.weapon.signature];
    void this.audio.ensure();
    this.loadFloor();
  }

  clearEntities() {
    for (const enemy of this.enemies) {
      if (enemy.visual) this.visuals.disposeMonsterVisual(enemy.visual);
    }
    for (const projectile of this.projectiles) {
      projectile.mesh?.metadata?.disposableMaterial?.dispose();
      projectile.mesh?.dispose();
    }
    for (const drop of this.drops) {
      drop.visual?.node?.dispose(false, true);
      drop.visual?.material?.dispose();
      drop.visual?.materials?.forEach((material) => material?.dispose?.());
    }
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.drops.length = 0;
  }

  loadFloor() {
    if (!this.run) return;
    this.clearEntities();
    this.floorKills = 0;
    this.fireCooldown = 0;
    this.dashCooldown = 0;
    this.skillCooldown = 0;
    this.skillAnim = 0;
    this.attackHold = 0;
    this.attackState = { active:false, timer:0, duration:0, heavy:false, combo:-1, hitDone:false, dashAttack:false };
    this.effects = { warp: 0, slow: 0, speed: 0, rage: 0, haste: 0 };
    this.runRng = makeRng((this.run.seed ^ Math.imul(this.run.floor, 0x7f4a7c15)) >>> 0);
    this.dungeon = generateDungeon(this.run.seed, this.run.floor);
    this.visuals.buildDungeon(this.dungeon, this.run.floor);
    this.visuals.setGateUnlocked(false);
    this.visuals.setPlayerWeapon(this.run.weapon);
    this.currentRoomId = this.dungeon.startId;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.cameraFx = { recoil: 0, hit: 0, dash: 0, step: 0, lean: 0 };
    const start = this.dungeon.rooms[this.currentRoomId];
    const startCenter = this.visuals.roomCenters.get(start.id);
    this.controller.teleport(startCenter.x, startCenter.z, 0);
    start.visited = true;
    start.spawned = true;
    start.cleared = true;
    this.roomTitleCache.clear();
    this.contextTarget = null;
    this.encounterDirector.cancel();
    this.setCombatActive(false);

    const fog = hslColor(352, 0.28, 0.105);
    this.scene.fogColor.copyFrom(fog);
    this.scene.clearColor = new Color4(0.045, 0.026, 0.026, 1);
    this.audio.setFloor(this.run.floor);

    this.hideScreens();
    this.setGameplayUi(true);
    this.phase = 'playing';
    this.input.reset();
    this.updateRoomLabel(start);
    this.updateHud();
    this.drawMinimap();
    this.showFloorBanner('ENTERING', 'FLOOR ' + String(this.run.floor).padStart(2, '0'), this.floorSubtitle());
    this.meta.bestFloor = Math.max(this.meta.bestFloor || 0, this.run.floor);
    this.meta.run = clone(this.run);
    this.saveMeta();
    this.updateOrientation();
  }

  floorSubtitle() {
    const lines = [
      'the walls learned a new shape',
      'the same stone arranged a different argument',
      'the floor plan denies responsibility',
      'something is singing through masonry',
      'all doors are technically opinions',
      'the grammar remembers what you survived'
    ];
    return lines[(this.run.floor - 1) % lines.length];
  }

  roomTitle(room) {
    if (this.roomTitleCache.has(room.id)) return this.roomTitleCache.get(room.id);
    let title;
    if (room.role === 'start') title = 'FOYER OF TEMPORARY CONFIDENCE';
    else if (room.role === 'gate') title = 'DESCENT OFFICE';
    else if (room.role === 'chest') title = 'UNSUPERVISED TREASURY';
    else if (room.role === 'shrine') title = 'BAD IDEA CHAPEL';
    else title = ROOM_NAMES[(room.id * 7 + this.run.floor * 3) % ROOM_NAMES.length];
    this.roomTitleCache.set(room.id, title);
    return title;
  }

  updateRoomLabel(room) {
    this.el['room-label'].textContent = this.roomTitle(room);
  }

  showFloorBanner(top, main, copy) {
    this.el['floor-banner-top'].textContent = top;
    this.el['floor-banner-main'].textContent = main;
    this.el['floor-banner-copy'].textContent = copy;
    this.el['floor-banner'].hidden = false;
    this.floorBannerTimer = 1.7;
  }

  toast(message) {
    this.el.toast.textContent = message;
    this.el.toast.classList.remove('show');
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('show');
  }

  discoverMonster(genome) {
    const sig = genome.signature;
    if (this.meta.codex.some((entry) => entry.sig === sig)) return;
    this.meta.codex.push({
      sig, name: genome.name, body: genome.body, locomotion: genome.locomotion,
      weapon: genome.rightArm, defense: genome.defense, mutation: genome.mutation
    });
    this.meta.codex = this.meta.codex.slice(-128);
    if (this.run) this.run.discoveries += 1;
    this.saveMeta();
    const attack = ABILITY_COPY[genome.ability] || genome.rightArmSpec?.cue || 'read the silhouette';
    const secondary = genome.leftArm !== genome.rightArm && genome.leftArmSpec?.cue ? ' · off-arm: ' + genome.leftArmSpec.cue : '';
    const locomotion = genome.locomotionSpec?.label ? ' · ' + genome.locomotionSpec.label : '';
    const head = genome.headSpec?.cue && genome.head !== 'bare' ? ' · ' + genome.headSpec.cue : '';
    const defense = genome.defenseSpec?.cue && genome.defense !== 'open' ? ' · ' + genome.defenseSpec.cue : '';
    const mutation = genome.mutationSpec?.cue && genome.mutation !== 'none' ? ' · ' + genome.mutationSpec.cue : '';
    this.showDiscovery(genome.name, attack + secondary + locomotion + head + defense + mutation);
  }

  discoverWeapon(weapon) {
    if (!weapon || this.meta.weaponCodex.some((entry) => entry.sig === weapon.signature)) return;
    this.meta.weaponCodex.push({
      sig: weapon.signature, name: weapon.name, core: weapon.core, head: weapon.head,
      skill: weapon.skill, trait: weapon.trait
    });
    this.meta.weaponCodex = this.meta.weaponCodex.slice(-128);
    if (this.run) this.run.discoveries += 1;
    this.saveMeta();
    this.showDiscovery(weapon.name, weapon.headSpec.label + ' · ' + weapon.handleSpec.label + ' · ' + weapon.traitSpec.label + ': ' + weapon.traitSpec.copy + ' · skill: ' + weapon.skillSpec.label);
  }

  discoverLoot(item) {
    if (this.meta.lootCodex.some((entry) => entry.id === item.id)) return;
    this.meta.lootCodex.push({ id: item.id, name: item.name });
    this.meta.lootCodex = this.meta.lootCodex.slice(-96);
    if (this.run) this.run.discoveries += 1;
    this.saveMeta();
    this.showDiscovery(item.name, item.copy);
  }

  showDiscovery(name, copy) {
    this.el['discovery-name'].textContent = name;
    this.el['discovery-copy'].textContent = copy;
    this.el.discovery.hidden = false;
    this.discoveryTimer = 3.3;
  }

  spawnRoom(room) {
    if (room.spawned) return;
    room.spawned = true;
    room.cleared = false;
    const firstCombat = this.run.floor === 1 && !this.run.firstCombatRewarded && room.role === 'room';
    const plan = buildEncounterPlan(room,this.run.floor,this.run.seed,{firstCombat});
    this.visuals.sealRoom(room);
    this.setCombatActive(true);
    this.handleEncounterEvents(this.encounterDirector.begin(plan),room);
  }

  spawnEncounterSeed(seed, room) {
    this.recentEnemySignatures = Array.isArray(this.run.recentEnemySignatures) ? this.run.recentEnemySignatures.slice(-30) : [];
    const genome = generateEnemyBlueprint(seed, this.run.floor, room.danger, this.recentEnemySignatures, this.generatorTier());
    this.recentEnemySignatures.push(genome.signature);
    this.recentEnemySignatures = this.recentEnemySignatures.slice(-30);
    this.run.recentEnemySignatures = this.recentEnemySignatures.slice(-30);

    const rng = makeRng(seed ^ 0xa511e9b3);
    const center = this.visuals.roomCenters.get(room.id);
    let ox = 0, oz = 0;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      ox = (rng() - 0.5) * (room.sizeX - 3.4);
      oz = (rng() - 0.5) * (room.sizeZ - 3.4);
      if (Math.hypot(ox, oz) < 2.8) { ox += ox < 0 ? -2.6 : 2.6; oz += oz < 0 ? -1.4 : 1.4; }
      const wx = center.x + ox, wz = center.z + oz;
      if (!this.controller.overlapsAt(wx, wz, 0)) break;
    }
    const position = new Vector3(center.x + ox, 0, center.z + oz);
    return this.spawnEnemy(genome, room.id, position, false);
  }

  setCombatActive(value) {
    this.combatActive=Boolean(value);
    this.root.classList.toggle('combat-active',this.combatActive);
    this.audio?.setCombat?.(this.combatActive);
  }

  handleEncounterEvents(events,room) {
    for(const event of events||[]){
      if(event.type==='cue'){
        this.audio?.encounterCue?.(event.kind);
        if(event.text)this.toast(event.text);
      } else if(event.type==='spawn'){
        for(const seed of event.seeds)this.spawnEncounterSeed(seed,room);
      } else if(event.type==='clear'){
        room.cleared=true;
        this.visuals.unsealRoom(room);
        this.setCombatActive(false);
        this.audio?.encounterCue?.('clear');
        this.toast('ROOM CLEAR.');
        if(event.reward==='weapon-choice'&&!this.run.firstCombatRewarded){
          this.run.firstCombatRewarded=true;
          this.spawnWeaponChoice(room.id,3);
        }
        this.drawMinimap();
        this.saveRun();
      }
    }
  }

  updateEncounter(dt) {
    const room=this.dungeon?.rooms?.[this.currentRoomId];
    if(!room||!room.spawned||room.cleared)return;
    const alive=this.enemies.filter((enemy)=>!enemy.dead&&!enemy.dying&&enemy.roomId===room.id).length;
    this.handleEncounterEvents(this.encounterDirector.tick(dt,alive),room);
  }

  spawnWeaponChoice(roomId,count=3) {
    const room=this.dungeon.rooms[roomId];
    const center=this.visuals.roomCenters.get(roomId);
    if(!room||!center)return;
    const group='choice-'+roomId+'-'+Date.now();
    const offsets=count===3?[[-1.55,0.7],[0,1.1],[1.55,0.7]]:[[0,0.9]];
    offsets.slice(0,count).forEach(([x,z],index)=>{
      this.spawnWeaponDrop(center.add(new Vector3(x,0,z)),roomId,{choiceGroup:group,seedSalt:0x99e1+index*733});
    });
    this.toast('CHOOSE A WEAPON.');
    this.weaponBannerTimer=2.8;
  }


  spawnEnemy(genome, roomId, position, child = false) {
    const enemy = {
      id: this.enemies.length + 1,
      genome,
      roomId,
      hp: genome.maxHp,
      maxHp: genome.maxHp,
      dead: false,
      child,
      attackTimer: 0.35 + this.runRng() * 0.45,
      specialTimer: 1.2 + this.runRng() * 1.4,
      tellTimer: 0,
      attackKind: null,
      attackHit: false,
      stagger: 0,
      staggerTime: 0,
      knockVelocity: new Vector3(),
      facing: 0,
      visual: null
    };
    enemy.visual = this.visuals.createMonsterVisual(genome, position);
    this.visuals.tagEnemy(enemy.visual, enemy);
    this.enemies.push(enemy);
    this.discoverMonster(genome);
    return enemy;
  }

  tick(dt) {
    this.elapsed += dt;
    if (this.floorBannerTimer > 0) {
      this.floorBannerTimer -= dt;
      if (this.floorBannerTimer <= 0) this.el['floor-banner'].hidden = true;
    }
    if (this.discoveryTimer > 0) {
      this.discoveryTimer -= dt;
      if (this.discoveryTimer <= 0) this.el.discovery.hidden = true;
    }

    this.visuals?.update(this.elapsed, this.effects.warp > 0 ? 0.35 : 0);
    this.updatePsyche(dt);
    if (this.phase !== 'playing') return;

    const actions = this.input.consumeActions();
    if (actions.pause) { this.pauseGame(); return; }

    this.updateEffects(dt);
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
      this.updateHud();
      return;
    }

    if (actions.attackStart && !this.attackState.active) {
      this.attackHold = 0;
      this.attackCommitted = false;
      this.audio.tone('ready',0.38);
    }
    if (actions.attackHeld && !this.attackState.active) {
      this.attackHold += dt;
      if (this.attackHold >= 0.3 && !this.attackCommitted) {
        this.attackCommitted = true;
        this.startAttack(true, this.justDodged > 0.02);
      }
    }
    if (actions.attackRelease && !this.attackState.active && !this.attackCommitted) {
      this.startAttack(false, this.justDodged > 0.02);
      this.attackHold = 0;
    }
    if (actions.attackRelease) this.attackCommitted = false;
    if (actions.dodge && this.dashCooldown <= 0) this.startDash();
    if (actions.skill) {
      if (this.contextTarget) this.useAction();
      else this.useWeaponSkill();
    }

    this.updatePlayer(dt, actions);
    this.updateAttack(dt, actions.attackHeld);
    this.updateCurrentRoom();
    this.updateEnemies(dt);
    this.updateEncounter(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateContext();
    this.updateHud();

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.16;
      this.drawMinimap();
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.skillAnim = Math.max(0, this.skillAnim - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.parryWindow = Math.max(0, this.parryWindow - dt);
    this.wardTimer = Math.max(0, this.wardTimer - dt);
    this.justDodged = Math.max(0, (this.justDodged || 0) - dt);
    this.weaponBannerTimer = Math.max(0, this.weaponBannerTimer - dt);
    this.root.classList.toggle('weapon-banner-active', this.weaponBannerTimer > 0);
  }

  updateEffects(dt) {
    Object.keys(this.effects).forEach((key) => { this.effects[key] = Math.max(0, this.effects[key] - dt); });
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    this.el['damage-layer'].style.opacity = String(this.damageFlash * 0.78);
  }

  updatePsyche() {
    const enabled = Boolean(this.meta.settings.psyche);
    if (!enabled) {
      this.root.style.setProperty('--psy-opacity', '0');
      this.root.style.setProperty('--game-hue', '0deg');
      this.root.style.setProperty('--game-sat', '1.04');
      this.root.style.setProperty('--game-scale', '1');
      return;
    }
    const mutation = this.run ? Math.min(1, (this.run.floor - 1) * 0.04) : 0.04;
    const warp = this.effects.warp > 0 ? 0.12 : 0;
    const opacity = 0.028 + mutation * 0.035 + warp;
    const hue = Math.sin(this.elapsed * 0.31) * (1.5 + mutation * 2 + warp * 12);
    this.root.style.setProperty('--psy-opacity', String(opacity));
    this.root.style.setProperty('--psy-spin', String((this.elapsed * 4) % 360) + 'deg');
    this.root.style.setProperty('--psy-x', String(58 + Math.sin(this.elapsed * 0.6) * 13) + '%');
    this.root.style.setProperty('--psy-y', String(43 + Math.cos(this.elapsed * 0.47) * 12) + '%');
    this.root.style.setProperty('--psy-blur', this.effects.warp > 0 ? '0.8px' : '0px');
    this.root.style.setProperty('--game-hue', String(hue) + 'deg');
    this.root.style.setProperty('--game-sat', String(1.05 + mutation * 0.08 + warp * 0.22));
    this.root.style.setProperty('--game-contrast', String(1.06 + warp * 0.18));
    this.root.style.setProperty('--game-scale', this.effects.warp > 0 ? String(1.002 + Math.sin(this.elapsed * 4) * 0.002) : '1');
  }

  updatePlayer(dt) {
    const look = this.input.consumeLook();
    this.lookYaw += look.x;
    this.lookPitch = clamp(this.lookPitch + look.y, -1.28, 1.28);

    const move = this.input.getMove();
    const yaw = this.lookYaw;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let direction = forward.scale(move.y).add(right.scale(move.x));
    if (direction.lengthSquared() > 1) direction.normalize();

    const autoSprint = move.magnitude > 0.84;
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      direction = this.dashDirection.clone();
      const dashSpeed = this.hasRelic('blink-tendon') ? 16.6 : 13.8;
      this.controller.movePlanar(direction.x * dashSpeed * dt, direction.z * dashSpeed * dt);
    } else {
      let speed = this.run.speed * (autoSprint ? 1.24 : 1);
      if (this.effects.speed > 0) speed *= 1.3;
      if (this.attackState.active && this.run.weapon?.movement === 'rooted') speed *= 0.48;
      this.controller.movePlanar(direction.x * speed * dt, direction.z * speed * dt);
    }

    const fx = this.cameraFx;
    fx.recoil = Math.max(0, fx.recoil - dt * 7.5);
    fx.hit = Math.max(0, fx.hit - dt * 4.1);
    fx.dash = Math.max(0, fx.dash - dt * 5.4);
    fx.step += dt * (5.4 + move.magnitude * (autoSprint ? 9.2 : 6.8));
    fx.lean += ((-move.x * (autoSprint ? 0.035 : 0.024)) - fx.lean) * Math.min(1, dt * 10);

    const moving = move.magnitude * (this.dashTimer > 0 ? 0.32 : 1);
    const bobAmp = autoSprint ? 0.032 : 0.021;
    const bob = Math.sin(fx.step) * bobAmp * moving;
    const lateralBob = Math.cos(fx.step * 0.5) * 0.0045 * moving;
    const hitYaw = Math.sin(this.elapsed * 47) * fx.hit * 0.016;
    const hitPitch = Math.cos(this.elapsed * 53) * fx.hit * 0.012;

    this.controller.syncCamera(bob);
    this.camera.rotation.y = this.lookYaw + hitYaw + lateralBob;
    this.camera.rotation.x = clamp(this.lookPitch + hitPitch - fx.recoil * 0.018, -1.3, 1.3);
    this.camera.rotation.z = fx.lean + Math.sin(this.elapsed * 41) * fx.hit * 0.008;

    const targetFov = 0.95 + fx.dash * 0.09 + (autoSprint ? 0.035 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
  }

  startDash() {
    const move = this.input.getMove();
    const yaw = this.lookYaw;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let direction = forward.scale(move.y).add(right.scale(move.x));
    if (direction.lengthSquared() < 0.04) direction = forward;
    direction.normalize();
    this.dashDirection.copyFrom(direction);
    this.dashTimer = 0.18;
    this.justDodged = 0.44;
    this.dashCooldown = Math.max(0.62, 1.45 * (1 - (this.run.dashReduction || 0)));
    this.invulnerable = Math.max(this.invulnerable, 0.22);
    this.cameraFx.dash = 1;
    this.audio.tone('dash');
    navigator.vibrate?.(8);
  }

  normalizeAngle(value) {
    let angle = value;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  findAimTarget(range = 3, coneDegrees = 38) {
    const origin = this.controller.position;
    const forward = new Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw));
    const cone = coneDegrees * Math.PI / 180;
    let best = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.visual || enemy.roomId !== this.currentRoomId) continue;
      const delta = enemy.visual.root.position.subtract(origin);
      delta.y = 0;
      const distance = delta.length();
      if (distance > range || distance < 0.001) continue;
      delta.scaleInPlace(1 / distance);
      const angle = Math.acos(clamp(Vector3.Dot(forward, delta), -1, 1));
      if (angle > cone) continue;
      const score = angle * 2.2 + distance * 0.055;
      if (score < bestScore) { bestScore = score; best = enemy; }
    }
    return best;
  }

  applyAimAssist(weapon, dashAttack = false) {
    const target = this.findAimTarget((weapon?.reach || 1) + (dashAttack ? 1.5 : 0.9), dashAttack ? 48 : 38);
    if (!target) return null;
    const dx = target.visual.root.position.x - this.controller.position.x;
    const dz = target.visual.root.position.z - this.controller.position.z;
    const targetYaw = Math.atan2(dx, dz);
    const delta = this.normalizeAngle(targetYaw - this.lookYaw);
    const maxCorrection = (weapon.magnetism || 12) * (dashAttack ? 1.2 : 1) * Math.PI / 180;
    this.lookYaw += clamp(delta, -maxCorrection, maxCorrection) * (dashAttack ? 0.95 : 0.72);
    return target;
  }

  startAttack(heavy = false, dashAttack = false) {
    const weapon = this.run.weapon;
    if (!weapon || this.attackState.active || this.fireCooldown > 0.02) return;
    this.applyAimAssist(weapon, dashAttack);
    const combo = ((this.attackState.combo ?? -1) + 1) % Math.max(1, weapon.comboLength || 1);
    const haste = this.effects.haste > 0 ? 0.78 : 1;
    const timing = attackTiming(weapon,heavy,combo,haste);
    this.attackState = {
      active:true,timer:timing.duration,duration:timing.duration,heavy,combo,
      hitDone:false,dashAttack,impactStart:timing.impactStart,impactEnd:timing.impactEnd
    };
    this.fireCooldown = timing.duration * 0.76;
    this.audio.tone(heavy ? 'heavy-swing' : 'swing', heavy ? 1 : 0.82);
    navigator.vibrate?.(heavy ? 10 : 4);
  }

  updateAttack(dt, attackHeld) {
    if (!this.run?.weapon) return;
    const charge = !this.attackState.active && attackHeld ? clamp(this.attackHold / 0.62, 0, 1) : 0;
    if (!this.attackState.active) {
      this.visuals.setWeaponPose({ charge, skill: this.skillAnim > 0 ? 1 - this.skillAnim / 0.42 : 0 });
      return;
    }

    const state = this.attackState;
    state.timer = Math.max(0, state.timer - dt);
    const progress = 1 - state.timer / Math.max(0.001, state.duration);
    this.visuals.setWeaponPose({
      swing: progress,
      charge: 0,
      skill: 0,
      combo: state.combo,
      heavy: state.heavy
    });

    const activeStart = state.impactStart ?? 0.34;
    const activeEnd = state.impactEnd ?? 0.56;
    if (!state.hitDone && progress >= activeStart && progress <= activeEnd) {
      state.hitDone = true;
      this.performMeleeHit(state);
    }

    const weapon=this.run.weapon;
    if (progress < 0.44 && weapon.movement !== 'rooted') {
      const push = state.heavy && weapon.core === 'claws' ? 3.0
        : state.heavy && weapon.core === 'spear' ? 2.35
        : weapon.movement === 'lunge' ? 2.0
        : weapon.movement === 'step-in' ? 1.2
        : 0.5;
      const forward = new Vector3(Math.sin(this.lookYaw),0,Math.cos(this.lookYaw));
      this.controller.movePlanar(forward.x * push * dt, forward.z * push * dt);
    }

    if (state.timer <= 0) {
      this.attackState = { ...state, active:false, timer:0, hitDone:false };
      this.visuals.setWeaponPose({});
    }
  }

  getEnemyHitRegion(enemy) {
    const genome=enemy.genome;
    const root=enemy.visual.root;
    const toPlayer=this.controller.position.subtract(root.position);
    toPlayer.y=0;
    if(toPlayer.lengthSquared()>0.0001)toPlayer.normalize();
    const forward=new Vector3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
    const right=new Vector3(Math.cos(root.rotation.y),0,-Math.sin(root.rotation.y));
    const frontDot=Vector3.Dot(forward,toPlayer);
    const sideDot=Vector3.Dot(right,toPlayer);

    if (genome.mutation === 'back-core' && frontDot < -0.28) return { name:'weak-core', multiplier:1.9, weak:true };
    if (genome.mutation === 'blood-sacs' && frontDot < -0.1) return { name:'blood-sac', multiplier:1.48, weak:true };
    if (genome.defense === 'right-shield' && sideDot > 0.15) return { name:'shield', multiplier:0.14, blocked:true };
    if (genome.defense === 'left-shield' && sideDot < -0.15) return { name:'shield', multiplier:0.14, blocked:true };

    const aimedLegs=this.lookPitch>0.27;
    const aimedHead=this.lookPitch<-0.22;
    if (aimedHead && genome.head === 'armored') return { name:'armored-head', multiplier:0.32, blocked:true };
    if (aimedLegs && genome.defense === 'leg-plates') return { name:'armored-legs', multiplier:0.42, blocked:true };
    if (!aimedLegs && !aimedHead && genome.defense === 'chest-plate') return { name:'chest-plate', multiplier:0.3, blocked:true };
    if (!aimedLegs && !aimedHead && genome.defense === 'bone-cage') return { name:'bone-cage', multiplier:0.54, blocked:true };
    return { name: aimedLegs ? 'legs' : aimedHead ? 'head' : 'body', multiplier: aimedHead ? 1.24 : 1, weak:false };
  }

  performMeleeHit(state) {
    const weapon=this.run.weapon;
    const origin=this.controller.position;
    const forward=new Vector3(Math.sin(this.lookYaw),0,Math.cos(this.lookYaw));
    const heavyReach = state.heavy
      ? weapon.core === 'spear' ? 0.82
        : weapon.core === 'claws' ? 0.36
        : weapon.core === 'glaive' ? 0.42
        : 0.16
      : 0;
    const reach=weapon.reach + heavyReach + (state.dashAttack ? 0.58 : 0);
    const heavyArc = state.heavy && weapon.core === 'maul' ? 1.28 : 1;
    const halfArc=Math.max(0.16,weapon.arc*0.62*heavyArc);
    const candidates=[];
    for(const enemy of this.enemies){
      if(enemy.dead||!enemy.visual||enemy.roomId!==this.currentRoomId)continue;
      const delta=enemy.visual.root.position.subtract(origin);delta.y=0;
      const distance=delta.length();
      if(distance>reach+enemy.genome.size*0.34||distance<0.001)continue;
      delta.scaleInPlace(1/distance);
      const angle=Math.acos(clamp(Vector3.Dot(forward,delta),-1,1));
      if(angle<=halfArc)candidates.push({enemy,distance,angle});
    }
    candidates.sort((a,b)=>a.angle-b.angle||a.distance-b.distance);
    const maxTargets=weapon.core==='glaive'||weapon.core==='maul'?3:weapon.core==='twin'?2:1;
    const hits=candidates.slice(0,maxTargets);
    if(!hits.length){
      this.cameraFx.recoil=Math.max(this.cameraFx.recoil,state.heavy?0.18:0.08);
      return;
    }

    for(const hit of hits){
      const enemy=hit.enemy;
      const region=this.getEnemyHitRegion(enemy);
      const critical=!region.blocked && this.runRng()<(this.run.crit||0);
      const heavyMultiplier = !state.heavy ? 1
        : weapon.core === 'maul' ? 2.05
        : weapon.core === 'spear' ? 1.82
        : weapon.core === 'claws' ? 1.48
        : 1.72;
      const base=weapon.damage*(this.run.damage||1)*heavyMultiplier*(state.dashAttack?1.24:1)*(critical?1.55:1);
      const amount=base*region.multiplier;
      const redline = weapon.traitSpec?.effect === 'lowhp-stagger' && this.run.hp / this.run.maxHp < 0.35 ? 1.42 : 1;
      const stagger=weapon.stagger*(state.heavy?1.8:1)*(state.dashAttack?1.22:1)*redline;
      this.damageEnemy(enemy,amount,{
        critical,stagger,heavy:state.heavy,weak:region.weak,blocked:region.blocked,
        knock:(state.heavy?(weapon.core==='maul'?2.7:1.7):0.7)+(weapon.stagger>1.3?0.5:0)
      });

      if (!region.blocked && this.hasRelic('chain-suture')) {
        const chained=this.enemies.find((candidate)=>candidate!==enemy&&!candidate.dead&&candidate.visual&&candidate.roomId===enemy.roomId&&Vector3.Distance(candidate.visual.root.position,enemy.visual.root.position)<2.25);
        if(chained){
          chained.stagger+=0.62;
          this.visuals.createHitEffect(chained.visual.root.position.add(new Vector3(0,0.65,0)),forward,0.34,false);
        }
      }

      if (state.heavy && !region.blocked && this.hasRelic('grave-aftershock')) {
        for(const other of this.enemies){
          if(other===enemy||other.dead||!other.visual||other.roomId!==enemy.roomId)continue;
          if(Vector3.Distance(other.visual.root.position,enemy.visual.root.position)<1.8){
            other.hp-=weapon.damage*0.2*(this.run.damage||1);
            other.stagger+=0.42;
            if(other.hp<=0)this.killEnemy(other);
          }
        }
      }
    }
  }

  damageEnemy(enemy, amount, options = {}) {
    if (enemy.dead || !enemy.visual) return;
    const { critical=false, stagger=0, heavy=false, weak=false, blocked=false, knock=0 }=options;
    enemy.hp -= Math.max(0.1, amount);
    enemy.stagger += stagger;
    const staggerResist=(enemy.genome.defenseSpec?.staggerResist||0)+(enemy.genome.mutationSpec?.staggerResist||0)+(enemy.genome.headSpec?.staggerResist||0);
    const threshold=2.15+staggerResist*2.2;
    const didStagger=enemy.stagger>=threshold;

    if(didStagger){
      enemy.stagger=0;
      enemy.staggerTime=Math.max(enemy.staggerTime,heavy?0.9:0.52);
      enemy.tellTimer=0;
      enemy.attackKind=null;
      if(knock>0){
        const away=enemy.visual.root.position.subtract(this.controller.position);away.y=0;
        if(away.lengthSquared()>0.001)enemy.knockVelocity=away.normalize().scale(knock*(heavy?3.3:2.1));
      }
    }

    const hitDirection=enemy.visual.root.position.subtract(this.controller.position).normalize();
    this.visuals.createHitEffect(enemy.visual.root.position.add(new Vector3(0,Math.max(0.55,enemy.genome.size),0)),hitDirection,heavy?1.5:0.8,weak);
    this.hitStop=Math.max(this.hitStop,blocked?0.018:heavy||didStagger?0.065:0.035);
    this.cameraFx.recoil=Math.max(this.cameraFx.recoil,heavy?0.7:0.32);
    this.audio.tone('hit',weak||critical?1.08:blocked?0.48:0.78);
    navigator.vibrate?.(heavy||didStagger?[8,18,8]:4);

    if(blocked&&!weak&&this.runRng()<0.3)this.toast('ARMOR ATE MOST OF THAT HIT.');
    if(weak)this.toast('WEAK POINT.');
    else if(critical)this.toast('CLEAN HIT.');

    const trait=this.run.weapon?.traitSpec?.effect;
    if(didStagger&&(trait==='stagger-blast'||this.hasRelic('rupture-heart'))){
      for(const other of this.enemies){
        if(other===enemy||other.dead||!other.visual||other.roomId!==enemy.roomId)continue;
        if(Vector3.Distance(other.visual.root.position,enemy.visual.root.position)<2.2){
          other.hp-=weaponSafeDamage(this.run.weapon)*0.22;
          other.stagger+=0.7;
          if(other.hp<=0)this.killEnemy(other);
        }
      }
    }
    if(didStagger&&trait==='chain-stagger'){
      const other=this.enemies.find((candidate)=>candidate!==enemy&&!candidate.dead&&candidate.visual&&candidate.roomId===enemy.roomId&&Vector3.Distance(candidate.visual.root.position,enemy.visual.root.position)<2.5);
      if(other){other.stagger+=1.15;this.visuals.createHitEffect(other.visual.root.position.add(new Vector3(0,0.8,0)),hitDirection,0.55,false);}
    }

    if (enemy.hp <= 0) this.killEnemy(enemy);
  }


  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const deathPosition = enemy.visual.root.position.clone();
    const mutation = enemy.genome.mutation;
    const roomId = enemy.roomId;

    if (mutation === 'back-core' || mutation === 'blood-sacs') {
      const radius = mutation === 'back-core' ? 2.7 : 2.15;
      const damage = enemy.genome.damage * (mutation === 'back-core' ? 0.7 : 0.5);
      this.visuals.createHitEffect(deathPosition.add(new Vector3(0,0.75,0)), new Vector3(0,1,0), 1.7, true);
      if (Vector3.Distance(deathPosition, this.controller.position) < radius) this.hurtPlayer(damage, enemy);
      for (const other of this.enemies) {
        if (other === enemy || other.dead || !other.visual || other.roomId !== roomId) continue;
        if (Vector3.Distance(other.visual.root.position, deathPosition) < radius) {
          this.damageEnemy(other, damage * 0.8, { stagger:1.4, knock:1.2, weak:true });
        }
      }
      this.hitStop=Math.max(this.hitStop,0.055);
    }

    this.visuals.disposeMonsterVisual(enemy.visual);
    enemy.visual = null;
    this.run.totalKills += 1;
    this.floorKills += 1;
    if (this.run.lifesteal > 0) this.run.hp = Math.min(this.run.maxHp, this.run.hp + this.run.lifesteal);
    if (this.run.weapon?.traitSpec?.effect === 'heal-exec' || this.hasRelic('execution-thread')) {
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + 2.5);
    }

    const dropRoll=this.runRng();
    if(dropRoll<0.28) this.spawnWeaponDrop(deathPosition, roomId);
    else if(dropRoll<0.43) this.spawnDrop(deathPosition);

    const room = this.dungeon.rooms[roomId];

    const unlocked = this.floorKills >= this.dungeon.requiredKills;
    if (unlocked && !this.visuals.gate?.unlocked) {
      this.visuals.setGateUnlocked(true);
      this.drawMinimap();
      this.audio.tone('gate', 1);
      this.toast('DESCENT OFFICE IS NOW ACCEPTING CLIENTS.');
    }
    this.saveRun();
  }

  spawnWeaponDrop(position, roomId = this.currentRoomId, options = {}) {
    const seed = options.seedSalt
      ? ((this.run.seed ^ Math.imul(this.floorKills + 11, options.seedSalt)) >>> 0)
      : (Math.floor(this.runRng() * 0xffffffff) >>> 0);
    const recent = Array.isArray(this.run.recentWeaponSignatures) ? this.run.recentWeaponSignatures : [];
    const weapon = generateWeapon(seed, this.run.floor, recent, this.generatorTier());
    this.run.recentWeaponSignatures = [...recent, weapon.signature].slice(-18);
    const visual = this.visuals.createWeaponDropVisual(weapon, position.add(new Vector3(0,0.03,0)));
    this.drops.push({ seed, type:'weapon', weapon, roomId, visual, age:0, choiceGroup:options.choiceGroup||null });
    this.drawMinimap();
  }


  spawnDrop(position, forced = null) {
    const seed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
    const loot = rollLoot(seed, this.run.floor, forced);
    const visual = this.visuals.createLootVisual(loot, position.add(new Vector3(0, 0.03, 0)), seed);
    this.drops.push({ seed, loot, visual, age: 0 });
    this.drawMinimap();
  }

  updateDrops(dt) {
    const player = this.controller.position;
    for (const drop of this.drops) {
      if (!drop.visual) continue;
      drop.age += dt;
      drop.visual.node.rotation.y += dt * (drop.type === 'weapon' ? 0.8 : 1.6);
      drop.visual.node.position.y = Math.sin(drop.age * 2.8 + drop.seed) * 0.08;
      const dx = drop.visual.node.position.x - player.x;
      const dz = drop.visual.node.position.z - player.z;
      if (drop.type !== 'weapon' && Math.hypot(dx, dz) < 1.15) this.collectDrop(drop);
    }
    this.drops = this.drops.filter((drop) => Boolean(drop.visual));
  }

  collectDrop(drop) {
    if (drop.type === 'weapon') {
      this.equipWeapon(drop.weapon);
      const group=drop.choiceGroup;
      for(const candidate of this.drops){
        if(candidate.type!=='weapon'||!candidate.visual)continue;
        if(candidate===drop||(group&&candidate.choiceGroup===group)){
          candidate.visual.node.dispose(false,true);
          candidate.visual.materials?.forEach((material)=>material.dispose());
          candidate.visual=null;
        }
      }
      this.drawMinimap();
      return;
    }

    const loot = drop.loot;
    this.discoverLoot(loot.item);
    if (loot.type === 'relic') {
      this.applyRelic(loot.item);
      this.toast('RELIC ACQUIRED: ' + loot.item.name.toUpperCase());
    } else {
      this.consumePotion(loot.item.id, true);
      this.toast('DRANK OFF THE FLOOR: ' + loot.item.name.toUpperCase());
    }
    drop.visual.node.dispose(false, true);
    drop.visual.material?.dispose();
    drop.visual = null;
    this.drawMinimap();
    this.audio.tone('loot', 1);
    this.saveRun();
  }

  equipWeapon(weapon) {
    if (!weapon) return;
    this.run.weapon=weapon;
    this.visuals.setPlayerWeapon(weapon);
    this.discoverWeapon(weapon);
    this.skillCooldown=0;
    this.attackState={active:false,timer:0,duration:0,heavy:false,combo:-1,hitDone:false,dashAttack:false};
    this.weaponBannerTimer=2.4;
    this.toast('EQUIPPED: ' + weapon.name + ' / ' + weapon.skillSpec.label);
    this.audio.tone('equip',1);
    navigator.vibrate?.([5,16,5]);
    this.saveRun();
  }


  applyRelic(item) {
    if (!item || this.run.relics.includes(item.id)) {
      if (item) this.toast('THE CRYPT REFUSES TO STACK IDENTICAL ORGANS.');
      return;
    }
    this.run.relics.push(item.id);
    this.toast('MECHANIC ACQUIRED: ' + item.name.toUpperCase());
  }

  hasRelic(id) {
    return Boolean(this.run?.relics?.includes(id));
  }


  drinkPotion() {
    if (!this.run.potions.length) {
      this.toast('YOUR FLASK QUEUE CONTAINS ONLY AIR.');
      return;
    }
    const id = this.run.potions.shift();
    this.consumePotion(id, false);
    this.saveRun();
  }

  consumePotion(id, immediate) {
    const item = potionById(id);
    if (!item) return;
    this.discoverLoot(item);
    this.audio.tone('drink', 1);
    navigator.vibrate?.([5, 20, 5]);

    if (item.effect === 'heal-warp') {
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + 28);
      this.effects.warp = Math.max(this.effects.warp, 6);
      this.toast('YOU CAN TASTE NEXT THURSDAY.');
    } else if (item.effect === 'slow') {
      this.effects.slow = Math.max(this.effects.slow, 7);
      this.toast('LOCAL TIME HAS BECOME STICKY.');
    } else if (item.effect === 'speed') {
      this.effects.speed = Math.max(this.effects.speed, 8);
      this.dashCooldown = 0;
      this.toast('GRAVITY HAS BEEN ASKED TO WAIT OUTSIDE.');
    } else if (item.effect === 'rage') {
      this.effects.rage = Math.max(this.effects.rage, 6);
      this.toast('THE TEA IS SCREAMING THROUGH YOUR HANDS.');
    } else {
      const roll = this.runRng();
      if (roll < 0.32) {
        this.run.hp -= 16;
        this.damageFlash = 0.8;
        this.toast('BOTTLE OF MAYBE: UNFORTUNATELY, NO.');
        if (this.run.hp <= 0) this.die();
      } else if (roll < 0.68) {
        this.run.hp = Math.min(this.run.maxHp, this.run.hp + 38);
        this.toast('BOTTLE OF MAYBE: SURPRISINGLY MEDICAL.');
      } else {
        this.run.damage *= 1.11;
        this.toast('BOTTLE OF MAYBE: CAREER ADVANCEMENT.');
      }
    }
    if (!immediate) this.effects.warp = Math.max(this.effects.warp, 0.8);
  }

  updateCurrentRoom() {
    const room = roomByPoint(this.dungeon, this.camera.position.x, this.camera.position.z);
    if (!room || room.id === this.currentRoomId) return;
    this.currentRoomId = room.id;
    room.visited = true;
    this.updateRoomLabel(room);
    this.spawnRoom(room);
    this.drawMinimap();
    if (room.role === 'gate' && !this.visuals.gate.unlocked) this.toast('DESCENT REQUIRES ' + Math.max(0, this.dungeon.requiredKills - this.floorKills) + ' MORE APOLOGIES.');
  }

  updateEnemies(dt) {
    const player = this.controller.position;
    let activeCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.visual) continue;
      const root = enemy.visual.root;
      const genome = enemy.genome;
      const motionT = this.elapsed * (genome.wobble || 1) + genome.phase;
      const floatY = genome.locomotion === 'floating' ? 0.18 + Math.sin(motionT * 1.7) * 0.12
        : genome.locomotion === 'hopper' ? Math.max(0, Math.sin(motionT * 2.5)) * 0.08
        : Math.sin(motionT * 2.2) * 0.025;
      root.position.y = floatY;

      if (enemy.visual.aura) {
        enemy.visual.aura.rotation.y += dt * 1.1;
        enemy.visual.aura.rotation.z += dt * 0.3;
      }
      if (enemy.roomId !== this.currentRoomId) continue;
      activeCount += 1;

      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      enemy.specialTimer = Math.max(0, enemy.specialTimer - dt);
      enemy.staggerTime = Math.max(0, enemy.staggerTime - dt);

      const dx = player.x - root.position.x;
      const dz = player.z - root.position.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const direction = new Vector3(dx / distance, 0, dz / distance);
      const slow = this.effects.slow > 0 ? 0.62 : 1;

      if (enemy.knockVelocity.lengthSquared() > 0.01) {
        root.position.addInPlace(enemy.knockVelocity.scale(dt));
        enemy.knockVelocity.scaleInPlace(Math.max(0,1-dt*7));
      }

      if (enemy.staggerTime > 0) {
        root.rotation.z = Math.sin(this.elapsed * 34) * 0.08;
        root.rotation.x = -0.08;
      } else {
        root.rotation.z = genome.locomotion === 'crawler' ? Math.sin(motionT * 5) * 0.035 : 0;
        root.rotation.x = 0;
        const desiredYaw = Math.atan2(dx, dz);
        const tracking=(genome.headSpec?.tracking||1);
        root.rotation.y += this.normalizeAngle(desiredYaw - root.rotation.y) * Math.min(1, dt * (genome.locomotion === 'heavy-biped' ? 4.2 : 7.5) * tracking);
        enemy.facing = root.rotation.y;
      }

      if (enemy.tellTimer > 0 && enemy.staggerTime <= 0) {
        enemy.tellTimer -= dt;
        const tellPulse = 1 + Math.sin(this.elapsed * 30) * 0.045;
        root.scaling.set(genome.size * tellPulse, genome.size / tellPulse, genome.size * tellPulse);
        if (enemy.tellTimer <= 0) {
          root.scaling.setAll(genome.size);
          this.executeEnemyAttack(enemy, distance, direction);
          enemy.attackKind = null;
        }
      } else if (enemy.staggerTime <= 0) {
        const attack = genome.ability;
        const cadence = Math.max(0.42, 1 / Math.max(0.35, genome.cadence || 1));

        if (genome.headSpec?.charge && enemy.specialTimer <= 0 && distance > 2.0 && distance < 5.5) {
          enemy.attackKind = 'horn-charge';
          enemy.attackSource = 'head';
          enemy.tellTimer = 0.46;
          enemy.specialTimer = 4.1 + this.runRng() * 1.2;
        } else if (genome.mutation === 'arc-growth' && enemy.specialTimer <= 0 && distance < 7.2) {
          enemy.attackKind = 'arc-pulse';
          enemy.attackSource = 'mutation';
          enemy.tellTimer = 0.52;
          enemy.specialTimer = 4.3 + this.runRng() * 1.3;
        } else if (genome.mutation === 'long-legs' && enemy.specialTimer <= 0 && distance > 2.1 && distance < 6.5) {
          enemy.attackKind = 'leg-dash';
          enemy.attackSource = 'mutation';
          enemy.tellTimer = 0.38;
          enemy.specialTimer = 3.6 + this.runRng();
        } else if (enemy.specialTimer <= 0 && genome.secondaryAbility && genome.secondaryAbility !== attack) {
          const secondary=genome.secondaryAbility;
          const ranged=secondary==='bolt';
          const valid=ranged ? distance<7.3 : secondary==='hook-pull' ? distance<4.8 : distance<Math.max(1.5,(genome.secondaryReach||1)+0.7);
          if(valid){
            enemy.attackKind=secondary;
            enemy.attackSource='secondary';
            const tells={ 'heavy-sweep':0.62,slam:0.7,flurry:0.18,thrust:0.34,'shield-bash':0.36,bolt:0.48,'hook-pull':0.44,cleave:0.3 };
            enemy.tellTimer=tells[secondary]||0.34;
            enemy.specialTimer=Math.max(2.4,1.65/Math.max(0.35,genome.secondaryCadence||1))+this.runRng()*0.9;
          }
        } else if (enemy.attackTimer <= 0) {
          enemy.attackKind = attack;
          enemy.attackSource = 'primary';
          const tells = {
            'heavy-sweep':0.62, slam:0.7, flurry:0.18, thrust:0.34,
            'shield-bash':0.36, bolt:0.48, 'hook-pull':0.44, cleave:0.3
          };
          enemy.tellTimer = tells[attack] || 0.34;
          enemy.attackTimer = cadence * (0.9 + this.runRng() * 0.22);
        }

        let preferred = 1.05;
        if (attack === 'bolt') preferred = 4.5;
        else if (attack === 'hook-pull') preferred = 2.7;
        else if (attack === 'thrust') preferred = 1.75;
        else if (attack === 'heavy-sweep' || attack === 'slam') preferred = 1.3;
        else if (attack === 'flurry') preferred = 0.82;

        if (!enemy.attackKind && distance > preferred) {
          const locomotionBoost = genome.locomotion === 'hopper' && distance > 2.4 ? 1.24 : 1;
          root.position.addInPlace(direction.scale(genome.speed * slow * locomotionBoost * dt));
        } else if (!enemy.attackKind && attack === 'bolt' && distance < 3.1) {
          root.position.addInPlace(direction.scale(-genome.speed * 0.55 * slow * dt));
        }
      }

      if (genome.mutation === 'spikes' && distance < 0.82 + genome.size * 0.42 && enemy.attackTimer <= 0.18) {
        this.hurtPlayer(genome.damage * (genome.mutationSpec.contactDamage || 0.3), enemy);
        enemy.attackTimer = Math.max(enemy.attackTimer,0.65);
      }

      const room = this.dungeon.rooms[enemy.roomId];
      const center = this.visuals.roomCenters.get(room.id);
      root.position.x = clamp(root.position.x, center.x - room.sizeX * 0.41, center.x + room.sizeX * 0.41);
      root.position.z = clamp(root.position.z, center.z - room.sizeZ * 0.41, center.z + room.sizeZ * 0.41);
    }
    this.audio.setDanger(Math.min(1, activeCount / 4));
  }

  executeEnemyAttack(enemy, distance, direction) {
    if (enemy.dead || !enemy.visual || enemy.staggerTime > 0) return;
    const genome=enemy.genome;
    const kind=enemy.attackKind;
    const sourceDamage=enemy.attackSource==='secondary'?(genome.secondaryDamage||genome.damage):genome.damage;
    let connected=false;
    const melee=(range,multiplier=1)=>{
      if(distance <= range + genome.size * 0.28){
        this.hurtPlayer(sourceDamage * multiplier, enemy);
        connected=true;
      }
    };

    if(kind==='bolt'){
      this.spawnEnemyProjectile(enemy,direction,5.7);
    } else if(kind==='arc-pulse'){
      for(let i=0;i<6;i+=1){
        const angle=i/6*Math.PI*2;
        this.spawnEnemyProjectile(enemy,new Vector3(Math.cos(angle),0,Math.sin(angle)),4.5);
      }
      this.audio.tone('blink',0.62);
    } else if(kind==='hook-pull'){
      if(distance<4.8){
        melee(4.8,0.58);
        const toward=enemy.visual.root.position.subtract(this.controller.position);toward.y=0;
        if(toward.lengthSquared()>0.001){
          toward.normalize();
          this.controller.movePlanar(toward.x*1.15,toward.z*1.15);
          this.controller.syncCamera();
        }
      }
    } else if(kind==='leg-dash'){
      const travel=Math.min(2.4,Math.max(0,distance-0.7));
      enemy.visual.root.position.addInPlace(direction.scale(travel));
      melee(1.25,1.12);
    } else if(kind==='horn-charge'){
      const travel=Math.min(2.15,Math.max(0,distance-0.65));
      enemy.visual.root.position.addInPlace(direction.scale(travel));
      melee(1.35,1.18);
    } else if(kind==='heavy-sweep'){
      melee(1.55,1.12);
    } else if(kind==='slam'){
      melee(1.35,1.25);
      if(distance<2.15)this.cameraFx.hit=Math.max(this.cameraFx.hit,0.48);
    } else if(kind==='flurry'){
      melee(1.05,0.72);
      if(distance<1.05)setTimeout(()=>{ if(!enemy.dead&&this.phase==='playing')this.hurtPlayer(genome.damage*0.55,enemy); },120);
    } else if(kind==='thrust'){
      melee(2.05,1.0);
    } else if(kind==='shield-bash'){
      melee(1.15,0.72);
    } else {
      melee(1.45,0.92);
    }

    if(connected&&genome.headSpec?.bite&&kind!=='bolt'&&kind!=='arc-pulse'){
      setTimeout(()=>{
        if(!enemy.dead&&this.phase==='playing'&&Vector3.Distance(enemy.visual.root.position,this.controller.position)<1.35){
          this.hurtPlayer(sourceDamage*0.34,enemy);
        }
      },105);
    }
    enemy.attackSource=null;
  }


  spawnEnemyProjectile(enemy, direction, speed) {
    const mesh = this.visuals.createProjectile(enemy.genome.accentHue, enemy.genome.elite ? 0.17 : 0.12);
    mesh.position.copyFrom(enemy.visual.root.position.add(new Vector3(0, 1.0 * enemy.genome.size, 0)));
    const targetY = this.camera.position.y - mesh.position.y;
    const velocity = new Vector3(direction.x, targetY * 0.13, direction.z).normalize().scale(speed);
    this.projectiles.push({ mesh, velocity, damage: enemy.genome.damage * 0.82, life: 4.2, hue: enemy.genome.accentHue, source: enemy });
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0 || !projectile.mesh) continue;
      projectile.life -= dt;
      projectile.mesh.position.addInPlace(projectile.velocity.scale(dt));
      projectile.mesh.rotation.y += dt * 4;
      projectile.mesh.rotation.x += dt * 2.4;
      if (Vector3.Distance(projectile.mesh.position, this.controller.position.add(new Vector3(0,1,0))) < 0.58) {
        this.hurtPlayer(projectile.damage, projectile.source);
        projectile.life = 0;
      }
      if (projectile.life <= 0) {
        projectile.mesh.metadata?.disposableMaterial?.dispose();
        projectile.mesh.dispose();
        projectile.mesh = null;
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => Boolean(projectile.mesh));
  }

  hurtPlayer(amount, source = null) {
    if (this.phase !== 'playing') return;

    if (this.parryWindow > 0 && source && !source.dead) {
      this.parryWindow = 0;
      source.stagger += 3;
      source.staggerTime = Math.max(source.staggerTime,0.7);
      const away=source.visual?.root?.position.subtract(this.controller.position);
      if(away&&away.lengthSquared()>0.001)source.knockVelocity=away.normalize().scale(3.2);
      this.hitStop=Math.max(this.hitStop,0.055);
      this.cameraFx.recoil=Math.max(this.cameraFx.recoil,0.55);
      this.toast('PARRIED.');
      this.audio.tone('hit',1.1);
      navigator.vibrate?.([6,18,6]);
      return;
    }

    if (this.invulnerable > 0) {
      if ((this.justDodged || 0) > 0.04 && (this.run.weapon?.traitSpec?.effect === 'dodge-haste' || this.hasRelic('perfect-nerve'))) {
        this.effects.haste = Math.max(this.effects.haste || 0, 3.4);
        this.toast('PERFECT DODGE — WEAPON HASTENED.');
      }
      return;
    }

    this.invulnerable = 0.34;
    const ward = this.wardTimer > 0 ? 0.36 : 1;
    this.run.hp -= Math.max(1, amount * ward);
    this.damageFlash = ward < 1 ? 0.36 : 0.88;
    this.cameraFx.hit = ward < 1 ? 0.35 : 0.9;
    this.audio.tone('hurt', ward < 1 ? 0.55 : 1);
    navigator.vibrate?.(ward < 1 ? 7 : [12, 28, 12]);
    if (this.run.hp <= 0) this.die();
  }

  useWeaponSkill(isEcho = false) {
    const weapon=this.run.weapon;
    if(!weapon)return;
    if(this.skillCooldown>0.02){
      this.toast(weapon.skillSpec.label + ' / ' + this.skillCooldown.toFixed(1) + 's');
      return;
    }
    const skill=weapon.skill;
    this.skillCooldown=weapon.skillSpec.cooldown;
    this.skillAnim=0.42;
    this.cameraFx.recoil=Math.max(this.cameraFx.recoil,0.24);
    navigator.vibrate?.(6);

    if(skill==='parry'){
      this.parryWindow=0.42;
      this.toast('PARRY WINDOW.');
      this.audio.tone('dash',0.7);
    } else if(skill==='shield'){
      this.wardTimer=2.2;
      this.toast('WARD: DAMAGE DAMPED.');
      this.audio.tone('gate',0.55);
    } else if(skill==='projectile'){
      const target=this.applyAimAssist(weapon,false)||this.findAimTarget(9,34);
      const start=this.camera.position.add(this.camera.getForwardRay().direction.scale(0.45));
      let end=start.add(this.camera.getForwardRay().direction.scale(8));
      if(target?.visual){
        end=target.visual.root.position.add(new Vector3(0,0.8,0));
        this.damageEnemy(target,weapon.damage*0.92*(this.run.damage||1),{stagger:0.72});
      }
      this.visuals.createTracer(start,end,2);

      if(this.hasRelic('second-mouth')){
        const second=this.enemies
          .filter((enemy)=>enemy!==target&&!enemy.dead&&enemy.visual&&enemy.roomId===this.currentRoomId)
          .filter((enemy)=>Vector3.Distance(enemy.visual.root.position,this.controller.position)<8.5)
          .sort((a,b)=>Vector3.Distance(a.visual.root.position,end)-Vector3.Distance(b.visual.root.position,end))[0];
        const secondEnd=second?.visual ? second.visual.root.position.add(new Vector3(0,0.72,0)) : end.add(new Vector3(0.42,0,-0.25));
        this.visuals.createTracer(start.add(new Vector3(0.08,-0.03,0)),secondEnd,8);
        if(second)this.damageEnemy(second,weapon.damage*0.46*(this.run.damage||1),{stagger:0.38});
      }
      this.audio.tone('shot',0.9);
    } else if(skill==='hook'){
      const target=this.findAimTarget(5.2,42);
      if(target?.visual){
        const toward=this.controller.position.subtract(target.visual.root.position);toward.y=0;
        if(toward.lengthSquared()>0.001){
          toward.normalize();
          target.visual.root.position.addInPlace(toward.scale(Math.min(2.2,Vector3.Distance(target.visual.root.position,this.controller.position)-0.8)));
        }
        this.damageEnemy(target,weapon.damage*0.52*(this.run.damage||1),{stagger:0.9,knock:0.3});
        this.toast('HOOKED.');
      } else this.toast('HOOK FOUND ONLY AIR.');
    } else if(skill==='aoe'){
      let hits=0;
      for(const enemy of this.enemies){
        if(enemy.dead||!enemy.visual||enemy.roomId!==this.currentRoomId)continue;
        if(Vector3.Distance(enemy.visual.root.position,this.controller.position)<3.25){
          this.damageEnemy(enemy,weapon.damage*0.72*(this.run.damage||1),{stagger:1.7,heavy:true,knock:1.4});
          hits+=1;
        }
      }
      this.hitStop=Math.max(this.hitStop,hits?0.055:0.02);
      this.toast(hits?'GROUND RUPTURE.':'THE FLOOR REMAINS UNIMPRESSED.');
    } else if(skill==='dash-cut'){
      this.applyAimAssist(weapon,true);
      const forward=new Vector3(Math.sin(this.lookYaw),0,Math.cos(this.lookYaw));
      this.controller.nudge(forward,2.4);
      this.controller.syncCamera();
      this.performMeleeHit({heavy:false,dashAttack:true});
      this.invulnerable=Math.max(this.invulnerable,0.16);
      this.toast('PHASE CUT.');
    } else if(skill==='execution'){
      const target=this.findAimTarget(2.25,34);
      if(target?.visual){
        const execute=target.hp/target.maxHp<=0.38;
        this.damageEnemy(target,weapon.damage*(execute?3.4:0.72)*(this.run.damage||1),{
          stagger:execute?3.5:1.2,heavy:true,weak:execute,knock:1.2
        });
        this.toast(execute?'EXECUTION.':'NOT READY TO DIE YET.');
      } else this.toast('NO BODY IN REACH.');
    } else {
      let hits=0;
      for(const enemy of this.enemies){
        if(enemy.dead||!enemy.visual||enemy.roomId!==this.currentRoomId)continue;
        if(Vector3.Distance(enemy.visual.root.position,this.controller.position)<4){
          enemy.stagger+=1.65;
          enemy.staggerTime=Math.max(enemy.staggerTime,0.28);
          this.visuals.createHitEffect(enemy.visual.root.position.add(new Vector3(0,0.7,0)),new Vector3(0,1,0),0.45,false);
          hits+=1;
        }
      }
      this.toast(hits?'STAGGER PULSE.':'PULSE FOUND NOTHING.');
      this.audio.tone('blink',0.7);
    }

    if(!isEcho&&this.hasRelic('borrowed-second')&&this.runRng()<0.28){
      this.skillCooldown*=0.45;
      this.toast('BORROWED SECOND: SKILL COOLDOWN CUT.');
    }

    if(!isEcho&&weapon.traitSpec?.effect==='skill-echo'&&!this.contextTarget){
      const previousCooldown=this.skillCooldown;
      setTimeout(()=>{
        if(this.phase!=='playing'||this.run.weapon?.signature!==weapon.signature)return;
        this.skillCooldown=0;
        if(skill==='projectile'||skill==='pulse'||skill==='aoe')this.useWeaponSkill(true);
        this.skillCooldown=Math.max(previousCooldown*0.55,this.skillCooldown);
      },180);
    }
  }


  updateContext() {
    let nearest = null;
    let best = 2.15;
    const player=this.controller.position;

    for (const target of this.visuals.interactives) {
      if (target.used && target.type !== 'gate') continue;
      if (target.roomId !== this.currentRoomId) continue;
      const distance = Math.hypot(player.x - target.position.x, player.z - target.position.z);
      if (distance < best) { best = distance; nearest = target; }
    }

    for(const drop of this.drops){
      if(drop.type!=='weapon'||!drop.visual)continue;
      if(drop.roomId!==this.currentRoomId)continue;
      const position=drop.visual.node.position;
      const distance=Math.hypot(player.x-position.x,player.z-position.z);
      if(distance<best){best=distance;nearest={type:'weapon-drop',roomId:drop.roomId,position,drop};}
    }

    this.contextTarget = nearest;
    if (!nearest) {
      this.el['context-prompt'].hidden = true;
      this.el['use-button-label'].textContent = this.run.weapon?.skillSpec?.label || 'SKILL';
      return;
    }

    this.el['context-prompt'].hidden = false;
    if (nearest.type === 'weapon-drop') {
      const weapon=nearest.drop.weapon;
      this.el['context-label'].textContent='EQUIP';
      this.el['context-copy'].textContent=weapon.name+' · '+weapon.skillSpec.label+' · reach '+weapon.reach.toFixed(1);
      this.el['use-button-label'].textContent='EQUIP';
    } else if (nearest.type === 'gate') {
      const missing = Math.max(0, this.dungeon.requiredKills - this.floorKills);
      this.el['context-label'].textContent = nearest.unlocked ? 'DESCEND' : 'LOCKED';
      this.el['context-copy'].textContent = nearest.unlocked ? 'enter the next floor' : missing + ' more kills required';
      this.el['use-button-label'].textContent = nearest.unlocked ? 'DOWN' : 'LOCKED';
    } else if (nearest.type === 'chest') {
      const room = this.dungeon.rooms[nearest.roomId];
      this.el['context-label'].textContent = room.cleared ? 'OPEN' : 'BUSY';
      this.el['context-copy'].textContent = room.cleared ? 'contains a generated weapon' : 'clear the room first';
      this.el['use-button-label'].textContent = 'OPEN';
    } else {
      this.el['context-label'].textContent = 'TOUCH';
      this.el['context-copy'].textContent = 'the shrine changes mechanics, not percentages';
      this.el['use-button-label'].textContent = 'TOUCH';
    }
  }

  useAction() {
    const target = this.contextTarget;
    if (!target) { this.useWeaponSkill(); return; }

    if(target.type==='weapon-drop'){
      this.collectDrop(target.drop);
      this.contextTarget=null;
      return;
    }

    if (target.type === 'gate') {
      if (!target.unlocked) {
        this.toast('THE DESCENT OFFICE REQUIRES MORE VIOLENCE.');
        return;
      }
      this.descend();
      return;
    }

    if (target.type === 'chest') {
      const room = this.dungeon.rooms[target.roomId];
      if (!room.cleared) { this.toast('CHEST REFUSES TO OPEN WHILE SUPERVISED.'); return; }
      this.visuals.setInteractiveUsed(target);
      room.opened = true;
      const seed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
      this.spawnWeaponDrop(target.position.add(new Vector3(0.75,0,0.5)),target.roomId);
      if(this.runRng()<0.48){
        const relic=rollLoot(seed,this.run.floor,'relic').item;
        this.discoverLoot(relic);
        this.applyRelic(relic);
      }
      this.audio.tone('loot', 1);
      this.toast('THE CHEST GREW A NEW WEAPON.');
      this.saveRun();
      return;
    }

    if (target.type === 'shrine') {
      this.visuals.setInteractiveUsed(target);
      const room = this.dungeon.rooms[target.roomId];
      room.shrineUsed = true;
      this.drawMinimap();
      this.triggerShrine(target.roomId);
    }
  }

  triggerShrine(roomId) {
    const roll = this.runRng();
    if (roll < 0.27) {
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + 28);
      this.effects.warp = 2.4;
      this.toast('THE SHRINE CLOSED SOME OF YOUR HOLES.');
    } else if (roll < 0.53) {
      const center=this.visuals.roomCenters.get(roomId);
      this.spawnWeaponDrop(center.add(new Vector3(1.15,0,-0.6)),roomId);
      this.toast('THE SHRINE COUGHED UP A WEAPON.');
    } else if (roll < 0.76) {
      this.skillCooldown=0;
      this.dashCooldown=0;
      this.run.hp=Math.min(this.run.maxHp,this.run.hp+10);
      this.effects.haste=Math.max(this.effects.haste||0,4);
      this.toast('THE SHRINE MADE YOUR HANDS IMPATIENT.');
    } else {
      const room = this.dungeon.rooms[roomId];
      const seed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
      const genome = generateEnemyBlueprint(seed, this.run.floor + 2, room.danger + 0.8, this.recentEnemySignatures, this.generatorTier());
      genome.name = 'AUDITOR ' + genome.name;
      genome.maxHp = Math.round(genome.maxHp * 1.42);
      genome.damage = Math.round(genome.damage * 1.22);
      genome.size *= 1.1;
      genome.elite = true;
      const center = this.visuals.roomCenters.get(roomId);
      this.spawnEnemy(genome, roomId, center.add(new Vector3(1.7, 0, -1.1)), false);
      room.cleared = false;
      this.toast('THE SHRINE HAS REQUESTED AN AUDIT.');
    }
    this.saveRun();
  }


  descend() {
    if (this.phase !== 'playing') return;
    this.phase = 'transition';
    this.run.floor += 1;
    this.run.hp = Math.min(this.run.maxHp, this.run.hp + Math.max(8, this.run.maxHp * 0.12));
    this.meta.bestFloor = Math.max(this.meta.bestFloor || 0, this.run.floor);
    this.meta.run = clone(this.run);
    this.saveMeta();
    this.audio.tone('gate', 1.2);
    this.showFloorBanner('DESCENDING', 'FLOOR ' + String(this.run.floor).padStart(2, '0'), this.floorSubtitle());
    setTimeout(() => {
      if (this.phase === 'transition') this.loadFloor();
    }, 760);
  }

  updateHud() {
    if (!this.run || !this.dungeon) return;
    const health = clamp(this.run.hp / this.run.maxHp, 0, 1);
    this.el['health-fill'].style.transform = 'scaleX(' + health + ')';
    this.el['health-label'].textContent = Math.max(0, Math.ceil(this.run.hp)) + '/' + Math.ceil(this.run.maxHp);
    this.el['floor-label'].textContent = 'FLOOR ' + String(this.run.floor).padStart(2, '0');
    this.el['kill-label'].textContent = this.floorKills + ' / ' + this.dungeon.requiredKills;
    const variety = Math.min(999,this.meta.codex.length);
    this.el['mutation-label'].textContent = 'TIER ' + this.generatorTier() + ' · SIGNATURES ' + variety;

    const weapon=this.run.weapon;
    if(weapon){
      this.el['weapon-name'].textContent=weapon.name.toUpperCase();
      this.el['weapon-state'].textContent=this.attackState.active
        ? (this.attackState.heavy?'HEAVY':'COMBO '+(this.attackState.combo+1))
        : this.skillCooldown>0.02
          ? weapon.skillSpec.label+' '+this.skillCooldown.toFixed(1)
          : weapon.skillSpec.label+' READY';
      if(!this.contextTarget)this.el['use-button-label'].textContent=weapon.skillSpec.label;
    }

    const maxDash = Math.max(0.62, 1.45 * (1 - (this.run.dashReduction || 0)));
    this.el['dash-meter'].style.transform = 'scaleX(' + clamp(1 - this.dashCooldown / maxDash, 0, 1) + ')';
    this.root.style.setProperty('--attack-charge',String(clamp(this.attackHold/0.62,0,1)));
  }


  drawMinimap() {
    if (!this.dungeon) return;
    const canvas = this.el.minimap;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const visited = this.dungeon.rooms.filter((room) => room.visited);
    if (!visited.length) return;

    const minX = Math.min(...visited.map((room) => room.gx));
    const maxX = Math.max(...visited.map((room) => room.gx));
    const minZ = Math.min(...visited.map((room) => room.gz));
    const maxZ = Math.max(...visited.map((room) => room.gz));
    const cell = Math.min(18, Math.floor(Math.min(canvas.width / (maxX - minX + 2), canvas.height / (maxZ - minZ + 2))));
    const ox = Math.floor((canvas.width - (maxX - minX + 1) * cell) / 2);
    const oz = Math.floor((canvas.height - (maxZ - minZ + 1) * cell) / 2);
    const roomRect = (room) => ({
      x: ox + (room.gx - minX) * cell + 2,
      z: oz + (room.gz - minZ) * cell + 2,
      size: Math.max(6, cell - 4)
    });

    ctx.lineCap = 'square';
    ctx.lineWidth = Math.max(2, Math.floor(cell * 0.18));
    ctx.strokeStyle = 'rgba(210,226,232,.28)';
    for (const room of visited) {
      const cx = ox + (room.gx - minX) * cell + cell / 2;
      const cz = oz + (room.gz - minZ) * cell + cell / 2;
      for (const next of Object.values(room.links)) {
        if (next === null || !this.dungeon.rooms[next].visited) continue;
        const target = this.dungeon.rooms[next];
        const tx = ox + (target.gx - minX) * cell + cell / 2;
        const tz = oz + (target.gz - minZ) * cell + cell / 2;
        ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(tx, tz); ctx.stroke();
      }
    }

    const roomColor = (room) => {
      if (room.id === this.currentRoomId) return '#ead8bc';
      if (room.role === 'gate') return this.visuals.gate?.unlocked ? '#d96843' : '#8e2029';
      if (room.role === 'chest' && !room.opened) return '#e6a35c';
      if (room.role === 'shrine' && !room.shrineUsed) return '#c7593f';
      if (!room.cleared) return '#b92835';
      return 'rgba(143,104,95,.56)';
    };

    for (const room of visited) {
      const rect = roomRect(room);
      ctx.fillStyle = 'rgba(10,12,18,.62)';
      ctx.fillRect(Math.round(rect.x - 1), Math.round(rect.z - 1), rect.size + 2, rect.size + 2);
      ctx.fillStyle = roomColor(room);
      ctx.fillRect(Math.round(rect.x), Math.round(rect.z), rect.size, rect.size);
      if (room.id === this.currentRoomId) {
        ctx.strokeStyle = '#d96843';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(rect.x - 2), Math.round(rect.z - 2), rect.size + 4, rect.size + 4);
      }
      if (room.role === 'chest' && !room.opened) {
        ctx.fillStyle = '#241722';
        ctx.fillRect(Math.round(rect.x + rect.size * 0.34), Math.round(rect.z + rect.size * 0.34), Math.max(2, rect.size * 0.32), Math.max(2, rect.size * 0.32));
      }
      if (room.role === 'shrine' && !room.shrineUsed) {
        ctx.fillStyle = '#241722';
        ctx.beginPath();
        ctx.arc(rect.x + rect.size / 2, rect.z + rect.size / 2, Math.max(1.4, rect.size * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const projectIntoRoom = (room, worldX, worldZ) => {
      const rect = roomRect(room);
      const center = this.visuals.roomCenters.get(room.id);
      const rx = clamp((worldX - center.x) / Math.max(1, room.sizeX * 0.5), -1, 1);
      const rz = clamp((worldZ - center.z) / Math.max(1, room.sizeZ * 0.5), -1, 1);
      return {
        x: rect.x + rect.size * (0.5 + rx * 0.32),
        z: rect.z + rect.size * (0.5 + rz * 0.32)
      };
    };

    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.visual) continue;
      const room = this.dungeon.rooms[enemy.roomId];
      if (!room?.visited) continue;
      const p = projectIntoRoom(room, enemy.visual.root.position.x, enemy.visual.root.position.z);
      ctx.fillStyle = enemy.genome.elite ? '#e6a35c' : '#c9363f';
      ctx.fillRect(Math.round(p.x - 1), Math.round(p.z - 1), enemy.genome.elite ? 4 : 3, enemy.genome.elite ? 4 : 3);
    }

    for (const drop of this.drops) {
      if (!drop.visual) continue;
      const room = roomByPoint(this.dungeon, drop.visual.node.position.x, drop.visual.node.position.z);
      if (!room?.visited) continue;
      const p = projectIntoRoom(room, drop.visual.node.position.x, drop.visual.node.position.z);
      ctx.fillStyle = drop.type === 'weapon' ? '#d96843' : drop.loot?.type === 'relic' ? '#c9363f' : '#e6a35c';
      ctx.fillRect(Math.round(p.x - 1), Math.round(p.z - 1), drop.type === 'weapon' ? 4 : 3, drop.type === 'weapon' ? 4 : 3);
    }
  }

  pauseGame(silent = false) {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.input.reset();
    this.saveRun();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.el['pause-floor'].textContent = String(this.run.floor);
    this.el['pause-kills'].textContent = String(this.run.totalKills);
    this.el['pause-relics'].textContent = String(this.run.relics.length);
    this.el['pause-screen'].hidden = false;
    if (!silent) this.toast('THE CRYPT HAS BEEN ASKED TO WAIT.');
  }

  resumeGame() {
    if (this.phase !== 'paused') return;
    this.el['pause-screen'].hidden = true;
    this.phase = 'playing';
    void this.audio.ensure();
  }

  openSettings(returnPhase) {
    this.settingsReturnPhase = returnPhase;
    if (returnPhase === 'paused') this.phase = 'settings';
    this.el['settings-screen'].hidden = false;
    this.updateSettingsUi();
  }

  closeSettings() {
    this.el['settings-screen'].hidden = true;
    if (this.settingsReturnPhase === 'paused') this.phase = 'paused';
  }

  die() {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.run.hp = 0;
    this.meta.deaths += 1;
    this.meta.bestFloor = Math.max(this.meta.bestFloor || 0, this.run.floor);
    this.meta.run = null;
    this.saveMeta();
    this.audio.tone('death', 1);
    this.input.reset();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.setGameplayUi(false);
    this.hideScreens();
    this.el['death-floor'].textContent = String(this.run.floor);
    this.el['death-kills'].textContent = String(this.run.totalKills);
    this.el['death-discoveries'].textContent = String(this.run.discoveries || 0);
    this.el['death-screen'].hidden = false;
  }

  updateOrientation() {
    const coarse = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
    const blocked = coarse && window.innerHeight > window.innerWidth;
    this.orientationBlocked = blocked;
    if (blocked) {
      this.el['rotate-screen'].hidden = false;
      if (this.phase === 'playing') this.pauseGame(true);
    } else {
      this.el['rotate-screen'].hidden = true;
    }
  }

  exitToLauncher() {
    this.saveRun();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    if (history.length > 1) history.back();
    else location.href = '../../';
  }

  showError(error) {
    console.error(error);
    this.phase = 'error';
    this.setGameplayUi(false);
    this.hideScreens();
    this.el['error-text'].textContent = error instanceof Error ? error.message : String(error);
    this.el['error-screen'].hidden = false;
  }
}
