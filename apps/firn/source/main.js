import './styles.css';
import { FirnGame } from './game.js';

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
const exitButton = document.querySelector('#exit-button');
const qualitySelect = document.querySelector('#quality-select');
const sensitivity = document.querySelector('#sensitivity');
const sound = document.querySelector('#sound-toggle');
const errorScreen = document.querySelector('#error-screen');
const errorText = document.querySelector('#error-text');
const reloadButton = document.querySelector('#reload-button');
const errorExitButton = document.querySelector('#error-exit-button');

const game = new FirnGame(canvas);

function report(text, progress) {
  loadingText.textContent = text;
  loadingBar.style.transform = `scaleX(${progress})`;
}
function updateOrientation() {
  const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const blocked = coarse && window.innerHeight > window.innerWidth;
  rotate.hidden = !blocked;
  game.setOrientationBlocked(blocked);
}
function openMenu() { game.setPaused(true); menu.hidden = false; }
function closeMenu() { menu.hidden = true; game.setPaused(false); }
function exitToLauncher() {
  game.saveSession();
  if (history.length > 1) history.back(); else location.href = '../../';
}

async function boot() {
  try {
    updateOrientation();
    await game.init(report);
    game.setPaused(true);
    qualitySelect.value = game.quality.mode;
    sensitivity.value = String(game.input.sensitivity);
    sound.checked = game.audio.enabled;
    loading.classList.add('done');
    setTimeout(() => { loading.hidden = true; }, 460);
    enter.hidden = false;
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorText.textContent = error instanceof Error ? error.message : String(error);
    errorScreen.hidden = false;
  }
}

enterButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  game.setPaused(false);
  enter.classList.add('done');
  setTimeout(() => { enter.hidden = true; }, 220);
  void game.audio.ensure().catch((error) => console.warn('[FIRN] Audio unlock failed; continuing silently.', error));
}, { once: true });
startExitButton.addEventListener('click', exitToLauncher);
menuButton.addEventListener('click', openMenu);
resumeButton.addEventListener('click', closeMenu);
menu.addEventListener('click', (event) => { if (event.target === menu) closeMenu(); });
qualitySelect.addEventListener('change', (event) => game.quality.setMode(event.target.value));
sensitivity.addEventListener('input', (event) => game.input.setSensitivity(event.target.value));
sound.addEventListener('change', (event) => game.audio.setEnabled(event.target.checked));
reloadButton.addEventListener('click', () => location.reload());
errorExitButton.addEventListener('click', exitToLauncher);
exitButton.addEventListener('click', exitToLauncher);
window.addEventListener('orientationchange', updateOrientation);
window.addEventListener('resize', updateOrientation);

boot();
