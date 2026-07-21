import { installMobileRuntime, bindPointerGesture } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:moss-pocket:save-v1';
const MUTATIONS = {
  velvet: { name: 'Бархатный слой', effect: '+25% к росту от касаний', glyph: '●' },
  capillary: { name: 'Капилляры', effect: 'следы дают вдвое больше росы', glyph: '⌁' },
  symbiosis: { name: 'Симбиоз', effect: 'пассивный рост ускорен на 60%', glyph: '♧' },
  moon: { name: 'Лунный налёт', effect: 'комбо держится дольше', glyph: '◒' },
  mycelium: { name: 'Мицелий', effect: 'каждый пятый сбор удваивается', glyph: '✣' },
  memory: { name: 'Память камня', effect: 'до 8 часов роста в отсутствие', glyph: '◎' }
};
const MUTATION_KEYS = Object.keys(MUTATIONS);
const DROPS = [[74,20],[38,29],[61,41],[22,48],[82,55],[46,64],[69,74],[29,79]];
const TUFTS = Array.from({ length: 46 }, (_, index) => ({
  left: 5 + ((index * 37) % 91),
  top: 10 + ((index * 53) % 82),
  scale: 0.55 + ((index * 17) % 55) / 100,
  delay: -((index * 0.37) % 5),
  kind: index % 7
}));

const $ = (selector) => document.querySelector(selector);
const shell = $('.game-shell');
const game = $('.game');
const field = $('#moss-field');
const notice = $('#notice');
const comboElement = $('#combo');
const mutationOverlay = $('#mutation-overlay');
const infoOverlay = $('#info-overlay');
const confirmOverlay = $('#confirm-overlay');

let state = { dew: 18, growth: 12, colony: 1, mutations: [], sound: true, lastSeen: Date.now() };
let combo = 0;
let rewardCount = 0;
let audioContext = null;
let comboTimer = 0;
let trailTimer = 0;
let rippleId = 0;
let mutationOpen = false;
let pointer = { dragging: false, x: 0, y: 0, distance: 0 };

function vibrate(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function playTone(frequency = 520, duration = 0.07) {
  if (!state.sound) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext ||= new AudioCtor();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(0.045, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function save() {
  state.lastSeen = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return 0;
    state = {
      dew: Math.max(0, Number(saved.dew) || 0),
      growth: Math.max(0, Math.min(100, Number(saved.growth) || 0)),
      colony: Math.max(1, Math.floor(Number(saved.colony) || 1)),
      mutations: Array.isArray(saved.mutations) ? saved.mutations.filter((key) => MUTATIONS[key]) : [],
      sound: saved.sound !== false,
      lastSeen: Number(saved.lastSeen) || Date.now()
    };
    const maxHours = state.mutations.includes('memory') ? 8 : 4;
    const elapsed = Math.min(maxHours * 3600, Math.max(0, (Date.now() - state.lastSeen) / 1000));
    const gain = Math.floor(elapsed / (state.mutations.includes('symbiosis') ? 18 : 28));
    state.dew += gain;
    return gain;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return 0;
  }
}

function render() {
  $('#dew-value').textContent = Math.floor(state.dew);
  $('#growth-value').textContent = `${Math.floor(state.growth)}%`;
  $('#growth-fill').style.width = `${state.growth}%`;
  $('#growth-panel').setAttribute('aria-label', `Рост колонии ${Math.floor(state.growth)} процентов`);
  $('#colony-label').textContent = `КОЛОНИЯ ${String(state.colony).padStart(2, '0')}`;
  $('#mutation-count').textContent = state.mutations.length;
  field.className = `moss-field colony-${Math.min(6, state.colony)}`;
  $('#sound-state').textContent = state.sound ? 'ВКЛ' : 'ВЫКЛ';
  $('#sound-state').classList.toggle('on', state.sound);
}

function setNotice(message) {
  notice.textContent = message;
}

function createRipple(x, y, strong = false) {
  const ripple = document.createElement('span');
  ripple.className = `ripple${strong ? ' strong' : ''}`;
  ripple.style.left = `${x}%`;
  ripple.style.top = `${y}%`;
  ripple.dataset.id = String(++rippleId);
  $('#ripples').append(ripple);
  setTimeout(() => ripple.remove(), 850);
}

function addTrailDot(x, y) {
  const dot = document.createElement('span');
  dot.className = 'trail-dot';
  dot.style.left = `${x}%`;
  dot.style.top = `${y}%`;
  $('#trail').append(dot);
  while ($('#trail').childElementCount > 21) $('#trail').firstElementChild.remove();
}

function clearTrailSoon() {
  clearTimeout(trailTimer);
  trailTimer = setTimeout(() => $('#trail').replaceChildren(), 650);
}

function updateCombo() {
  combo = Math.min(9, combo + 1);
  comboElement.hidden = combo < 2;
  comboElement.textContent = `×${combo}`;
  comboElement.style.animation = 'none';
  requestAnimationFrame(() => { comboElement.style.animation = ''; });
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    combo = 0;
    comboElement.hidden = true;
  }, state.mutations.includes('moon') ? 2800 : 1600);
}

