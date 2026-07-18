const VERSION = '1.3.0';

function injectStyles() {
  if (document.querySelector('link[data-faza-visual-v3]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./visual-v3.css?v=${VERSION}`;
  link.dataset.fazaVisualV3 = '';
  document.head.append(link);
}

function hexPoints(cx, cy, radius = 39) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(' ');
}

function buildInteractiveConcept() {
  const board = document.querySelector('.phase-emblem.concept-board');
  if (!board || board.dataset.visualV3 === 'ready') return;
  board.dataset.visualV3 = 'ready';
  board.removeAttribute('aria-hidden');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', 'Пример того, как выключенная ось меняет связи между камнями');
  const cells = [
    [180, 180], [92, 180], [268, 180], [136, 104], [224, 104], [136, 256], [224, 256]
  ];
  board.innerHTML = `
    <div class="concept-caption"><span>ОДНА ПОЗИЦИЯ</span><b data-concept-title>БЕЗ ↔</b></div>
    <svg viewBox="0 0 360 360" aria-hidden="true">
      <g class="concept-grid">${cells.map(([x, y]) => `<polygon points="${hexPoints(x, y)}"></polygon>`).join('')}</g>
      <g class="concept-axis-links">
        <line data-concept-link="0" x1="92" y1="180" x2="268" y2="180"></line>
        <line data-concept-link="1" x1="136" y1="256" x2="224" y2="104"></line>
        <line data-concept-link="2" x1="136" y1="104" x2="224" y2="256"></line>
      </g>
      <g class="concept-stones">
        <circle class="blue" cx="92" cy="180" r="23"></circle>
        <circle class="blue" cx="180" cy="180" r="23"></circle>
        <circle class="blue ghost" cx="268" cy="180" r="23"></circle>
        <circle class="clay" cx="136" cy="104" r="23"></circle>
        <circle class="clay" cx="224" cy="256" r="23"></circle>
      </g>
      <g class="concept-cut" data-concept-cut>
        <circle cx="180" cy="180" r="15"></circle>
        <path d="M173 173l14 14m0-14-14 14"></path>
      </g>
    </svg>
    <div class="concept-axis-row" aria-label="Выключенная ось">
      <button type="button" data-concept-phase="0" aria-pressed="true">↔</button>
      <button type="button" data-concept-phase="1" aria-pressed="false">↗</button>
      <button type="button" data-concept-phase="2" aria-pressed="false">↘</button>
    </div>
  `;
  const select = (phase) => {
    board.dataset.phase = String(phase);
    board.querySelector('[data-concept-title]').textContent = ['БЕЗ ↔', 'БЕЗ ↗', 'БЕЗ ↘'][phase];
    board.querySelectorAll('[data-concept-phase]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.conceptPhase) === phase));
    });
  };
  board.addEventListener('click', (event) => {
    const button = event.target.closest('[data-concept-phase]');
    if (button) select(Number(button.dataset.conceptPhase));
  });
  select(0);
}

function decorateModeButtons() {
  document.querySelectorAll('.primary-action').forEach((button, index) => {
    button.dataset.index = String(index + 1).padStart(2, '0');
  });
}

function decoratePhaseButtons() {
  document.querySelectorAll('#phase-picker [data-phase]').forEach((button) => {
    const axis = button.querySelector('.phase-axis');
    if (!axis || axis.dataset.diagram === 'ready') return;
    axis.dataset.diagram = 'ready';
    axis.innerHTML = `
      <i class="axis-line axis-line-0"></i>
      <i class="axis-line axis-line-1"></i>
      <i class="axis-line axis-line-2"></i>
      <b aria-hidden="true">×</b>
    `;
  });
}

function decorateScores() {
  document.querySelectorAll('[data-player-panel]').forEach((panel) => {
    if (panel.querySelector('.capture-track')) return;
    panel.insertAdjacentHTML('beforeend', `<span class="capture-track" aria-hidden="true">${'<i></i>'.repeat(5)}</span>`);
  });
}

