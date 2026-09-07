import {
  Color3,
  Engine,
  MeshBuilder,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3
} from '@babylonjs/core';
import { DuelAI } from './ai.js';
import { DuelAudio } from './audio.js';
import { CombatSystem } from './combat.js';
import { clamp, wrapAngle } from './core.js';
import { DuelInput } from './input.js';
import { ProceduralWarrior } from './rig.js';
import { ArenaWorld } from './world.js';

class QualityController {
  constructor(engine, world, storageNamespace, onChange) {
    this.engine = engine;
    this.world = world;
    this.storageNamespace = storageNamespace;
    this.onChange = onChange;
    this.mode = localStorage.getItem(`${storageNamespace}:quality`) || 'auto';
    this.effective = 'medium';
    this.sampleTime = 0;
    this.frameAccumulator = 0;
    this.frameCount = 0;
    this.autoScale = Math.max(1.1, Math.min(1.5, window.devicePixelRatio / 2));
    this.apply();
  }

  setMode(mode) {
    if (!['auto', 'high', 'medium', 'low'].includes(mode)) return;
    this.mode = mode;
    localStorage.setItem(`${this.storageNamespace}:quality`, mode);
    this.apply();
  }

  apply() {
    if (this.mode === 'high') {
      this.effective = 'high';
      this.engine.setHardwareScalingLevel(1);
    } else if (this.mode === 'medium') {
      this.effective = 'medium';
      this.engine.setHardwareScalingLevel(1.28);
    } else if (this.mode === 'low') {
      this.effective = 'low';
      this.engine.setHardwareScalingLevel(1.58);
    } else {
      this.effective = this.autoScale > 1.48 ? 'low' : this.autoScale > 1.22 ? 'medium' : 'high';
      this.engine.setHardwareScalingLevel(this.autoScale);
    }
    this.world?.setQuality(this.effective);
    this.onChange?.(this.mode, this.effective);
  }

  tick(dt) {
    if (this.mode !== 'auto') return;
    this.sampleTime += dt;
    this.frameAccumulator += dt;
    this.frameCount += 1;
    if (this.sampleTime < 1.35) return;
    const averageMs = (this.frameAccumulator / Math.max(1, this.frameCount)) * 1000;
    if (averageMs > 20.8 && this.autoScale < 1.72) this.autoScale = Math.min(1.72, this.autoScale + 0.10);
    else if (averageMs < 16.7 && this.autoScale > 1.08) this.autoScale = Math.max(1.08, this.autoScale - 0.055);
    const previous = this.effective;
    this.sampleTime = 0;
    this.frameAccumulator = 0;
    this.frameCount = 0;
    this.apply();
    if (previous !== this.effective) this.onChange?.(this.mode, this.effective);
  }
}

export class SinewGame {
  constructor(canvas, root, storageNamespace) {
    this.canvas = canvas;
    this.root = root;
    this.storageNamespace = storageNamespace;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.world = null;
    this.player = null;
    this.enemy = null;
    this.input = null;
    this.audio = null;
    this.ai = new DuelAI();
    this.combat = null;
    this.quality = null;
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.cameraKick = new Vector3();
    this.cameraKickVelocity = new Vector3();
    this.paused = true;
    this.orientationBlocked = false;
    this.ended = false;
    this.hidden = document.hidden;
    this.onState = null;
    this.onMatchEnd = null;
    this.onQuality = null;
    this.lastFrame = performance.now();
    this.fx = new Set();
  }