function reward(amount, x, y, strong = false) {
  rewardCount += 1;
  const velvet = state.mutations.includes('velvet') ? 1.25 : 1;
  const doubled = state.mutations.includes('mycelium') && rewardCount % 5 === 0 ? 2 : 1;
  const final = Math.max(1, Math.round(amount * velvet * doubled));
  state.dew += final;
  state.growth = Math.min(100, state.growth + final * 0.82);
  updateCombo();
  createRipple(x, y, strong);
  playTone(440 + Math.min(8, combo) * 34, strong ? 0.12 : 0.07);
  render();
  if (state.growth >= 100) openMutation();
}

function coordinates(event) {
  const rect = field.getBoundingClientRect();
  return {
    x: Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100))
  };
}

function beginGesture(event) {
  if (mutationOpen || !infoOverlay.hidden || !confirmOverlay.hidden) return;
  const point = coordinates(event);
  pointer = { dragging: true, ...point, distance: 0 };
  $('#trail').replaceChildren();
  addTrailDot(point.x, point.y);
  reward(2, point.x, point.y);
  setNotice('Веди медленно — мох пьёт');
}

function moveGesture(event) {
  if (!pointer.dragging) return;
  const point = coordinates(event);
  const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y);
  if (distance < 3.8) return;
  pointer.x = point.x;
  pointer.y = point.y;
  pointer.distance += distance;
  addTrailDot(point.x, point.y);
  if (pointer.distance > 13) {
    pointer.distance = 0;
    reward(state.mutations.includes('capillary') ? 2 : 1, point.x, point.y);
    vibrate(8);
  }
}

function endGesture() {
  if (!pointer.dragging) return;
  pointer.dragging = false;
  setNotice(combo > 2 ? `Тихое комбо ×${combo}` : 'Колония напилась');
  clearTrailSoon();
  save();
}

function choices() {
  const available = MUTATION_KEYS.filter((key) => !state.mutations.includes(key));
  return (available.length ? available : MUTATION_KEYS)
    .sort((a, b) => ((a.charCodeAt(0) + state.colony * 7) % 11) - ((b.charCodeAt(0) + state.colony * 7) % 11))
    .slice(0, 3);
}

