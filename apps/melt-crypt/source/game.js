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
  createMonsterGenome,
  generateDungeon,
  makeRng,
  rollLoot,
  roomByPoint
} from './core.js';
import { CryptInput } from './input.js';
import { CryptAudio } from './audio.js';
import { CryptVisuals, hslColor } from './world.js';

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
  spit: 'spits compressed bad decisions',
  blink: 'teleports when reality looks away',
  rush: 'charges after a short warning',
  split: 'files for mitosis on death',
  leech: 'steals back health in melee',
  burst: 'periodically vomits projectiles in every direction'
};

function defaultMeta() {
  return {
    version: 1,
    settings: { quality: 'pixel', sensitivity: 1, psyche: true, sound: true },
    bestFloor: 0,
    runs: 0,
    deaths: 0,
    codex: [],
    lootCodex: [],
    run: null
  };
}

function loadMeta() {
  const fallback = defaultMeta();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      ...fallback,
      ...parsed,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      codex: Array.isArray(parsed.codex) ? parsed.codex.slice(0, 96) : [],
      lootCodex: Array.isArray(parsed.lootCodex) ? parsed.lootCodex.slice(0, 96) : [],
      run: parsed.run && typeof parsed.run === 'object' ? parsed.run : null
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

export class MeltCryptGame {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#render-canvas');
    this.el = {};
    [
      'psy-layer','damage-layer','hud','floor-label','health-fill','health-label','room-label','mutation-label','kill-label',
      'minimap','pause-button','reticle','weapon-readout','weapon-state','potion-readout','potion-name','potion-count',
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
    this.dashTimer = 0;
    this.dashDirection = new Vector3(0, 0, 1);
    this.invulnerable = 0;
    this.effects = { warp: 0, slow: 0, speed: 0, rage: 0 };
    this.damageFlash = 0;
    this.elapsed = 0;
    this.runRng = Math.random;
    this.orientationBlocked = false;
    this.abandonArmed = false;
    this.discoveryTimer = 0;
    this.floorBannerTimer = 0;
    this.roomTitleCache = new Map();
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
    this.scene.imageProcessingConfiguration.contrast = 1.14;
    this.scene.imageProcessingConfiguration.exposure = 1.05;

    this.camera = new FreeCamera('crypt-player', new Vector3(0, 1.58, 0), this.scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 90;
    this.camera.fov = 0.95;
    this.camera.inertia = 0;
    this.camera.checkCollisions = true;
    this.camera.ellipsoid = new Vector3(0.38, 0.78, 0.38);
    this.camera.ellipsoidOffset = new Vector3(0, -0.78, 0);
    this.scene.activeCamera = this.camera;

    report('growing an inadvisable weapon…', 0.55);
    this.visuals = new CryptVisuals(this.scene, this.camera);
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

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    ['hud','reticle','weapon-readout','potion-readout','action-cluster'].forEach((key) => { this.el[key].hidden = !visible; });
    if (!visible) this.el['context-prompt'].hidden = true;
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
    this.el['title-codex'].textContent = String(this.meta.codex.length) + ' phenotypes archived';
    this.updatePsyche(0.04);
  }

  startNewRun() {
    this.run = {
      seed: randomSeed(),
      floor: 1,
      hp: 100,
      maxHp: 100,
      damage: 14,
      speed: 4.45,
      crit: 0.06,
      lifesteal: 0,
      dashReduction: 0,
      relics: [],
      potions: ['prophecy-mouthwash'],
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
    this.effects = { warp: 0, slow: 0, speed: 0, rage: 0 };
    this.runRng = makeRng((this.run.seed ^ Math.imul(this.run.floor, 0x7f4a7c15)) >>> 0);
    this.dungeon = generateDungeon(this.run.seed, this.run.floor);
    this.visuals.buildDungeon(this.dungeon, this.run.floor);
    this.visuals.setGateUnlocked(false);
    this.currentRoomId = this.dungeon.startId;
    const start = this.dungeon.rooms[this.currentRoomId];
    start.visited = true;
    start.spawned = true;
    start.cleared = true;
    this.roomTitleCache.clear();
    this.contextTarget = null;

    const hue = (286 + this.run.floor * 37) % 360;
    const fog = hslColor(hue, 0.5, 0.09);
    this.scene.fogColor.copyFrom(fog);
    this.scene.clearColor = new Color4(fog.r * 0.55, fog.g * 0.55, fog.b * 0.55, 1);
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
  }

  floorSubtitle() {
    const lines = [
      'the walls learned a new color',
      'local biology has become entrepreneurial',
      'the floor plan denies responsibility',
      'something is singing through masonry',
      'all doors are technically opinions',
      'the ecosystem has read your previous run'
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
    const sig = [genome.body, genome.ability, genome.eyes, genome.horns, genome.limbs, genome.elite ? 1 : 0].join('/');
    if (this.meta.codex.some((entry) => entry.sig === sig)) return;
    this.meta.codex.push({ sig, name: genome.name, body: genome.body, ability: genome.ability });
    this.meta.codex = this.meta.codex.slice(-96);
    if (this.run) this.run.discoveries += 1;
    this.saveMeta();
    this.showDiscovery(genome.name, ABILITY_COPY[genome.ability] || 'behaves in a legally distinct manner');
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
    for (let index = 0; index < room.monsterSeeds.length; index += 1) {
      const seed = room.monsterSeeds[index];
      const genome = createMonsterGenome(seed, this.run.floor, room.danger);
      const rng = makeRng(seed ^ 0xa511e9b3);
      let ox = (rng() - 0.5) * (room.sizeX - 3);
      let oz = (rng() - 0.5) * (room.sizeZ - 3);
      if (Math.hypot(ox, oz) < 2.4) { ox += ox < 0 ? -2.3 : 2.3; oz += oz < 0 ? -1.1 : 1.1; }
      const center = this.visuals.roomCenters.get(room.id);
      const position = new Vector3(center.x + ox, 0, center.z + oz);
      this.spawnEnemy(genome, room.id, position, false);
    }
    if (!room.monsterSeeds.length) room.cleared = true;
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
      attackTimer: 0,
      abilityTimer: genome.cooldown * (0.45 + this.runRng() * 0.55),
      rushTell: 0,
      rushTime: 0,
      rushHit: false,
      chargeDirection: new Vector3(),
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

    this.visuals?.update(this.elapsed, this.effects.warp > 0 ? 1 : this.effects.rage > 0 ? 0.45 : 0);
    this.updatePsyche(dt);
    if (this.phase !== 'playing') return;

    const actions = this.input.consumeActions();
    if (actions.pause) { this.pauseGame(); return; }

    this.updateEffects(dt);
    this.updatePlayer(dt, actions);
    this.updateCurrentRoom();
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateContext();
    this.updateHud();

    if (actions.fire && this.fireCooldown <= 0) this.fireWeapon();
    if (actions.dash && this.dashCooldown <= 0) this.startDash();
    if (actions.potion) this.drinkPotion();
    if (actions.use) this.useAction();

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
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
      this.root.style.setProperty('--game-sat', '1.05');
      this.root.style.setProperty('--game-scale', '1');
      return;
    }
    const mutation = this.run ? Math.min(1, (this.run.floor - 1) * 0.055) : 0.06;
    const warp = this.effects.warp > 0 ? 0.32 : 0;
    const rage = this.effects.rage > 0 ? 0.1 : 0;
    const opacity = 0.045 + mutation * 0.08 + warp + rage;
    const hue = Math.sin(this.elapsed * (this.effects.warp > 0 ? 2.6 : 0.26)) * (4 + mutation * 14 + warp * 70);
    this.root.style.setProperty('--psy-opacity', String(opacity));
    this.root.style.setProperty('--psy-spin', String((this.elapsed * 11) % 360) + 'deg');
    this.root.style.setProperty('--psy-x', String(58 + Math.sin(this.elapsed * 0.8) * 20) + '%');
    this.root.style.setProperty('--psy-y', String(43 + Math.cos(this.elapsed * 0.61) * 18) + '%');
    this.root.style.setProperty('--psy-blur', this.effects.warp > 0 ? '1.5px' : '0px');
    this.root.style.setProperty('--game-hue', String(hue) + 'deg');
    this.root.style.setProperty('--game-sat', String(1.1 + mutation * 0.32 + warp * 0.55));
    this.root.style.setProperty('--game-contrast', String(1.04 + rage * 0.8));
    this.root.style.setProperty('--game-scale', this.effects.warp > 0 ? String(1.003 + Math.sin(this.elapsed * 4) * 0.004) : '1');
  }

  updatePlayer(dt, actions) {
    const look = this.input.consumeLook();
    this.camera.rotation.y += look.x;
    this.camera.rotation.x = clamp(this.camera.rotation.x + look.y, -1.33, 1.33);

    const move = this.input.getMove();
    const yaw = this.camera.rotation.y;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let direction = forward.scale(move.y).add(right.scale(move.x));
    if (direction.lengthSquared() > 1) direction.normalize();

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      direction = this.dashDirection.clone();
      this.camera.cameraDirection.copyFrom(direction.scale(12.5 * dt));
    } else {
      const speed = this.run.speed * (this.effects.speed > 0 ? 1.52 : 1);
      this.camera.cameraDirection.copyFrom(direction.scale(speed * dt));
    }
    if (Math.abs(this.camera.position.y - 1.58) > 0.03) this.camera.position.y = 1.58;
  }

  startDash() {
    const move = this.input.getMove();
    const yaw = this.camera.rotation.y;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let direction = forward.scale(move.y).add(right.scale(move.x));
    if (direction.lengthSquared() < 0.04) direction = forward;
    direction.normalize();
    this.dashDirection.copyFrom(direction);
    this.dashTimer = 0.16;
    this.dashCooldown = Math.max(0.7, 1.72 * (1 - (this.run.dashReduction || 0)));
    this.invulnerable = Math.max(this.invulnerable, 0.2);
    this.audio.tone('dash');
    navigator.vibrate?.(8);
  }

  fireWeapon() {
    this.fireCooldown = 0.235;
    const ray = this.camera.getForwardRay(32);
    const pick = this.scene.pickWithRay(ray, (mesh) => mesh.isPickable && Boolean(mesh.metadata?.enemy || mesh.metadata?.solid), true);
    const start = ray.origin.add(ray.direction.scale(0.5));
    const end = pick?.hit && pick.pickedPoint ? pick.pickedPoint : ray.origin.add(ray.direction.scale(32));
    this.visuals.createTracer(start, end, 318 + (this.run.floor * 11) % 40);
    this.visuals.setWeaponRecoil(1);
    this.audio.tone('shot', 0.85);
    navigator.vibrate?.(5);

    const enemy = pick?.pickedMesh?.metadata?.enemy;
    if (enemy && !enemy.dead) {
      const critical = this.runRng() < (this.run.crit || 0);
      const multiplier = this.effects.rage > 0 ? 2 : 1;
      const damage = this.run.damage * multiplier * (critical ? 1.85 : 1) * (0.92 + this.runRng() * 0.16);
      this.damageEnemy(enemy, damage, critical);
    }
  }

  damageEnemy(enemy, amount, critical = false) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.visual.root.scaling.scaleInPlace(critical ? 1.035 : 1.016);
    setTimeout(() => {
      if (!enemy.dead && enemy.visual?.root) enemy.visual.root.scaling.setAll(enemy.genome.size);
    }, 55);
    this.audio.tone('hit', critical ? 1.1 : 0.75);
    if (critical) this.toast('CRITICAL THOUGHT.');
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const deathPosition = enemy.visual.root.position.clone();
    this.visuals.disposeMonsterVisual(enemy.visual);
    enemy.visual = null;
    this.run.totalKills += 1;
    this.floorKills += 1;
    if (this.run.lifesteal > 0) this.run.hp = Math.min(this.run.maxHp, this.run.hp + this.run.lifesteal);

    if (enemy.genome.ability === 'split' && !enemy.child) {
      for (let i = 0; i < 2; i += 1) {
        const seed = (enemy.genome.seed ^ (0x9e3779b9 + i * 991)) >>> 0;
        const childGenome = createMonsterGenome(seed, this.run.floor, 0.64, enemy.genome);
        childGenome.size *= 0.62;
        childGenome.maxHp = Math.max(7, Math.round(childGenome.maxHp * 0.42));
        childGenome.damage = Math.max(2, Math.round(childGenome.damage * 0.58));
        childGenome.name = 'SMALLER ' + childGenome.name;
        const offset = new Vector3((i ? 1 : -1) * 0.52, 0, 0.28);
        this.spawnEnemy(childGenome, enemy.roomId, deathPosition.add(offset), true);
      }
      this.toast('IT HAS SUBMITTED TWO COPIES OF ITSELF.');
    }

    if (this.runRng() < 0.22 + Math.min(0.12, this.run.floor * 0.008)) this.spawnDrop(deathPosition);

    const room = this.dungeon.rooms[enemy.roomId];
    const aliveInRoom = this.enemies.some((candidate) => !candidate.dead && candidate.roomId === enemy.roomId);
    if (!aliveInRoom) {
      room.cleared = true;
      if (room.id === this.currentRoomId) this.toast('ROOM QUIET. SUSPICIOUS.');
    }

    const unlocked = this.floorKills >= this.dungeon.requiredKills;
    if (unlocked && !this.visuals.gate?.unlocked) {
      this.visuals.setGateUnlocked(true);
      this.audio.tone('gate', 1);
      this.toast('DESCENT OFFICE IS NOW ACCEPTING CLIENTS.');
    }
    this.saveRun();
  }

  spawnDrop(position, forced = null) {
    const seed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
    const loot = rollLoot(seed, this.run.floor, forced);
    const visual = this.visuals.createLootVisual(loot, position.add(new Vector3(0, 0.03, 0)), seed);
    this.drops.push({ seed, loot, visual, age: 0 });
  }

  updateDrops(dt) {
    const player = this.camera.position;
    for (const drop of this.drops) {
      if (!drop.visual) continue;
      drop.age += dt;
      drop.visual.node.rotation.y += dt * 1.6;
      drop.visual.node.position.y = Math.sin(drop.age * 2.8 + drop.seed) * 0.08;
      const dx = drop.visual.node.position.x - player.x;
      const dz = drop.visual.node.position.z - player.z;
      if (Math.hypot(dx, dz) < 1.15) this.collectDrop(drop);
    }
    this.drops = this.drops.filter((drop) => Boolean(drop.visual));
  }

  collectDrop(drop) {
    const loot = drop.loot;
    this.discoverLoot(loot.item);
    if (loot.type === 'relic') {
      this.applyRelic(loot.item);
      this.toast('RELIC ACQUIRED: ' + loot.item.name.toUpperCase());
    } else if (this.run.potions.length < 5) {
      this.run.potions.push(loot.item.id);
      this.toast('BOTTLED: ' + loot.item.name.toUpperCase());
    } else {
      this.toast('FLASK QUEUE FULL. DRANK IT OFF THE FLOOR.');
      this.consumePotion(loot.item.id, true);
    }
    drop.visual.node.dispose(false, true);
    drop.visual.material.dispose();
    drop.visual = null;
    this.audio.tone('loot', 1);
    this.saveRun();
  }

  applyRelic(item) {
    this.run.relics.push(item.id);
    if (item.stat === 'speed') this.run.speed *= 1 + item.amount;
    if (item.stat === 'damage') this.run.damage *= 1 + item.amount;
    if (item.stat === 'maxHp') {
      this.run.maxHp += item.amount;
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + item.amount);
    }
    if (item.stat === 'crit') this.run.crit = clamp((this.run.crit || 0) + item.amount, 0, 0.55);
    if (item.stat === 'lifesteal') this.run.lifesteal = (this.run.lifesteal || 0) + item.amount;
    if (item.stat === 'dash') this.run.dashReduction = clamp((this.run.dashReduction || 0) + item.amount, 0, 0.62);
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
    const player = this.camera.position;
    let activeCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.visual) continue;
      const root = enemy.visual.root;
      root.position.y = Math.sin(this.elapsed * enemy.genome.wobble * 2 + enemy.genome.phase) * 0.045;
      if (enemy.visual.aura) {
        enemy.visual.aura.rotation.y += dt * (0.8 + enemy.genome.wobble);
        enemy.visual.aura.rotation.z += dt * 0.33;
      }
      if (enemy.roomId !== this.currentRoomId) continue;
      activeCount += 1;

      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
      enemy.abilityTimer -= dt;
      const dx = player.x - root.position.x;
      const dz = player.z - root.position.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const direction = new Vector3(dx / distance, 0, dz / distance);
      root.rotation.y = Math.atan2(dx, dz);
      const slow = this.effects.slow > 0 ? 0.6 : 1;

      if (enemy.rushTell > 0) {
        enemy.rushTell -= dt;
        root.scaling.x = enemy.genome.size * (1 + Math.sin(this.elapsed * 28) * 0.08);
        if (enemy.rushTell <= 0) {
          root.scaling.setAll(enemy.genome.size);
          enemy.rushTime = 0.42;
          enemy.rushHit = false;
        }
      } else if (enemy.rushTime > 0) {
        enemy.rushTime -= dt;
        root.position.addInPlace(enemy.chargeDirection.scale(enemy.genome.speed * slow * 4.1 * dt));
        if (!enemy.rushHit && Vector3.Distance(root.position, player) < 1.05 + enemy.genome.size * 0.28) {
          enemy.rushHit = true;
          this.hurtPlayer(enemy.genome.damage * 1.25);
        }
      } else {
        if (enemy.genome.ability === 'blink' && enemy.abilityTimer <= 0 && distance < 8.5) {
          const room = this.dungeon.rooms[enemy.roomId];
          const center = this.visuals.roomCenters.get(room.id);
          const angle = this.runRng() * Math.PI * 2;
          const radius = 2.1 + this.runRng() * 1.25;
          root.position.x = clamp(player.x + Math.cos(angle) * radius, center.x - room.sizeX * 0.38, center.x + room.sizeX * 0.38);
          root.position.z = clamp(player.z + Math.sin(angle) * radius, center.z - room.sizeZ * 0.38, center.z + room.sizeZ * 0.38);
          enemy.abilityTimer = enemy.genome.cooldown + 0.8;
          this.audio.tone('blink', 0.7);
        } else if (enemy.genome.ability === 'spit' && enemy.abilityTimer <= 0 && distance < 9.5) {
          this.spawnEnemyProjectile(enemy, direction, 5.4);
          enemy.abilityTimer = enemy.genome.cooldown;
        } else if (enemy.genome.ability === 'burst' && enemy.abilityTimer <= 0 && distance < 8) {
          for (let i = 0; i < 8; i += 1) {
            const angle = i / 8 * Math.PI * 2 + this.elapsed * 0.2;
            this.spawnEnemyProjectile(enemy, new Vector3(Math.cos(angle), 0, Math.sin(angle)), 4.25);
          }
          enemy.abilityTimer = enemy.genome.cooldown + 1.1;
        } else if (enemy.genome.ability === 'rush' && enemy.abilityTimer <= 0 && distance > 2 && distance < 8) {
          enemy.rushTell = 0.52;
          enemy.chargeDirection.copyFrom(direction);
          enemy.abilityTimer = enemy.genome.cooldown + 1.35;
          this.toast('SOMETHING HAS COMMITTED TO A STRAIGHT LINE.');
        }

        const preferred = enemy.genome.ability === 'spit' || enemy.genome.ability === 'burst' ? 3.4 : 1.0;
        if (distance > preferred && enemy.rushTell <= 0) {
          root.position.addInPlace(direction.scale(enemy.genome.speed * slow * dt));
        }
      }

      const room = this.dungeon.rooms[enemy.roomId];
      const center = this.visuals.roomCenters.get(room.id);
      root.position.x = clamp(root.position.x, center.x - room.sizeX * 0.42, center.x + room.sizeX * 0.42);
      root.position.z = clamp(root.position.z, center.z - room.sizeZ * 0.42, center.z + room.sizeZ * 0.42);

      const meleeDistance = 0.7 + enemy.genome.size * 0.5;
      if (distance < meleeDistance && enemy.attackTimer <= 0 && enemy.rushTell <= 0) {
        this.hurtPlayer(enemy.genome.damage);
        enemy.attackTimer = 0.8 + this.runRng() * 0.35;
        if (enemy.genome.ability === 'leech') enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.genome.damage * 0.75);
      }
    }
    this.audio.setDanger(Math.min(1, activeCount / 4));
  }

  spawnEnemyProjectile(enemy, direction, speed) {
    const mesh = this.visuals.createProjectile(enemy.genome.accentHue, enemy.genome.elite ? 0.17 : 0.12);
    mesh.position.copyFrom(enemy.visual.root.position.add(new Vector3(0, 1.0 * enemy.genome.size, 0)));
    const targetY = this.camera.position.y - mesh.position.y;
    const velocity = new Vector3(direction.x, targetY * 0.13, direction.z).normalize().scale(speed);
    this.projectiles.push({ mesh, velocity, damage: enemy.genome.damage * 0.82, life: 4.2, hue: enemy.genome.accentHue });
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      if (projectile.life <= 0 || !projectile.mesh) continue;
      projectile.life -= dt;
      projectile.mesh.position.addInPlace(projectile.velocity.scale(dt));
      projectile.mesh.rotation.y += dt * 4;
      projectile.mesh.rotation.x += dt * 2.4;
      if (Vector3.Distance(projectile.mesh.position, this.camera.position) < 0.52) {
        this.hurtPlayer(projectile.damage);
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

  hurtPlayer(amount) {
    if (this.invulnerable > 0 || this.phase !== 'playing') return;
    this.invulnerable = 0.38;
    this.run.hp -= Math.max(1, amount);
    this.damageFlash = 0.95;
    this.audio.tone('hurt', 1);
    navigator.vibrate?.([12, 28, 12]);
    if (this.run.hp <= 0) this.die();
  }

  updateContext() {
    let nearest = null;
    let best = 2.05;
    for (const target of this.visuals.interactives) {
      if (target.used && target.type !== 'gate') continue;
      if (target.roomId !== this.currentRoomId) continue;
      const distance = Math.hypot(this.camera.position.x - target.position.x, this.camera.position.z - target.position.z);
      if (distance < best) { best = distance; nearest = target; }
    }
    this.contextTarget = nearest;
    if (!nearest) {
      this.el['context-prompt'].hidden = true;
      this.el['use-button-label'].textContent = this.run.potions.length ? 'FLASK' : 'USE';
      return;
    }
    this.el['context-prompt'].hidden = false;
    if (nearest.type === 'gate') {
      const missing = Math.max(0, this.dungeon.requiredKills - this.floorKills);
      this.el['context-label'].textContent = nearest.unlocked ? 'DESCEND' : 'LOCKED';
      this.el['context-copy'].textContent = nearest.unlocked ? 'enter the next floor' : missing + ' more kills required';
      this.el['use-button-label'].textContent = nearest.unlocked ? 'DOWN' : 'LOCKED';
    } else if (nearest.type === 'chest') {
      const room = this.dungeon.rooms[nearest.roomId];
      this.el['context-label'].textContent = room.cleared ? 'OPEN' : 'BUSY';
      this.el['context-copy'].textContent = room.cleared ? 'unsupervised treasury' : 'the monsters are still using it';
      this.el['use-button-label'].textContent = 'OPEN';
    } else {
      this.el['context-label'].textContent = 'TOUCH';
      this.el['context-copy'].textContent = 'bad idea chapel';
      this.el['use-button-label'].textContent = 'TOUCH';
    }
  }

  useAction() {
    const target = this.contextTarget;
    if (!target) { this.drinkPotion(); return; }
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
      const relicSeed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
      const relic = rollLoot(relicSeed, this.run.floor, 'relic').item;
      this.discoverLoot(relic);
      this.applyRelic(relic);
      if (this.runRng() < 0.72) {
        const potion = rollLoot(relicSeed ^ 0x54a11ce, this.run.floor, 'potion').item;
        this.discoverLoot(potion);
        if (this.run.potions.length < 5) this.run.potions.push(potion.id);
      }
      this.audio.tone('loot', 1);
      this.toast('TREASURY DISAGREES WITH YOUR INVENTORY.');
      this.saveRun();
      return;
    }
    if (target.type === 'shrine') {
      this.visuals.setInteractiveUsed(target);
      this.triggerShrine(target.roomId);
    }
  }

  triggerShrine(roomId) {
    const roll = this.runRng();
    if (roll < 0.25) {
      this.run.hp = Math.min(this.run.maxHp, this.run.hp + 24);
      this.effects.warp = 4;
      this.toast('THE SHRINE FORGIVES A WOUND IT DID NOT CAUSE.');
    } else if (roll < 0.5) {
      this.run.damage *= 1.08;
      this.run.maxHp = Math.max(35, this.run.maxHp - 5);
      this.run.hp = Math.min(this.run.hp, this.run.maxHp);
      this.toast('THE SHRINE TRADED FIVE FLESH FOR EIGHT PERCENT OPINION.');
    } else if (roll < 0.76) {
      const potion = rollLoot(Math.floor(this.runRng() * 0xffffffff), this.run.floor, 'potion').item;
      this.discoverLoot(potion);
      if (this.run.potions.length < 5) this.run.potions.push(potion.id);
      else this.consumePotion(potion.id, true);
      this.toast('THE SHRINE DISPENSED A BEVERAGE WITHOUT A LICENSE.');
    } else {
      const room = this.dungeon.rooms[roomId];
      const seed = Math.floor(this.runRng() * 0xffffffff) >>> 0;
      const genome = createMonsterGenome(seed, this.run.floor + 2, room.danger + 0.8);
      genome.name = 'AUDITOR ' + genome.name;
      genome.maxHp = Math.round(genome.maxHp * 1.45);
      genome.damage = Math.round(genome.damage * 1.25);
      genome.size *= 1.12;
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
    const mutation = clamp(Math.round((this.run.floor - 1) * 8.5 + this.meta.codex.length * 0.35), 0, 999);
    this.el['mutation-label'].textContent = 'MUTATION ' + mutation + '%';
    this.el['weapon-state'].textContent = this.fireCooldown > 0.02 ? 'CYCLING' : this.effects.rage > 0 ? 'SCREAMING' : 'READY';

    const potion = potionById(this.run.potions[0]);
    this.el['potion-name'].textContent = potion ? potion.name.toUpperCase() : 'EMPTY';
    this.el['potion-count'].textContent = String(this.run.potions.length);
    const maxDash = Math.max(0.7, 1.72 * (1 - (this.run.dashReduction || 0)));
    this.el['dash-meter'].style.transform = 'scaleX(' + clamp(1 - this.dashCooldown / maxDash, 0, 1) + ')';
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
    const cell = Math.min(17, Math.floor(Math.min(canvas.width / (maxX - minX + 2), canvas.height / (maxZ - minZ + 2))));
    const ox = Math.floor((canvas.width - (maxX - minX + 1) * cell) / 2);
    const oz = Math.floor((canvas.height - (maxZ - minZ + 1) * cell) / 2);

    ctx.lineWidth = Math.max(2, Math.floor(cell * 0.18));
    ctx.strokeStyle = 'rgba(255,240,201,.28)';
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
    for (const room of visited) {
      const x = ox + (room.gx - minX) * cell + 2;
      const z = oz + (room.gz - minZ) * cell + 2;
      const size = Math.max(5, cell - 4);
      ctx.fillStyle = room.id === this.currentRoomId ? '#d7ff55' : room.role === 'gate' ? '#ff4fd8' : room.cleared ? 'rgba(255,240,201,.68)' : '#54e7ff';
      ctx.fillRect(Math.round(x), Math.round(z), size, size);
      if (room.role === 'chest' && !room.opened) {
        ctx.fillStyle = '#fff0c9'; ctx.fillRect(Math.round(x + size / 2 - 1), Math.round(z + size / 2 - 1), 3, 3);
      }
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
