import { bindPointerGesture } from '../../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../../shared/capabilities/storage.js';
import { SeaAudio } from './audio';
import { DEG, ShipDynamics, clamp, hash2, idealSailTrim, lerp, smoothTo, wrapAngle, type ShipControls, type WindState } from './core';
import { OceanWorld, type EnvironmentFrame, type QualityMode } from './world';

type SettingsState = {
  quality: QualityMode;
  sensitivity: number;
  sound: boolean;
  hints: boolean;
  onboardingDone: boolean;
  totalDistanceMeters: number;
};

type WeatherPreset = {
  label: string;
  wind: number;
  wave: number;
  rain: number;
  storm: number;
  cloud: number;
  visibility: number;
};

const PRESETS: readonly WeatherPreset[] = [
  { label: 'ШТИЛЬ', wind: 2.2, wave: 0.48, rain: 0, storm: 0, cloud: 0.18, visibility: 1 },
  { label: 'БРИЗ', wind: 6.6, wave: 0.82, rain: 0, storm: 0.02, cloud: 0.2, visibility: 1 },
  { label: 'МОРЕ', wind: 9.4, wave: 1.08, rain: 0, storm: 0.09, cloud: 0.32, visibility: 0.96 },
  { label: 'СИЛЬНЫЙ ВЕТЕР', wind: 13.2, wave: 1.45, rain: 0.04, storm: 0.28, cloud: 0.48, visibility: 0.88 },
  { label: 'ДОЖДЬ', wind: 10.8, wave: 1.2, rain: 0.72, storm: 0.2, cloud: 0.78, visibility: 0.68 },
  { label: 'ШТОРМ', wind: 18.4, wave: 2.08, rain: 0.92, storm: 1, cloud: 0.96, visibility: 0.43 }
] as const;