function openMutation() {
  if (mutationOpen) return;
  mutationOpen = true;
  pointer.dragging = false;
  $('#mutation-eyebrow').textContent = `КОЛОНИЯ ${String(state.colony).padStart(2, '0')} СОЗРЕЛА`;
  const grid = $('#mutation-grid');
  grid.replaceChildren();
  for (const key of choices()) {
    const mutation = MUTATIONS[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.nativePress = '';
    button.innerHTML = `<i>${mutation.glyph}</i><span><b>${mutation.name}</b><small>${mutation.effect}</small></span>`;
    button.addEventListener('click', () => chooseMutation(key));
    grid.append(button);
  }
  mutationOverlay.hidden = false;
  setNotice('Колония готова измениться');
  vibrate([20, 50, 35]);
  playTone(660, 0.16);
}

function chooseMutation(key) {
  if (!state.mutations.includes(key)) state.mutations.push(key);
  state.colony += 1;
  state.growth = 4;
  mutationOpen = false;
  mutationOverlay.hidden = true;
  setNotice(`${MUTATIONS[key].name} пророс`);
  playTone(720, 0.24);
  vibrate([18, 35, 18]);
  render();
  save();
}

function callRain() {
  if (state.dew < 25) {
    setNotice('Нужно ещё немного росы');
    field.classList.remove('blocked');
    requestAnimationFrame(() => field.classList.add('blocked'));
    vibrate(25);
    return;
  }
  state.dew -= 25;
  state.growth = Math.min(100, state.growth + 22);
  setNotice('Тёплый дождь прошёл над чашей');
  DROPS.slice(0, 6).forEach(([x, y], index) => setTimeout(() => createRipple(x, y, true), index * 45));
  playTone(300, 0.3);
  vibrate([10, 40, 10]);
  render();
  save();
  if (state.growth >= 100) setTimeout(openMutation, 250);
}

function resetColony() {
  state = { dew: 18, growth: 12, colony: 1, mutations: [], sound: state.sound, lastSeen: Date.now() };
  combo = 0;
  mutationOpen = false;
  localStorage.removeItem(STORAGE_KEY);
  confirmOverlay.hidden = true;
  infoOverlay.hidden = true;
  mutationOverlay.hidden = true;
  comboElement.hidden = true;
  setNotice('Чистая почва. Начнём тихо.');
  render();
  save();
}

function seedField() {
  $('#tufts').replaceChildren(...TUFTS.map((tuft) => {
    const element = document.createElement('i');
    element.className = `tuft tuft-${tuft.kind}`;
    element.style.left = `${tuft.left}%`;
    element.style.top = `${tuft.top}%`;
    element.style.scale = String(tuft.scale);
    element.style.animationDelay = `${tuft.delay}s`;
    return element;
  }));
  $('#idle-drops').replaceChildren(...DROPS.map(([x, y], index) => {
    const element = document.createElement('span');
    element.className = 'idle-drop';
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    element.style.animationDelay = `${index * -0.31}s`;
    return element;
  }));
}

bindPointerGesture(field, {
  onStart: beginGesture,
  onMove: moveGesture,
  onEnd: endGesture,
  onCancel: endGesture
});

$('#rain-button').addEventListener('click', callRain);
$('#settings-button').addEventListener('click', () => { infoOverlay.hidden = false; });
$('#settings-close').addEventListener('click', () => { infoOverlay.hidden = true; });
$('#sound-button').addEventListener('click', () => { state.sound = !state.sound; render(); save(); if (state.sound) playTone(520); });
$('#reset-button').addEventListener('click', () => { confirmOverlay.hidden = false; });
$('#reset-cancel').addEventListener('click', () => { confirmOverlay.hidden = true; });
$('#reset-confirm').addEventListener('click', resetColony);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!confirmOverlay.hidden) confirmOverlay.hidden = true;
  else if (!infoOverlay.hidden) infoOverlay.hidden = true;
});

window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

seedField();
const offlineGain = load();
if (offlineGain > 0) {
  setNotice(`Мох собрал ${offlineGain} росы`);
  $('#offline-note').textContent = `+${offlineGain} пока тебя не было`;
}
render();
save();
shell.classList.remove('loading');
$('.loading-screen').remove();
game.hidden = false;

function schedulePassiveGrowth() {
  window.setTimeout(() => {
    if (!document.hidden && !mutationOpen) {
      state.dew += 1;
      state.growth = Math.min(100, state.growth + (state.mutations.includes('symbiosis') ? 1.4 : 0.7));
      render();
      if (state.growth >= 100) openMutation();
    }
    schedulePassiveGrowth();
  }, state.mutations.includes('symbiosis') ? 2400 : 3800);
}

schedulePassiveGrowth();

setInterval(save, 5000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
}
