import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { audio, createDeadAirGame, inputState } from './game';
import { STAGES, stageById } from './content';
import { clearSave, loadSave, persistSave, recordDeath, recordStage } from './save';
import type { SaveState, StageStats } from './types';

const VERSION = '1.0.0';
const RELEASE_NOTES = [
  'Полная кампания с постепенным ростом сложности и авторскими босс-боями.',
  'Горизонтальное мобильное управление, автоматическая стрельба, рывок, парирование и специальные атаки.',
  'Рейтинги, повторные испытания, локальный прогресс и офлайн PWA.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName: 'DEAD AIR // 13', version: VERSION, releaseNotes: RELEASE_NOTES });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bootScreen = $('bootScreen');
const bootStatus = $('bootStatus');
const menuScreen = $('menuScreen');
const selectScreen = $('selectScreen');
const hud = $('hud');
const pauseScreen = $('pauseScreen');
const resultScreen = $('resultScreen');
const errorScreen = $('errorScreen');

const continueButton = $<HTMLButtonElement>('continueButton');
const continueMeta = $('continueMeta');
const selectButton = $<HTMLButtonElement>('selectButton');
const challengeButton = $<HTMLButtonElement>('challengeButton');
const challengeMeta = $('challengeMeta');
const soundButton = $<HTMLButtonElement>('soundButton');
const pauseSoundButton = $<HTMLButtonElement>('pauseSoundButton');
const channelGrid = $('channelGrid');
const archiveProgress = $('archiveProgress');
const stageLabel = $('stageLabel');
const stageName = $('stageName');
const hpBar = $('hpBar');
const hpValue = $('hpValue');
const signalBar = $('signalBar');
const signalValue = $('signalValue');
const specialPips = $('specialPips');
const movePad = $('movePad');
const moveThumb = $('moveThumb');
const dashButton = $<HTMLButtonElement>('dashButton');
const jumpButton = $<HTMLButtonElement>('jumpButton');
const specialButton = $<HTMLButtonElement>('specialButton');
const resultGrade = $('resultGrade');
const resultTitle = $('resultTitle');
const resultTime = $('resultTime');
const resultDamage = $('resultDamage');
const resultParries = $('resultParries');
const resultScore = $('resultScore');
const nextButton = $<HTMLButtonElement>('nextButton');

let save: SaveState = loadSave();
let currentStage = save.lastStage;
let currentMode: 'campaign'|'archive'|'encore' = 'campaign';
let controller: ReturnType<typeof createDeadAirGame> | null = null;
let activePointer: number | null = null;
let padStartX = 0;
let currentStats: StageStats | null = null;

audio.setEnabled(save.sound);

function hideAll() {
  menuScreen.hidden = true;
  selectScreen.hidden = true;
  hud.hidden = true;
  pauseScreen.hidden = true;
  resultScreen.hidden = true;
  errorScreen.hidden = true;
}

function syncSoundLabels() {
  const text = save.sound ? 'ЗВУК · ВКЛ' : 'ЗВУК · ВЫКЛ';
  soundButton.textContent = text;
  pauseSoundButton.textContent = text;
}

function toggleSound() {
  save.sound = !save.sound;
  persistSave(save);
  audio.setEnabled(save.sound);
  void audio.unlock();
  audio.ui();
  syncSoundLabels();
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function renderMenu() {
  currentStage = Math.max(1, Math.min(13, save.lastStage || 1));
  continueMeta.textContent = save.completed.length
    ? `${stageById(currentStage).code} · ${save.completed.length}/13 завершено`
    : 'Новый эфир';
  challengeButton.disabled = !save.campaignComplete;
  challengeMeta.textContent = save.campaignComplete
    ? `Encore · ${save.encoreClears % 13}/13 · циклов ${Math.floor(save.encoreClears / 13)}`
    : 'Закрыто до прохождения';
  syncSoundLabels();
}

function renderArchive() {
  archiveProgress.textContent = `${save.completed.length} / 13`;
  channelGrid.replaceChildren();
  for (const stage of STAGES) {
    const unlocked = stage.id <= save.unlockedStage;
    const completed = save.completed.includes(stage.id);
    const best = save.best[String(stage.id)];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'channel-tile';
    button.dataset.nativePress = '';
    button.disabled = !unlocked;
    button.innerHTML = unlocked
      ? `<span>${stage.code}</span><strong>${stage.name}</strong><small>${completed ? `BEST ${best?.grade ?? '—'} · ${best?.score ?? 0}` : 'НЕ ПРОЙДЕНО'}</small>`
      : `<span>CH ${String(stage.id).padStart(2,'0')}</span><strong>NO SIGNAL</strong><small>ЗАКРЫТО</small>`;
    if (completed) button.classList.add('is-complete');
    button.addEventListener('click', () => {
      if (!unlocked) return;
      void audio.unlock();
      audio.ui();
      startStage(stage.id, completed ? 'archive' : 'campaign');
    });
    channelGrid.append(button);
  }
}

function showMenu() {
  controller?.quit();
  hideAll();
  menuScreen.hidden = false;
  currentStats = null;
  renderMenu();
}

function showArchive() {
  controller?.quit();
  hideAll();
  selectScreen.hidden = false;
  renderArchive();
}

function startStage(stageId: number, mode: 'campaign'|'archive'|'encore' = 'campaign') {
  if (!controller) return;
  currentStage = stageId;
  currentMode = mode;
  hideAll();
  hud.hidden = false;
  stageLabel.textContent = mode === 'encore' ? 'ENCORE' : stageById(stageId).code;
  stageName.textContent = mode === 'encore' ? 'UNSTABLE ARCHIVE' : stageById(stageId).name;
  void audio.unlock();
  controller.startStage(stageId, mode, mode === 'encore' ? save.encoreClears : undefined);
}

function showResult(stats: StageStats) {
  hideAll();
  resultScreen.hidden = false;
  resultGrade.textContent = stats.grade;
  resultTitle.textContent = stats.stageId === 13 && stats.mode === 'campaign' ? 'Эфир завершён' : 'Передача закрыта';
  resultTime.textContent = formatTime(stats.elapsedMs);
  resultDamage.textContent = String(stats.damageTaken);
  resultParries.textContent = String(stats.parries);
  resultScore.textContent = String(stats.score);
  nextButton.textContent = stats.mode === 'campaign' && stats.stageId < 13 ? 'СЛЕДУЮЩИЙ КАНАЛ' : stats.mode === 'encore' ? 'СЛЕДУЮЩИЙ ENCORE' : 'В АРХИВ';
}

continueButton.addEventListener('click', () => {
  audio.ui();
  startStage(currentStage, save.completed.includes(currentStage) ? 'archive' : 'campaign');
});
selectButton.addEventListener('click', () => { audio.ui(); showArchive(); });
$('selectBack').addEventListener('click', () => { audio.ui(); showMenu(); });
challengeButton.addEventListener('click', () => {
  if (!save.campaignComplete) return;
  audio.ui();
  const stage = 1 + (save.encoreClears % 13);
  startStage(stage, 'encore');
});
soundButton.addEventListener('click', toggleSound);
pauseSoundButton.addEventListener('click', toggleSound);

$('pauseButton').addEventListener('click', () => {
  controller?.pause();
  pauseScreen.hidden = false;
  audio.ui();
});
$('resumeButton').addEventListener('click', () => {
  pauseScreen.hidden = true;
  controller?.resume();
  audio.ui();
});
$('restartButton').addEventListener('click', () => {
  pauseScreen.hidden = true;
  audio.ui();
  controller?.restart();
});
$('quitButton').addEventListener('click', () => { audio.ui(); showMenu(); });
$('retryButton').addEventListener('click', () => {
  if (!currentStats) return;
  audio.ui();
  startStage(currentStats.stageId, currentStats.mode);
});
$('resultMenuButton').addEventListener('click', () => { audio.ui(); showArchive(); });
nextButton.addEventListener('click', () => {
  if (!currentStats) return;
  audio.ui();
  if (currentStats.mode === 'campaign' && currentStats.stageId < 13) startStage(currentStats.stageId + 1, 'campaign');
  else if (currentStats.mode === 'encore') startStage(1 + (save.encoreClears % 13), 'encore');
  else showArchive();
});
$('errorRetry').addEventListener('click', () => location.reload());

function queueButton(button: HTMLButtonElement, key: 'jumpQueued'|'dashQueued'|'specialQueued') {
  const down = (event: PointerEvent) => {
    event.preventDefault();
    inputState[key] = true;
    button.classList.add('is-pressed');
    void audio.unlock();
  };
  const up = () => button.classList.remove('is-pressed');
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
}
queueButton(jumpButton, 'jumpQueued');
queueButton(dashButton, 'dashQueued');
queueButton(specialButton, 'specialQueued');

movePad.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  activePointer = event.pointerId;
  padStartX = event.clientX;
  movePad.setPointerCapture(event.pointerId);
  movePad.classList.add('is-active');
});
movePad.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  const rect = movePad.getBoundingClientRect();
  const max = Math.max(46, rect.width * 0.32);
  const dx = Math.max(-max, Math.min(max, event.clientX - padStartX));
  inputState.axis = dx / max;
  moveThumb.style.transform = `translateX(${dx}px)`;
});
const releasePad = (event?: PointerEvent) => {
  if (event && activePointer !== null && event.pointerId !== activePointer) return;
  activePointer = null;
  inputState.axis = 0;
  moveThumb.style.transform = 'translateX(0)';
  movePad.classList.remove('is-active');
};
movePad.addEventListener('pointerup', releasePad);
movePad.addEventListener('pointercancel', releasePad);
movePad.addEventListener('lostpointercapture', releasePad);

