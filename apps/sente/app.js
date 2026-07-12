// Pocket Works capability anchors: cachePrefix: 'sente-'; storageNamespace: 'pocket-works:sente'.
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  BLACK,
  WHITE,
  EMPTY,
  boardAt,
  colorName,
  createGame,
  finishScoring,
  getGroup,
  hydrateGame,
  inspectMove,
  passTurn as basePassTurn,
  playMove,
  resignGame,
  resumeFromScoring,
  scoreGame,
  serializeGame,
  toSgf,
  toggleDeadGroup,
  undo
} from './go-engine.js';
import { aiLabel, chooseAiMove } from './ai.js';
import { suggestDeadGroups } from './dead-groups.js';

const passTurn = (game) => {
  const result = basePassTurn(game);
  if (result.scoring) {
    game.dead = suggestDeadGroups(game);
    const suggested = game.dead.length;
    window.setTimeout(() => {
      if (!suggested || game.phase !== 'scoring') return;
      const message = document.querySelector('#boardMessage');
      if (!message) return;
      message.textContent = `Предварительно отмечено камней: ${suggested}. Нажмите на группу, если SENTE ошибся.`;
      message.classList.add('show');
      window.setTimeout(() => message.classList.remove('show'), 2600);
    }, 240);
  }
  return result;
};

const chunkUrls = ['./runtime-1.txt', './runtime-2.txt', './runtime-3.txt', './runtime-4.txt'];

function readBoardPreferences() {
  try {
    const state = JSON.parse(localStorage.getItem('pocket-works:sente:state:v1') || 'null');
    return {
      size: Number(state?.current?.size || state?.settings?.size || 9),
      coordinates: Boolean(state?.settings?.coordinates)
    };
  } catch {
    return { size: 9, coordinates: false };
  }
}

function installLiveLoupe() {
  const frame = document.querySelector('#boardFrame');
  const board = document.querySelector('#board');
  const loupe = document.querySelector('#loupe');
  const loupeCanvas = document.querySelector('#loupeCanvas');
  if (!frame || !board || !loupe || !loupeCanvas) return;

  loupe.style.width = '108px';
  loupe.style.height = '108px';
  loupe.style.borderWidth = '4px';
  loupe.style.background = '#d9b778';

  const context = loupeCanvas.getContext('2d');
  let preferences = readBoardPreferences();
  let pending = 0;
  let lastPoint = null;

  const draw = () => {
    pending = 0;
    if (!lastPoint || !loupe.classList.contains('visible') || !board.width || !board.height) return;

    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const size = [9, 13, 19].includes(preferences.size) ? preferences.size : 9;
    const margin = preferences.coordinates ? 28 : 18;
    const side = Math.min(rect.width, rect.height) - margin * 2;
    const cell = side / Math.max(1, size - 1);
    const originX = (rect.width - side) / 2;
    const originY = (rect.height - side) / 2;
    const localX = lastPoint.x - rect.left;
    const localY = lastPoint.y - rect.top;
    const boardX = Math.max(0, Math.min(size - 1, Math.round((localX - originX) / cell)));
    const boardY = Math.max(0, Math.min(size - 1, Math.round((localY - originY) / cell)));
    const centerCssX = originX + boardX * cell;
    const centerCssY = originY + boardY * cell;

    const scaleX = board.width / rect.width;
    const scaleY = board.height / rect.height;
    const sourceCss = Math.max(34, Math.min(70, cell * 3.15));
    const sourceWidth = sourceCss * scaleX;
    const sourceHeight = sourceCss * scaleY;
    const centerX = centerCssX * scaleX;
    const centerY = centerCssY * scaleY;
    const sourceLeft = centerX - sourceWidth / 2;
    const sourceTop = centerY - sourceHeight / 2;
    const clippedLeft = Math.max(0, sourceLeft);
    const clippedTop = Math.max(0, sourceTop);
    const clippedRight = Math.min(board.width, sourceLeft + sourceWidth);
    const clippedBottom = Math.min(board.height, sourceTop + sourceHeight);
    const clippedWidth = Math.max(1, clippedRight - clippedLeft);
    const clippedHeight = Math.max(1, clippedBottom - clippedTop);

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const output = Math.round(108 * dpr);
    if (loupeCanvas.width !== output || loupeCanvas.height !== output) {
      loupeCanvas.width = output;
      loupeCanvas.height = output;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, output, output);
    context.fillStyle = getComputedStyle(frame).backgroundColor || '#d9b778';
    context.fillRect(0, 0, output, output);

    const destinationLeft = (clippedLeft - sourceLeft) / sourceWidth * output;
    const destinationTop = (clippedTop - sourceTop) / sourceHeight * output;
    const destinationWidth = clippedWidth / sourceWidth * output;
    const destinationHeight = clippedHeight / sourceHeight * output;
    context.drawImage(
      board,
      clippedLeft,
      clippedTop,
      clippedWidth,
      clippedHeight,
      destinationLeft,
      destinationTop,
      destinationWidth,
      destinationHeight
    );

    context.strokeStyle = 'rgba(245, 239, 226, .92)';
    context.lineWidth = Math.max(2, 1.5 * dpr);
    context.beginPath();
    context.arc(output / 2, output / 2, 8 * dpr, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(30, 30, 26, .72)';
    context.beginPath();
    context.arc(output / 2, output / 2, 2.1 * dpr, 0, Math.PI * 2);
    context.fill();

    const safeX = Math.max(58, Math.min(window.innerWidth - 58, lastPoint.x));
    const safeY = Math.max(154, Math.min(window.innerHeight - 18, lastPoint.y));
    loupe.style.left = `${safeX}px`;
    loupe.style.top = `${safeY}px`;
  };

  const schedule = (event, refreshPreferences = false) => {
    if (refreshPreferences) preferences = readBoardPreferences();
    lastPoint = { x: event.clientX, y: event.clientY };
    if (!pending) pending = requestAnimationFrame(draw);
  };

  frame.addEventListener('pointerdown', (event) => schedule(event, true), { passive: true });
  frame.addEventListener('pointermove', (event) => schedule(event), { passive: true });
  frame.addEventListener('pointerup', () => { lastPoint = null; }, { passive: true });
  frame.addEventListener('pointercancel', () => { lastPoint = null; }, { passive: true });
  frame.addEventListener('lostpointercapture', () => { lastPoint = null; });
}

try {
  const parts = await Promise.all(chunkUrls.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    return response.text();
  }));

  const names = ['e', 't', 'n', 'o', 'i', 's', 'a', 'r', 'l', 'c', 'u', 'd', 'p', 'h', 'm', 'g', 'f', 'v', 'y', 'b', 'S', 'x', 'L', 'C'];
  const values = [
    installMobileRuntime,
    createWorkshopMode,
    watchConnectivity,
    BLACK,
    WHITE,
    EMPTY,
    boardAt,
    colorName,
    createGame,
    finishScoring,
    getGroup,
    hydrateGame,
    inspectMove,
    passTurn,
    playMove,
    resignGame,
    resumeFromScoring,
    scoreGame,
    serializeGame,
    toSgf,
    toggleDeadGroup,
    undo,
    aiLabel,
    chooseAiMove
  ];

  Function(...names, `'use strict';\n${parts.join('')}`)(...values);
  installLiveLoupe();
} catch (error) {
  console.error('SENTE failed to start', error);
  document.body.innerHTML = '<main class="boot-failure"><h1>SENTE не запустился</h1><p>Файлы приложения повреждены или не загрузились.</p><a href="../../">Вернуться в Pocket Works</a></main>';
}
