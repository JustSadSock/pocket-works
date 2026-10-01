import '../../../shared/mobile-runtime.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { registerSW } from 'virtual:pwa-register';
import { audio } from './audio';
import { clampPercent, hasProgress, healthPercent } from './core';
import { ITEMS } from './content';
import { createThirdOathGame, inputState, type DialogueView } from './game';
import { clearSave, freshSave, loadSave, persistSave, type GameMode, type SaveState } from './state';

const VERSION = '0.2.0';
const RELEASE_NOTES = [
  'Глава II: старая башня, колокольный ярус, реестр имён и встреча с Элином.',
  'Новые противники: Безгласные, дальнобойные Смотрящие и Носитель печати.',
  'Три решения судьбы башенной печати с последствиями старых проверок и найденного письма.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName: 'Третья клятва', version: VERSION, releaseNotes: RELEASE_NOTES });
registerSW({ immediate: true });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bootScreen = $('bootScreen');
const gameScreen = $('gameScreen');
const gameRoot = $('gameRoot');
const continueButton = $<HTMLButtonElement>('continueButton');
const continueLabel = $('continueLabel');
const continueMeta = $('continueMeta');
const newGameButton = $<HTMLButtonElement>('newGameButton');
const soundButton = $<HTMLButtonElement>('soundButton');
const pauseSoundButton = $<HTMLButtonElement>('pauseSoundButton');
const pauseScreen = $('pauseScreen');
const deathScreen = $('deathScreen');
const completeScreen = $('completeScreen');
const dialoguePanel = $('dialoguePanel');
const dialogueText = $('dialogueText');
const speakerName = $('speakerName');
const dialogueOptions = $('dialogueOptions');
const ritualOverlay = $('ritualOverlay');
const ritualText = $('ritualText');
const healthBar = $('healthBar');
const healthText = $('healthText');
const resolveBar = $('resolveBar');
const bossStatus = $('bossStatus');
const bossBar = $('bossBar');
const prompt = $('prompt');
const promptText = $('promptText');
const interactButton = $<HTMLButtonElement>('interactButton');
const zoneTitle = $('zoneTitle');
const zoneName = $('zoneName');
const zoneKicker = $('zoneKicker');
const toast = $('toast');
const movePad = $('movePad');
const moveThumb = $('moveThumb');
const attackButton = $<HTMLButtonElement>('attackButton');
const guardButton = $<HTMLButtonElement>('guardButton');
const abilityButton = $<HTMLButtonElement>('abilityButton');
const inventoryList = $('inventoryList');
const objectiveText = $('objectiveText');
const completeKicker = $('completeKicker');
const completeTitle = $('completeTitle');
const completeCopy = $('completeCopy');
const continueAfterButton = $<HTMLButtonElement>('continueAfterButton');

let save: SaveState = loadSave();
let controller: ReturnType<typeof createThirdOathGame> | null = null;
let activePadPointer: number | null = null;
let zoneTimer = 0;
let toastTimer = 0;
let currentMode: GameMode = 'menu';

audio.setEnabled(save.sound);

function updateSoundLabels() {
  const label = save.sound ? 'Звук · вкл' : 'Звук · выкл';
  soundButton.textContent = label;
  pauseSoundButton.textContent = label;
}

function syncMenu() {
  updateSoundLabels();
  const progressed = hasProgress(save.flags, save.inventory, save.playSeconds);
  continueLabel.textContent = progressed ? 'ПРОДОЛЖИТЬ' : 'ВОЙТИ В КАПЕЛЛУ';
  if (save.completed) continueMeta.textContent = 'Глава II завершена · вернуться к печати';
  else if (save.chapter >= 2) continueMeta.textContent = 'Глава II · Старая башня';
  else if (progressed) continueMeta.textContent = 'Продолжить с последнего места';
  else continueMeta.textContent = 'Новая игра';
  newGameButton.hidden = !progressed;
}

function resetInputs() {
  inputState.moveX = 0;
  inputState.moveY = 0;
  inputState.attackPressed = false;
  inputState.attackHeld = false;
  inputState.guardHeld = false;
  inputState.abilityPressed = false;
  inputState.interactPressed = false;
  activePadPointer = null;
  moveThumb.style.transform = 'translate3d(0,0,0)';
}

function renderHud(health: number, maxHealth: number, resolve: number, combat: boolean, bossHealth: number, bossMaxHealth: number) {
  healthBar.style.width = String(healthPercent(health, maxHealth)) + '%';
  healthText.textContent = String(health) + ' / ' + String(maxHealth);
  resolveBar.style.width = String(clampPercent(resolve)) + '%';
  const bossVisible = bossMaxHealth > 0 && bossHealth > 0;
  bossStatus.hidden = !bossVisible;
  bossBar.style.width = String(bossVisible ? healthPercent(bossHealth, bossMaxHealth) : 0) + '%';
  document.body.classList.toggle('in-combat', combat);
}

function renderJournal() {
  inventoryList.replaceChildren();
  const catalog = Object.values(ITEMS) as Array<{ id: string; name: string; note: string }>;
  const found = save.inventory
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is { id: string; name: string; note: string } => Boolean(item));

  if (found.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'journal-empty';
    empty.textContent = 'Пока ничего.';
    inventoryList.append(empty);
  } else {
    for (const item of found) {
      const row = document.createElement('div');
      row.className = 'journal-item';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const note = document.createElement('small');
      note.textContent = item.note;
      row.append(name, note);
      inventoryList.append(row);
    }
  }

  if (!save.flags.secretDoorOpen) objectiveText.textContent = 'Осмотреть капеллу. Под алтарём тянет холодом.';
  else if (!save.flags.cryptWardenDefeated) objectiveText.textContent = 'Спуститься в крипту и найти путь глубже.';
  else if (!save.flags.oathPlaced || !save.flags.tearPlaced) objectiveText.textContent = 'Вернуться к трём пьедесталам внизу.';
  else if (!save.flags.hallAwakened) objectiveText.textContent = 'Подождать ответа Зала Клятв.';
  else if (!save.flags.chapter1Complete) objectiveText.textContent = 'Босые следы ведут к старой башне.';
  else if (!save.flags.bellFightCleared) objectiveText.textContent = 'Подняться к разбитому колоколу.';
  else if (!save.flags.archiveExamined) objectiveText.textContent = 'Найти реестр имён выше колокольного яруса.';
  else if (!save.flags.sealChoiceMade) objectiveText.textContent = 'Подойти к Элину у башенной печати.';
  else if (!save.flags.towerGuardianDefeated) objectiveText.textContent = 'Пережить ответ печати.';
  else if (!save.completed) objectiveText.textContent = 'Послушать, что осталось после Носителя.';
  else objectiveText.textContent = 'Глава II завершена.';
}

