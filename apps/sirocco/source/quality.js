import { rollingAverage } from './core.js';

export const QUALITY_PRESETS = {
  high: {
    id: 'high', label: 'High', hardwareScaling: 1.0, radius: 3, segments: 30,
    farSegments: 38, farSize: 820, shadowSize: 1536, particles: 26, footprintLimit: 112
  },
  medium: {
    id: 'medium', label: 'Medium', hardwareScaling: 1.28, radius: 2, segments: 24,
    farSegments: 30, farSize: 720, shadowSize: 1024, particles: 16, footprintLimit: 84
  },
  low: {
    id: 'low', label: 'Low', hardwareScaling: 1.58, radius: 2, segments: 18,
    farSegments: 22, farSize: 600, shadowSize: 512, particles: 8, footprintLimit: 56
  }
};

const ORDER = ['low', 'medium', 'high'];

function detectInitial() {
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const dpr = window.devicePixelRatio || 1;
  if (touch && dpr >= 2.5) return 'medium';
  if (touch) return 'high';
  return 'high';
}

export class AdaptiveQuality {
  constructor(onChange) {
    this.onChange = onChange;
    this.mode = localStorage.getItem('pocket-works:sirocco:quality') || 'auto';
    this.level = this.mode === 'auto' ? detectInitial() : (QUALITY_PRESETS[this.mode] ? this.mode : detectInitial());
    this.samples = [];
    this.elapsed = 0;
    this.cooldown = 0;
    this.lowSeconds = 0;
    this.highSeconds = 0;
  }

  get preset() { return QUALITY_PRESETS[this.level]; }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem('pocket-works:sirocco:quality', mode);
    if (mode !== 'auto' && QUALITY_PRESETS[mode]) this.apply(mode, true);
  }

  apply(level, force = false) {
    if (!QUALITY_PRESETS[level] || (!force && this.level === level)) return;
    this.level = level;
    this.cooldown = 8;
    this.lowSeconds = 0;
    this.highSeconds = 0;
    this.onChange?.(this.preset);
  }

  update(dt, fps) {
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.samples.push(fps);
    if (this.samples.length > 90) this.samples.shift();
    if (this.mode !== 'auto' || this.elapsed < 6 || this.cooldown > 0) return;
    const average = rollingAverage(this.samples);
    this.lowSeconds = average < 48 ? this.lowSeconds + dt : Math.max(0, this.lowSeconds - dt * 1.5);
    this.highSeconds = average > 58 ? this.highSeconds + dt : Math.max(0, this.highSeconds - dt * 1.5);
    const index = ORDER.indexOf(this.level);
    if (this.lowSeconds > 3.5 && index > 0) this.apply(ORDER[index - 1]);
    else if (this.highSeconds > 15 && index < ORDER.length - 1) this.apply(ORDER[index + 1]);
  }
}
