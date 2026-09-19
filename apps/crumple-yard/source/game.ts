import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3
} from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { CrashYard } from './arena';
import { VehicleAudio } from './audio';
import { ChaseCamera } from './camera';
import { CollisionSystem, type CollisionFeedback } from './collision';
import { VEHICLE_BY_ID, VEHICLES, type VehicleId } from './config';
import { ImpactEffects } from './effects';
import { MobileDriveInput } from './input';
import { mostDamagedComponents } from './damage';
import type { CollisionRegistry } from './physics-types';
import { loadSettings, saveSettings, type GameSettings } from './settings';
import { TrafficSystem, TRAFFIC_SPAWNS, trafficPreset } from './traffic';
import { Vehicle } from './vehicle';

const FIXED_DT = 1 / 90;
const VERSION = '1.0.0';

type QaState = {
  version: string;
  boot: 'loading' | 'ready' | 'running' | 'paused' | 'error';
  selectedVehicle: VehicleId;
  preset: number;
  speedKmh: number;
  fps: number;
  quality: number;
  impactCount: number;
  peakImpact: number;
  zoneDamage: Record<string, number>;
  components: Record<string, number>;
  effects: {
    structuralIntegrity: number;
    steeringAuthority: number;
    steeringPull: number;
    enginePower: number;
    coolingEfficiency: number;
  };
  deformation: number;
  aiCars: number;
  debrisCount: number;
  activeParticles: number;
  physicsSubsteps: number;
  playerPosition: { x: number; y: number; z: number };
  cameraDistance: number;
  lastImpact: { zone: string; severity: number; relativeSpeed: number; label: string } | null;
  errors: string[];
};

type Ui = {
  loading: HTMLElement;
  loadingText: HTMLElement;
  menu: HTMLElement;
  hud: HTMLElement;
  start: HTMLButtonElement;
  soundMenu: HTMLButtonElement;
  presetName: HTMLElement;
  presetButtons: HTMLElement;
  pause: HTMLElement;
  pauseButton: HTMLButtonElement;
  pauseBackdrop: HTMLButtonElement;
  resume: HTMLButtonElement;
  repair: HTMLButtonElement;
  garage: HTMLButtonElement;
  soundPause: HTMLButtonElement;
  pauseSummary: HTMLElement;
  immobile: HTMLElement;
  immobileReason: HTMLElement;
  immobileRepair: HTMLButtonElement;
  error: HTMLElement;
  errorText: HTMLElement;
  retry: HTMLButtonElement;
  speed: HTMLElement;
  vehicle: HTMLElement;
  driveState: HTMLElement;
  structBar: HTMLElement;
  structValue: HTMLElement;
  steerBar: HTMLElement;
  steerValue: HTMLElement;
  powerBar: HTMLElement;
  powerValue: HTMLElement;
  impactReadout: HTMLElement;
  impactZone: HTMLElement;
  impactInfo: HTMLElement;
  steerPad: HTMLElement;
  steerThumb: HTMLElement;
  drivePedal: HTMLElement;
  brakePedal: HTMLElement;
  carButtons: HTMLButtonElement[];
};

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Missing required UI element: ' + selector);
  return element;
}