function showPrompt(label: string | null) {
  const visible = Boolean(label) && currentMode !== 'dialogue' && currentMode !== 'cutscene';
  prompt.hidden = !visible;
  interactButton.hidden = !visible;
  if (label) promptText.textContent = label;
}

function showDialogue(view: DialogueView | null) {
  if (!view) {
    dialoguePanel.hidden = true;
    document.body.classList.remove('dialogue-open');
    return;
  }
  speakerName.textContent = view.speaker;
  dialogueText.textContent = view.text;
  dialogueOptions.replaceChildren();
  for (const option of view.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dialogue-option';
    button.dataset.nativePress = '';
    if (option.label.startsWith('[')) button.classList.add('skill-option');
    button.textContent = option.label;
    button.addEventListener('click', () => controller?.chooseDialogue(option.id), { once: true });
    dialogueOptions.append(button);
  }
  dialoguePanel.hidden = false;
  document.body.classList.add('dialogue-open');
}

function showZone(name: string, kicker: string) {
  zoneName.textContent = name;
  zoneKicker.textContent = kicker;
  zoneTitle.hidden = false;
  zoneTitle.classList.remove('show');
  requestAnimationFrame(() => zoneTitle.classList.add('show'));
  window.clearTimeout(zoneTimer);
  zoneTimer = window.setTimeout(() => {
    zoneTitle.classList.remove('show');
    window.setTimeout(() => { zoneTitle.hidden = true; }, 420);
  }, 2300);
}

function showToast(text: string) {
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.remove('show');
  requestAnimationFrame(() => toast.classList.add('show'));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => { toast.hidden = true; }, 260);
  }, 1600);
}

function showRitual(text: string | null) {
  if (!text) {
    ritualOverlay.classList.remove('show');
    window.setTimeout(() => { ritualOverlay.hidden = true; }, 360);
    return;
  }
  ritualText.textContent = text;
  ritualOverlay.hidden = false;
  ritualOverlay.classList.remove('show');
  requestAnimationFrame(() => ritualOverlay.classList.add('show'));
}

function createController() {
  controller?.destroy();
  gameRoot.replaceChildren();
  controller = createThirdOathGame(gameRoot, save, {
    onHud: renderHud,
    onPrompt: showPrompt,
    onDialogue: showDialogue,
    onZone: showZone,
    onToast: showToast,
    onRitual: showRitual,
    onMode: (mode) => {
      currentMode = mode;
      document.body.dataset.gameMode = mode;
      if (mode !== 'dialogue') document.body.classList.remove('dialogue-open');
    },
    onDeath: () => {
      resetInputs();
      deathScreen.hidden = false;
    },
    onComplete: () => {
      resetInputs();
      completeKicker.textContent = 'ГЛАВА II · ИМЯ';
      if (save.flags.sealChoiceCut) {
        completeTitle.textContent = 'Две строки исчезли.';
        completeCopy.textContent = 'Башня осталась стоять, но больше не знает ни тебя, ни Элина.';
      } else if (save.flags.sealChoiceBind) {
        completeTitle.textContent = 'Печать сохранена.';
        completeCopy.textContent = 'Имена остались внутри. Элин ушёл раньше, чем ты успел обернуться.';
      } else {
        completeTitle.textContent = 'Имена вышли наружу.';
        completeCopy.textContent = 'Камень молчит. Впервые за много лет башня никого не помнит.';
      }
      continueAfterButton.textContent = 'Вернуться к печати';
      completeScreen.hidden = false;
    },
    onSave: (next) => { save = next; if (!pauseScreen.hidden) renderJournal(); }
  });
}

