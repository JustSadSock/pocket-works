import { Engine, Scene } from '@babylonjs/core';
import { createSandMaterials } from './sand-material.js';
import { DesertWorld } from './world.js';
import { SandWalkerController } from './movement.js';
import { HumanoidRig } from './character.js';
import { FootprintField } from './deformation.js';
import { SlipField } from './slip-field.js';
import { SandParticles } from './particles.js';
import { DesertLighting } from './lighting.js';
import { DesertAtmosphere } from './atmosphere.js';
import { FirstPersonCamera } from './camera.js';
import { MobileInput } from './input.js';
import { AdaptiveQuality } from './quality.js';
import { DebugPanel } from './debug.js';
import { DesertAudio } from './audio.js';
import { clamp, damp } from './core.js';
import { downhillDirection } from './terrain.js';

const SESSION_KEY = 'pocket-works:sirocco:session';
const SESSION_SCHEMA = 2;
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
    this.pelvisRoll = 0;
    this.pelvisLift = 0;
  }

  async init(report = () => {}) {
    report('Инициализация мобильного рендера…', 0.08);
    this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' }, false);
    this.engine.setHardwareScalingLevel(1.28);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.autoClear = true;
    await nextFrame();

    report('Собираем песок и микрорельеф…', 0.23);
    this.quality = new AdaptiveQuality((preset) => this.applyQuality(preset));
    this.materials = createSandMaterials(this.scene);
    this.world = new DesertWorld(this.scene, this.materials, this.quality.preset);
    this.controller = new SandWalkerController((dx, dz, ox, oz) => this.handleRebase(dx, dz, ox, oz));
    this.restoreSession();
    await nextFrame();

    report('Строим тело и foot IK…', 0.43);
    this.shadowCasters = [];
    this.rig = new HumanoidRig(this.scene, this.shadowCasters);
    this.lighting = new DesertLighting(this.scene, this.quality.preset, this.shadowCasters);
    this.atmosphere = new DesertAtmosphere(this.scene, this.lighting.sunDirection);
    this.footprints = new FootprintField(this.scene, this.materials.footprint, 112);
    this.slips = new SlipField(this.scene, this.materials.footprint, 36);
    this.particles = new SandParticles(this.scene, this.quality.preset.particles);
    await nextFrame();

    report('Настраиваем камеру и touch input…', 0.64);
    this.camera = new FirstPersonCamera(this.scene);
    this.input = new MobileInput(document.body);
    this.audio = new DesertAudio();
    this.debug = new DebugPanel(this.scene, this.engine, { materials: this.materials, world: this.world, rig: this.rig, footprints: this.footprints });
    this.applyQuality(this.quality.preset);
    this.world.setOrigin(this.controller.worldOffsetX, this.controller.worldOffsetZ);
    this.world.update(this.controller.globalX, this.controller.globalZ);
    this.lighting.registerWorld(this.world);
    await nextFrame();

    report('Прогреваем дюны и тени…', 0.88);
    this.rig.update(this.controller, 1 / 60);
    this.adaptBodyToFeet(1 / 60);
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
      if (snapshot?.schema !== SESSION_SCHEMA) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
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

  handleRebase(dx, dz, offsetX, offsetZ) {
    this.world.setOrigin(offsetX, offsetZ);
    this.rig.shiftOrigin(dx, dz);
    this.footprints.shiftOrigin(dx, dz);
    this.slips.shiftOrigin(dx, dz);
  }

  adaptBodyToFeet(dt) {
    const left = this.rig.footState.left;
    const right = this.rig.footState.right;
    if (!left.initialized || !right.initialized) return;
    const averageFootY = (left.plant.y + right.plant.y) * 0.5;
    const liftTarget = clamp((averageFootY - this.controller.localPosition.y - 0.035) * 0.55, -0.045, 0.075);
    const rollTarget = clamp((right.plant.y - left.plant.y) * 0.36, -0.115, 0.115);
    this.pelvisLift = damp(this.pelvisLift, liftTarget, 10, dt);
    this.pelvisRoll = damp(this.pelvisRoll, rollTarget, 9, dt);
    this.rig.nodes.pelvis.position.y += this.pelvisLift;
    this.rig.nodes.pelvis.rotation.z = this.pelvisRoll;
    this.rig.nodes.spine.rotation.z = -this.pelvisRoll * 0.42;
  }

  applyQuality(preset) {
    if (!preset || !this.engine) return;
    this.engine.setHardwareScalingLevel(preset.hardwareScaling);
    this.world?.setQuality(preset);
    this.lighting?.setQuality(preset);
    this.atmosphere?.setQuality(preset);
    this.particles?.setBudget(preset.particles);
    this.footprints?.setLimit(preset.footprintLimit);
    this.slips?.setQuality(preset);
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
      const chunksChanged = this.world.update(this.controller.globalX, this.controller.globalZ);
      if (chunksChanged) this.lighting.registerWorld(this.world);
      const landings = this.rig.update(this.controller, dt);
      this.adaptBodyToFeet(dt);
      for (const landing of landings) {
        this.footprints.add(landing, this.controller);
        const steep = groundState.sliding > 0.04;
        const down = steep ? downhillDirection(landing.globalX, landing.globalZ) : null;
        if (steep) this.slips.add(landing, down, 0.45 + groundState.sliding * 0.9);
        this.particles.kick(landing.position, landing.yaw, steep ? 1.25 : 0.72, down);
        this.audio.footstep(0.75 + Math.min(0.3, this.controller.speed * 0.08));
      }
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
    this.particles?.dispose();
    this.slips?.dispose();
    this.footprints?.dispose();
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
