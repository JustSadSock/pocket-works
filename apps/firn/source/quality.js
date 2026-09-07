const PRESETS = {
  high: { key: 'high', label: 'High', hardwareScaling: 1.0, segments: 30, radius: 2, farSegments: 58, farSize: 980, particles: 520, trackLimit: 128, shadowSize: 1536 },
  medium: { key: 'medium', label: 'Medium', hardwareScaling: 1.22, segments: 24, radius: 2, farSegments: 48, farSize: 900, particles: 360, trackLimit: 96, shadowSize: 1024 },
  low: { key: 'low', label: 'Low', hardwareScaling: 1.48, segments: 18, radius: 1, farSegments: 38, farSize: 780, particles: 220, trackLimit: 64, shadowSize: 768 }
};

export class AdaptiveQuality {
  constructor(onChange = () => {}) {
    this.mode = localStorage.getItem('pocket-works:firn:quality') || 'auto';
    this.activeKey = this.mode === 'auto' ? 'medium' : this.mode;
    if (!PRESETS[this.activeKey]) this.activeKey = 'medium';
    this.preset = PRESETS[this.activeKey];
    this.onChange = onChange;
    this.lowClock = 0;
    this.highClock = 0;
  }

  setMode(mode) {
    this.mode = PRESETS[mode] ? mode : 'auto';
    localStorage.setItem('pocket-works:firn:quality', this.mode);
    const target = this.mode === 'auto' ? 'medium' : this.mode;
    if (target === this.activeKey) this.onChange(this.preset);
    else this.setActive(target);
  }

  setActive(key) {
    if (!PRESETS[key] || key === this.activeKey) return;
    this.activeKey = key;
    this.preset = PRESETS[key];
    this.lowClock = 0;
    this.highClock = 0;
    this.onChange(this.preset);
  }

  update(dt, fps) {
    if (this.mode !== 'auto') return;
    if (fps < 43) { this.lowClock += dt; this.highClock = 0; }
    else if (fps > 57) { this.highClock += dt; this.lowClock = Math.max(0, this.lowClock - dt * 0.5); }
    else { this.lowClock = Math.max(0, this.lowClock - dt); this.highClock = Math.max(0, this.highClock - dt); }
    if (this.lowClock > 4.5) {
      if (this.activeKey === 'high') this.setActive('medium');
      else if (this.activeKey === 'medium') this.setActive('low');
    } else if (this.highClock > 12) {
      if (this.activeKey === 'low') this.setActive('medium');
      else if (this.activeKey === 'medium') this.setActive('high');
    }
  }
}
