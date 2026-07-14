import { Color3 } from '@babylonjs/core/Maths/math.color';
import { createVersionedStore } from '../../../shared/capabilities/storage.js';
import { lockOrientation, unlockOrientation, watchOrientation } from '../../../shared/capabilities/device.js';
import { clamp, lerp, speedFeel } from './core';
import {
  cornerSpeedKmh,
  createVehicleDynamics,
  racingLineTarget,
  resolveVehicleContact,
  stepVehicle,
  type VehicleDynamics
} from './handling';
import { RaceAudio } from './race-audio';
import { RaceWorld } from './world-31';
import type { CarVisual } from './world-visuals';

const NS = 'pocket-works:petlya-17';
const LAPS = 3;
const MAX_SPEED = 322;
const ROAD_HALF = 5.9;

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const formatTime = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds)) return '—';
  const value = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor(value % 60000 / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
};

type Mode = 'loading' | 'menu' | 'countdown' | 'racing' | 'paused' | 'finished' | 'settings';

type Bot = VehicleDynamics & {
  name: string;
  pace: number;
  aggression: number;
  totalDistance: number;
  lane: number;
  targetLane: number;
  decisionAt: number;
  phase: number;
  visual: CarVisual;
};

type Settings = {
  sensitivity: number;
  sound: boolean;
  haptics: boolean;
  quality: 'auto' | 'high';
};

const BOT_TEMPLATES = [
  { name: 'ЯКОРЬ', color: new Color3(0.82, 0.61, 0.15), stripe: new Color3(0.04, 0.18, 0.15), pace: 0.94, aggression: 0.35, lane: -2.8 },
  { name: 'НОЖ', color: new Color3(0.78, 0.19, 0.08), stripe: new Color3(0.88, 0.82, 0.66), pace: 1, aggression: 0.9, lane: 1.2 },
  { name: 'ТЕНЬ', color: new Color3(0.08, 0.27, 0.23), stripe: new Color3(0.78, 0.75, 0.65), pace: 0.97, aggression: 0.22, lane: -0.5 },
  { name: 'ГОНЧАЯ', color: new Color3(0.82, 0.78, 0.67), stripe: new Color3(0.55, 0.12, 0.05), pace: 0.985, aggression: 0.72, lane: 2.9 },
  { name: 'ИСКРА', color: new Color3(0.18, 0.39, 0.58), stripe: new Color3(0.88, 0.68, 0.18), pace: 0.955, aggression: 0.55, lane: 0.1 }
];

export class RaceGame {
  readonly world: RaceWorld;

  private mode: Mode = 'loading';
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private countdown = 0;
  private countdownMark = 4;
  private raceTimeMs = 0;
  private lapStartMs = 0;
  private bestLapMs = Infinity;
  private passes = 0;
  private previousPosition = 6;
  private throttle = false;
  private braking = false;
  private steerTarget = 0;
  private steer = 0;
  private sensorStop: null | (() => void) = null;
  private sensorBaseline: number | null = null;
  private sensorActive = false;
  private collisionCooldown = 0;
  private lastGear = 1;
  private hapticTimer = 0;
  private messageTimer = 0;
  private resetArmed = false;
  private resetTimer = 0;
  private keys = new Set<string>();
  private bots: Bot[] = [];

  private player = {
    totalDistance: 0,
    lane: 0,
    lap: 1,
    drafting: 0,
    ...createVehicleDynamics()
  };

  private readonly store = createVersionedStore({
    namespace: NS,
    version: 3,
    defaults: {
      settings: { sensitivity: 21, sound: true, haptics: true, quality: 'auto' },
      records: { bestFinish: null, bestLapMs: null }
    }
  });

  private settings: Settings;
  private records: { bestFinish: number | null; bestLapMs: number | null };
  private audio: RaceAudio;