async function startGame() {
  await audio.unlock();
  bootScreen.hidden = true;
  gameScreen.hidden = false;
  pauseScreen.hidden = true;
  deathScreen.hidden = true;
  completeScreen.hidden = true;
  dialoguePanel.hidden = true;
  ritualOverlay.hidden = true;
  createController();
}

function showMenu() {
  resetInputs();
  controller?.saveNow();
  controller?.destroy();
  controller = null;
  currentMode = 'menu';
  document.body.dataset.gameMode = 'menu';
  gameScreen.hidden = true;
  bootScreen.hidden = false;
  pauseScreen.hidden = true;
  deathScreen.hidden = true;
  completeScreen.hidden = true;
  syncMenu();
}

function toggleSound() {
  save.sound = !save.sound;
  persistSave(save);
  audio.setEnabled(save.sound);
  if (save.sound) void audio.unlock();
  audio.ui();
  updateSoundLabels();
}

continueButton.addEventListener('click', () => { audio.ui(); void startGame(); });
newGameButton.addEventListener('click', () => {
  clearSave();
  save = freshSave();
  audio.setEnabled(save.sound);
  syncMenu();
  audio.ui();
  void startGame();
});
soundButton.addEventListener('click', toggleSound);
pauseSoundButton.addEventListener('click', toggleSound);

$('pauseButton').addEventListener('click', () => {
  controller?.saveNow();
  controller?.pause();
  resetInputs();
  renderJournal();
  pauseScreen.hidden = false;
  audio.ui();
});
$('resumeButton').addEventListener('click', () => {
  pauseScreen.hidden = true;
  controller?.resume();
  audio.ui();
});
$('quitButton').addEventListener('click', () => { audio.ui(); showMenu(); });
$('retryButton').addEventListener('click', () => {
  deathScreen.hidden = true;
  audio.ui();
  controller?.restartFromCheckpoint();
});
$('deathMenuButton').addEventListener('click', () => { audio.ui(); showMenu(); });
continueAfterButton.addEventListener('click', () => {
  completeScreen.hidden = true;
  controller?.resumeAfterComplete();
  audio.ui();
});
$('completeMenuButton').addEventListener('click', () => { audio.ui(); showMenu(); });

function updatePad(clientX: number, clientY: number) {
  const rect = movePad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = Math.max(34, rect.width * .31);
  const len = Math.hypot(dx, dy);
  if (len > max) {
    dx = dx / len * max;
    dy = dy / len * max;
  }
  inputState.moveX = dx / max;
  inputState.moveY = dy / max;
  moveThumb.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
}

movePad.addEventListener('pointerdown', (event) => {
  if (activePadPointer !== null) return;
  activePadPointer = event.pointerId;
  movePad.setPointerCapture(event.pointerId);
  updatePad(event.clientX, event.clientY);
  void audio.unlock();
  event.preventDefault();
});
movePad.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePadPointer) return;
  updatePad(event.clientX, event.clientY);
  event.preventDefault();
});
const endPad = (event: PointerEvent) => {
  if (event.pointerId !== activePadPointer) return;
  activePadPointer = null;
  inputState.moveX = 0;
  inputState.moveY = 0;
  moveThumb.style.transform = 'translate3d(0,0,0)';
};
movePad.addEventListener('pointerup', endPad);
movePad.addEventListener('pointercancel', endPad);
movePad.addEventListener('lostpointercapture', endPad);

attackButton.addEventListener('pointerdown', (event) => {
  void audio.unlock();
  inputState.attackPressed = true;
  inputState.attackHeld = true;
  attackButton.setPointerCapture(event.pointerId);
  event.preventDefault();
});
const endAttack = () => { inputState.attackHeld = false; };
attackButton.addEventListener('pointerup', endAttack);
attackButton.addEventListener('pointercancel', endAttack);
attackButton.addEventListener('lostpointercapture', endAttack);

guardButton.addEventListener('pointerdown', (event) => {
  void audio.unlock();
  inputState.guardHeld = true;
  inputState.guardPressedAt = performance.now();
  guardButton.setPointerCapture(event.pointerId);
  event.preventDefault();
});
const endGuard = () => { inputState.guardHeld = false; };
guardButton.addEventListener('pointerup', endGuard);
guardButton.addEventListener('pointercancel', endGuard);
guardButton.addEventListener('lostpointercapture', endGuard);

abilityButton.addEventListener('pointerdown', (event) => {
  void audio.unlock();
  inputState.abilityPressed = true;
  event.preventDefault();
});
interactButton.addEventListener('pointerdown', (event) => {
  inputState.interactPressed = true;
  event.preventDefault();
});

window.addEventListener('blur', resetInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controller?.saveNow();
    resetInputs();
    if (gameScreen.hidden === false && pauseScreen.hidden === true && currentMode !== 'complete' && currentMode !== 'dead') {
      controller?.pause();
      pauseScreen.hidden = false;
    }
  }
});

syncMenu();
