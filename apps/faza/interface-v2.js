const VERSION = '1.2.0';

function injectStyles() {
  if (document.querySelector('link[data-faza-interface-v2]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./interface-v2.css?v=${VERSION}`;
  link.dataset.fazaInterfaceV2 = '';
  document.head.append(link);
}

function injectControlSafety() {
  if (document.querySelector('style[data-faza-control-safety]')) return;
  const style = document.createElement('style');
  style.dataset.fazaControlSafety = '';
  style.textContent = `
    @media (max-width: 760px), (orientation: landscape) and (max-height: 640px) {
      .turn-console { position: relative; }
      .turn-stepper { padding-right: 98px; }
      .game-actions {
        display: flex !important;
        position: absolute;
        z-index: 4;
        top: 4px;
        right: 10px;
        min-block-size: 24px;
        border: 0;
      }
      .game-actions .text-control { min-height: 24px; font-size: .52rem; }
      .game-actions .text-control:last-child { display: none; }
    }
    @media (orientation: landscape) and (max-height: 640px) {
      .turn-console {
        gap: 4px;
        grid-template-rows: 24px 40px minmax(120px, 1fr) 40px 38px;
      }
      .turn-copy p:last-child { display: none; }
      .phase-picker button { min-height: 38px; }
      .impact-metrics small { display: none; }
      .confirm-move { min-height: 38px; block-size: 38px; }
    }
  `;
  document.head.append(style);
}

function buildMiniBoard() {
  const emblem = document.querySelector('.phase-emblem');
  if (!emblem) return;
  emblem.classList.add('concept-board');
  emblem.innerHTML = `
    <div class="concept-caption"><span>ОДНА ПОЗИЦИЯ</span><b>ТРИ ГРАФА СВЯЗЕЙ</b></div>
    <svg viewBox="0 0 360 360" aria-hidden="true">
      <g class="concept-grid">
        <polygon points="180,73 224,98 224,149 180,174 136,149 136,98"></polygon>
        <polygon points="92,124 136,149 136,200 92,225 48,200 48,149"></polygon>
        <polygon points="268,124 312,149 312,200 268,225 224,200 224,149"></polygon>
        <polygon points="180,174 224,200 224,251 180,276 136,251 136,200"></polygon>
        <polygon points="92,225 136,251 136,302 92,327 48,302 48,251"></polygon>
        <polygon points="268,225 312,251 312,302 268,327 224,302 224,251"></polygon>
      </g>
      <g class="concept-links">
        <line x1="180" y1="124" x2="92" y2="175"></line>
        <line x1="180" y1="124" x2="268" y2="175"></line>
        <line x1="92" y1="175" x2="180" y2="225"></line>
        <line x1="268" y1="175" x2="180" y2="225"></line>
        <line class="cut" x1="180" y1="225" x2="92" y2="276"></line>
        <line x1="180" y1="225" x2="268" y2="276"></line>
      </g>
      <g class="concept-stones">
        <circle class="blue" cx="180" cy="124" r="24"></circle>
        <circle class="blue" cx="92" cy="175" r="24"></circle>
        <circle class="blue ghost" cx="180" cy="225" r="24"></circle>
        <circle class="clay" cx="268" cy="175" r="24"></circle>
        <circle class="clay" cx="268" cy="276" r="24"></circle>
      </g>
      <g class="concept-cut"><circle cx="136" cy="251" r="14"></circle><path d="M129 244l14 14m0-14-14 14"></path></g>
    </svg>
    <div class="concept-axis-row"><span class="is-off">↔</span><span>↗</span><span>↘</span></div>
  `;
}

function decorateMenu() {
  const eyebrow = document.querySelector('.eyebrow');
  const lead = document.querySelector('.menu-lead');
  if (eyebrow) eyebrow.textContent = 'ТАКТИЧЕСКАЯ ДУЭЛЬ / СВЯЗИ МЕНЯЮТСЯ КАЖДЫЙ ХОД';
  if (lead) lead.textContent = 'Поставь камень. Выключи одну ось. Сломай чужую группу — или собери путь, который переживёт ответ.';
  document.querySelectorAll('.primary-action').forEach((button) => {
    const mode = button.dataset.mode;
    button.dataset.glyph = mode === 'ai' ? '⌁' : '⇄';
  });
  buildMiniBoard();
}

function decorateGame() {
  const stage = document.querySelector('.board-stage');
  const consoleNode = document.querySelector('.turn-console');
  if (!stage || !consoleNode) return;

  const blueLabel = stage.querySelector('.goal-label.goal-blue');
  const clayLabel = stage.querySelector('.goal-label.goal-clay');
  if (blueLabel) blueLabel.innerHTML = '<b>СИНИЙ</b><span>ЛЕВО ↔ ПРАВО</span>';
  if (clayLabel) clayLabel.innerHTML = '<b>ОХРА</b><span>↗ ↙</span>';

  if (!stage.querySelector('.board-key')) {
    stage.insertAdjacentHTML('beforeend', `
      <div class="board-key" aria-hidden="true">
        <span><i class="key-link"></i> связь</span>
        <span><i class="key-cut">×</i> разрез</span>
        <span><i class="key-liberty"></i> дыхание</span>
      </div>
    `);
  }

  if (!consoleNode.querySelector('.turn-stepper')) {
    consoleNode.insertAdjacentHTML('afterbegin', `
      <div class="turn-stepper" aria-label="Этапы хода">
        <span data-step="cell"><i>1</i><b>Клетка</b></span>
        <em></em>
        <span data-step="axis"><i>2</i><b>Разрез</b></span>
        <em></em>
        <span data-step="confirm"><i>3</i><b>Ход</b></span>
      </div>
    `);
  }
}

function updateStepper() {
  const picker = document.querySelector('#phase-picker');
  const board = document.querySelector('#board');
  const stepper = document.querySelector('.turn-stepper');
  if (!picker || !board || !stepper) return;
  const hasCell = picker.classList.contains('is-ready');
  const hasAxis = Boolean(picker.querySelector('.is-selected-phase'));
  const committing = board.classList.contains('is-committing');
  const steps = {
    cell: { active: !hasCell, done: hasCell },
    axis: { active: hasCell && !hasAxis, done: hasAxis },
    confirm: { active: hasAxis && !committing, done: committing }
  };
  Object.entries(steps).forEach(([key, value]) => {
    const node = stepper.querySelector(`[data-step="${key}"]`);
    node?.classList.toggle('is-active', value.active);
    node?.classList.toggle('is-done', value.done);
  });
  stepper.classList.toggle('is-ai', document.querySelector('#turn-title')?.textContent.includes('ставит камень') || document.querySelector('#turn-title')?.textContent.includes('ищет ход'));
}

function updateVersion() {
  document.querySelector('.menu-footer span')?.replaceChildren(`v${VERSION}`);
  const updateScript = document.querySelector('[data-update-manager]');
  if (updateScript) updateScript.dataset.appVersion = VERSION;
}

function observeState() {
  const targets = [document.querySelector('#phase-picker'), document.querySelector('#board'), document.querySelector('#turn-title')].filter(Boolean);
  const observer = new MutationObserver(updateStepper);
  targets.forEach((target) => observer.observe(target, { attributes: true, childList: true, subtree: true, characterData: true }));
  updateStepper();
}

injectStyles();
injectControlSafety();
document.documentElement.dataset.fazaInterface = '2';
decorateMenu();
decorateGame();
updateVersion();
observeState();