  private loading = $('#loading');
  private loadingBar = $('#loadingBar');
  private loadingText = $('#loadingText');
  private menu = $('#menu');
  private settingsScreen = $('#settings');
  private pauseScreen = $('#pause');
  private resultsScreen = $('#results');
  private hud = $('#hud');
  private controls = $('#controls');
  private speedPanel = $('#speedPanel');
  private steerPad = $('#steerPad');
  private message = $('#message');
  private draftBadge = $('#draft');
  private gasButton = $('#gas') as HTMLButtonElement;
  private brakeButton = $('#brake') as HTMLButtonElement;

  constructor(canvas: HTMLCanvasElement) {
    const saved = this.store.getAll();
    this.settings = {
      sensitivity: clamp(Number(saved.settings?.sensitivity) || 21, 10, 35),
      sound: saved.settings?.sound !== false,
      haptics: saved.settings?.haptics !== false,
      quality: saved.settings?.quality === 'high' ? 'high' : 'auto'
    };
    this.records = {
      bestFinish: Number.isFinite(saved.records?.bestFinish) ? Number(saved.records.bestFinish) : null,
      bestLapMs: Number.isFinite(saved.records?.bestLapMs) ? Number(saved.records.bestLapMs) : null
    };
    this.audio = new RaceAudio(() => this.settings.sound);
    this.world = new RaceWorld(canvas, this.settings.quality);
    this.bindControls();
    this.updateSettings();
    this.updateRecords();
  }

  private showScreen(target: HTMLElement | null): void {
    for (const screen of [this.loading, this.menu, this.settingsScreen, this.pauseScreen, this.resultsScreen]) screen.classList.add('hidden');
    target?.classList.remove('hidden');
  }

