function defaultProfile() {
  return {
    selectedMap: 'terrace',
    briefingSeen: false,
    best: {},
    settings: {
      sensitivity: 1,
      assist: 0.7,
      leftHanded: false,
      audio: true,
      haptics: true,
      quality: 'high'
    }
  };
}

function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const fallback = defaultProfile();
    if (!saved || typeof saved !== 'object') return fallback;
    return {
      ...fallback,
      ...saved,
      best: saved.best && typeof saved.best === 'object' ? saved.best : {},
      settings: { ...fallback.settings, ...(saved.settings || {}) }
    };
  } catch {
    return defaultProfile();
  }
}

let profile = readProfile();
function persistProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); }
  catch (error) { console.warn('КАЛИБР не смог сохранить профиль', error); }
}

class AudioRack {
  constructor() {
    this.context = null;
    this.master = null;
  }
  ensure() {
    if (!profile.settings.audio) return;
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume();
  }
  tone(freq, duration, type = 'square', gain = 0.1, slide = 0) {
    if (!profile.settings.audio) return;
    this.ensure();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
  noise(duration = 0.08, gain = 0.18, highpass = 600) {
    if (!profile.settings.audio) return;
    this.ensure();
    if (!this.context || !this.master) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    envelope.gain.value = gain;
    source.buffer = buffer;
    source.connect(filter).connect(envelope).connect(this.master);
    source.start();
  }
  shot() { this.noise(0.09, 0.48, 280); this.tone(82, 0.1, 'sawtooth', 0.14, -24); }
  enemyShot() { this.noise(0.06, 0.16, 900); this.tone(130, 0.07, 'square', 0.05, -30); }
  hit() { this.tone(920, 0.045, 'square', 0.08, -250); }
  empty() { this.tone(190, 0.04, 'square', 0.07, -20); }
  reload() { this.tone(240, 0.06, 'triangle', 0.06, 80); setTimeout(() => this.tone(340, 0.08, 'triangle', 0.07, -60), 720); }
  ui() { this.tone(520, 0.035, 'triangle', 0.04, 80); }
  alarm() { this.tone(170, 0.12, 'sawtooth', 0.06, -20); }
}

const audio = new AudioRack();
function haptic(pattern) {
  if (profile.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function makeTexture(type) {
  const texture = document.createElement('canvas');
  texture.width = 64;
  texture.height = 64;
  const t = texture.getContext('2d');
  const noise = (count, alpha = 0.08) => {
    for (let i = 0; i < count; i += 1) {
      const v = 180 + Math.random() * 70;
      t.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      t.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };
  if (type === 1) {
    t.fillStyle = '#657073'; t.fillRect(0, 0, 64, 64);
    t.strokeStyle = 'rgba(20,28,30,.42)'; t.lineWidth = 2;
    t.strokeRect(1, 1, 62, 62); t.beginPath(); t.moveTo(0, 32); t.lineTo(64, 32); t.stroke();
    t.fillStyle = '#303a3d'; [[7,7],[57,7],[7,57],[57,57]].forEach(([x,y]) => t.fillRect(x,y,2,2)); noise(130);
  } else if (type === 2) {
    t.fillStyle = '#c79a3c'; t.fillRect(0, 0, 64, 64);
    t.fillStyle = '#1a2325';
    for (let x = -64; x < 96; x += 24) { t.save(); t.translate(x, 0); t.rotate(-0.55); t.fillRect(0, -20, 10, 110); t.restore(); }
    t.fillStyle = 'rgba(242,226,164,.18)'; t.fillRect(0, 0, 64, 4); noise(80, .12);
  } else if (type === 3) {
    t.fillStyle = '#729b98'; t.fillRect(0, 0, 64, 64);
    t.strokeStyle = '#395452'; t.lineWidth = 2;
    for (let x = 0; x <= 64; x += 16) { t.beginPath(); t.moveTo(x,0); t.lineTo(x,64); t.stroke(); }
    for (let y = 0; y <= 64; y += 16) { t.beginPath(); t.moveTo(0,y); t.lineTo(64,y); t.stroke(); }
    t.fillStyle = 'rgba(225,246,240,.16)'; t.fillRect(2,2,60,3); noise(40, .08);
  } else if (type === 4) {
    const gradient = t.createLinearGradient(0, 0, 64, 0);
    gradient.addColorStop(0, '#263439'); gradient.addColorStop(.45, '#53646a'); gradient.addColorStop(.55, '#1b272b'); gradient.addColorStop(1, '#394a50');
    t.fillStyle = gradient; t.fillRect(0, 0, 64, 64);
    t.fillStyle = 'rgba(12,17,19,.45)'; for (let y = 0; y < 64; y += 16) t.fillRect(0, y, 64, 2);
    t.fillStyle = '#b26045'; t.fillRect(5, 7, 7, 50); t.fillRect(52, 7, 7, 50); noise(90, .16);
  } else {
    t.fillStyle = '#a7a18d'; t.fillRect(0, 0, 64, 64);
    t.fillStyle = '#6f6b5e';
    for (let y = 0; y < 64; y += 10) {
      const offset = (Math.floor(y / 10) % 2) * 8;
      t.fillRect(0, y, 64, 2);
      for (let x = offset; x < 64; x += 16) t.fillRect(x, y, 2, 10);
    }
    noise(100, .1);
  }
  return texture;
}

function makeEnemySprite(palette = '#d8ded9') {
  const sprite = document.createElement('canvas');
  sprite.width = 64; sprite.height = 96;
  const s = sprite.getContext('2d');
  s.clearRect(0, 0, 64, 96);
  s.fillStyle = 'rgba(0,0,0,.24)'; s.beginPath(); s.ellipse(32, 90, 22, 5, 0, 0, TAU); s.fill();
  s.fillStyle = '#151c1f'; s.fillRect(18, 45, 28, 31); s.fillRect(18, 72, 10, 18); s.fillRect(36, 72, 10, 18);
  s.fillStyle = palette; s.fillRect(20, 42, 24, 24);
  s.fillStyle = '#283438'; s.fillRect(17, 28, 30, 20); s.fillRect(22, 17, 20, 14);
  s.fillStyle = '#f2b84b'; s.fillRect(23, 30, 18, 4);
  s.fillStyle = '#101719'; s.fillRect(12, 49, 8, 24); s.fillRect(44, 49, 8, 24);
  s.fillStyle = '#3f4c50'; s.fillRect(36, 52, 22, 7); s.fillRect(50, 57, 8, 4);
  s.fillStyle = 'rgba(255,255,255,.12)'; s.fillRect(21, 43, 3, 20);
  return sprite;
}

function makePickupSprite(kind) {
  const sprite = document.createElement('canvas');
  sprite.width = 64; sprite.height = 64;
  const s = sprite.getContext('2d');
  s.fillStyle = 'rgba(0,0,0,.25)'; s.beginPath(); s.ellipse(32, 56, 20, 5, 0, 0, TAU); s.fill();
  s.fillStyle = kind === 'health' ? '#70a9a8' : '#f2b84b'; s.fillRect(13, 18, 38, 34);
  s.fillStyle = '#172023'; s.fillRect(17, 22, 30, 26);
  s.fillStyle = kind === 'health' ? '#70a9a8' : '#f2b84b';
  if (kind === 'health') { s.fillRect(27, 25, 10, 20); s.fillRect(22, 30, 20, 10); }
  else { for (let x = 21; x <= 39; x += 9) { s.fillRect(x, 25, 4, 18); s.fillRect(x + 1, 22, 2, 3); } }
  return sprite;
}

function makeExitSprite() {
  const sprite = document.createElement('canvas');
  sprite.width = 80; sprite.height = 112;
  const s = sprite.getContext('2d');
  const gradient = s.createLinearGradient(0, 0, 0, 112);
  gradient.addColorStop(0, 'rgba(242,184,75,0)'); gradient.addColorStop(.3, 'rgba(242,184,75,.25)'); gradient.addColorStop(1, 'rgba(242,184,75,0)');
  s.fillStyle = gradient; s.fillRect(12, 0, 56, 112);
  s.strokeStyle = '#f2b84b'; s.lineWidth = 4; s.strokeRect(22, 25, 36, 62);
  s.fillStyle = '#f2b84b'; s.fillRect(37, 12, 6, 88); s.fillRect(12, 53, 56, 6);
  s.fillStyle = '#121719'; s.fillRect(31, 48, 18, 16);
  return sprite;
}

const textures = [null, makeTexture(1), makeTexture(2), makeTexture(3), makeTexture(4), makeTexture(5)];
const sprites = {
  enemy: makeEnemySprite(),
  enemyAlert: makeEnemySprite('#e3a465'),
  health: makePickupSprite('health'),
  ammo: makePickupSprite('ammo'),
  exit: makeExitSprite()
};

let selectedMap = MAPS[profile.selectedMap] ? profile.selectedMap : 'terrace';
let phase = 'menu';
let current = null;
let frameId = 0;
let lastFrame = performance.now();
let renderWidth = 420;
let renderHeight = 200;
let zBuffer = [];
let toastTimer = 0;
let previewTime = 0;
let shake = 0;
let muzzleFlash = 0;
let recoil = 0;
let lastLockedTarget = null;

const input = {
  movePointer: null,
  lookPointer: null,
  moveOriginX: 0,
  moveOriginY: 0,
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  firing: false,
  keys: new Set(),
  mouseDown: false
};
