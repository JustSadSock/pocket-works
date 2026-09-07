import { Engine, Scene } from '@babylonjs/core';
import { createSandMaterials } from './sand-material.js';
import { DesertWorld } from './world.js';
import { SandWalkerController } from './movement.js';
import { HumanoidRig } from './character.js';
import { SandPhysics } from './sand-physics.js';
import { LocalSandSurface } from './sand-surface.js';
import { SandParticles } from './particles.js';
import { DesertLighting } from './lighting.js';
import { DesertAtmosphere } from './atmosphere.js';
import { FirstPersonCamera } from './camera.js';
import { CharacterContactShadow } from './contact-shadow.js';
import { MobileInput } from './input.js';
import { AdaptiveQuality } from './quality.js';
import { DebugPanel } from './debug.js';
import { DesertAudio } from './audio.js';

const SESSION_KEY = 'pocket-works:sirocco:session';
const SESSION_SCHEMA = 6;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export class SiroccoGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.running = false;
    this.paused = false;
    this.orientationBlocked = false;
    this.lastFps = 60;
    this.saveClock = 0;
  }

  async init(report = () => {}) {
    report('Инициализация мобильного рендера…', 0.08);
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
    await nextFrame();

    report('Собираем песок и локальную физику…', 0.23);
    this.quality = new AdaptiveQuality((preset) => this.applyQuality(preset));
    this.materials = createSandMaterials(this.scene);
    this.world = new DesertWorld(this.scene, this.materials, this.quality.preset);
    this.sand = new SandPhysics(this.world);
    this.sand.setQuality(this.quality.preset);
    this.world.setSandPhysics(this.sand);
    this.sandSurface = new LocalSandSurface(this.scene, this.world, this.sand, this.materials.near, this.quality.preset);
    this.controller = new SandWalkerController((dx, dz, ox, oz) => this.handleRebase(dx, dz, ox, oz), this.sandSurface);
    this.restoreSession();
    await nextFrame();

    report('Загружаем тело и настоящую походку…', 0.39);
    this.shadowCasters = [];
    this.rig = new HumanoidRig(this.scene, this.shadowCasters, this.sandSurface);
    await this.rig.init();
    await nextFrame();

    report('Настраиваем свет и атмосферу…', 0.53);
    this.lighting = new DesertLighting(this.scene, this.quality.preset, this.shadowCasters);
    this.atmosphere = new DesertAtmosphere(this.scene, this.lighting.sunDirection);
    this.particles = new SandParticles(this.scene, this.quality.preset.particles);
    this.contactShadow = new CharacterContactShadow(this.scene, this.sandSurface);
    await nextFrame();

    report('Настраиваем камеру и touch input…', 0.67);
    this.camera = new FirstPersonCamera(this.scene);
    this.input = new MobileInput(document.body);
    this.audio = new DesertAudio();
    this.debug = new DebugPanel(this.scene, this.engine, {
      materials: this.materials,
      world: this.world,
      rig: this.rig,
      sand: this.sand
    });
    this.applyQuality(this.quality.preset);
    this.world.setOrigin(this.controller.worldOffsetX, this.controller.worldOffsetZ);
    this.world.update(this.controller.globalX, this.controller.globalZ);
    this.sandSurface.update(this.controller, true);
    this.controller.localPosition.y = this.sandSurface.sampleHeight(this.controller.globalX, this.controller.globalZ);
    this.contactShadow.update(this.controller);
    await nextFrame();

    report('Прогреваем анимацию и мягкие тени…', 0.90);
    this.rig.update(this.controller, 1 / 60);
    this.camera.update(this.controller, 1 / 60);
    this.scene.render();
    await nextFrame();

    this.bindLifecycle();
    report('Готово', 1);
    this.running = true;
    this.engine.runRenderLoop(() => this.frame());
  }

  restoreSession() {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const snapshot = JSON.parse(stored);
      if (snapshot?.schema !== SESSION_SCHEMA) { localStorage.removeItem(SESSION_KEY); return; }
      this.controller.restore(snapshot);
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      console.warn('[SIROCCO] Ignoring invalid saved session.', error);
    }
  }

  saveSession() {
    if (!this.controller) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ schema: SESSION_SCHEMA, ...this.controller.snapshot() }));
    } catch (error) {
      console.warn('[SIROCCO] Session persistence failed.', error);
    }
  }

  bindLifecycle() {
    this.onResize = () => this.engine.resize();
    this.onVisibility = () => {
      if (document.hidden) {
        this.saveSession();
        this.audio?.ctx?.suspend?.();
      }
    };
    this.onPageHide = () => this.saveSession();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  handleRebase() {
    this.world.setOrigin(this.controller.worldOffsetX, this.controller.worldOffsetZ);
    this.rig?.shiftOrigin();
    this.sandSurface?.syncOrigin();
  }

  applyQuality(preset) {
    if (!preset || !this.engine) return;
    this.engine.setHardwareScalingLevel(preset.hardwareScaling);
    this.world?.setQuality(preset);
    this.lighting?.setQuality(preset);
    this.atmosphere?.setQuality(preset);
    this.particles?.setBudget(preset.particles);
    this.sand?.setQuality(preset);
    this.sandSurface?.setQuality(preset);
    document.querySelector('#quality-label')?.replaceChildren(document.createTextNode(this.quality?.mode === 'auto' ? `AUTO · ${preset.label}` : preset.label));
  }

  frame() {
    if (!this.scene || !this.engine) return;
    const dt = Math.min(0.04, this.engine.getDeltaTime() / 1000);
    const active = this.running && !this.paused && !document.hidden && !this.orientationBlocked;
    if (active) {
      const move = this.input.getMove();
      this.controller.applyLook(this.input.consumeLook());
      const groundState = this.controller.update(dt, move);
      this.world.update(this.controller.globalX, this.controller.globalZ);
      this.sandSurface.update(this.controller);

      const landings = this.rig.update(this.controller, dt);
      for (const landing of landings) {
        this.sand.stampFoot(landing, this.controller);
        const steep = groundState.sliding > 0.04;
        const down = steep ? this.sandSurface.downhill(landing.globalX, landing.globalZ) : null;
        this.particles.kick(landing.position, landing.yaw, steep ? 1.14 : 0.62, down);
        this.audio.footstep(0.72 + Math.min(0.28, this.controller.speed * 0.08));
      }

      const downhill = groundState.sliding > 0.10
        ? this.sandSurface.downhill(this.controller.globalX, this.controller.globalZ)
        : null;
      this.particles.trail(dt, this.controller.localPosition, this.controller.bodyYaw, groundState.sliding, downhill);

      const dirtySand = this.sand.consumeDirtyBounds();
      if (dirtySand) {
        this.world.refreshDeformation(dirtySand);
        this.sandSurface.markDirty();
        this.sandSurface.update(this.controller, true);
      }
      this.sand.update(dt, this.controller.globalX, this.controller.globalZ);

      this.contactShadow.update(this.controller);
      this.camera.update(this.controller, dt);
      this.audio.update(this.controller.speed, this.controller.lastSlope);
      this.lastFps = this.engine.getFps();
      this.quality.update(dt, this.lastFps);
      this.debug.update(dt, this.controller, this.quality.preset);
      this.saveClock += dt;
      if (this.saveClock >= 2.5) { this.saveClock = 0; this.saveSession(); }
    }
    this.scene.render();
  }

  setPaused(value) { this.paused = value; if (value) this.saveSession(); }
  setOrientationBlocked(value) { this.orientationBlocked = value; }

  dispose() {
    this.running = false;
    this.saveSession();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.input?.dispose();
    this.debug?.dispose();
    this.contactShadow?.dispose();
    this.particles?.dispose();
    this.sandSurface?.dispose();
    this.sand?.clear();
    this.rig?.dispose();
    this.world?.dispose();
    this.materials?.dispose();
    this.atmosphere?.dispose();
    this.lighting?.dispose();
    this.camera?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