window.addEventListener('dead-air:started', ((event: CustomEvent) => {
  const stage = event.detail.stage;
  stageLabel.textContent = currentMode === 'encore' ? 'ENCORE' : stage.code;
  stageName.textContent = currentMode === 'encore' ? 'UNSTABLE ARCHIVE' : stage.name;
}) as EventListener);

window.addEventListener('dead-air:hud', ((event: CustomEvent) => {
  const detail = event.detail;
  hpBar.style.transform = `scaleX(${Math.max(0, detail.hp/detail.maxHp)})`;
  hpValue.textContent = String(detail.hp);
  signalBar.style.transform = `scaleX(${Math.max(0, detail.signal/detail.maxSignal)})`;
  signalValue.textContent = String(detail.signal);
  specialPips.textContent = '●'.repeat(detail.signal) + '○'.repeat(Math.max(0, detail.maxSignal-detail.signal));
  specialButton.classList.toggle('is-ready', detail.signal > 0);
}) as EventListener);

window.addEventListener('dead-air:death', (() => {
  save = recordDeath(save);
  if (navigator.vibrate) navigator.vibrate(24);
}) as EventListener);

window.addEventListener('dead-air:haptic', (() => {
  if (navigator.vibrate) navigator.vibrate(18);
}) as EventListener);

