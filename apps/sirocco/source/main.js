import './styles.css';
import { SiroccoGame } from './game.js';

const canvas = document.querySelector('#render-canvas');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loading-text');
const loadingBar = document.querySelector('#loading-bar');
const enter = document.querySelector('#enter');
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

const game = new SiroccoGame(canvas);

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

async function boot() {
  try {
    updateOrientation();
    await game.init(report);
    qualitySelect.value = game.quality.mode;
    sensitivity.value = String(game.input.sensitivity);
    sound.checked = game.audio.enabled;
    loading.classList.add('done');
    setTimeout(() => { loading.hidden = true; }, 520);
    enter.hidden = false;
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorText.textContent = error instanceof Error ? error.message : String(error);
    errorScreen.hidden = false;
  }
}

enter.addEventListener('pointerdown', async () => {
  await game.audio.ensure();
  enter.classList.add('done');
  setTimeout(() => { enter.hidden = true; }, 300);
}, { once: true });
menuButton.addEventListener('click', openMenu);
resumeButton.addEventListener('click', closeMenu);
menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
qualitySelect.addEventListener('change', (e) => game.quality.setMode(e.target.value));
sensitivity.addEventListener('input', (e) => game.input.setSensitivity(e.target.value));
sound.addEventListener('change', (e) => game.audio.setEnabled(e.target.checked));
reloadButton.addEventListener('click', () => location.reload());
exitButton.addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = '../../'; });
window.addEventListener('orientationchange', updateOrientation);
window.addEventListener('resize', updateOrientation);

boot();
