import {
  BOARD_SIZE, CELL_COUNT, applyMove, cellIsBlocked, createInitialState,
  deserializeState, legalMoves, mobility, resolveSwap, rowCol, serializeState,
} from "./engine.js";

const STORAGE_KEY = "pocket-works:vektor";
const DEFAULT_DATA = {
  settings: { difficulty: "vector", humanFirst: true, sound: true, haptics: true },
  stats: { games: 0, humanWins: 0 },
  game: null,
};
const $ = (id) => document.getElementById(id);
const screens = ["menuScreen", "setupScreen", "rulesScreen", "gameScreen"].map($);
const overlays = ["swapOverlay", "pauseOverlay", "resultOverlay", "confirmOverlay", "errorOverlay"].map($);
const board = $("board");
const pieces = [$("piece0"), $("piece1")];
const cells = [];
let data = loadData();
let setupMode = "local";
let state = null;
let runtime = null;
let legal = [];
let aiBusy = false;
let requestId = 0;
let worker = null;
const workerResolvers = new Map();
let lastOrigin = null;
let drag = null;
let toastTimer = null;
let audioContext = null;

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      settings: { ...DEFAULT_DATA.settings, ...(parsed?.settings || {}) },
      stats: { ...DEFAULT_DATA.stats, ...(parsed?.stats || {}) },
      game: parsed?.game || null,
    };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
}
function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { showToast("Не удалось сохранить позицию"); }
}
function saveGame() {
  data.game = state && runtime && state.winnerColor === null
    ? { state: serializeState(state), runtime: { ...runtime } }
    : null;
  saveData();
  updateMenu();
}
function showScreen(target) {
  for (const screen of screens) {
    const active = screen === target;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  }
  for (const overlay of overlays) overlay.hidden = true;
}
function showOverlay(target) { target.hidden = false; }
function hideOverlay(target) { target.hidden = true; }
function updateMenu() {
  $("resumeButton").hidden = !data.game;
  if (data.game) $("resumeMeta").textContent = `ход ${data.game.state?.ply || 0} · поле 6×6`;
  $("soundButton").textContent = `ЗВУК: ${data.settings.sound ? "ВКЛ" : "ВЫКЛ"}`;
  $("soundButton").setAttribute("aria-pressed", String(data.settings.sound));
}
function chooseOption(container, value) {
  for (const button of container.querySelectorAll("button[data-value]")) button.classList.toggle("is-selected", button.dataset.value === value);
}
function openSetup(mode) {
  setupMode = mode;
  $("setupKicker").textContent = mode === "ai" ? "ПРОТИВ МАШИНЫ" : "ЛОКАЛЬНАЯ ДУЭЛЬ";
  $("difficultyField").hidden = mode !== "ai";
  $("firstMoveField").hidden = mode !== "ai";
  chooseOption($("difficultyChoices"), data.settings.difficulty);
  chooseOption($("firstMoveChoices"), data.settings.humanFirst ? "human" : "ai");
  showScreen($("setupScreen"));
}
function createBoard() {
  board.textContent = "";
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const button = document.createElement("button");
    const [row, col] = rowCol(cell);
    button.type = "button";
    button.className = "cell";
    button.dataset.cell = String(cell);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${String.fromCharCode(65 + col)}${row + 1}`);
    button.addEventListener("click", () => handleCell(cell));
    cells.push(button);
    board.append(button);
  }
}
function playerLabel(physical) {
  if (runtime?.mode === "ai") return physical === runtime.aiPhysical ? "МАШИНА" : "ТЫ";
  return `ИГРОК ${physical + 1}`;
}
function activePhysical() { return state.ownerByColor[state.turn]; }
function humanCanMove() {
  return Boolean(state && !aiBusy && state.winnerColor === null && state.swapStatus !== "pending" && (runtime.mode === "local" || activePhysical() !== runtime.aiPhysical));
}
function render() {
  if (!state) return;
  document.documentElement.style.setProperty("--active", state.turn === 0 ? "var(--blue)" : "var(--orange)");
  legal = state.swapStatus === "pending" || state.winnerColor !== null ? [] : legalMoves(state);
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    const element = cells[cell];
    element.classList.toggle("is-void", cellIsBlocked(state, cell));
    element.classList.toggle("is-legal", legal.includes(cell) && humanCanMove());
    element.classList.toggle("just-fell", cell === lastOrigin);
    element.disabled = !legal.includes(cell) || !humanCanMove();
  }
  if (lastOrigin !== null) requestAnimationFrame(() => cells[lastOrigin]?.classList.remove("just-fell"));
  lastOrigin = null;
  state.positions.forEach((cell, color) => {
    const [row, col] = rowCol(cell);
    pieces[color].style.setProperty("--x", col);
    pieces[color].style.setProperty("--y", row);
    pieces[color].classList.toggle("is-active", color === state.turn && humanCanMove());
    pieces[color].disabled = color !== state.turn || !humanCanMove();
  });
  $("turnMeta").textContent = `ХОД ${String(state.ply + 1).padStart(2, "0")}`;
  $("turnLabel").textContent = `${playerLabel(activePhysical())} · ${state.turn === 0 ? "СИНИЙ" : "ОРАНЖЕВЫЙ"}`;
  $("mobilityValue").textContent = String(legal.length);
  $("blueOwner").textContent = playerLabel(state.ownerByColor[0]);
  $("orangeOwner").textContent = playerLabel(state.ownerByColor[1]);
  $("positionCode").textContent = `V${String(state.ply).padStart(2, "0")} / ${CELL_COUNT - state.ply}`;
  $("progressBar").style.width = `${Math.min(100, state.ply / (CELL_COUNT - 2) * 100)}%`;
  $("pauseButton").disabled = aiBusy;
  $("gameHint").textContent = aiBusy ? "Поиск позиции…" : state.swapStatus === "pending" ? "Второй игрок решает, кому достанется дебют." : humanCanMove() ? "Выбери подсвеченную клетку или протяни фигуру по лучу." : "Ход соперника.";
}
function startGame() {
  const aiPhysical = setupMode === "ai" ? (data.settings.humanFirst ? 1 : 0) : null;
  state = createInitialState();
  runtime = { mode: setupMode, difficulty: data.settings.difficulty, aiPhysical, startedAt: Date.now() };
  showScreen($("gameScreen"));
  render();
  saveGame();
  sound("start");
  maybeAITurn();
}
function resumeGame() {
  try {
    state = deserializeState(data.game.state);
    runtime = { ...data.game.runtime };
    showScreen($("gameScreen"));
    render();
    state.swapStatus === "pending" ? handleSwapPhase() : maybeAITurn();
  } catch {
    data.game = null;
    saveData();
    showError("Сохранение повреждено и было удалено.");
  }
}
function handleCell(cell) {
  if (!humanCanMove()) return;
  if (!legal.includes(cell)) { feedback("invalid"); return; }
  performMove(cell);
}
function performMove(destination) {
  const color = state.turn;
  const origin = state.positions[color];
  try { state = applyMove(state, destination); }
  catch (error) { showToast(error.message); feedback("invalid"); return; }
  lastOrigin = origin;
  sound("move", color);
  vibrate(12);
  render();
  saveGame();
  if (state.swapStatus === "pending") return handleSwapPhase();
  if (state.winnerColor !== null) return finishGame();
  maybeAITurn();
}
function handleSwapPhase() {
  const chooserPhysical = 1;
  if (runtime.mode === "ai" && runtime.aiPhysical === chooserPhysical) {
    setThinking(true, "МАШИНА ОЦЕНИВАЕТ ДЕБЮТ");
    askWorker("swap").then(({ swap, score }) => { setThinking(false); resolveSwapChoice(Boolean(swap), true, score); }).catch(handleAIError);
  } else {
    $("swapCopy").textContent = runtime.mode === "ai"
      ? "Ты можешь забрать синюю позицию машины. Тогда машина получит оранжевую и сделает следующий ход."
      : "Игрок 2 может забрать синюю фигуру. Тогда игрок 1 получит оранжевую и сделает следующий ход.";
    showOverlay($("swapOverlay"));
  }
}
function resolveSwapChoice(shouldSwap, byAI = false, score = 0) {
  try { state = resolveSwap(state, shouldSwap); }
  catch (error) { showToast(error.message); return; }
  hideOverlay($("swapOverlay"));
  sound(shouldSwap ? "swap" : "tap");
  vibrate(shouldSwap ? [15, 40, 15] : 8);
  render();
  saveGame();
  if (byAI) showToast(shouldSwap ? "Машина забрала синюю" : "Машина оставила стороны");
  if (Math.abs(score) > 80 && byAI) showToast("Дебют оказался слишком односторонним");
  state.winnerColor !== null ? finishGame() : maybeAITurn();
}
function maybeAITurn() {
  if (!state || runtime.mode !== "ai" || state.winnerColor !== null || state.swapStatus === "pending" || activePhysical() !== runtime.aiPhysical) return;
  const task = state.ply === 0 ? "opening" : "move";
  setThinking(true, task === "opening" ? "МАШИНА СТАВИТ ЧЕСТНЫЙ ДЕБЮТ" : "МАШИНА СЧИТАЕТ ЛУЧИ");
  setTimeout(() => askWorker(task).then(({ move }) => {
    setThinking(false);
    if (move === null) { state = { ...state, winnerColor: 1 - state.turn }; return finishGame(); }
    performMove(move);
  }).catch(handleAIError), 150);
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker("./ai-worker.js", { type: "module" });
  worker.addEventListener("message", (event) => {
    const resolver = workerResolvers.get(event.data.requestId);
    if (!resolver) return;
    workerResolvers.delete(event.data.requestId);
    event.data.ok ? resolver.resolve(event.data.result) : resolver.reject(new Error(event.data.error));
  });
  worker.addEventListener("error", () => {
    for (const resolver of workerResolvers.values()) resolver.reject(new Error("Модуль поиска остановился"));
    workerResolvers.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}
function askWorker(task) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    workerResolvers.set(id, { resolve, reject });
    getWorker().postMessage({ requestId: id, task, state: serializeState(state), difficulty: runtime.difficulty });
  });
}
function handleAIError(error) { setThinking(false); showError(`Машина не смогла закончить расчёт: ${error.message}`); }
function setThinking(active, text = "МАШИНА СЧИТАЕТ ЛУЧИ") {
  aiBusy = active;
  $("thinking").hidden = !active;
  $("thinkingText").textContent = text;
  render();
}
function finishGame() {
  const winnerColor = state.winnerColor;
  const winnerPhysical = state.ownerByColor[winnerColor];
  const loserColor = 1 - winnerColor;
  data.stats.games += 1;
  if (runtime.mode === "ai" && winnerPhysical !== runtime.aiPhysical) data.stats.humanWins += 1;
  data.game = null;
  saveData();
  document.documentElement.style.setProperty("--active", winnerColor === 0 ? "var(--blue)" : "var(--orange)");
  $("resultKicker").textContent = winnerColor === 0 ? "СИНИЙ ВЕКТОР СОХРАНЁН" : "ОРАНЖЕВЫЙ ВЕКТОР СОХРАНЁН";
  $("resultTitle").textContent = `${playerLabel(winnerPhysical)} победил`;
  $("resultCopy").textContent = `${playerLabel(state.ownerByColor[loserColor])} не имеет ни одного допустимого хода.`;
  $("resultMoves").textContent = String(state.ply);
  $("resultMobility").textContent = String(mobility(state, winnerColor));
  $("resultTime").textContent = formatTime(Date.now() - runtime.startedAt);
  sound("win", winnerColor);
  vibrate([25, 45, 25, 45, 50]);
  showOverlay($("resultOverlay"));
  updateMenu();
}
function formatTime(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function restartGame() {
  for (const overlay of overlays) overlay.hidden = true;
  runtime = { ...runtime, startedAt: Date.now() };
  state = createInitialState();
  render();
  saveGame();
  sound("start");
  maybeAITurn();
}
function quitToMenu() { showScreen($("menuScreen")); updateMenu(); }
function showError(message) { $("errorCopy").textContent = message; showOverlay($("errorOverlay")); }
function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("is-visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("is-visible"), 1700);
}
function vibrate(pattern) { if (data.settings.haptics && navigator.vibrate) navigator.vibrate(pattern); }
function ensureAudio() {
  if (!data.settings.sound) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}
function tone(frequency, duration, gain = .03, type = "sine", delay = 0) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
  volume.gain.setValueAtTime(.0001, context.currentTime + delay);
  volume.gain.exponentialRampToValueAtTime(gain, context.currentTime + delay + .01);
  volume.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + .02);
}
function sound(kind, color = 0) {
  if (!data.settings.sound) return;
  if (kind === "move") { tone(color === 0 ? 210 : 168, .12, .03, "triangle"); tone(color === 0 ? 430 : 350, .08, .018, "sine", .07); }
  else if (kind === "swap") { tone(260, .09, .025, "square"); tone(390, .11, .025, "square", .08); }
  else if (kind === "win") { tone(color === 0 ? 330 : 294, .16, .04, "triangle"); tone(440, .2, .035, "triangle", .12); tone(660, .24, .03, "sine", .25); }
  else if (kind === "invalid") tone(105, .1, .025, "square");
  else if (kind === "start") { tone(180, .08, .025, "triangle"); tone(270, .12, .025, "triangle", .08); }
  else tone(240, .05, .018, "sine");
}
function feedback(kind) { sound(kind); vibrate(kind === "invalid" ? 25 : 8); }
function toggleSound() {
  data.settings.sound = !data.settings.sound;
  saveData();
  updateMenu();
  $("pauseSoundButton").textContent = `Звук: ${data.settings.sound ? "вкл" : "выкл"}`;
  if (data.settings.sound) sound("tap");
}
function setupDragging(piece, color) {
  piece.addEventListener("pointerdown", (event) => {
    if (color !== state?.turn || !humanCanMove()) return;
    event.preventDefault();
    piece.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, target: null };
    piece.classList.add("is-dragging");
  });
  piece.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".cell");
    const target = element ? Number(element.dataset.cell) : null;
    for (const cell of cells) cell.classList.remove("is-preview");
    if (Number.isInteger(target) && legal.includes(target)) {
      drag.target = target;
      cells[target].classList.add("is-preview");
      const rect = $("boardShell").getBoundingClientRect();
      const [row, col] = rowCol(target);
      $("dragTarget").style.left = `${(col + .5) / BOARD_SIZE * rect.width}px`;
      $("dragTarget").style.top = `${(row + .5) / BOARD_SIZE * rect.height}px`;
      $("dragTarget").classList.add("is-visible");
    } else { drag.target = null; $("dragTarget").classList.remove("is-visible"); }
  });
  const finish = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = drag.target;
    drag = null;
    piece.classList.remove("is-dragging");
    $("dragTarget").classList.remove("is-visible");
    for (const cell of cells) cell.classList.remove("is-preview");
    if (target !== null) performMove(target);
  };
  piece.addEventListener("pointerup", finish);
  piece.addEventListener("pointercancel", finish);
}
function bind() {
  $("localButton").addEventListener("click", () => openSetup("local"));
  $("aiButton").addEventListener("click", () => openSetup("ai"));
  $("resumeButton").addEventListener("click", resumeGame);
  $("rulesButton").addEventListener("click", () => showScreen($("rulesScreen")));
  $("soundButton").addEventListener("click", toggleSound);
  $("setupBackButton").addEventListener("click", () => showScreen($("menuScreen")));
  $("rulesBackButton").addEventListener("click", () => showScreen($("menuScreen")));
  $("rulesPlayButton").addEventListener("click", () => openSetup("local"));
  $("startButton").addEventListener("click", startGame);
  $("difficultyChoices").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    data.settings.difficulty = button.dataset.value;
    chooseOption($("difficultyChoices"), data.settings.difficulty);
    saveData();
  });
  $("firstMoveChoices").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    data.settings.humanFirst = button.dataset.value === "human";
    chooseOption($("firstMoveChoices"), button.dataset.value);
    saveData();
  });
  $("acceptSwapButton").addEventListener("click", () => resolveSwapChoice(true));
  $("declineSwapButton").addEventListener("click", () => resolveSwapChoice(false));
  $("pauseButton").addEventListener("click", () => {
    if (aiBusy) return;
    $("pauseMove").textContent = `Ход ${state.ply + 1}`;
    $("pauseMobility").textContent = `${legal.length} вариантов`;
    $("pauseSoundButton").textContent = `Звук: ${data.settings.sound ? "вкл" : "выкл"}`;
    $("hapticsButton").textContent = `Отдача: ${data.settings.haptics ? "вкл" : "выкл"}`;
    showOverlay($("pauseOverlay"));
  });
  $("continueButton").addEventListener("click", () => hideOverlay($("pauseOverlay")));
  $("restartButton").addEventListener("click", () => { hideOverlay($("pauseOverlay")); showOverlay($("confirmOverlay")); });
  $("cancelRestartButton").addEventListener("click", () => hideOverlay($("confirmOverlay")));
  $("confirmRestartButton").addEventListener("click", restartGame);
  $("pauseSoundButton").addEventListener("click", toggleSound);
  $("hapticsButton").addEventListener("click", () => { data.settings.haptics = !data.settings.haptics; saveData(); $("hapticsButton").textContent = `Отдача: ${data.settings.haptics ? "вкл" : "выкл"}`; vibrate(12); });
  $("quitButton").addEventListener("click", quitToMenu);
  $("againButton").addEventListener("click", restartGame);
  $("resultSetupButton").addEventListener("click", () => openSetup(runtime.mode));
  $("resultMenuButton").addEventListener("click", quitToMenu);
  $("reloadButton").addEventListener("click", () => location.reload());
  pieces.forEach(setupDragging);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("pagehide", saveGame);
}
function init() {
  try { createBoard(); bind(); updateMenu(); showScreen($("menuScreen")); }
  catch (error) { showError(error.message || "Неизвестная ошибка"); }
}
init();