  async init(report = () => {}) {
    report('Запускаем физику тела…', 0.12);
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    }, false);
    this.engine.setHardwareScalingLevel(1.28);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.autoClear = true;

    report('Поднимаем каменный двор…', 0.28);
    this.world = new ArenaWorld(this.scene);

    report('Собираем процедурные риги…', 0.48);
    this.player = new ProceduralWarrior(this.scene, {
      id: 'player',
      isPlayer: true,
      position: new Vector3(0, 0, -3.4),
      yaw: 0,
      palette: { cloth: '#3c403d', leather: '#473126', darkSteel: '#3a4141', accent: '#6a3028', steel: '#9ea3a2' }
    });
    this.enemy = new ProceduralWarrior(this.scene, {
      id: 'enemy',
      position: new Vector3(0, 0, 2.9),
      yaw: Math.PI,
      palette: { cloth: '#4b4036', leather: '#523024', darkSteel: '#343b3c', accent: '#7f3528', steel: '#959d9b' }
    });
    this.world.addWarrior(this.player);
    this.world.addWarrior(this.enemy);

    report('Настраиваем оружие и swept-контакты…', 0.66);
    this.input = new DuelInput(this.root, this.storageNamespace);
    this.audio = new DuelAudio(this.storageNamespace);
    this.combat = new CombatSystem((event) => this.handleCombatEvent(event));

    this.camera = new UniversalCamera('player-camera', new Vector3(0, 1.8, -3.4), this.scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 80;
    this.camera.fov = 1.08;
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;

    this.quality = new QualityController(this.engine, this.world, this.storageNamespace, (mode, effective) => this.onQuality?.(mode, effective));

    report('Калибруем инерцию…', 0.84);
    this.resetMatch(true);
    this.bindLifecycle();
    this.engine.runRenderLoop(() => this.frame());
    this.engine.resize();
    report('Готово', 1);
  }

  bindLifecycle() {
    this.onResize = () => this.engine?.resize();
    this.onVisibility = () => {
      this.hidden = document.hidden;
      this.lastFrame = performance.now();
      if (this.hidden) this.input?.resetPointers();
    };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  frame() {
    if (!this.scene || !this.engine || this.hidden) return;
    const now = performance.now();
    const dt = clamp((now - this.lastFrame) / 1000, 1 / 240, 1 / 24);
    this.lastFrame = now;
    if (!this.paused && !this.orientationBlocked && !this.ended) this.update(dt, now / 1000);
    this.updateFx(dt);
    this.scene.render();
    this.quality?.tick(dt);
  }

  update(dt, nowSeconds) {
    const move = this.input.getMove();
    const look = this.input.consumeLook(dt);
    this.viewYaw = wrapAngle(this.viewYaw + look.yaw);
    this.viewPitch = clamp(this.viewPitch + look.pitch, -0.68, 0.72);

    this.player.update(dt, {
      lookYaw: this.viewYaw,
      lookPitch: this.viewPitch,
      lookYawRate: look.yawRate,
      lookPitchRate: look.pitchRate,
      moveX: move.x,
      moveY: move.y,
      moveMagnitude: move.magnitude,
      moveSpaceYaw: this.viewYaw
    });

    const enemyControl = this.ai.update(dt, this.enemy, this.player);
    this.enemy.update(dt, enemyControl);
    this.resolveBodySeparation();
    this.combat.resolvePair(this.player, this.enemy, dt, nowSeconds);

    if (this.player.stepPulse) this.audio.step(clamp(this.player.velocity.length() / 4.2, 0.25, 1));
    if (this.enemy.stepPulse && Vector3.Distance(this.player.position, this.enemy.position) < 5) this.audio.step(0.22);
    this.audio.whoosh(this.player.sword.speed);
    if (this.enemy.sword.speed > 6) this.audio.whoosh(this.enemy.sword.speed * 0.75);

    this.updateCamera(dt);
    this.onState?.(this.getState());

    if (this.player.dead || this.enemy.dead) this.finishMatch();
  }

  resolveBodySeparation() {
    const delta = this.enemy.position.subtract(this.player.position);
    delta.y = 0;
    const distance = delta.length();
    const minimum = 0.92;
    if (distance <= 1e-5 || distance >= minimum) return;
    const normal = delta.scale(1 / distance);
    const correction = (minimum - distance) * 0.5;
    this.player.position.addInPlace(normal.scale(-correction));
    this.enemy.position.addInPlace(normal.scale(correction));
    this.player.velocity.scaleInPlace(0.82);
    this.enemy.velocity.scaleInPlace(0.82);
  }

  updateCamera(dt) {
    const pose = this.player.getCameraPose(this.viewYaw, this.viewPitch);
    const t = 1 - Math.exp(-24 * dt);
    this.camera.position.x += (pose.position.x - this.camera.position.x) * t;
    this.camera.position.y += (pose.position.y - this.camera.position.y) * t;
    this.camera.position.z += (pose.position.z - this.camera.position.z) * t;

    this.cameraKickVelocity.scaleInPlace(Math.exp(-10 * dt));
    this.cameraKick.addInPlace(this.cameraKickVelocity.scale(dt));
    this.cameraKick.scaleInPlace(Math.exp(-7.5 * dt));
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const breath = Math.sin(performance.now() * 0.0017) * 0.0025;
    this.camera.rotation.x = this.viewPitch + this.cameraKick.x + breath;
    this.camera.rotation.y = this.viewYaw + this.cameraKick.y;
    this.camera.rotation.z = this.cameraKick.z + Math.sin(this.player.stepPhase) * clamp(speed / 4.2, 0, 1) * 0.006;
  }

  handleCombatEvent(event) {
    if (event.type === 'clash') {
      this.audio.clash(event.intensity);
      this.spawnImpact(event.point, '#e8c68a', event.intensity);
      if (event.a === this.player || event.b === this.player) this.kickCamera(-0.025 * event.intensity, (Math.random() - 0.5) * 0.025, (Math.random() - 0.5) * 0.02);
    } else if (event.type === 'block') {
      this.audio.block(event.intensity);
      this.spawnImpact(event.point, '#d7a55d', event.intensity * 0.8);
      if (event.defender === this.player) this.kickCamera(-0.035 * event.intensity, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.025);
    } else if (event.type === 'hit') {
      this.audio.hit(event.intensity);
      this.spawnImpact(event.point, '#8d3028', event.intensity);
      if (event.defender === this.player) this.kickCamera(-0.07 * event.intensity, (Math.random() - 0.5) * 0.055, (Math.random() - 0.5) * 0.035);
    }
  }

  kickCamera(pitch, yaw, roll) {
    this.cameraKickVelocity.x += pitch * 12;
    this.cameraKickVelocity.y += yaw * 12;
    this.cameraKickVelocity.z += roll * 12;
  }

  spawnImpact(point, color, intensity) {
    if (!point || this.fx.size > 20) return;
    const material = new StandardMaterial(`impact-mat-${performance.now()}`, this.scene);
    material.emissiveColor = Color3.FromHexString(color);
    material.disableLighting = false;
    const mesh = MeshBuilder.CreateSphere(`impact-${performance.now()}`, { diameter: 0.055 + intensity * 0.055, segments: 6 }, this.scene);
    mesh.position.copyFrom(point);
    mesh.material = material;
    mesh.isPickable = false;
    this.fx.add({ mesh, material, life: 0.16, start: 0.16 });
  }

  updateFx(dt) {
    for (const fx of [...this.fx]) {
      fx.life -= dt;
      const t = clamp(fx.life / fx.start, 0, 1);
      fx.mesh.scaling.setAll(0.6 + (1 - t) * 1.8);
      fx.mesh.visibility = t;
      if (fx.life <= 0) {
        fx.mesh.dispose();
        fx.material.dispose();
        this.fx.delete(fx);
      }
    }
  }

  getState() {
    return {
      playerHealth: this.player.health,
      enemyHealth: this.enemy.health,
      playerStability: this.player.stability,
      enemyStability: this.enemy.stability,
      swordSpeed: this.player.sword.speed,
      ended: this.ended
    };
  }

  finishMatch() {
    if (this.ended) return;
    this.ended = true;
    this.input.resetPointers();
    const result = this.enemy.dead ? 'victory' : 'defeat';
    const stats = this.loadStats();
    stats[result === 'victory' ? 'wins' : 'losses'] += 1;
    localStorage.setItem(`${this.storageNamespace}:stats`, JSON.stringify(stats));
    this.onMatchEnd?.({ result, state: this.getState(), stats });
  }

  loadStats() {
    try {
      const stored = JSON.parse(localStorage.getItem(`${this.storageNamespace}:stats`) || '{}');
      return { wins: Number(stored.wins) || 0, losses: Number(stored.losses) || 0 };
    } catch {
      return { wins: 0, losses: 0 };
    }
  }

  resetMatch(keepPaused = false) {
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.cameraKick.setAll(0);
    this.cameraKickVelocity.setAll(0);
    this.player?.reset(new Vector3(0, 0, -3.4), 0);
    this.enemy?.reset(new Vector3(0, 0, 2.9), Math.PI);
    this.ai.reset();
    this.combat?.reset();
    this.input?.resetPointers();
    this.ended = false;
    if (!keepPaused) this.paused = false;
    this.updateCamera(1 / 60);
    this.onState?.(this.getState());
  }

  restart() {
    this.resetMatch(false);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.input?.resetPointers();
    this.lastFrame = performance.now();
  }

  setOrientationBlocked(blocked) {
    this.orientationBlocked = Boolean(blocked);
    if (blocked) this.input?.resetPointers();
    this.lastFrame = performance.now();
  }

  saveSession() {
    localStorage.setItem(`${this.storageNamespace}:last`, JSON.stringify({
      at: Date.now(),
      playerHealth: this.player?.health ?? 100,
      enemyHealth: this.enemy?.health ?? 100
    }));
  }

  dispose() {
    this.saveSession();
    this.input?.dispose();
    this.player?.dispose();
    this.enemy?.dispose();
    this.world?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