  private haptic(pattern: number | number[]): void {
    if (this.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
  }

  private say(text: string, duration = 900): void {
    this.message.textContent = text;
    window.clearTimeout(this.messageTimer);
    if (duration > 0) this.messageTimer = window.setTimeout(() => { this.message.textContent = ''; }, duration);
  }

  private saveSettings(): void {
    this.store.set('settings', { ...this.settings });
  }

  private saveRecords(): void {
    this.store.set('records', { ...this.records });
    this.updateRecords();
  }

  private updateRecords(): void {
    $('#bestFinish').textContent = this.records.bestFinish ? `${this.records.bestFinish}/6` : '—';
    $('#bestLap').textContent = formatTime(this.records.bestLapMs ?? Infinity);
  }

  private updateSettings(): void {
    const sensitivity = $('#sensitivity') as HTMLInputElement;
    sensitivity.value = String(this.settings.sensitivity);
    $('#sensitivityValue').textContent = `${this.settings.sensitivity}°`;
    for (const [id, enabled] of [['sound', this.settings.sound], ['haptics', this.settings.haptics]] as const) {
      const button = $(`#${id}`) as HTMLButtonElement;
      button.textContent = enabled ? 'ВКЛ' : 'ВЫКЛ';
      button.classList.toggle('off', !enabled);
    }
    const quality = $('#quality') as HTMLButtonElement;
    quality.textContent = this.settings.quality === 'auto' ? 'АВТО' : 'ВЫСОКОЕ';
  }

  private createBots(): Bot[] {
    const gaps = [42, 72, 108, 148, 194];
    return BOT_TEMPLATES.map((template, index) => ({
      name: template.name,
      pace: template.pace,
      aggression: template.aggression,
      totalDistance: gaps[index],
      lane: template.lane,
      targetLane: template.lane,
      decisionAt: 1 + index * 0.25,
      phase: Math.random() * Math.PI * 2,
      visual: this.world.createCar(template.name, template.color, template.stripe, index),
      ...createVehicleDynamics()
    }));
  }

  private disposeBots(): void {
    for (const bot of this.bots) bot.visual.root.dispose(false, true);
    this.bots = [];
  }

  private resetRace(): void {
    Object.assign(this.player, { totalDistance: 0, lane: 0, lap: 1, drafting: 0, ...createVehicleDynamics() });
    this.disposeBots();
    this.bots = this.createBots();
    for (const bot of this.bots) this.world.placeCar(bot.visual, bot.totalDistance, bot.lane, 0, 0, 0, 0);
    this.raceTimeMs = 0;
    this.lapStartMs = 0;
    this.bestLapMs = Infinity;
    this.passes = 0;
    this.previousPosition = 6;
    this.collisionCooldown = 0;
    this.lastGear = 1;
    this.steer = 0;
    this.steerTarget = 0;
    this.throttle = false;
    this.braking = false;
    this.updateHud();
  }

  private position(): number {
    let value = 1;
    for (const bot of this.bots) if (bot.totalDistance > this.player.totalDistance) value += 1;
    return value;
  }

  private nearestAhead(): Bot | null {
    let nearest: Bot | null = null;
    let nearestDistance = Infinity;
    for (const bot of this.bots) {
      const distance = bot.totalDistance - this.player.totalDistance;
      if (distance > 0 && distance < nearestDistance) {
        nearest = bot;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private draftStrength(): number {
    let strength = 0;
    for (const bot of this.bots) {
      const distance = bot.totalDistance - this.player.totalDistance;
      const lateral = Math.abs(bot.lane - this.player.lane);
      if (distance > 5 && distance < 58 && lateral < 1.3) {
        strength = Math.max(strength, (1 - distance / 58) * (1 - lateral / 1.3));
      }
    }
    return clamp(strength, 0, 1);
  }

  private updateHud(): void {
    $('#position').textContent = String(this.position());
    $('#lap').textContent = `${Math.min(this.player.lap, LAPS)}/${LAPS}`;
    const ahead = this.nearestAhead();
    $('#gap').textContent = ahead ? `+${((ahead.totalDistance - this.player.totalDistance) / Math.max(this.player.speed / 3.6, 1)).toFixed(1)}с` : 'ЛИДЕР';
    $('#speed').textContent = String(Math.round(this.player.speed)).padStart(3, '0');
    const gear = clamp(Math.floor(this.player.speed / 50) + 1, 1, 6);
    $('#gear').textContent = String(gear);
    $('#rpmBar').style.width = `${clamp((this.player.speed % 50) / 50 * 100, 4, 100)}%`;
  }

  private updateBots(delta: number): void {
    for (const bot of this.bots) {
      const curvatureNow = this.world.track.curvature(bot.totalDistance, 16);
      const cornerCurvature = this.world.track.maximumCurvature(bot.totalDistance);
      const maximum = 302 + bot.pace * 8;
      const targetSpeed = Math.min(
        maximum,
        cornerSpeedKmh(cornerCurvature, 0.9 + bot.pace * 0.08, 0.94 + bot.aggression * 0.06, maximum)
      );

      if (this.raceTimeMs / 1000 > bot.decisionAt) {
        const curvatureFar = this.world.track.curvature(bot.totalDistance + 58, 24);
        const line = racingLineTarget(curvatureNow, curvatureFar, ROAD_HALF - 1.25, bot.aggression);
        let avoidance = 0;
        let overtake = 0;
        const traffic = [
          ...this.bots.filter((other) => other !== bot).map((other) => ({ distance: other.totalDistance, lane: other.lane, speed: other.speed })),
          { distance: this.player.totalDistance, lane: this.player.lane, speed: this.player.speed }
        ];
        for (const other of traffic) {
          const longitudinal = other.distance - bot.totalDistance;
          if (longitudinal < -4 || longitudinal > 24) continue;
          const lateral = bot.lane - other.lane;
          const pressure = 1 - clamp(Math.abs(longitudinal) / 24, 0, 1);
          avoidance += Math.sign(lateral || Math.sin(bot.phase)) * pressure * 1.15;
          if (longitudinal > 2 && other.speed < bot.speed - 4) {
            const openLeft = Math.abs(other.lane + 2.4) < ROAD_HALF - 1;
            overtake += (openLeft ? -1 : 1) * (0.9 + bot.aggression * 0.8);
          }
        }
        bot.targetLane = clamp(line + avoidance + overtake, -ROAD_HALF + 1.05, ROAD_HALF - 1.05);
        bot.decisionAt = this.raceTimeMs / 1000 + 0.42 + Math.random() * 0.72;
      }

      const aiSteer = clamp((bot.targetLane - bot.lane) * 0.34 - bot.lateralSpeed * 0.11 - bot.yawOffset * 0.6, -1, 1);
      const speedError = targetSpeed - bot.speed;
      const aiThrottle = speedError > 3 ? 1 : speedError > -1 ? 0.35 : 0;
      const aiBrake = speedError < -4 ? clamp(-speedError / 48, 0, 1) : 0;
      const offroad = clamp((Math.abs(bot.lane) - ROAD_HALF + 0.75) / 1.1, 0, 1);
      const step = stepVehicle(bot, {
        steer: aiSteer,
        throttle: aiThrottle,
        brake: aiBrake,
        curvature: curvatureNow,
        offroad,
        drafting: 0,
        maxSpeed: maximum,
        gripScale: 0.96 + bot.pace * 0.04
      }, delta);
      Object.assign(bot, step);
      bot.lane += step.laneDelta;
      bot.lane = clamp(bot.lane, -ROAD_HALF - 0.45, ROAD_HALF + 0.45);
      bot.totalDistance += step.longitudinalMeters;
      this.world.placeCar(bot.visual, bot.totalDistance, bot.lane, bot.yawOffset, bot.bodyRoll, bot.bodyPitch, bot.speed);
    }
  }

  private collide(): void {
    if (this.collisionCooldown > 0) return;
    for (const bot of this.bots) {
      const longitudinal = bot.totalDistance - this.player.totalDistance;
      const lateralOffset = bot.lane - this.player.lane;
      const lateral = Math.abs(lateralOffset);
      if (longitudinal > -2.9 && longitudinal < 5.2 && lateral < 1.45) {
        const response = resolveVehicleContact(this.player.speed, bot.speed, lateralOffset, 1 - lateral / 1.45);
        this.collisionCooldown = lerp(0.28, 0.62, response.severity);
        this.player.speed = clamp(this.player.speed + response.playerSpeedDelta, 0, MAX_SPEED + 18);
        bot.speed = clamp(bot.speed + response.opponentSpeedDelta, 0, MAX_SPEED + 10);
        this.player.lateralSpeed += response.playerLateralImpulse;
        bot.lateralSpeed += response.opponentLateralImpulse;
        this.player.yawOffset = clamp(this.player.yawOffset + response.yawImpulse, -0.62, 0.62);
        bot.yawOffset = clamp(bot.yawOffset - response.yawImpulse * 0.72, -0.48, 0.48);
        this.player.lane += response.playerLateralImpulse * 0.045;
        bot.lane += response.opponentLateralImpulse * 0.035;
        this.world.impact(response.severity);
        this.audio.impact(response.severity);
        this.haptic(response.severity > 0.65 ? [30, 18, 44] : [16, 12, 22]);
        this.say(response.severity > 0.7 ? 'ЖЁСТКИЙ КОНТАКТ' : 'КОНТАКТ', 540);
        break;
      }
    }
  }

  private finish(): void {
    if (this.mode === 'finished') return;
    this.mode = 'finished';
    this.controls.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.speedPanel.classList.add('hidden');
    this.draftBadge.classList.add('hidden');
    this.audio.update(0, MAX_SPEED, false, 0, 0, 0, 0);
    this.audio.beep(840, 0.32, 0.16);
    this.haptic([35, 35, 70]);

    const resultPosition = this.position();
    if (!this.records.bestFinish || resultPosition < this.records.bestFinish) this.records.bestFinish = resultPosition;
    if (Number.isFinite(this.bestLapMs) && (!this.records.bestLapMs || this.bestLapMs < this.records.bestLapMs)) this.records.bestLapMs = Math.round(this.bestLapMs);
    this.saveRecords();

    const names = ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Пятое', 'Шестое'];
    const texts = [
      'Чисто. Быстро. Теперь машину пришлось действительно удерживать.',
      'До победы не хватило одного позднего торможения.',
      'Подиум есть. Передние шины тоже почти пережили этот план.',
      'Средний результат. В следующий раз попробуй тормозить до стены.',
      'Пелотон уехал, но хотя бы не по рельсам.',
      'Последний. Зато все четыре условных колеса смотрят примерно вперёд.'
    ];
    $('#resultTitle').textContent = `${names[resultPosition - 1]} место`;
    $('#resultText').textContent = texts[resultPosition - 1];
    $('#resultPosition').textContent = `${resultPosition}/6`;
    $('#resultTime').textContent = formatTime(this.raceTimeMs);
    $('#resultLap').textContent = formatTime(this.bestLapMs);
    $('#resultPasses').textContent = String(this.passes);
    this.showScreen(this.resultsScreen);
  }

  private updateRace(delta: number): void {
    if (this.mode === 'countdown') {
      this.countdown -= delta;
      const mark = Math.ceil(this.countdown);
      if (mark !== this.countdownMark && mark > 0 && mark <= 3) {
        this.countdownMark = mark;
        this.say(String(mark), 720);
        this.audio.beep(360 + (3 - mark) * 70, 0.11, 0.14);
        this.haptic(18);
      }
      if (this.countdown <= 0) {
        this.mode = 'racing';
        this.say('СТАРТ', 760);
        this.audio.beep(780, 0.18, 0.18);
        this.haptic([25, 28, 34]);
      }
      return;
    }
    if (this.mode !== 'racing') return;

    this.raceTimeMs += delta * 1000;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - delta);
    this.steer += (this.steerTarget - this.steer) * Math.min(1, delta * 8.5);
    this.player.drafting = this.draftStrength();
    const curvature = this.world.track.curvature(this.player.totalDistance, 18);
    const offroad = clamp((Math.abs(this.player.lane) - ROAD_HALF + 0.72) / 1.15, 0, 1);
    const step = stepVehicle(this.player, {
      steer: this.steer,
      throttle: this.throttle ? 1 : 0,
      brake: this.braking ? 1 : 0,
      curvature,
      offroad,
      drafting: this.player.drafting,
      maxSpeed: MAX_SPEED
    }, delta);
    Object.assign(this.player, step);
    this.player.lane += step.laneDelta;

    if (Math.abs(this.player.lane) > ROAD_HALF + 1.2) {
      this.player.lane = Math.sign(this.player.lane) * (ROAD_HALF + 1.2);
      this.player.lateralSpeed *= -0.28;
      this.player.yawOffset *= -0.34;
      this.player.speed *= 0.82;
      this.world.impact(0.72);
      this.audio.impact(0.65);
      this.haptic([22, 16, 24]);
    }

    const before = this.player.totalDistance;
    this.player.totalDistance += step.longitudinalMeters;
    this.updateBots(delta);
    this.collide();

    const oldLap = Math.floor(before / this.world.track.length);
    const newLap = Math.floor(this.player.totalDistance / this.world.track.length);
    if (newLap > oldLap && newLap < LAPS) {
      const lapTime = this.raceTimeMs - this.lapStartMs;
      this.lapStartMs = this.raceTimeMs;
      this.bestLapMs = Math.min(this.bestLapMs, lapTime);
      this.player.lap = newLap + 1;
      this.say(this.player.lap === LAPS ? 'ПОСЛЕДНИЙ КРУГ' : `КРУГ ${this.player.lap}`, 1150);
      this.audio.beep(660, 0.16, 0.13);
      this.haptic([20, 20, 20]);
    }

    const currentPosition = this.position();
    if (currentPosition < this.previousPosition) this.passes += this.previousPosition - currentPosition;
    this.previousPosition = currentPosition;

    const gear = clamp(Math.floor(this.player.speed / 50) + 1, 1, 6);
    if (gear !== this.lastGear && this.player.speed > 20) {
      this.lastGear = gear;
      this.audio.beep(98 + gear * 15, 0.035, 0.035);
      this.haptic(8);
      this.world.impact(0.12);
    }

    this.draftBadge.classList.toggle('hidden', this.player.drafting < 0.12);
    if (this.player.drafting >= 0.12) this.draftBadge.querySelector('b')!.textContent = `+${Math.round(this.player.drafting * 18)}`;

    this.hapticTimer -= delta;
    if (this.settings.haptics && step.atLimit && this.hapticTimer <= 0) {
      this.haptic(this.player.grip < 0.38 ? [5, 7, 5] : 4);
      this.hapticTimer = lerp(0.14, 0.055, 1 - this.player.grip);
    } else if (this.settings.haptics && this.player.speed > 235 && this.hapticTimer <= 0) {
      this.haptic(4);
      this.hapticTimer = lerp(0.32, 0.12, speedFeel(this.player.speed, MAX_SPEED));
    }

    document.documentElement.dataset.handlingState = this.player.grip < 0.4 ? 'sliding' : step.atLimit ? 'limit' : 'grip';
    document.documentElement.dataset.grip = this.player.grip.toFixed(2);
    document.documentElement.dataset.slip = this.player.slipAngle.toFixed(3);
    if (this.player.totalDistance >= LAPS * this.world.track.length) this.finish();
    this.updateHud();
  }

  private updatePresentation(delta: number): void {
    this.world.updateCockpit({
      speed: this.player.speed,
      maxSpeed: MAX_SPEED,
      steer: this.steer,
      yawOffset: this.player.yawOffset,
      lateralSpeed: this.player.lateralSpeed,
      bodyRoll: this.player.bodyRoll,
      bodyPitch: this.player.bodyPitch,
      slipAngle: this.player.slipAngle,
      drafting: this.player.drafting,
      acceleration: this.player.acceleration,
      distance: this.player.totalDistance,
      lane: this.player.lane
    }, delta);
    const offroad = clamp((Math.abs(this.player.lane) - ROAD_HALF + 0.72) / 1.15, 0, 1);
    this.audio.update(
      this.player.speed,
      MAX_SPEED,
      this.mode === 'racing' || this.mode === 'countdown',
      offroad,
      this.player.drafting,
      this.player.slipAngle,
      this.player.acceleration
    );
  }

  private async enableTilt(): Promise<boolean> {
    this.sensorBaseline = null;
    this.sensorStop?.();
    this.sensorStop = await watchOrientation((event: DeviceOrientationEvent) => {
      const angle = Number(screen.orientation?.angle ?? (window as typeof window & { orientation?: number }).orientation ?? 0);
      let value = Number(event.gamma) || 0;
      if (angle === 90) value = Number(event.beta) || 0;
      if (angle === 270 || angle === -90) value = -(Number(event.beta) || 0);
      if (this.sensorBaseline === null) this.sensorBaseline = value;
      const normalized = clamp((value - this.sensorBaseline) / this.settings.sensitivity, -1, 1);
      this.steerTarget = Math.abs(normalized) < 0.035 ? 0 : normalized;
    });
    this.sensorActive = Boolean(this.sensorStop);
    return this.sensorActive;
  }

  private stopTilt(): void {
    this.sensorStop?.();
    this.sensorStop = null;
    this.sensorBaseline = null;
    this.sensorActive = false;
  }

  private async startRace(useTilt: boolean): Promise<void> {
    await this.audio.unlock();
    let tilt = false;
    if (useTilt) tilt = await this.enableTilt();
    if (!tilt) {
      this.stopTilt();
      this.steerPad.classList.remove('hidden');
    } else {
      this.steerPad.classList.add('hidden');
    }
    try { await lockOrientation('landscape'); } catch {}
    this.resetRace();
    this.showScreen(null);
    this.controls.classList.remove('hidden');
    this.hud.classList.remove('hidden');
    this.speedPanel.classList.remove('hidden');
    this.mode = 'countdown';
    this.countdown = 3.7;
    this.countdownMark = 4;
    this.say(tilt ? 'ДЕРЖИ РОВНО' : 'РУЛЬ ВНИЗУ', 950);
  }

  private goMenu = (): void => {
    this.mode = 'menu';
    this.stopTilt();
    unlockOrientation();
    this.controls.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.speedPanel.classList.add('hidden');
    this.draftBadge.classList.add('hidden');
    this.message.textContent = '';
    this.throttle = false;
    this.braking = false;
    this.audio.mute();
    this.updateRecords();
    this.showScreen(this.menu);
  };

  private pauseRace = (): void => {
    if (!['racing', 'countdown'].includes(this.mode)) return;
    this.mode = 'paused';
    this.throttle = false;
    this.braking = false;
    this.controls.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.speedPanel.classList.add('hidden');
    this.audio.mute();
    this.showScreen(this.pauseScreen);
  };

  private resumeRace = (): void => {
    if (this.mode !== 'paused') return;
    this.mode = 'racing';
    this.showScreen(null);
    this.controls.classList.remove('hidden');
    this.hud.classList.remove('hidden');
    this.speedPanel.classList.remove('hidden');
  };

  private openSettings(from: 'menu' | 'pause'): void {
    this.settingsReturn = from;
    this.mode = 'settings';
    this.updateSettings();
    this.showScreen(this.settingsScreen);
  }

  private closeSettings = (): void => {
    if (this.settingsReturn === 'pause') {
      this.mode = 'paused';
      this.showScreen(this.pauseScreen);
    } else {
      this.mode = 'menu';
      this.showScreen(this.menu);
    }
  };

  private hold(button: HTMLButtonElement, setter: (value: boolean) => void): void {
    const end = (event?: PointerEvent) => {
      setter(false);
      button.classList.remove('active');
      if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      setter(true);
      button.classList.add('active');
    });
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }

  private bindControls(): void {
    this.hold(this.gasButton, (value) => { this.throttle = value; });
    this.hold(this.brakeButton, (value) => { this.braking = value; });

    let steerPointer: number | null = null;
    const steerFrom = (event: PointerEvent) => {
      const rect = this.steerPad.getBoundingClientRect();
      this.steerTarget = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      (this.steerPad.querySelector('i') as HTMLElement).style.left = `${(this.steerTarget + 1) * 50}%`;
    };
    this.steerPad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      steerPointer = event.pointerId;
      this.steerPad.setPointerCapture?.(event.pointerId);
      steerFrom(event);
    });
    this.steerPad.addEventListener('pointermove', (event) => { if (event.pointerId === steerPointer) steerFrom(event); });
    const releaseSteer = (event: PointerEvent) => {
      if (event.pointerId !== steerPointer) return;
      steerPointer = null;
      this.steerTarget = 0;
      (this.steerPad.querySelector('i') as HTMLElement).style.left = '50%';
    };
    this.steerPad.addEventListener('pointerup', releaseSteer);
    this.steerPad.addEventListener('pointercancel', releaseSteer);
    this.steerPad.addEventListener('lostpointercapture', releaseSteer);

    window.addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Escape'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'Escape') {
        if (['racing', 'countdown'].includes(this.mode)) this.pauseRace();
        else if (this.mode === 'paused') this.resumeRace();
      }
      if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) this.throttle = true;
      if (['ArrowDown', 'KeyS'].includes(event.code)) this.braking = true;
      if (!this.sensorActive) {
        if (['ArrowLeft', 'KeyA'].includes(event.code)) this.steerTarget = -1;
        if (['ArrowRight', 'KeyD'].includes(event.code)) this.steerTarget = 1;
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) this.throttle = false;
      if (['ArrowDown', 'KeyS'].includes(event.code)) this.braking = false;
      if (!this.sensorActive && !['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].some((key) => this.keys.has(key))) this.steerTarget = 0;
    });

    $('#start').addEventListener('click', () => void this.startRace(true));
    $('#practice').addEventListener('click', () => void this.startRace(false));
    $('#settingsButton').addEventListener('click', () => this.openSettings('menu'));
    $('#pauseButton').addEventListener('click', this.pauseRace);
    $('#resume').addEventListener('click', this.resumeRace);
    $('#restart').addEventListener('click', () => void this.startRace(this.sensorActive));
    $('#quit').addEventListener('click', this.goMenu);
    $('#again').addEventListener('click', () => void this.startRace(this.sensorActive));
    $('#resultsMenu').addEventListener('click', this.goMenu);
    $('#closeSettings').addEventListener('click', this.closeSettings);

    ($('#sensitivity') as HTMLInputElement).addEventListener('input', (event) => {
      this.settings.sensitivity = Number((event.target as HTMLInputElement).value);
      $('#sensitivityValue').textContent = `${this.settings.sensitivity}°`;
      this.sensorBaseline = null;
      this.saveSettings();
    });
    $('#sound').addEventListener('click', () => {
      this.settings.sound = !this.settings.sound;
      this.saveSettings();
      this.updateSettings();
      if (this.settings.sound) void this.audio.unlock();
      else this.audio.mute();
    });
    $('#haptics').addEventListener('click', () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings();
      this.updateSettings();
      if (this.settings.haptics) this.haptic(18);
    });
    $('#quality').addEventListener('click', () => {
      this.settings.quality = this.settings.quality === 'auto' ? 'high' : 'auto';
      this.world.setQuality(this.settings.quality);
      this.saveSettings();
      this.updateSettings();
    });
    $('#reset').addEventListener('click', (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      if (!this.resetArmed) {
        this.resetArmed = true;
        button.textContent = 'НАЖМИ ЕЩЁ РАЗ ДЛЯ СБРОСА';
        window.clearTimeout(this.resetTimer);
        this.resetTimer = window.setTimeout(() => {
          this.resetArmed = false;
          button.textContent = 'СБРОСИТЬ РЕКОРДЫ';
        }, 3500);
        return;
      }
      this.resetArmed = false;
      this.records = { bestFinish: null, bestLapMs: null };
      this.saveRecords();
      button.textContent = 'РЕКОРДЫ СБРОШЕНЫ';
      window.setTimeout(() => { button.textContent = 'СБРОСИТЬ РЕКОРДЫ'; }, 1200);
    });

    window.addEventListener('resize', () => this.world.engine.resize());
    window.addEventListener('orientationchange', () => {
      this.sensorBaseline = null;
      window.setTimeout(() => this.world.engine.resize(), 120);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ['racing', 'countdown'].includes(this.mode)) this.pauseRace();
    });
    window.addEventListener('pagehide', () => {
      this.saveSettings();
      this.saveRecords();
      this.audio.mute();
    });
  }

  resetAll(): void {
    this.store.reset();
    this.records = { bestFinish: null, bestLapMs: null };
    Object.assign(this.settings, { sensitivity: 21, sound: true, haptics: true, quality: 'auto' });
    this.world.setQuality('auto');
    this.updateRecords();
    this.updateSettings();
    this.goMenu();
  }

  async boot(): Promise<void> {
    this.loadingBar.style.width = '18%';
    this.loadingText.textContent = 'Банки и геометрия кольца';
    this.world.build();
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    this.loadingBar.style.width = '64%';
    this.loadingText.textContent = 'Кокпит, зеркала и пелотон';
    this.bots = this.createBots();
    for (const bot of this.bots) this.world.placeCar(bot.visual, bot.totalDistance, bot.lane, 0, 0, 0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    this.loadingBar.style.width = '88%';
    this.loadingText.textContent = 'Сцепление и телеметрия';
    this.world.scene.executeWhenReady(() => {
      this.loadingBar.style.width = '100%';
      this.loadingText.textContent = 'Готово';
      window.setTimeout(() => {
        this.mode = 'menu';
        this.showScreen(this.menu);
      }, 260);
    });

    this.world.engine.runRenderLoop(() => {
      const delta = clamp(this.world.engine.getDeltaTime() / 1000, 0, 0.05);
      this.updateRace(delta);
      this.updatePresentation(delta);
      this.world.adaptQuality(delta, this.settings.quality);
      this.world.scene.render();
    });
  }
}
