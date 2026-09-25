import { MeltCryptGame } from './game.js';


const root = document.querySelector('#app');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loading-text');
const loadingBar = document.querySelector('#loading-bar');

const game = new MeltCryptGame(root);

function report(text, progress) {
  loadingText.textContent = text;
  loadingBar.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
}

async function boot() {
  try {
    await game.init(report);
    if (!loading.hidden) {
      loading.classList.add('done');
      setTimeout(() => { loading.hidden = true; }, 360);
    }
  } catch (error) {
    loading.hidden = true;
    game.showError(error);
  }
}

boot();
