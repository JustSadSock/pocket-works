import { bindPointerGesture, installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createRafLoop } from '../../shared/capabilities/motion.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { watchOrientation } from '../../shared/capabilities/device.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:echoes';
const mobileRuntime = installMobileRuntime();
const preferences = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    awake: false,
    theme: 'nocturne',
    sound: true,
    tilt: true,
    trail: true,
    intensity: 72,
    density: 64,
    archive: []
  }
});

const root = document.documentElement;
const body = document.body;
const canvas = document.querySelector('#field');
let gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });

const state = {
  started: preferences.get('awake', false),
  theme: preferences.get('theme', 'nocturne'),
  sound: preferences.get('sound', true),
  tilt: preferences.get('tilt', true),
  trail: preferences.get('trail', true),
  intensity: preferences.get('intensity', 72),
  density: preferences.get('density', 64),
  pointer: { x: .5, y: .5, down: 0, vx: 0, vy: 0, lastX: .5, lastY: .5 },
  tiltValue: { x: 0, y: 0 },
  pulses: Array.from({ length: 12 }, () => ({ x: -2, y: -2, born: -99, power: 0 })),
  pulseIndex: 0,
  energy: 0
};

const vertex = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){ v_uv = a_position*.5+.5; gl_Position = vec4(a_position,0.,1.); }`;

const fragment = `#version 300 es
precision highp float;
out vec4 outColor;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_pointer;
uniform vec2 u_tilt;
uniform vec4 u_pulses[12];
uniform float u_intensity;
uniform float u_density;
uniform float u_theme;
uniform float u_trail;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
vec3 palette(float t){
  vec3 acid = u_theme<.5?vec3(.294,1.,.70):vec3(0.,.72,.47);
  vec3 violet = u_theme<.5?vec3(.54,.36,1.):vec3(.40,.25,.90);
  vec3 cyan = u_theme<.5?vec3(.36,.91,.93):vec3(.05,.69,.72);
  return mix(mix(acid,cyan,.5+.5*sin(t*2.1)),violet,.5+.5*cos(t*1.3));
}
void main(){
  vec2 uv=v_uv; vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  vec2 pt=(u_pointer.xy-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  p += u_tilt*.035;
  float n=fbm(p*(2.8+u_density*3.)+vec2(u_time*.035,-u_time*.027));
  float n2=fbm(p*5.2-vec2(u_time*.018,u_time*.024));
  vec2 warp=vec2(n-.5,n2-.5)*.09*u_intensity;
  float dist=length(p-pt+warp);
  float pointerGlow=exp(-dist*8.)*(.22+.78*u_pointer.z);
  float rings=0.; float wave=0.;
  for(int i=0;i<12;i++){
    vec4 q=u_pulses[i]; float age=u_time-q.z; if(age>0.&&age<5.){
      vec2 pp=(q.xy-.5)*vec2(u_resolution.x/u_resolution.y,1.);
      float d=length(p-pp+warp*.6); float radius=age*(.10+.12*q.w);
      float r=exp(-abs(d-radius)*65.)*exp(-age*.48)*q.w;
      float r2=exp(-abs(d-radius*.64)*90.)*exp(-age*.62)*q.w*.65;
      rings+=r+r2; wave+=sin((d-age*.16)*55.)*exp(-d*2.7)*exp(-age*.75)*q.w;
    }
  }
  float core=exp(-length(p+warp*.5)*8.5);
  float halo=exp(-length(p+warp*.7)*2.9)*.18;
  float filaments=pow(max(0.,sin((length(p+warp)*18.-u_time*.9)+n*6.)),8.)*.12;
  float speck=step(.985,hash(floor((uv+u_time*.0008)*u_resolution.xy/(2.2-u_density))));
  vec3 bg=u_theme<.5?vec3(.025,.029,.039):vec3(.925,.94,.91);
  vec3 col=bg; vec3 chroma=palette(n*4.+u_time*.16+wave);
  col += chroma*(rings*1.35 + pointerGlow*.8 + halo + core*.26 + filaments);
  col += chroma*speck*(.18+.62*u_density);
  col += vec3(1.)*pow(rings,2.)*.45;
  float vignette=smoothstep(1.0,.18,length((uv-.5)*vec2(.9,1.1)));
  col=mix(bg,col,vignette*.92+.08);
  col += (hash(gl_FragCoord.xy+u_time)-.5)/255.;
  outColor=vec4(col,1.);
}`;

let program = null;
let uniforms = null;

function initialiseWebGl() {
  if (!gl) return false;
  try {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const location = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    uniforms = {
      resolution: gl.getUniformLocation(program,'u_resolution'),
      time: gl.getUniformLocation(program,'u_time'),
      pointer: gl.getUniformLocation(program,'u_pointer'),
      tilt: gl.getUniformLocation(program,'u_tilt'),
      pulses: gl.getUniformLocation(program,'u_pulses[0]'),
      intensity: gl.getUniformLocation(program,'u_intensity'),
      density: gl.getUniformLocation(program,'u_density'),
      theme: gl.getUniformLocation(program,'u_theme'),
      trail: gl.getUniformLocation(program,'u_trail')
    };
    return true;
  } catch {
    gl = null;
    program = null;
    uniforms = null;
    return false;
  }
}

if (!initialiseWebGl()) body.classList.add('no-webgl');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const energyEl = document.querySelector('#energyReadout');
const memoryEl = document.querySelector('#memoryReadout');
const fieldEl = document.querySelector('#fieldReadout');
const onboarding = document.querySelector('#onboarding');
const toast = document.querySelector('#toast');
let toastTimer = 0;
let orientationStop = null;
let audioContext = null;
let masterGain = null;
let drone = null;
let droneGain = null;
let clearArchiveArmed = false;
let clearArchiveTimer = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function savePreference(key, value) {
  preferences.set(key, value);
}

function loadArchive() {
  const archive = preferences.get('archive', []);
  return Array.isArray(archive) ? archive.filter((item) => item && typeof item === 'object').slice(0, 8) : [];
}

function saveArchive(items) {
  try {
    preferences.set('archive', items.slice(0, 8));
    return true;
  } catch {
    showToast('STORAGE FULL');
    return false;
  }
}

function resize() {
  const viewport = mobileRuntime.getViewportState();
  const width = Math.max(1, Math.round(viewport.width || window.innerWidth));
  const height = Math.max(1, Math.round(viewport.height || window.innerHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

function ensureAudio() {
  if (!state.sound) return;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = .18;
    masterGain.connect(audioContext.destination);
    drone = audioContext.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 52;
    droneGain = audioContext.createGain();
    droneGain.gain.value = .025;
    drone.connect(droneGain).connect(masterGain);
    drone.start();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  if (masterGain) masterGain.gain.value = .18;
}

function ping(power = .6) {
  if (!state.sound) return;
  ensureAudio();
  if (!audioContext || !masterGain) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequency = 180 + Math.random() * 520;
  oscillator.type = Math.random() > .5 ? 'sine' : 'triangle';
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * .46, audioContext.currentTime + .55);
  gain.gain.setValueAtTime(.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.045 * Math.min(1.2, power), audioContext.currentTime + .02);
  gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .65);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + .7);
}

function signalAudio(active) {
  if (!state.sound) return;
  ensureAudio();
  if (!audioContext || !droneGain) return;
  droneGain.gain.cancelScheduledValues(audioContext.currentTime);
  droneGain.gain.linearRampToValueAtTime(active ? .09 : .025, audioContext.currentTime + .18);
}

function addPulse(x, y, power = 1) {
  const pulse = state.pulses[state.pulseIndex++ % state.pulses.length];
  pulse.x = x;
  pulse.y = 1 - y;
  pulse.born = performance.now() / 1000;
  pulse.power = Math.min(1.8, power);
  state.energy = Math.min(99, state.energy + Math.round(8 * power));
  ping(power);
}

function normalisePointer(event) {
  return { x: event.clientX / Math.max(1, window.innerWidth), y: event.clientY / Math.max(1, window.innerHeight) };
}

function pointerDown(event) {
  const point = normalisePointer(event);
  state.pointer.down = 1;
  state.pointer.x = point.x;
  state.pointer.y = 1 - point.y;
  state.pointer.lastX = point.x;
  state.pointer.lastY = 1 - point.y;
  addPulse(point.x, point.y, .75 + (event.pressure || .3));
}

function pointerMove(event) {
  const point = normalisePointer(event);
  const nextY = 1 - point.y;
  state.pointer.vx = point.x - state.pointer.lastX;
  state.pointer.vy = nextY - state.pointer.lastY;
  state.pointer.lastX = point.x;
  state.pointer.lastY = nextY;
  state.pointer.x = point.x;
  state.pointer.y = nextY;
  const velocity = Math.hypot(state.pointer.vx, state.pointer.vy);
  if (state.pointer.down && velocity > .008 && Math.random() < .28) {
    addPulse(point.x, point.y, .35 + Math.min(1, velocity * 22));
  }
}

function pointerUp() {
  state.pointer.down = 0;
}

bindPointerGesture(canvas, {
  onStart: pointerDown,
  onMove: pointerMove,
  onEnd: pointerUp,
  onCancel: pointerUp
});

function render(now) {
  const seconds = now / 1000;
  state.energy *= .988;
  energyEl.textContent = String(Math.round(state.energy)).padStart(2, '0');
  memoryEl.textContent = String(loadArchive().length).padStart(2, '0');
  fieldEl.textContent = state.pointer.down || body.classList.contains('signaling') ? 'ACTIVE' : state.energy > 2 ? 'ECHO' : 'IDLE';
  if (!gl || !program || !uniforms) return;
  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.time, seconds);
  gl.uniform4f(uniforms.pointer, state.pointer.x, state.pointer.y, state.pointer.down, Math.hypot(state.pointer.vx, state.pointer.vy));
  gl.uniform2f(uniforms.tilt, state.tiltValue.x, state.tiltValue.y);
  const flattenedPulses = [];
  for (const pulse of state.pulses) flattenedPulses.push(pulse.x, pulse.y, pulse.born, pulse.power);
  gl.uniform4fv(uniforms.pulses, new Float32Array(flattenedPulses));
  gl.uniform1f(uniforms.intensity, state.intensity / 100);
  gl.uniform1f(uniforms.density, state.density / 100);
  gl.uniform1f(uniforms.theme, state.theme === 'dawn' ? 1 : 0);
  gl.uniform1f(uniforms.trail, state.trail ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

async function enableTilt() {
  if (!state.tilt || orientationStop) return Boolean(orientationStop);
  orientationStop = await watchOrientation((event) => {
    if (!state.tilt || event.gamma == null || event.beta == null) return;
    state.tiltValue.x = clamp(event.gamma / 45, -1, 1);
    state.tiltValue.y = clamp(event.beta / 90, -1, 1);
  });
  if (!orientationStop) showToast('MOTION UNAVAILABLE');
  return Boolean(orientationStop);
}

function disableTilt() {
  orientationStop?.();
  orientationStop = null;
  state.tiltValue.x = 0;
  state.tiltValue.y = 0;
}

document.querySelector('#awakenButton').addEventListener('click', async () => {
  ensureAudio();
  await enableTilt();
  state.started = true;
  savePreference('awake', true);
  onboarding.classList.add('hidden');
  for (let index = 0; index < 4; index += 1) {
    setTimeout(() => addPulse(.5, .5, .8 + index * .15), index * 130);
  }
});

if (state.started) onboarding.classList.add('hidden');

const signalButton = document.querySelector('#signalButton');
function startSignal(event) {
  event.preventDefault();
  ensureAudio();
  body.classList.add('signaling');
  signalAudio(true);
  state.pointer.down = 1;
  const rect = signalButton.getBoundingClientRect();
  for (let index = 0; index < 3; index += 1) {
    setTimeout(() => addPulse((rect.left + rect.width / 2) / innerWidth, (rect.top + rect.height / 2) / innerHeight, 1.2 + index * .2), index * 160);
  }
}
function stopSignal() {
  body.classList.remove('signaling');
  signalAudio(false);
  state.pointer.down = 0;
}
signalButton.addEventListener('pointerdown', startSignal);
window.addEventListener('pointerup', stopSignal);
window.addEventListener('pointercancel', stopSignal);

const views = [...document.querySelectorAll('.view')];
const navButtons = [...document.querySelectorAll('.nav button')];
const dock = document.querySelector('.action-dock');
navButtons.forEach((button) => button.addEventListener('click', () => {
  navButtons.forEach((item) => item.classList.toggle('active', item === button));
  views.forEach((view) => view.classList.toggle('active', view.dataset.view === button.dataset.target));
  dock.style.display = button.dataset.target === 'field' ? 'flex' : 'none';
  if (button.dataset.target === 'archive') renderArchive();
}));

function capture() {
  if (!gl) {
    showToast('WEBGL REQUIRED');
    return;
  }
  try {
    const items = loadArchive();
    const thumbnail = document.createElement('canvas');
    const ratio = canvas.height / Math.max(1, canvas.width);
    thumbnail.width = 320;
    thumbnail.height = Math.round(320 * ratio);
    thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
    const snapshot = thumbnail.toDataURL('image/jpeg', .58);
    items.unshift({ id: crypto.randomUUID(), at: Date.now(), energy: Math.round(state.energy), image: snapshot });
    if (!saveArchive(items)) return;
    showToast('ECHO CAPTURED');
    renderArchive();
  } catch {
    showToast('CAPTURE FAILED');
  }
}

document.querySelector('#captureButton').addEventListener('click', capture);

function armDelete(button, onConfirm) {
  if (button.dataset.armed === 'true') {
    onConfirm();
    return;
  }
  button.dataset.armed = 'true';
  button.textContent = 'OK';
  setTimeout(() => {
    if (!button.isConnected) return;
    button.dataset.armed = 'false';
    button.textContent = '×';
  }, 2400);
}

function renderArchive() {
  const grid = document.querySelector('#archiveGrid');
  const empty = document.querySelector('#emptyArchive');
  const items = loadArchive();
  grid.innerHTML = '';
  empty.hidden = items.length > 0;
  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'archive-card';
    const time = new Date(item.at);
    card.innerHTML = `<button class="delete" type="button" aria-label="Удалить сохранённое эхо">×</button><img src="${item.image}" alt="Сохранённое эхо ${index + 1}"><footer><b>ECHO ${String(items.length - index).padStart(2, '0')}</b><small>${time.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} / ${time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></footer>`;
    const deleteButton = card.querySelector('.delete');
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      armDelete(deleteButton, () => {
        saveArchive(loadArchive().filter((entry) => entry.id !== item.id));
        renderArchive();
        showToast('ECHO ERASED');
      });
    });
    card.addEventListener('click', () => {
      navButtons[0].click();
      addPulse(.5, .5, 1.7);
      state.energy = Math.min(99, state.energy + item.energy * .25);
    });
    grid.append(card);
  });
  memoryEl.textContent = String(items.length).padStart(2, '0');
}

renderArchive();
const clearArchiveButton = document.querySelector('#clearArchive');
clearArchiveButton.addEventListener('click', () => {
  if (!clearArchiveArmed) {
    clearArchiveArmed = true;
    clearArchiveButton.textContent = 'CONFIRM';
    clearTimeout(clearArchiveTimer);
    clearArchiveTimer = setTimeout(() => {
      clearArchiveArmed = false;
      clearArchiveButton.textContent = 'CLEAR';
    }, 2800);
    return;
  }
  clearArchiveArmed = false;
  clearArchiveButton.textContent = 'CLEAR';
  saveArchive([]);
  renderArchive();
  showToast('ARCHIVE CLEARED');
});

document.querySelector('#exportButton').addEventListener('click', () => {
  if (!gl) {
    showToast('WEBGL REQUIRED');
    return;
  }
  const anchor = document.createElement('a');
  anchor.download = `echoes-${Date.now()}.png`;
  anchor.href = canvas.toDataURL('image/png');
  anchor.click();
  showToast('PNG EXPORTED');
});

const about = document.querySelector('#aboutModal');
document.querySelector('#brandButton').addEventListener('click', () => about.setAttribute('aria-hidden', 'false'));
document.querySelector('#closeAbout').addEventListener('click', () => about.setAttribute('aria-hidden', 'true'));
about.addEventListener('click', (event) => {
  if (event.target === about) about.setAttribute('aria-hidden', 'true');
});

const soundToggle = document.querySelector('#soundToggle');
const tiltToggle = document.querySelector('#tiltToggle');
const trailToggle = document.querySelector('#trailToggle');
const intensitySlider = document.querySelector('#intensitySlider');
const densitySlider = document.querySelector('#densitySlider');

function syncSettingsControls() {
  soundToggle.checked = state.sound;
  tiltToggle.checked = state.tilt;
  trailToggle.checked = state.trail;
  intensitySlider.value = state.intensity;
  densitySlider.value = state.density;
  document.querySelector('#intensityValue').textContent = `${state.intensity}%`;
  document.querySelector('#densityValue').textContent = `${state.density}%`;
}

soundToggle.addEventListener('change', () => {
  state.sound = soundToggle.checked;
  savePreference('sound', state.sound);
  if (state.sound) ensureAudio();
  else if (masterGain) masterGain.gain.value = 0;
});

tiltToggle.addEventListener('change', async () => {
  state.tilt = tiltToggle.checked;
  savePreference('tilt', state.tilt);
  if (state.tilt) await enableTilt();
  else disableTilt();
});

trailToggle.addEventListener('change', () => {
  state.trail = trailToggle.checked;
  savePreference('trail', state.trail);
});

intensitySlider.addEventListener('input', () => {
  state.intensity = Number(intensitySlider.value);
  document.querySelector('#intensityValue').textContent = `${state.intensity}%`;
  savePreference('intensity', state.intensity);
});

densitySlider.addEventListener('input', () => {
  state.density = Number(densitySlider.value);
  document.querySelector('#densityValue').textContent = `${state.density}%`;
  savePreference('density', state.density);
});

function applyTheme() {
  root.dataset.theme = state.theme;
  document.querySelector('#themeLabel').textContent = state.theme.toUpperCase();
  document.querySelector('meta[name="theme-color"]').content = state.theme === 'dawn' ? '#ecefe9' : '#07080b';
  savePreference('theme', state.theme);
}

document.querySelector('#themeToggle').addEventListener('click', () => {
  state.theme = state.theme === 'nocturne' ? 'dawn' : 'nocturne';
  applyTheme();
  showToast(state.theme.toUpperCase());
});

function resetEchoes() {
  preferences.reset();
  state.started = false;
  state.theme = 'nocturne';
  state.sound = true;
  state.tilt = true;
  state.trail = true;
  state.intensity = 72;
  state.density = 64;
  state.energy = 0;
  state.pointer.down = 0;
  state.pulseIndex = 0;
  state.pulses.forEach((pulse) => Object.assign(pulse, { x: -2, y: -2, born: -99, power: 0 }));
  disableTilt();
  onboarding.classList.remove('hidden');
  syncSettingsControls();
  applyTheme();
  renderArchive();
  showToast('ECHOES RESET');
}

createWorkshopMode({
  appName: 'ECHOES',
  version: APP_VERSION,
  cachePrefix: 'echoes-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: resetEchoes
});

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('appviewportchange', resize, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audioContext?.state === 'running') void audioContext.suspend();
});
window.addEventListener('pagehide', disableTilt, { once: true });

syncSettingsControls();
applyTheme();
resize();
if (state.started && state.tilt) void enableTilt();
createRafLoop(render, { pauseWhenHidden: true, maxDelta: 80 });
