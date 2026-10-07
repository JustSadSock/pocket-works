import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import Phaser from 'phaser';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { ArcadeAudio } from './audio';
import { arena, fighterFrame, POSES, type Pose } from './art';
import { blankInput, CAST, createMatch, MOVES, nextRound, stepMatch, type FighterId, type Input, type Match } from './core';

declare global {
  interface Window { render_game_to_text: () => string; advanceTime: (ms: number) => void; __AI_TEST_STATE__: unknown }
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new ArcadeAudio();
const storageKey = 'pocket-works:afterhours-arena:profile';
interface Profile { selected: FighterId; sound: boolean; wins: number; played: number }
let profile: Profile = { selected: 'rook', sound: true, wins: 0, played: 0 };
try {
  const v = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
  profile = { selected: v.selected === 'vesper' ? 'vesper' : 'rook', sound: v.sound !== false, wins: Number.isSafeInteger(v.wins) && v.wins >= 0 ? v.wins : 0, played: Number.isSafeInteger(v.played) && v.played >= 0 ? v.played : 0 };
} catch { /* A corrupt/unavailable save must not prevent a match. */ }
const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch { /* Private-mode storage is optional. */ } };
audio.enabled = profile.sound;
let state = createMatch(profile.selected, true), scene: ArenaScene | null = null, manual = false, accumulator = 0, lastMode = '', savedResult = false;
const held = new Map<string, keyof Input>();
function input(): Input { const out = blankInput(); for (const key of held.values()) out[key] = true; return out; }
function clearInput() { held.clear(); document.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed')); }
function publish() {
  const view = { coordinates: '480x270, origin top-left; fighter y is height above deck at y=210', mode: state.mode, round: state.round, seconds: Math.ceil(state.time), winner: state.winner, roundWinner: state.roundWinner, fighters: state.fighters.map(f => ({ id: f.id, x: Math.round(f.x), height: Math.round(f.y), health: f.hp, energy: f.energy, wins: f.wins, facing: f.facing, attack: f.move, attackTime: +f.elapsed.toFixed(2), blocking: f.blocking, stunned: f.stun > 0, combo: f.comboAge < 1.1 ? f.combo : 0 })), projectiles: state.shots.map(p => ({ owner: p.owner, x: Math.round(p.x), height: p.y })), selected: profile.selected, sound: audio.enabled, record: { wins: profile.wins, played: profile.played } };
  window.__AI_TEST_STATE__ = view; return JSON.stringify(view);
}
window.render_game_to_text = publish;
function tick(dt: number) {
  const old = state.mode;
  stepMatch(state, input(), dt);
  state.events.forEach(e => { audio.play(e.type); scene?.effect(e); });
  if (state.mode === 'result' && !savedResult) { savedResult = true; profile.played++; if (state.winner === 0) profile.wins++; save(); }
  if (old !== state.mode) clearInput();
  scene?.ageEffects(dt);
}
window.advanceTime = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return;
  manual = true;
  const frames = Math.min(36000, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < frames; i++) tick(1 / 60);
  scene?.paint(); syncUI(); publish();
};
function start() { audio.unlock(); audio.play('ui'); clearInput(); state = createMatch(profile.selected); savedResult = false; accumulator = 0; scene?.resetEffects(); syncUI(); }
function select(id: FighterId) {
  profile.selected = id; save(); state = createMatch(id, true); clearInput();
  document.querySelectorAll<HTMLButtonElement>('[data-fighter]').forEach(b => { const active = b.dataset.fighter === id; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', String(active)); });
  syncUI();
}
function menu() { clearInput(); scene?.resetEffects(); select(profile.selected); }
function pause() {
  if (state.mode === 'paused') state.mode = state.resumeMode;
  else if (state.mode === 'fight' || state.mode === 'intro') { state.resumeMode = state.mode; state.mode = 'paused'; }
  clearInput(); syncUI();
}
function fullscreen() {
  const promise = document.fullscreenElement ? document.exitFullscreen?.() : document.querySelector('main')?.requestFullscreen?.();
  promise?.catch(() => { $('fullscreen-btn').textContent = 'НЕДОСТУПНО'; });
}
function syncUI() {
  const menuVisible = state.mode === 'menu', overlayVisible = ['paused', 'round', 'result'].includes(state.mode);
  $('menu').hidden = !menuVisible; $('hud').hidden = menuVisible; $('overlay').hidden = !overlayVisible;
  $('stage-caption').hidden = menuVisible; $('control-deck').classList.toggle('inactive', menuVisible || overlayVisible);
  document.querySelectorAll<HTMLButtonElement>('[data-input]').forEach(b => {
    b.disabled = menuVisible || overlayVisible || state.mode === 'intro';
    if (b.dataset.input === 'special') { const available = state.fighters[0].energy >= 60; b.classList.toggle('unavailable', !available); b.setAttribute('aria-label', available ? 'Спецприём готов' : 'Спецприём: нужно 60 энергии'); }
  });
  const pauseButton = $<HTMLButtonElement>('pause-btn'); pauseButton.disabled = !['fight', 'intro', 'paused'].includes(state.mode); pauseButton.textContent = state.mode === 'paused' ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
  $('record').textContent = profile.played ? `${profile.wins} ПОБЕД / ${profile.played} БОЁВ` : '';
  $('sound-btn').textContent = audio.enabled ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ'; $('sound-btn').setAttribute('aria-label', audio.enabled ? 'Выключить звук' : 'Включить звук');
  $('timer').textContent = String(Math.ceil(state.time)).padStart(2, '0'); $('round-label').textContent = `РАУНД ${String(state.round).padStart(2, '0')}`;
  state.fighters.forEach((f, i) => { const p = `p${i + 1}`; $(p + '-name').textContent = CAST[f.id].name; $(p + '-health').style.width = `${f.hp}%`; $(p + '-meter').style.width = `${f.energy}%`; $(p + '-wins').textContent = '●'.repeat(f.wins) + '○'.repeat(2 - f.wins); $(p + '-ready').textContent = f.energy >= 60 ? 'СПЕЦ ГОТОВ' : `${Math.floor(f.energy)} / 60`; });
  $('callout').textContent = state.mode === 'intro' ? state.intro > .65 ? `РАУНД ${state.round}` : 'FIGHT!' : '';
  const f = state.fighters[0]; $('combo').textContent = f.combo >= 2 && f.comboAge < 1.1 && state.mode === 'fight' ? `${f.combo} HITS` : '';
  $('footer-hint').textContent = menuVisible ? 'ВЫБЕРИ БОЙЦА. ЗАЙМИ АРЕНУ.' : 'J / РУКА · K / НОГА · L / СПЕЦ';
  if (state.mode !== lastMode) {
    if (overlayVisible) {
      const paused = state.mode === 'paused', result = state.mode === 'result', winner = result ? state.winner : state.roundWinner;
      $('overlay-kicker').textContent = paused ? 'АВТОМАТ ПОДОЖДЁТ' : result ? 'ПОЕДИНОК ЗАВЕРШЁН' : `РАУНД ${state.round} ЗАВЕРШЁН`;
      $('overlay-title').textContent = paused ? 'ПАУЗА' : winner === null ? 'НИЧЬЯ' : `${CAST[state.fighters[winner].id].name} ПОБЕЖДАЕТ`;
      $('overlay-copy').textContent = paused ? 'Переведи дыхание. Следующий удар — твой.' : result ? `${state.fighters[0].wins} : ${state.fighters[1].wins} · ${winner === 0 ? 'Причал сегодня за тобой.' : 'Ещё один бой? Ночь не закончилась.'}` : winner === null ? 'Равный счёт. Решим в следующем раунде.' : `${state.fighters[0].wins} : ${state.fighters[1].wins} · До двух побед.`;
      $('continue-btn').textContent = paused ? 'ПРОДОЛЖИТЬ →' : result ? 'РЕВАНШ →' : 'СЛЕДУЮЩИЙ РАУНД →';
      $<HTMLButtonElement>('continue-btn').focus({ preventScroll: true });
    } else if (menuVisible && scene) $<HTMLButtonElement>('start-btn').focus({ preventScroll: true });
    lastMode = state.mode;
  }
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: number; size: number }
class ArenaScene extends Phaser.Scene {
  private sprites: Phaser.GameObjects.Image[] = [];
  private shadows!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private trauma = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  create() {
    scene = this; this.textures.addCanvas('harbor', arena()); this.add.image(0, 0, 'harbor').setOrigin(0);
    for (const id of ['rook', 'vesper'] as FighterId[]) for (const pose of POSES) this.textures.addCanvas(`${id}-${pose}`, fighterFrame(id, pose));
    this.shadows = this.add.graphics();
    this.sprites = state.fighters.map(f => this.add.image(f.x, 210, `${f.id}-idle0`).setOrigin(.5, 90 / 96).setScale(1.12));
    this.fx = this.add.graphics();
    for (const id of ['rook', 'vesper'] as FighterId[]) $<HTMLImageElement>(`portrait-${id}`).src = fighterFrame(id, 'idle0').toDataURL();
    $('loading').hidden = true; $<HTMLButtonElement>('start-btn').disabled = false; select(profile.selected); this.paint();
  }
  resetEffects() { this.particles = []; this.trauma = 0; this.cameras.main.setScroll(0, 0); }
  effect(e: Match['events'][number]) {
    if (e.type !== 'hit' && e.type !== 'block' && e.type !== 'land' && e.type !== 'special') return;
    if (e.type === 'hit' && !this.reduced) this.trauma = e.heavy ? 3 : 1.5;
    const color = e.type === 'block' ? 0x87cbbb : e.type === 'land' ? 0xc2b490 : 0xffd69a;
    const count = e.type === 'land' ? 5 : e.heavy ? 14 : 9;
    for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2; this.particles.push({ x: e.x, y: e.type === 'land' ? 210 : e.y, vx: Math.cos(angle) * (24 + i * 3), vy: Math.sin(angle) * 40 - 20, life: .23 + i % 3 * .06, color, size: i % 3 ? 2 : 3 }); }
  }
  ageEffects(dt: number) { this.trauma = Math.max(0, this.trauma - dt * 18); this.particles = this.particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 150 * dt; return p.life > 0; }); }
  paint() {
    this.shadows.clear(); this.fx.clear();
    this.cameras.main.setScroll(this.reduced ? 0 : Math.round(Math.sin(state.age * 90) * this.trauma), 0);
    state.fighters.forEach((f, i) => {
      let pose: Pose = Math.floor(state.age * 3) % 2 ? 'idle0' : 'idle1';
      if (f.walking) pose = Math.floor(state.age * 9) % 2 ? 'walk0' : 'walk1';
      if (f.y > 0) pose = 'jump';
      if (f.blocking) pose = 'block';
      if (f.move) { const spec = MOVES[f.move]; pose = f.elapsed < spec.startup ? 'windup' : f.elapsed < spec.startup + spec.active + .07 ? f.move : 'idle0'; }
      if (f.stun > 0 && !f.blocking) pose = 'hit';
      if (f.hp === 0) pose = 'down';
      else if ((state.mode === 'round' && state.roundWinner === i) || (state.mode === 'result' && state.winner === i)) pose = 'win';
      this.shadows.fillStyle(0x172d31, .65); this.shadows.fillEllipse(Math.round(f.x), 212, Math.max(15, 35 - f.y * .2), 7);
      this.sprites[i].setTexture(`${f.id}-${pose}`).setPosition(Math.round(f.x), Math.round(210 - f.y)).setFlipX(f.facing < 0).clearTint();
      if (f.stun > .16 && !f.blocking) this.sprites[i].setTint(0xffbf99);
      if (f.move === 'special' && f.elapsed < MOVES.special.startup) { this.fx.lineStyle(1, f.id === 'rook' ? 0xef854d : 0x87cbbb, .8); this.fx.strokeCircle(f.x + f.facing * 20, 180 - f.y, 5 + f.elapsed * 22); }
    });
    for (const shot of state.shots) {
      const color = state.fighters[shot.owner].id === 'rook' ? 0xef854d : 0x87cbbb;
      this.fx.fillStyle(color, .45); this.fx.fillRect(Math.round(shot.x - shot.dir * 16 - 6), 177, 22, 13);
      this.fx.fillStyle(color); this.fx.fillRect(Math.round(shot.x - 6), 174, 12, 20);
      this.fx.fillStyle(0xffe3b0); this.fx.fillRect(Math.round(shot.x - 3), 179, 6, 10);
    }
    for (const p of this.particles) { this.fx.fillStyle(p.color, Math.min(1, p.life * 5)); this.fx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
  }
  update(_time: number, delta: number) {
    if (document.hidden) return;
    if (!manual) { accumulator += Math.min(delta / 1000, .08); while (accumulator >= 1 / 60) { tick(1 / 60); accumulator -= 1 / 60; } }
    this.paint(); syncUI(); publish();
  }
}
const keyMap: Record<string, keyof Input> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump', ArrowUp: 'jump', KeyS: 'block', ArrowDown: 'block', KeyJ: 'punch', KeyK: 'kick', KeyL: 'special' };
document.addEventListener('keydown', e => {
  if ($<HTMLDialogElement>('help-dialog').open) return;
  if (e.code === 'KeyF') { if (!e.repeat) fullscreen(); e.preventDefault(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) pause(); e.preventDefault(); return; }
  if (state.mode !== 'fight') return;
  const action = keyMap[e.code]; if (action) { e.preventDefault(); held.set(e.code, action); document.querySelector(`[data-input=${action}]`)?.classList.add('pressed'); }
});
document.addEventListener('keyup', e => { const action = keyMap[e.code]; held.delete(e.code); if (action && ![...held.values()].includes(action)) document.querySelector(`[data-input=${action}]`)?.classList.remove('pressed'); });
document.querySelectorAll<HTMLButtonElement>('[data-input]').forEach(b => {
  b.addEventListener('pointerdown', e => { if (b.disabled || state.mode !== 'fight') return; e.preventDefault(); audio.unlock(); b.setPointerCapture(e.pointerId); held.set(`pointer-${e.pointerId}`, b.dataset.input as keyof Input); b.classList.add('pressed'); });
  const release = (e: PointerEvent) => { held.delete(`pointer-${e.pointerId}`); b.classList.remove('pressed'); };
  b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
});
document.querySelectorAll<HTMLButtonElement>('[data-fighter]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.play('ui'); select(b.dataset.fighter as FighterId); }));
$('start-btn').addEventListener('click', start);
$('continue-btn').addEventListener('click', () => { audio.unlock(); if (state.mode === 'paused') pause(); else if (state.mode === 'result') start(); else if (state.mode === 'round') { nextRound(state); clearInput(); scene?.resetEffects(); syncUI(); } });
$('select-btn').addEventListener('click', menu);
$('pause-btn').addEventListener('click', pause);
$('fullscreen-btn').addEventListener('click', fullscreen);
document.addEventListener('fullscreenchange', () => $('fullscreen-btn').textContent = document.fullscreenElement ? 'ВЫЙТИ ИЗ ЭКРАНА' : 'ПОЛНЫЙ ЭКРАН');
$('sound-btn').addEventListener('click', () => { audio.enabled = !audio.enabled; profile.sound = audio.enabled; audio.unlock(); save(); syncUI(); });
$('help-btn').addEventListener('click', () => { clearInput(); $<HTMLDialogElement>('help-dialog').showModal(); });
for (const id of ['close-help', 'help-done']) $(id).addEventListener('click', () => $<HTMLDialogElement>('help-dialog').close());
window.addEventListener('blur', () => { clearInput(); if (state.mode === 'fight' || state.mode === 'intro') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (state.mode === 'fight' || state.mode === 'intro') pause(); } });
installMobileRuntime();
registerEnhancedUpdate({ appName: 'AFTERHOURS ARENA', version: '0.1.0', releaseNotes: ['Первый ночной турнир: два бойца, блок, прыжки, спецприёмы и поединок до двух побед.'] });
try {
  new Phaser.Game({ type: Phaser.CANVAS, parent: 'engine-stage', width: 480, height: 270, backgroundColor: '#253b49', pixelArt: true, roundPixels: true, antialias: false, audio: { noAudio: true }, input: { keyboard: false }, scale: { mode: Phaser.Scale.NONE }, scene: ArenaScene });
} catch { $('loading').textContent = 'НЕ УДАЛОСЬ ЗАПУСТИТЬ АВТОМАТ. ОБНОВИ СТРАНИЦУ.'; }