const FIXED_STEP = 1 / 60;
const WEATHER_SECONDS = 82;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required Pelagos element: ${selector}`);
  return element;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function weatherPresetFor(segment: number): WeatherPreset {
  if (segment <= 0) return PRESETS[1];
  const roll = hash2(segment * 17 + 3, segment * 29 - 9);
  if (roll < 0.12) return PRESETS[0];
  if (roll < 0.39) return PRESETS[1];
  if (roll < 0.66) return PRESETS[2];
  if (roll < 0.82) return PRESETS[3];
  if (roll < 0.93) return PRESETS[4];
  return PRESETS[5];
}

function interpolateEnvironment(a: WeatherPreset, b: WeatherPreset, mix: number, time: number): EnvironmentFrame {
  const directionBase = 0.82 + Math.sin(time * 0.0067) * 0.42 + Math.sin(time * 0.0019 + 1.4) * 0.58;
  const gustNoise = 0.5 + 0.5 * Math.sin(time * 0.93 + Math.sin(time * 0.17) * 1.8);
  const windSpeed = lerp(a.wind, b.wind, mix) * (0.88 + gustNoise * lerp(0.08, 0.28, lerp(a.storm, b.storm, mix)));
  const wind: WindState = {
    direction: wrapAngle(directionBase + Math.sin(time * 0.024) * lerp(0.05, 0.26, lerp(a.storm, b.storm, mix))),
    speed: windSpeed,
    gust: gustNoise
  };
  const timeOfDay = (0.31 + time / 720) % 1;
  return {
    waveScale: lerp(a.wave, b.wave, mix),
    rain: lerp(a.rain, b.rain, mix),
    storm: lerp(a.storm, b.storm, mix),
    cloud: lerp(a.cloud, b.cloud, mix),
    visibility: lerp(a.visibility, b.visibility, mix),
    label: mix < 0.55 ? a.label : b.label,
    timeOfDay,
    wind
  };
}

export class PelagosGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly store = createVersionedStore({
    namespace: 'pocket-works:pelagos',
    version: 1,
    defaults: {
      quality: 'auto',
      sensitivity: 1,
      sound: true,
      hints: true,
      onboardingDone: false,
      totalDistanceMeters: 0
    } satisfies SettingsState,
    validate: (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const state = value as Partial<SettingsState>;
      return ['auto', 'high', 'medium', 'low'].includes(String(state.quality))
        && typeof state.sensitivity === 'number' && state.sensitivity >= 0.5 && state.sensitivity <= 1.8
        && typeof state.sound === 'boolean'
        && typeof state.hints === 'boolean'
        && typeof state.onboardingDone === 'boolean'
        && typeof state.totalDistanceMeters === 'number' && state.totalDistanceMeters >= 0;
    }
  });
  private settings: SettingsState;
  private readonly ship = new ShipDynamics();
  private readonly audio = new SeaAudio();
  private world: OceanWorld | null = null;
  private controls: ShipControls = { steer: 0, sail: 0.42, rowing: 0 };
  private accumulator = 0;
  private worldTime = 0;
  private lastFrameTime = 0;
  private running = false;
  private paused = false;
  private hiddenPause = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookDragging = false;
  private environment: EnvironmentFrame = interpolateEnvironment(PRESETS[1], PRESETS[1], 0, 0);
  private committedDistance = 0;
  private lastProgressSave = 0;
  private lastWeatherLabel = '';
  private impactCooldown = 0;
  private onboardingStep = 0;
  private readonly learned = { helm: false, trim: false, row: false, look: false };
  private toastTimer = 0;
  private onboardingTimer = 0;
  private readonly cleanup: Array<() => void> = [];

  private readonly loading = required<HTMLElement>('#loading');
  private readonly loadingBar = required<HTMLElement>('#loadingBar');
  private readonly loadingText = required<HTMLElement>('#loadingText');
  private readonly menu = required<HTMLElement>('#menu');
  private readonly settingsPanel = required<HTMLElement>('#settings');
  private readonly pausePanel = required<HTMLElement>('#pause');
  private readonly resumeGate = required<HTMLElement>('#resumeGate');
  private readonly errorScreen = required<HTMLElement>('#errorScreen');
  private readonly hud = required<HTMLElement>('#hud');
  private readonly telemetryPanel = required<HTMLElement>('#telemetry');
  private readonly controlsPanel = required<HTMLElement>('#controls');
  private readonly lookZone = required<HTMLElement>('#lookZone');
  private readonly hint = required<HTMLElement>('#hint');
  private readonly toast = required<HTMLElement>('#toast');
  private readonly helmZone = required<HTMLElement>('#helmZone');
  private readonly trimZone = required<HTMLElement>('#trimZone');
  private readonly rowButton = required<HTMLButtonElement>('#rowButton');
  private readonly helmKnob = required<HTMLElement>('#helmKnob');
  private readonly trimKnob = required<HTMLElement>('#trimKnob');
  private readonly trimIdeal = required<HTMLElement>('#trimIdeal');
  private readonly windArrow = required<HTMLElement>('#windArrow');
  private readonly windValue = required<HTMLElement>('#windValue');
  private readonly speedValue = required<HTMLElement>('#speedValue');
  private readonly courseNeedle = required<HTMLElement>('#courseNeedle');
  private readonly courseValue = required<HTMLElement>('#courseValue');
  private readonly weatherValue = required<HTMLElement>('#weatherValue');
  private readonly totalDistance = required<HTMLElement>('#totalDistance');
  private readonly sensitivity = required<HTMLInputElement>('#sensitivity');
  private readonly sensitivityValue = required<HTMLOutputElement>('#sensitivityValue');
  private readonly qualityButton = required<HTMLButtonElement>('#qualityButton');
  private readonly soundButton = required<HTMLButtonElement>('#soundButton');
  private readonly hintsButton = required<HTMLButtonElement>('#hintsButton');

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = this.store.getAll() as SettingsState;
    this.audio.setEnabled(this.settings.sound);
    this.syncSettingsUI();
    this.installUI();
    this.installLifecycle();
  }

  async boot(): Promise<void> {
    this.loadingBar.style.width = '14%';
    this.loadingText.textContent = 'WebGL и мобильный рендер';
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.world = new OceanWorld(this.canvas, this.settings.quality);
    this.loadingBar.style.width = '48%';
    this.loadingText.textContent = 'Волновой шейдер и плавучесть';
    await this.world.scene.whenReadyAsync();
    this.loadingBar.style.width = '76%';
    this.loadingText.textContent = 'Корабль, паруса и океан';
    this.environment = this.environmentAt(this.worldTime);
    this.world.update(this.ship.state, this.ship.telemetry, this.environment, this.worldTime, FIXED_STEP, 0, 0, 0, 0, 0);
    this.world.render();
    this.loadingBar.style.width = '100%';
    this.loadingText.textContent = 'Готово';
    await new Promise<void>((resolve) => window.setTimeout(resolve, 130));
    this.loading.classList.add('hidden');
    this.menu.classList.remove('hidden');
    this.refreshDistanceUI();
    this.lastFrameTime = performance.now();
    this.world.engine.runRenderLoop(() => this.frame(performance.now()));
  }

  private installUI(): void {
    required<HTMLButtonElement>('#startButton').addEventListener('click', () => void this.startVoyage());
    required<HTMLButtonElement>('#settingsButton').addEventListener('click', () => this.openSettings());
    required<HTMLButtonElement>('#closeSettings').addEventListener('click', () => this.closeSettings());
    required<HTMLButtonElement>('#pauseButton').addEventListener('click', () => this.pause());
    required<HTMLButtonElement>('#resumeButton').addEventListener('click', () => void this.resume());
    required<HTMLButtonElement>('#menuButton').addEventListener('click', () => this.returnToMenu());
    required<HTMLButtonElement>('#retryButton').addEventListener('click', () => location.reload());

    this.sensitivity.addEventListener('input', () => {
      this.settings.sensitivity = clamp(Number(this.sensitivity.value) / 100, 0.65, 1.4);
      this.sensitivityValue.value = `${Math.round(this.settings.sensitivity * 100)}%`;
      this.store.set('sensitivity', this.settings.sensitivity);
    });

    this.qualityButton.addEventListener('click', () => {
      const order: QualityMode[] = ['auto', 'high', 'medium', 'low'];
      this.settings.quality = order[(order.indexOf(this.settings.quality) + 1) % order.length];
      this.store.set('quality', this.settings.quality);
      this.world?.setQuality(this.settings.quality);
      this.syncSettingsUI();
    });

    this.soundButton.addEventListener('click', () => {
      this.settings.sound = !this.settings.sound;
      this.store.set('sound', this.settings.sound);
      this.audio.setEnabled(this.settings.sound);
      if (this.settings.sound) void this.audio.unlock();
      this.syncSettingsUI();
    });

    this.hintsButton.addEventListener('click', () => {
      this.settings.hints = !this.settings.hints;
      this.store.set('hints', this.settings.hints);
      this.syncSettingsUI();
      if (!this.settings.hints) this.hint.classList.add('hidden');
    });

    this.cleanup.push(bindPointerGesture(this.helmZone, {
      onStart: (event: PointerEvent) => this.updateHelmFromPointer(event),
      onMove: (event: PointerEvent) => this.updateHelmFromPointer(event),
      onEnd: () => this.releaseHelm(),
      onCancel: () => this.releaseHelm()
    }));

    this.cleanup.push(bindPointerGesture(this.trimZone, {
      onStart: (event: PointerEvent) => this.updateTrimFromPointer(event),
      onMove: (event: PointerEvent) => this.updateTrimFromPointer(event),
      onEnd: () => {},
      onCancel: () => {}
    }));

    this.cleanup.push(bindPointerGesture(this.rowButton, {
      onStart: () => {
        if (!this.running || this.paused) return;
        this.controls.rowing = 1;
        this.learned.row = true;
        this.rowButton.classList.add('active');
        this.updateOnboarding();
      },
      onEnd: () => this.releaseRowing(),
      onCancel: () => this.releaseRowing()
    }));

    let lookStartX = 0;
    let lookStartY = 0;
    let lookBaseYaw = 0;
    let lookBasePitch = 0;
    this.cleanup.push(bindPointerGesture(this.lookZone, {
      onStart: (event: PointerEvent) => {
        if (!this.running || this.paused) return;
        this.lookDragging = true;
        lookStartX = event.clientX;
        lookStartY = event.clientY;
        lookBaseYaw = this.lookYaw;
        lookBasePitch = this.lookPitch;
      },
      onMove: (event: PointerEvent) => {
        if (!this.running || this.paused || !this.lookDragging) return;
        const dx = (event.clientX - lookStartX) / Math.max(240, window.innerWidth);
        const dy = (event.clientY - lookStartY) / Math.max(420, window.innerHeight);
        this.lookYaw = clamp(lookBaseYaw - dx * 2.45, -1.18, 1.18);
        this.lookPitch = clamp(lookBasePitch + dy * 1.35, -0.38, 0.48);
        if (Math.abs(dx) + Math.abs(dy) > 0.07) {
          this.learned.look = true;
          this.updateOnboarding();
        }
      },
      onEnd: () => { this.lookDragging = false; },
      onCancel: () => { this.lookDragging = false; }
    }));
  }

  private installLifecycle(): void {
    const onResize = () => this.world?.resize();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('appviewportchange', onResize as EventListener, { passive: true });
    const reset = () => this.resetTransientInput();
    window.addEventListener('blur', reset, { passive: true });
    const visibility = () => {
      this.resetTransientInput();
      if (document.hidden) {
        if (this.running && !this.paused) {
          this.hiddenPause = true;
          this.paused = true;
          void this.audio.suspend();
        }
        this.commitProgress();
        return;
      }
      this.lastFrameTime = performance.now();
      this.accumulator = 0;
      if (this.hiddenPause && this.running) this.resumeGate.classList.remove('hidden');
    };
    document.addEventListener('visibilitychange', visibility);
    const pageHide = () => {
      this.resetTransientInput();
      this.commitProgress();
      void this.audio.suspend();
    };
    window.addEventListener('pagehide', pageHide);
    const resumeAfterHidden = () => void this.resumeAfterHidden();
    this.resumeGate.addEventListener('pointerdown', resumeAfterHidden);
    this.cleanup.push(() => window.removeEventListener('resize', onResize));
    this.cleanup.push(() => window.removeEventListener('appviewportchange', onResize as EventListener));
    this.cleanup.push(() => window.removeEventListener('blur', reset));
    this.cleanup.push(() => document.removeEventListener('visibilitychange', visibility));
    this.cleanup.push(() => window.removeEventListener('pagehide', pageHide));
    this.cleanup.push(() => this.resumeGate.removeEventListener('pointerdown', resumeAfterHidden));
  }

  private updateHelmFromPointer(event: PointerEvent): void {
    if (!this.running || this.paused) return;
    const rect = this.helmZone.getBoundingClientRect();
    const normalized = clamp(((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2, -1, 1);
    const curve = Math.sign(normalized) * Math.pow(Math.abs(normalized), 1.28);
    this.controls.steer = clamp(curve * this.settings.sensitivity, -1, 1);
    if (Math.abs(this.controls.steer) > 0.22) {
      this.learned.helm = true;
      this.updateOnboarding();
    }
    this.syncControlVisuals();
  }

  private releaseHelm(): void {
    this.controls.steer = 0;
    this.syncControlVisuals();
  }

  private updateTrimFromPointer(event: PointerEvent): void {
    if (!this.running || this.paused) return;
    const rect = this.trimZone.getBoundingClientRect();
    const normalized = clamp(1 - (event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    if (Math.abs(normalized - this.controls.sail) > 0.035) this.learned.trim = true;
    this.controls.sail = normalized;
    this.updateOnboarding();
    this.syncControlVisuals();
  }

  private releaseRowing(): void {
    this.controls.rowing = 0;
    this.rowButton.classList.remove('active');
  }

  private resetTransientInput(): void {
    this.controls.steer = 0;
    this.controls.rowing = 0;
    this.lookDragging = false;
    this.rowButton.classList.remove('active');
    this.syncControlVisuals();
  }

  private resetOnboardingProgress(): void {
    Object.assign(this.learned, { helm: false, trim: false, row: false, look: false });
    this.onboardingStep = 0;
    window.clearTimeout(this.onboardingTimer);
    this.onboardingTimer = 0;
    this.hint.classList.add('hidden');
  }

  private async startVoyage(): Promise<void> {
    await this.audio.unlock().catch(() => false);
    this.ship.reset();
    this.controls = { steer: 0, sail: 0.42, rowing: 0 };
    this.committedDistance = 0;
    this.lastProgressSave = this.worldTime;
    this.lastWeatherLabel = '';
    this.impactCooldown = 0;
    if (!this.settings.onboardingDone) this.resetOnboardingProgress();
    this.running = true;
    this.paused = false;
    this.hiddenPause = false;
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
    this.menu.classList.add('hidden');
    this.settingsPanel.classList.add('hidden');
    this.pausePanel.classList.add('hidden');
    this.resumeGate.classList.add('hidden');
    this.showGameUI(true);
    if (this.settings.hints && !this.settings.onboardingDone) this.updateOnboarding(true);
    this.showToast('Ветер уже в парусе');
  }

  private pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.resetTransientInput();
    this.commitProgress();
    void this.audio.suspend();
    this.pausePanel.classList.remove('hidden');
  }

  private async resume(): Promise<void> {
    if (!this.running) return;
    await this.audio.unlock().catch(() => false);
    this.paused = false;
    this.hiddenPause = false;
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
    this.pausePanel.classList.add('hidden');
    this.resumeGate.classList.add('hidden');
  }

  private async resumeAfterHidden(): Promise<void> {
    if (!this.hiddenPause) return;
    await this.resume();
  }

  private returnToMenu(): void {
    this.commitProgress();
    this.running = false;
    this.paused = false;
    this.hiddenPause = false;
    this.resetTransientInput();
    window.clearTimeout(this.onboardingTimer);
    this.onboardingTimer = 0;
    void this.audio.suspend();
    this.showGameUI(false);
    this.pausePanel.classList.add('hidden');
    this.resumeGate.classList.add('hidden');
    this.menu.classList.remove('hidden');
    this.refreshDistanceUI();
  }

  private openSettings(): void {
    this.menu.classList.add('hidden');
    this.settingsPanel.classList.remove('hidden');
  }

  private closeSettings(): void {
    this.settingsPanel.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  private showGameUI(value: boolean): void {
    this.hud.classList.toggle('hidden', !value);
    this.telemetryPanel.classList.toggle('hidden', !value);
    this.controlsPanel.classList.toggle('hidden', !value);
    this.lookZone.classList.toggle('hidden', !value);
    if (!value) this.hint.classList.add('hidden');
  }

  private frame(now: number): void {
    const world = this.world;
    if (!world) return;
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : FIXED_STEP, 0, 0.05);

    if (!this.paused && !document.hidden) {
      if (this.running) {
        this.accumulator = Math.min(0.12, this.accumulator + dt);
        while (this.accumulator >= FIXED_STEP) {
          this.environment = this.environmentAt(this.worldTime);
          this.ship.update(FIXED_STEP, this.worldTime, this.controls, this.environment.wind, this.environment.waveScale);
          this.worldTime += FIXED_STEP;
          this.accumulator -= FIXED_STEP;
        }
      } else {
        this.worldTime += dt * 0.7;
        this.environment = this.environmentAt(this.worldTime);
      }
    }

    if (!this.lookDragging) {
      this.lookYaw = smoothTo(this.lookYaw, 0, 2.1, dt);
      this.lookPitch = smoothTo(this.lookPitch, 0, 2.4, dt);
    }

    const originX = this.ship.state.worldX - this.ship.state.x;
    const originZ = this.ship.state.worldZ - this.ship.state.z;
    world.update(this.ship.state, this.ship.telemetry, this.environment, this.worldTime, Math.max(dt, 0.0001), originX, originZ, this.lookYaw, this.lookPitch, this.controls.rowing);
    world.render();

    if (this.running && !this.paused) {
      this.updateHUD();
      this.audio.update({
        speed: this.ship.telemetry.speed,
        windSpeed: this.environment.wind.speed,
        waveScale: this.environment.waveScale,
        rain: this.environment.rain,
        rowing: this.controls.rowing,
        sailLoad: this.ship.telemetry.sailEfficiency * clamp(this.ship.telemetry.apparentWindSpeed / 12, 0, 1)
      }, dt);
      this.impactCooldown -= dt;
      if (this.impactCooldown <= 0 && Math.abs(this.ship.state.verticalVelocity) > 1.65 && this.environment.waveScale > 1.1) {
        const strength = clamp((Math.abs(this.ship.state.verticalVelocity) - 1.2) / 2.2, 0, 1);
        this.audio.impact(strength);
        if (strength > 0.7 && typeof navigator.vibrate === 'function') navigator.vibrate(6);
        this.impactCooldown = 0.55;
      }
      if (this.worldTime - this.lastProgressSave > 24) {
        this.lastProgressSave = this.worldTime;
        this.commitProgress();
      }
    }
  }

  private environmentAt(time: number): EnvironmentFrame {
    const segment = Math.floor(time / WEATHER_SECONDS);
    const local = (time % WEATHER_SECONDS) / WEATHER_SECONDS;
    const transition = smoothStep(0.58, 0.98, local);
    const a = weatherPresetFor(segment);
    const b = weatherPresetFor(segment + 1);
    const frame = interpolateEnvironment(a, b, transition, time);
    if (this.running && frame.label !== this.lastWeatherLabel) {
      if (this.lastWeatherLabel) this.showToast(frame.label === 'ШТОРМ' ? 'Шторм поднимается' : `Погода: ${frame.label.toLowerCase()}`);
      this.lastWeatherLabel = frame.label;
    }
    return frame;
  }

  private updateHUD(): void {
    const telemetry = this.ship.telemetry;
    const state = this.ship.state;
    this.speedValue.textContent = (telemetry.speed * 1.94384).toFixed(1);
    const course = ((state.yaw / DEG) % 360 + 360) % 360;
    this.courseValue.textContent = `${String(Math.round(course)).padStart(3, '0')}°`;
    this.courseNeedle.style.transform = `rotate(${clamp(state.yawVelocity * 90, -24, 24).toFixed(1)}deg)`;
    this.weatherValue.textContent = this.environment.label;
    this.windValue.textContent = this.environment.wind.speed.toFixed(1);
    this.windArrow.style.transform = `rotate(${(telemetry.windAngle / DEG).toFixed(1)}deg)`;
    const ideal = idealSailTrim(telemetry.windAngle);
    this.trimIdeal.style.bottom = `${(ideal * 100).toFixed(1)}%`;
    this.syncControlVisuals();
  }

  private syncControlVisuals(): void {
    const helmTravel = 46;
    this.helmKnob.style.transform = `translate(calc(-50% + ${(this.controls.steer * helmTravel).toFixed(1)}px), -50%)`;
    this.trimKnob.style.bottom = `${(this.controls.sail * 100).toFixed(1)}%`;
  }

  private updateOnboarding(force = false): void {
    if (!this.settings.hints || this.settings.onboardingDone || !this.running) {
      this.hint.classList.add('hidden');
      return;
    }
    const previous = this.onboardingStep;
    if (!this.learned.helm) this.onboardingStep = 0;
    else if (!this.learned.trim) this.onboardingStep = 1;
    else if (!this.learned.row) this.onboardingStep = 2;
    else if (!this.learned.look) this.onboardingStep = 3;
    else this.onboardingStep = 4;

    if (this.onboardingStep >= 4) {
      this.settings.onboardingDone = true;
      this.store.set('onboardingDone', true);
      this.hint.textContent = 'Готово. Дальше море объяснит само.';
      this.hint.classList.remove('hidden');
      window.clearTimeout(this.onboardingTimer);
      this.onboardingTimer = window.setTimeout(() => {
        this.hint.classList.add('hidden');
        this.onboardingTimer = 0;
      }, 2100);
      return;
    }
    if (!force && previous === this.onboardingStep) return;
    const messages = [
      'Проведи большим пальцем по рулю слева — руль перекладывается не мгновенно.',
      'Потяни ползунок паруса справа. Золотая риска показывает эффективный угол.',
      'Удерживай «ГРЕСТИ»: вёсла помогают на малой скорости и в неудобном ветре.',
      'Свайпни по самому морю, чтобы осмотреться. Камера мягко вернётся за корму.'
    ];
    this.hint.textContent = messages[this.onboardingStep];
    this.hint.classList.remove('hidden');
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('show');
      this.toastTimer = 0;
    }, 1800);
  }

  private commitProgress(): void {
    if (!this.running) return;
    const delta = Math.max(0, this.ship.state.distance - this.committedDistance);
    if (delta < 0.01) return;
    this.committedDistance = this.ship.state.distance;
    this.settings.totalDistanceMeters += delta;
    this.store.set('totalDistanceMeters', this.settings.totalDistanceMeters);
  }

  private refreshDistanceUI(): void {
    this.totalDistance.textContent = `${(this.settings.totalDistanceMeters / 1000).toFixed(1)} км`;
  }

  private syncSettingsUI(): void {
    this.sensitivity.value = String(Math.round(this.settings.sensitivity * 100));
    this.sensitivityValue.value = `${Math.round(this.settings.sensitivity * 100)}%`;
    const qualityLabels: Record<QualityMode, string> = { auto: 'АВТО', high: 'ВЫСОКО', medium: 'СРЕДНЕ', low: 'НИЗКО' };
    this.qualityButton.textContent = qualityLabels[this.settings.quality];
    this.soundButton.textContent = this.settings.sound ? 'ВКЛ' : 'ВЫКЛ';
    this.hintsButton.textContent = this.settings.hints ? 'ВКЛ' : 'ВЫКЛ';
  }

  showBootError(error: unknown): void {
    this.loading.classList.add('hidden');
    this.menu.classList.add('hidden');
    this.showGameUI(false);
    this.errorScreen.classList.remove('hidden');
    const text = required<HTMLElement>('#errorText');
    text.textContent = error instanceof Error ? `Ошибка: ${error.message.slice(0, 150)}` : 'WebGL или мобильный рендер недоступен.';
  }

  resetAll(): void {
    this.running = false;
    this.paused = false;
    this.hiddenPause = false;
    this.accumulator = 0;
    this.worldTime = 0;
    this.lastFrameTime = performance.now();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.committedDistance = 0;
    this.lastProgressSave = 0;
    this.lastWeatherLabel = '';
    this.impactCooldown = 0;
    this.resetOnboardingProgress();
    this.resetTransientInput();
    window.clearTimeout(this.toastTimer);
    this.toastTimer = 0;
    this.toast.classList.remove('show');
    this.store.reset();
    this.settings = this.store.getAll() as SettingsState;
    this.audio.setEnabled(this.settings.sound);
    this.ship.reset();
    this.controls = { steer: 0, sail: 0.42, rowing: 0 };
    this.environment = interpolateEnvironment(PRESETS[1], PRESETS[1], 0, 0);
    this.world?.setQuality(this.settings.quality);
    this.syncControlVisuals();
    this.syncSettingsUI();
    this.refreshDistanceUI();
    this.showGameUI(false);
    this.loading.classList.add('hidden');
    this.settingsPanel.classList.add('hidden');
    this.pausePanel.classList.add('hidden');
    this.resumeGate.classList.add('hidden');
    this.errorScreen.classList.add('hidden');
    this.menu.classList.remove('hidden');
    void this.audio.suspend();
  }

  async destroy(): Promise<void> {
    this.commitProgress();
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.onboardingTimer);
    this.toastTimer = 0;
    this.onboardingTimer = 0;
    for (const dispose of this.cleanup.splice(0)) dispose();
    await this.audio.destroy();
    this.world?.dispose();
    this.world = null;
  }
}