function buildUi(): Ui {
  return {
    loading: required('#loadingScreen'),
    loadingText: required('#loadingText'),
    menu: required('#menuScreen'),
    hud: required('#hud'),
    start: required<HTMLButtonElement>('#startButton'),
    soundMenu: required<HTMLButtonElement>('#soundMenuButton'),
    presetName: required('#presetName'),
    presetButtons: required('#presetButtons'),
    pause: required('#pauseLayer'),
    pauseButton: required<HTMLButtonElement>('#pauseButton'),
    pauseBackdrop: required<HTMLButtonElement>('#pauseBackdrop'),
    resume: required<HTMLButtonElement>('#resumeButton'),
    repair: required<HTMLButtonElement>('#repairButton'),
    garage: required<HTMLButtonElement>('#garageButton'),
    soundPause: required<HTMLButtonElement>('#soundPauseButton'),
    pauseSummary: required('#pauseSummary'),
    immobile: required('#immobileLayer'),
    immobileReason: required('#immobileReason'),
    immobileRepair: required<HTMLButtonElement>('#immobileRepair'),
    error: required('#errorScreen'),
    errorText: required('#errorText'),
    retry: required<HTMLButtonElement>('#retryButton'),
    speed: required('#speedValue'),
    vehicle: required('#vehicleName'),
    driveState: required('#driveState'),
    structBar: required('#structBar'),
    structValue: required('#structValue'),
    steerBar: required('#steerBar'),
    steerValue: required('#steerValue'),
    powerBar: required('#powerBar'),
    powerValue: required('#powerValue'),
    impactReadout: required('#impactReadout'),
    impactZone: required('#impactZone'),
    impactInfo: required('#impactInfo'),
    steerPad: required('#steerPad'),
    steerThumb: required('#steerThumb'),
    drivePedal: required('#drivePedal'),
    brakePedal: required('#brakePedal'),
    carButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-car]'))
  };
}

