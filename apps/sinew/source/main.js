import './styles.css';
import { installConstraintCombat } from './constraint-combat.js';
import { SinewGame } from './game.js';
import { installVisualPolish } from './visual-polish.js';

const storageNamespace = 'pocket-works:sinew';
const root = document.querySelector('#app');
const canvas = document.querySelector('#render-canvas');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loading-text');
const loadingBar = document.querySelector('#loading-bar');
const enter = document.querySelector('#enter');
const enterButton = document.querySelector('#enter-button');
const startExitButton = document.querySelector('#start-exit-button');
const rotate = document.querySelector('#rotate');
const menu = document.querySelector('#menu');
const menuButton = document.querySelector('#menu-button');
const resumeButton = document.querySelector('#resume-button');
const restartMenuButton = document.querySelector('#restart-menu-button');
const exitButton = document.querySelector('#exit-button');
const qualitySelect = document.querySelector('#quality-select');
const qualityLabel = document.querySelector('#quality-label');
const sensitivity = document.querySelector('#sensitivity');
const soundToggle = document.querySelector('#sound-toggle');
const playerHealth = document.querySelector('#player-health');
const enemyHealth = document.querySelector('#enemy-health');
const playerStability = document.querySelector('#player-stability');
const enemyStability = document.querySelector('#enemy-stability');
const result = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const resultDetail = document.querySelector('#result-detail');
const record = document.querySelector('#record');
const restartButton = document.querySelector('#restart-button');
const resultExitButton = document.querySelector('#result-exit-button');
const errorScreen = document.querySelector('#error-screen');
const errorText = document.querySelector('#error-text');
const reloadButton = document.querySelector('#reload-button');
const errorExitButton = document.querySelector('#error-exit-button');

const game = new SinewGame(canvas, root, storageNamespace);
let entered = false;

function report(text, progress) { loadingText.textContent = text; loadingBar.style.transform = `scaleX(${progress})`; }
function exitToLauncher() { game.saveSession(); if (history.length > 1) history.back(); else location.href = '../../'; }
function updateOrientation() { const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; const blocked = coarse && window.innerHeight > window.innerWidth; rotate.hidden = !blocked; game.setOrientationBlocked(blocked); }
function openMenu() { if (!entered || game.ended) return; game.setPaused(true); menu.hidden = false; }
function closeMenu() { menu.hidden = true; if (entered && !game.ended) game.setPaused(false); }
function updateHud(state) { playerHealth.style.transform = `scaleX(${Math.max(0, state.playerHealth) / 100})`; enemyHealth.style.transform = `scaleX(${Math.max(0, state.enemyHealth) / 100})`; playerStability.style.transform = `scaleX(${Math.max(0, state.playerStability) / 100})`; enemyStability.style.transform = `scaleX(${Math.max(0, state.enemyStability) / 100})`; }
function unlockAudio() { if (!entered || !game.audio?.enabled) return; void game.audio.ensure().catch((error) => console.warn('[SINEW] audio unlock failed; continuing silently', error)); }

async function boot() {
  try {
    updateOrientation();
    await game.init(report);
    installConstraintCombat(game);
    installVisualPolish(game);
    game.setPaused(true);
    game.onState = updateHud;
    game.onQuality = (mode, effective) => { qualityLabel.textContent = `${mode.toUpperCase()} · ${effective[0].toUpperCase()}${effective.slice(1)}`; };
    game.onMatchEnd = ({ result: outcome, stats }) => {
      menu.hidden = true; result.hidden = false; result.dataset.outcome = outcome; resultTitle.textContent = outcome === 'victory' ? 'Победа' : 'Поражение';
      resultDetail.textContent = outcome === 'victory' ? 'Ты провёл клинок через реальную защиту противника.' : 'Противник нашёл брешь. Щит был не там, где прошёл клинок.';
      record.textContent = `${stats.wins} побед · ${stats.losses} поражений`;
    };
    qualitySelect.value = game.quality.mode; qualityLabel.textContent = `${game.quality.mode.toUpperCase()} · ${game.quality.effective[0].toUpperCase()}${game.quality.effective.slice(1)}`;
    sensitivity.value = String(game.input.sensitivity); soundToggle.checked = game.audio.enabled; updateHud(game.getState()); loading.classList.add('done'); setTimeout(() => { loading.hidden = true; enter.hidden = false; }, 420);
  } catch (error) {
    console.error('[SINEW] boot failed', error); loading.hidden = true; errorText.textContent = error instanceof Error ? error.message : String(error); errorScreen.hidden = false;
  }
}

enterButton.addEventListener('pointerdown', (event) => { event.preventDefault(); entered = true; unlockAudio(); game.setPaused(false); enter.classList.add('done'); setTimeout(() => { enter.hidden = true; }, 220); }, { once: true });
root.addEventListener('pointerdown', unlockAudio, { passive: true });
startExitButton.addEventListener('click', exitToLauncher);
menuButton.addEventListener('click', openMenu);
resumeButton.addEventListener('click', closeMenu);
menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
restartMenuButton.addEventListener('click', () => { result.hidden = true; menu.hidden = true; game.restart(); });
exitButton.addEventListener('click', exitToLauncher);
qualitySelect.addEventListener('change', (event) => game.quality.setMode(event.target.value));
sensitivity.addEventListener('input', (event) => game.input.setSensitivity(event.target.value));
soundToggle.addEventListener('change', async (event) => { game.audio.setEnabled(event.target.checked); if (event.target.checked) await game.audio.ensure().catch(() => {}); });
restartButton.addEventListener('click', () => { result.hidden = true; game.restart(); });
resultExitButton.addEventListener('click', exitToLauncher);
reloadButton.addEventListener('click', () => location.reload());
errorExitButton.addEventListener('click', exitToLauncher);
window.addEventListener('orientationchange', updateOrientation);
window.addEventListener('resize', updateOrientation);
window.addEventListener('pagehide', () => game.saveSession());

boot();
