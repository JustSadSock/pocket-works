import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { createSnowMaterials } from './snow-material.js';
import { SnowWorld } from './world.js';
import { MountainWalkerController } from './movement.js';
import { SnowDeformationPatch } from './deformation.js';
import { SnowParticles } from './particles.js';
import { MountainLighting } from './lighting.js';
import { MountainWeather } from './weather.js';
import { FirstPersonCamera } from './camera.js';
import { MobileInput } from './input.js';
import { AdaptiveQuality } from './quality.js';
import { MountainAudio } from './audio.js';
import { downhillDirection } from './terrain.js';

const SESSION_KEY = 'pocket-works:firn:session';
const SESSION_SCHEMA = 1;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export class FirnGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.running = false;
    this.paused = false;
    this.orientationBlocked = false;
    this.saveClock = 0;
    this.sloughCooldown = 0;
    this.surfaceKind = '';
    this.surfaceChip = document.querySelector('#surface-chip');
    this.weatherChip = document.querySelector('#weather-chip');
  }

  async init(report = () => {}) {
    report('Инициализация мобильного рендера…', 0.08);
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance'
    }, false);
    this.engine.setHardwareScalingLevel(1.22);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.autoClear = true;
    await nextFrame();

    report('Собираем снежный покров…', 0.23);
    this.quality = new AdaptiveQuality((preset) => this.applyQuality(preset));
    this.materials = createSnowMaterials(this.scene);
    this.world = new SnowWorld(this.scene, this.materials, this.quality.preset);
    this.controller = new MountainWalkerController((dx, dz, ox, oz) => this.handleRebase(dx, dz, ox, oz));
    this.restoreSession();
    await nextFrame();

    report('Строим горы и локальную деформацию…', 0.42);
    this.deformation = new SnowDeformationPatch(this.scene, this.materials, this.quality.preset);
    this.lighting = new MountainLighting(this.scene, this.quality.preset);
    this.particles = new SnowParticles(this.scene, this.quality.preset.particles);
    this.weather = new MountainWeather(this.scene, this.lighting, this.particles);
    await nextFrame();

    report('Настраиваем движение по склонам…', 0.61);
    this.camera = new FirstPersonCamera(this.scene);
    this.input = new MobileInput(document.body);
    this.audio = new MountainAudio();
    this.applyQuality(this.quality.preset);
    this.world.setOrigin(this.controller.worldOffsetX, this.controller.worldOffsetZ);
    this.deformation.setOrigin(this.controller.worldOffsetX, this.controller.worldOffsetZ);
    this.world.update(this.controller.globalX, this.controller.globalZ, 3);
    while (this.world.pendingCount > 0) {
      this.world.update(this.controller.globalX, this.controller.globalZ, 3);
      this.lighting.registerWorld(this.world);
      await nextFrame();
    }
    this.lighting.registerWorld(this.world);
    this.deformation.update(1, this.controller.globalX, this.controller.globalZ);
    await nextFrame();

    report('Прогреваем тени, туман и позёмку…', 0.86);
    this.camera.update(this.controller, 1 / 60);
    this.particles.update(this.camera.camera.position);
    this.scene.render();
    await nextFrame();

    this.bindLifecycle();
    report('Готово', 1);
    this.running = true;
    this.engine.runRenderLoop(() => this.frame());
  }

  restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      if (snapshot?.schema !== SESSION_SCHEMA) return;
      this.controller.restore(snapshot);
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      console.warn('[FIRN] Invalid saved session ignored.', error);
    }
  }

  saveSession() {
    if (!this.controller) return;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ schema: SESSION_SCHEMA, ...this.controller.snapshot() })); }
    catch (error) { console.warn('[FIRN] Session persistence failed.', error); }
  }

  bindLifecycle() {
    this.onResize = () => this.engine.resize();
    this.onVisibility = () => {
      if (document.hidden) { this.saveSession(); this.audio?.ctx?.suspend?.(); }
    };
    this.onPageHide = () => this.saveSession();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  handleRebase(_dx, _dz, offsetX, offsetZ) {
    this.world.setOrigin(offsetX, offsetZ);
    this.deformation.setOrigin(offsetX, offsetZ);
  }

  applyQuality(preset) {
    if (!preset || !this.engine) return;
    this.engine.setHardwareScalingLevel(preset.hardwareScaling);
    this.world?.setQuality(preset);
    this.lighting?.setQuality(preset);
    this.deformation?.setQuality(preset);
    this.particles?.setBudget(preset.particles);
    const label = document.querySelector('#quality-label');
    if (label) label.textContent = this.quality?.mode === 'auto' ? `AUTO · ${preset.label}` : preset.label;
  }

  flashChip(element, text) {
    if (!element) return;
    element.textContent = text;
    element.classList.remove('show');
    void element.offsetWidth;
    element.classList.add('show');
  }

  updateSurfaceChip(kind) {
    if (kind === this.surfaceKind) return;
    this.surfaceKind = kind;
    const names = { powder: 'ГЛУБОКИЙ СНЕГ', crust: 'НАСТ', ice: 'ЛЁД', drift: 'СНЕЖНЫЙ НАДУВ', packed: 'ПЛОТНЫЙ СНЕГ' };
    this.flashChip(this.surfaceChip, names[kind] || 'СНЕГ');
  }

  maybeSlough(landing) {
    if (this.sloughCooldown > 0 || landing.instability < 0.54) return;
    const chance = (landing.instability - 0.5) * 0.7 + landing.slide * 0.18;
    if (Math.random() > chance) return;
    const down = downhillDirection(landing.globalX, landing.globalZ);
    const strength = Math.min(1.25, 0.55 + landing.instability * 0.65 + landing.slide * 0.55);
    const yaw = Math.atan2(down.x, down.z);
    this.deformation.addScar(landing.globalX + down.x * 0.72, landing.globalZ + down.z * 0.72, yaw, strength);
    const local = new Vector3(landing.localX + down.x * 0.5, landing.y + 0.06, landing.localZ + down.z * 0.5);
    this.particles.slough(local, down, strength);
    this.sloughCooldown = 1.4 + Math.random() * 1.8;
  }

  frame() {
    if (!this.scene || !this.engine) return;
    const dt = Math.min(0.04, this.engine.getDeltaTime() / 1000);
    const active = this.running && !this.paused && !document.hidden && !this.orientationBlocked;

    if (active) {
      this.sloughCooldown = Math.max(0, this.sloughCooldown - dt);
      const input = this.input.getMove();
      this.controller.applyLook(this.input.consumeLook());
      const state = this.controller.update(dt, input);
      this.input.setBraceNeeded(state.braceNeeded);
      this.updateSurfaceChip(state.snow.kind);

      const changed = this.world.update(this.controller.globalX, this.controller.globalZ, 1);
      if (changed) this.lighting.registerWorld(this.world);

      for (const landing of state.landings) {
        this.deformation.addFootprint(landing);
        const down = downhillDirection(landing.globalX, landing.globalZ);
        this.particles.kick(new Vector3(landing.localX, landing.y + 0.04, landing.localZ), landing.powder, landing.slide > 0.08 ? down : null, 0.65 + landing.sink * 0.75);
        this.audio.footstep(landing.powder, landing.hardness, 0.8 + Math.min(0.28, this.controller.speed * 0.06));
        this.maybeSlough(landing);
      }

      if (state.sliding > 0.2 && this.controller.speed > 1.15 && Math.random() < dt * 1.8) {
        const down = downhillDirection(this.controller.globalX, this.controller.globalZ);
        const yaw = Math.atan2(down.x, down.z);
        this.deformation.addScar(this.controller.globalX, this.controller.globalZ, yaw, Math.min(0.8, state.sliding));
      }

      this.deformation.update(dt, this.controller.globalX, this.controller.globalZ);
      this.camera.update(this.controller, dt);
      this.particles.update(this.camera.camera.position);
      const weatherChange = this.weather.update(dt, this.controller.localPosition.y);
      if (weatherChange) this.flashChip(this.weatherChip, weatherChange);
      this.audio.update(this.controller.speed, this.weather.wind, state.sliding, this.controller.braceAmount);
      this.quality.update(dt, this.engine.getFps());

      this.saveClock += dt;
      if (this.saveClock >= 2.5) { this.saveClock = 0; this.saveSession(); }
    }
    this.scene.render();
  }

  setPaused(value) { this.paused = value; if (value) this.saveSession(); }
  setOrientationBlocked(value) { this.orientationBlocked = value; }

  dispose() {
    this.running = false; this.saveSession();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.input?.dispose(); this.deformation?.dispose(); this.particles?.dispose(); this.world?.dispose();
    this.materials?.dispose(); this.weather?.dispose(); this.lighting?.dispose(); this.camera?.dispose();
    this.scene?.dispose(); this.engine?.dispose();
  }
}