window.addEventListener('dead-air:complete', ((event: CustomEvent<StageStats>) => {
  currentStats = event.detail;
  save = recordStage(save, event.detail);
  if (navigator.vibrate) navigator.vibrate([20, 35, 20]);
  setTimeout(() => showResult(event.detail), 760);
}) as EventListener);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !hud.hidden) {
    controller?.pause();
    pauseScreen.hidden = false;
  }
});

window.addEventListener('appdatareset', () => {
  save = clearSave();
  renderMenu();
  renderArchive();
});

createWorkshopMode({
  appName: 'DEAD AIR // 13',
  version: VERSION,
  cachePrefix: 'dead-air-13-',
  storageNamespace: 'pocket-works:dead-air-13',
  onReset: () => {
    save = clearSave();
    renderMenu();
  }
});

async function boot() {
  try {
    bootStatus.textContent = 'Настройка эфирного тракта…';
    controller = createDeadAirGame('gameMount');
    controller.quit();
    renderMenu();
    await new Promise((resolve) => setTimeout(resolve, 180));
    bootScreen.classList.add('is-gone');
    setTimeout(() => {
      bootScreen.hidden = true;
      menuScreen.hidden = false;
    }, 280);
  } catch (error) {
    console.error(error);
    hideAll();
    errorScreen.hidden = false;
    $('errorText').textContent = error instanceof Error ? error.message : 'Неизвестная ошибка WebGL.';
  }
}

void boot();