function decorateBoardStage() {
  const stage = document.querySelector('.board-stage');
  const board = document.querySelector('#board');
  if (!stage || !board) return;
  if (!stage.querySelector('.phase-compass')) {
    board.insertAdjacentHTML('beforebegin', `
      <div class="phase-compass" aria-hidden="true">
        <i data-compass-axis="0"></i><i data-compass-axis="1"></i><i data-compass-axis="2"></i>
        <span></span>
      </div>
    `);
  }
  if (!stage.querySelector('.position-radar')) {
    stage.insertAdjacentHTML('beforeend', `
      <div class="position-radar" role="status" aria-live="polite">
        <span class="radar-mark"></span><b>ПОЗИЦИЯ</b><em data-radar-copy>стабильна</em>
      </div>
    `);
  }
}

function phaseIndex() {
  const selected = document.querySelector('#phase-picker [data-phase].is-selected-phase');
  if (selected) return Number(selected.dataset.phase);
  const text = document.querySelector('#phase-name')?.textContent || '';
  if (text.includes('↗')) return 1;
  if (text.includes('↘')) return 2;
  return 0;
}

function syncCaptureTracks() {
  document.querySelectorAll('[data-player-panel]').forEach((panel) => {
    const count = Number(panel.querySelector('[data-captures]')?.textContent || 0);
    panel.querySelectorAll('.capture-track i').forEach((pip, index) => {
      const filled = index < count;
      if (pip.classList.contains('is-filled') !== filled) pip.classList.toggle('is-filled', filled);
    });
  });
}

function syncBoardReadout() {
  const stage = document.querySelector('.board-stage');
  const board = document.querySelector('#board');
  const radar = stage?.querySelector('.position-radar');
  if (!stage || !board || !radar) return;
  const phase = phaseIndex();
  if (stage.dataset.closedAxis !== String(phase)) stage.dataset.closedAxis = String(phase);
  const currentPanel = document.querySelector('[data-player-panel].is-current');
  const current = currentPanel?.dataset.playerPanel || '1';
  if (document.documentElement.dataset.fazaTurn !== current) document.documentElement.dataset.fazaTurn = current;
  const blueThreats = board.querySelectorAll('.stone.player-1.is-threat').length;
  const clayThreats = board.querySelectorAll('.stone.player-2.is-threat').length;
  const captures = board.querySelectorAll('.stone.will-capture').length;
  const paths = board.querySelectorAll('.stone.is-path').length;
  let tone = 'stable';
  let copy = 'стабильна';
  if (captures) {
    tone = 'capture';
    copy = `${captures} камн${captures === 1 ? 'ь снимается' : captures < 5 ? 'я снимаются' : 'ей снимаются'}`;
  } else if (blueThreats || clayThreats) {
    tone = 'pressure';
    const parts = [];
    if (blueThreats) parts.push(`синий под давлением: ${blueThreats}`);
    if (clayThreats) parts.push(`охра под давлением: ${clayThreats}`);
    copy = parts.join(' · ');
  } else if (paths) {
    tone = 'path';
    copy = 'удерживается путь';
  } else if (document.querySelector('#phase-picker .is-selected-phase')) {
    tone = 'preview';
    copy = `предпросмотр разреза ${['↔', '↗', '↘'][phase]}`;
  }
  if (radar.dataset.tone !== tone) radar.dataset.tone = tone;
  const copyNode = radar.querySelector('[data-radar-copy]');
  if (copyNode && copyNode.textContent !== copy) copyNode.textContent = copy;
}

let scheduled = false;
function sync() {
  scheduled = false;
  decoratePhaseButtons();
  decorateScores();
  decorateBoardStage();
  syncCaptureTracks();
  syncBoardReadout();
}
function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(sync);
}

injectStyles();
document.documentElement.dataset.fazaVisual = '3';
buildInteractiveConcept();
decorateModeButtons();
decoratePhaseButtons();
decorateScores();
decorateBoardStage();
sync();
const observer = new MutationObserver(scheduleSync);
const board = document.querySelector('#board');
const picker = document.querySelector('#phase-picker');
const phaseName = document.querySelector('#phase-name');
if (board) observer.observe(board, { subtree: true, childList: true, attributes: true });
if (picker) observer.observe(picker, { subtree: true, childList: true, attributes: true, characterData: true });
if (phaseName) observer.observe(phaseName, { subtree: true, childList: true, characterData: true });
document.querySelectorAll('[data-captures]').forEach((node) => observer.observe(node, { subtree: true, childList: true, characterData: true }));
document.querySelectorAll('[data-player-panel]').forEach((node) => observer.observe(node, { attributes: true, attributeFilter: ['class'] }));