export class CrumpleGame {
  private readonly canvas = required<HTMLCanvasElement>('#renderCanvas');
  private readonly ui = buildUi();
  private readonly engine = new Engine(this.canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: false,
    powerPreference: 'high-performance'
  });
  private readonly scene = new Scene(this.engine);
  private world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private registry: CollisionRegistry = new Map();
  private yard!: CrashYard;
  private collisions!: CollisionSystem;
  private camera!: ChaseCamera;
  private effects!: ImpactEffects;
  private audio = new VehicleAudio();
  private input: MobileDriveInput;
  private traffic!: TrafficSystem;
  private player: Vehicle | null = null;
  private shadow!: ShadowGenerator;
  private settings: GameSettings = loadSettings();
  private running = false;
  private paused = true;
  private accumulator = 0;
  private lastFrame = performance.now();
  private fpsEma = 60;
  private quality = 1;
  private frames = 0;
  private lastHud = 0;
  private lastImpactUi = 0;
  private terminalTimer = 0;
  private qa: QaState;
  private lastSubsteps = 0;

  constructor() {
    this.input = new MobileDriveInput({
      steerPad: this.ui.steerPad,
      steerThumb: this.ui.steerThumb,
      drivePedal: this.ui.drivePedal,
      brakePedal: this.ui.brakePedal
    });

    this.qa = {
      version: VERSION,
      boot: 'loading',
      selectedVehicle: this.settings.vehicle,
      preset: this.settings.preset,
      speedKmh: 0,
      fps: 60,
      quality: 1,
      impactCount: 0,
      peakImpact: 0,
      zoneDamage: {},
      components: {},
      effects: {
        structuralIntegrity: 1,
        steeringAuthority: 1,
        steeringPull: 0,
        enginePower: 1,
        coolingEfficiency: 1
      },
      deformation: 0,
      aiCars: 0,
      debrisCount: 0,
      activeParticles: 0,
      physicsSubsteps: 0,
      playerPosition: { x: 0, y: 0, z: 0 },
      cameraDistance: 0,
      lastImpact: null,
      errors: []
    };
    (window as typeof window & { __CRUMPLE_TEST_STATE__?: QaState }).__CRUMPLE_TEST_STATE__ = this.qa;
  }

  async boot() {
    try {
      this.ui.loadingText.textContent = 'Загрузка Rapier WASM и контактного решателя…';
      await RAPIER.init();
      this.configureRenderer();
      this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      this.world.timestep = FIXED_DT;
      this.eventQueue = new RAPIER.EventQueue(true);
      this.yard = new CrashYard(this.scene, this.world, this.registry);
      this.effects = new ImpactEffects(this.scene);
      this.camera = new ChaseCamera(this.scene, this.world);
      this.traffic = new TrafficSystem(this.yard);
      this.collisions = new CollisionSystem(this.world, this.eventQueue, this.registry, (feedback) => this.onImpact(feedback));
      this.bindUi();
      this.applySoundState();
      this.rebuildPlayer();
      this.renderPresetButtons();
      this.syncMenu();
      this.qa.boot = 'ready';
      this.ui.start.disabled = false;
      this.ui.loadingText.textContent = 'Rapier / кузов / подвеска готовы.';
      this.ui.menu.hidden = false;
      requestAnimationFrame(() => this.ui.loading.classList.add('is-gone'));
      this.lastFrame = performance.now();
      this.engine.runRenderLoop(() => this.loop());
    } catch (error) {
      this.showFatal(error);
    }
  }

  private configureRenderer() {
    this.scene.clearColor = new Color4(0.69, 0.70, 0.66, 1);
    this.scene.ambientColor = new Color3(0.34, 0.34, 0.31);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = 48;
    this.scene.fogEnd = 128;
    this.scene.fogColor = new Color3(0.67, 0.68, 0.65);
    this.scene.skipPointerMovePicking = true;
    this.scene.imageProcessingConfiguration.exposure = 1.06;
    this.scene.imageProcessingConfiguration.contrast = 1.08;

    const hemi = new HemisphericLight('yard-sky', new Vector3(0.16, 1, -0.12), this.scene);
    hemi.intensity = 1.05;
    hemi.diffuse = new Color3(0.94, 0.92, 0.84);
    hemi.groundColor = new Color3(0.28, 0.29, 0.27);

    const sun = new DirectionalLight('yard-sun', new Vector3(-0.42, -0.78, 0.28), this.scene);
    sun.position = new Vector3(38, 62, -42);
    sun.intensity = 1.38;
    sun.diffuse = new Color3(1, 0.91, 0.76);

    this.shadow = new ShadowGenerator(512, sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.bias = 0.0022;

    const dpr = Math.max(1, devicePixelRatio || 1);
    const target = this.settings.graphics === 'high' ? Math.min(1.18, dpr * 0.48) :
      this.settings.graphics === 'balanced' ? Math.min(1.7, dpr * 0.66) :
      Math.min(1.48, Math.max(1, dpr * 0.58));
    this.engine.setHardwareScalingLevel(Math.max(1, target));
  }

  private bindUi() {
    this.ui.carButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.car as VehicleId;
        if (!VEHICLE_BY_ID[id] || id === this.settings.vehicle) return;
        this.settings.vehicle = id;
        this.settings.preset = 0;
        saveSettings(this.settings);
        this.rebuildPlayer();
        this.renderPresetButtons();
        this.syncMenu();
      });
    });

    this.ui.start.addEventListener('click', () => void this.startSession());
    this.ui.soundMenu.addEventListener('click', () => void this.toggleSound());
    this.ui.soundPause.addEventListener('click', () => void this.toggleSound());
    this.ui.pauseButton.addEventListener('click', () => this.pause());
    this.ui.resume.addEventListener('click', () => this.resume());
    this.ui.pauseBackdrop.addEventListener('click', () => this.resume());
    this.ui.repair.addEventListener('click', () => {
      this.repairPlayer();
      this.resume();
    });
    this.ui.garage.addEventListener('click', () => this.openGarage());
    this.ui.immobileRepair.addEventListener('click', () => {
      this.repairPlayer();
      this.ui.immobile.hidden = true;
      this.paused = false;
      this.qa.boot = 'running';
      this.lastFrame = performance.now();
    });
    this.ui.retry.addEventListener('click', () => location.reload());

    addEventListener('resize', () => this.engine.resize(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.input.reset();
        if (this.running && !this.paused) this.pause();
        this.engine.stopRenderLoop();
      } else {
        this.lastFrame = performance.now();
        this.engine.runRenderLoop(() => this.loop());
      }
    });
    addEventListener('pagehide', () => saveSettings(this.settings), { passive: true });
  }

  private async toggleSound() {
    await this.audio.unlock();
    this.settings.sound = !this.settings.sound;
    saveSettings(this.settings);
    this.applySoundState();
  }

  private applySoundState() {
    this.audio.setMuted(!this.settings.sound);
    this.ui.soundMenu.textContent = this.settings.sound ? 'ЗВУК · ВКЛ' : 'ЗВУК · ВЫКЛ';
    this.ui.soundPause.querySelector('b')!.textContent = this.settings.sound ? 'ВКЛ' : 'ВЫКЛ';
  }

  private renderPresetButtons() {
    const spec = VEHICLE_BY_ID[this.settings.vehicle];
    this.ui.presetButtons.textContent = '';
    spec.presets.forEach((preset, index) => {
      const button = document.createElement('button');
      button.className = 'preset-button';
      button.type = 'button';
      button.style.setProperty('--swatch', preset.paint);
      button.style.setProperty('--wheel', preset.wheel);
      button.setAttribute('aria-label', preset.name);
      button.setAttribute('aria-pressed', String(index === this.settings.preset));
      button.addEventListener('click', () => {
        if (index === this.settings.preset) return;
        this.settings.preset = index;
        saveSettings(this.settings);
        this.rebuildPlayer();
        this.renderPresetButtons();
        this.syncMenu();
      });
      this.ui.presetButtons.append(button);
    });
  }

  private syncMenu() {
    const spec = VEHICLE_BY_ID[this.settings.vehicle];
    const preset = spec.presets[this.settings.preset] ?? spec.presets[0];
    this.ui.presetName.textContent = preset.name;
    for (const button of this.ui.carButtons) {
      const selected = button.dataset.car === this.settings.vehicle;
      button.setAttribute('aria-checked', String(selected));
    }
  }

  private addShadows(vehicle: Vehicle) {
    for (const mesh of vehicle.root.getChildMeshes()) this.shadow.addShadowCaster(mesh, false);
  }

  private rebuildPlayer() {
    if (!this.world) return;
    if (this.player) this.player.dispose();
    const spec = VEHICLE_BY_ID[this.settings.vehicle];
    const preset = spec.presets[this.settings.preset] ?? spec.presets[0];
    this.player = new Vehicle(this.scene, this.world, this.registry, spec, preset, new Vector3(0, 1.18, -24), 0, true);
    this.addShadows(this.player);
    if (this.camera) this.camera.snap(this.player);
    this.qa.selectedVehicle = this.settings.vehicle;
    this.qa.preset = this.settings.preset;
  }

  private createTraffic() {
    this.traffic.dispose();
    const specs = [VEHICLE_BY_ID.kestrel, VEHICLE_BY_ID.meridian, VEHICLE_BY_ID.bastion];
    TRAFFIC_SPAWNS.forEach((spawn, index) => {
      const spec = specs[index % specs.length];
      const vehicle = new Vehicle(
        this.scene,
        this.world,
        this.registry,
        spec,
        trafficPreset(spec, index + 1),
        spawn.position,
        spawn.yaw,
        false
      );
      this.addShadows(vehicle);
      this.traffic.add(vehicle, spawn.waypoint, spawn.direction);
    });
  }

  private async startSession() {
    if (!this.player || this.running) return;
    await this.audio.unlock();
    this.audio.setMuted(!this.settings.sound);
    this.createTraffic();
    this.running = true;
    this.paused = false;
    this.accumulator = 0;
    this.terminalTimer = 0;
    this.ui.menu.hidden = true;
    this.ui.hud.hidden = false;
    this.ui.pause.hidden = true;
    this.ui.immobile.hidden = true;
    this.qa.boot = 'running';
    this.camera.snap(this.player);
    this.lastFrame = performance.now();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.input.reset();
    this.ui.pause.hidden = false;
    if (this.player) {
      const effects = this.player.effects();
      const worst = mostDamagedComponents(this.player.damage, 2)
        .map(([name, health]) => name + ' ' + Math.round(health * 100) + '%')
        .join(' · ');
      this.ui.pauseSummary.textContent = 'Структура ' + Math.round(effects.structuralIntegrity * 100) + '% · ' + worst;
    }
    this.qa.boot = 'paused';
  }

  resume() {
    if (!this.running) return;
    this.ui.pause.hidden = true;
    this.paused = false;
    this.qa.boot = 'running';
    this.lastFrame = performance.now();
  }

  private repairPlayer() {
    this.rebuildPlayer();
    this.ui.immobile.hidden = true;
    this.terminalTimer = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now();
  }

  private openGarage() {
    this.paused = true;
    this.running = false;
    this.input.reset();
    this.traffic.dispose();
    this.ui.pause.hidden = true;
    this.ui.immobile.hidden = true;
    this.ui.hud.hidden = true;
    this.ui.menu.hidden = false;
    this.rebuildPlayer();
    this.qa.boot = 'ready';
  }

  private onImpact(feedback: CollisionFeedback) {
    const isPlayer = feedback.vehicle === this.player;
    this.effects.burst(feedback.point, feedback.normal, feedback.result.severity, feedback.result.glass);
    if (feedback.result.severity > 0.018) this.audio.impact(feedback.result.severity, feedback.material === 'steel' ? 'metal' : feedback.material === 'soft' ? 'soft' : 'hard');
    if (isPlayer) {
      this.camera.kick(feedback.result.severity);
      this.qa.lastImpact = {
        zone: feedback.result.zone,
        severity: Number(feedback.result.severity.toFixed(3)),
        relativeSpeed: Number(feedback.relativeSpeed.toFixed(2)),
        label: feedback.label
      };
      const labels: Record<string, string> = { front: 'ПЕРЕД', rear: 'ЗАД', left: 'ЛЕВЫЙ БОРТ', right: 'ПРАВЫЙ БОРТ', roof: 'КРЫША', chassis: 'ШАССИ' };
      this.ui.impactZone.textContent = labels[feedback.result.zone] + ' · ' + Math.round(feedback.result.severity * 100) + '%';
      this.ui.impactInfo.textContent = feedback.label + ' · Δv ' + (feedback.relativeSpeed * 3.6).toFixed(0) + ' км/ч';
      this.ui.impactReadout.classList.add('is-hot');
      this.lastImpactUi = performance.now();
    }
  }

  private stepPhysics(frameDt: number) {
    if (!this.player || !this.running || this.paused) {
      this.lastSubsteps = 0;
      return;
    }
    this.accumulator = Math.min(this.accumulator + frameDt, FIXED_DT * 5);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.player.preStep(this.input.state, FIXED_DT);
      this.traffic.preStep(FIXED_DT);
      this.world.timestep = FIXED_DT;
      this.world.step(this.eventQueue);
      this.collisions.drain(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    this.lastSubsteps = steps;
  }

  private syncWorld(dt: number) {
    if (!this.player) return;
    this.player.syncVisual();
    this.player.syncDetached();
    this.traffic.sync();
    this.yard.sync();
    this.effects.update(dt);
    this.camera.update(this.player, dt);
    const effects = this.player.effects();
    this.audio.update(this.player.speedMps(), this.player.throttle, effects.enginePower, this.player.damage.temperature);

    if (this.running && !this.paused) {
      const y = this.player.root.position.y;
      const terminal = !effects.driveable || y < -3.5;
      this.terminalTimer = terminal ? this.terminalTimer + dt : Math.max(0, this.terminalTimer - dt * 2);
      if (this.terminalTimer > 1.15 && this.ui.immobile.hidden) {
        this.paused = true;
        this.input.reset();
        this.ui.immobileReason.textContent = y < -3.5
          ? 'Машина покинула площадку. Физика честно продолжила путь, но испытание закончено.'
          : effects.structuralIntegrity < 0.08
            ? 'Силовая структура кузова разрушена: геометрия и подвеска больше не держат автомобиль.'
            : 'Двигатель или трансмиссия потеряли достаточно прочности, чтобы дальнейшее движение стало практически невозможным.';
        this.ui.immobile.hidden = false;
        this.qa.boot = 'paused';
      }
    }
  }

  private updateHud(now: number) {
    if (!this.player || now - this.lastHud < 80) return;
    this.lastHud = now;
    const effects = this.player.effects();
    const speed = Math.round(this.player.speedKmh());
    const values = [
      { value: effects.structuralIntegrity, bar: this.ui.structBar, label: this.ui.structValue },
      { value: effects.steeringAuthority, bar: this.ui.steerBar, label: this.ui.steerValue },
      { value: effects.enginePower, bar: this.ui.powerBar, label: this.ui.powerValue }
    ];
    this.ui.speed.textContent = String(speed);
    this.ui.vehicle.textContent = this.player.spec.name;
    this.ui.driveState.textContent = effects.driveable ? (this.player.damage.temperature > 0.95 ? 'OVERHEAT' : 'DRIVEABLE') : 'FAILED';
    for (const item of values) {
      const percent = Math.round(item.value * 100);
      item.bar.style.transform = 'scaleX(' + Math.max(0, item.value) + ')';
      item.bar.style.background = item.value < 0.3 ? '#f16628' : '#e1ddd1';
      item.label.textContent = String(percent);
    }
    if (now - this.lastImpactUi > 1700) this.ui.impactReadout.classList.remove('is-hot');
    this.publishQa();
  }

  private publishQa() {
    if (!this.player) return;
    const effects = this.player.effects();
    const pos = this.player.root.position;
    Object.assign(this.qa, {
      boot: this.qa.boot,
      selectedVehicle: this.settings.vehicle,
      preset: this.settings.preset,
      speedKmh: Number(this.player.speedKmh().toFixed(1)),
      fps: Number(this.fpsEma.toFixed(1)),
      quality: Number(this.quality.toFixed(2)),
      impactCount: this.player.damage.impactCount,
      peakImpact: Number(this.player.damage.peakImpact.toFixed(3)),
      zoneDamage: { ...this.player.damage.zoneDamage },
      components: { ...this.player.damage.components },
      effects: {
        structuralIntegrity: Number(effects.structuralIntegrity.toFixed(3)),
        steeringAuthority: Number(effects.steeringAuthority.toFixed(3)),
        steeringPull: Number(effects.steeringPull.toFixed(3)),
        enginePower: Number(effects.enginePower.toFixed(3)),
        coolingEfficiency: Number(effects.coolingEfficiency.toFixed(3))
      },
      deformation: Number(this.player.shell.deformationScore().toFixed(4)),
      aiCars: this.traffic.agents.length,
      debrisCount: this.player.detached.length + this.traffic.agents.reduce((total, agent) => total + agent.vehicle.detached.length, 0),
      activeParticles: this.effects.activeCount,
      physicsSubsteps: this.lastSubsteps,
      playerPosition: { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2)) },
      cameraDistance: Number(this.camera.distanceTo(this.player).toFixed(2))
    });
  }

  private adaptQuality(dt: number) {
    const fps = 1 / Math.max(0.001, dt);
    this.fpsEma += (fps - this.fpsEma) * 0.035;
    this.frames += 1;
    if (this.settings.graphics !== 'auto' || this.frames % 180 !== 0) return;
    if (this.fpsEma < 40 && this.quality > 0.62) {
      this.quality = Math.max(0.62, this.quality - 0.12);
      this.engine.setHardwareScalingLevel(Math.min(1.95, this.engine.getHardwareScalingLevel() + 0.13));
    } else if (this.fpsEma > 56 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.08);
      this.engine.setHardwareScalingLevel(Math.max(1, this.engine.getHardwareScalingLevel() - 0.07));
    }
  }

  private loop() {
    const now = performance.now();
    const dt = Math.min(0.08, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.stepPhysics(dt);
    this.syncWorld(dt);
    this.adaptQuality(dt);
    this.updateHud(now);
    this.scene.render();
  }

  private showFatal(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CRUMPLE] boot failure', error);
    this.qa.boot = 'error';
    this.qa.errors.push(message);
    this.ui.loading.classList.add('is-gone');
    this.ui.menu.hidden = true;
    this.ui.hud.hidden = true;
    this.ui.errorText.textContent = 'Не удалось запустить 3D/physics runtime. ' + message;
    this.ui.error.hidden = false;
  }

  resetAll() {
    this.settings = { vehicle: 'meridian', preset: 0, sound: true, graphics: 'auto' };
    saveSettings(this.settings);
    location.reload();
  }
}
