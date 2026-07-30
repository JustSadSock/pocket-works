import { tolerantJsonParse, serializeDocument } from './src/engine.js';
import {
  compileBlueprint,
  createRepairPacket,
  formatBlueprintReport,
  looksLikeBlueprintText,
  AI_BLUEPRINT_PROMPT
} from './src/blueprint.js';

const BLUEPRINT_STORAGE = 'pocket-works:forma:last-blueprint-v1';
let lastBlueprint = '';
let lastReport = null;
let lastError = null;

installFileCompiler();
installEditorCompiler();
installPromptKit();
await import('./app.js');
enhanceInterface();

function installFileCompiler() {
  if (typeof File === 'undefined' || !File.prototype.text) return;
  const originalText = File.prototype.text;
  if (File.prototype.text.__formaBlueprintPatched) return;
  async function patchedText(...args) {
    const source = await originalText.apply(this, args);
    if (!looksLikeBlueprintText(source)) return source;
    return compileSource(source, this.name || 'импортированный файл');
  }
  patchedText.__formaBlueprintPatched = true;
  File.prototype.text = patchedText;
}

function installPromptKit() {
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (button?.id === 'copyPromptButton') {
      event.preventDefault(); event.stopImmediatePropagation(); copyText(AI_BLUEPRINT_PROMPT);
    }
    if (button?.id === 'downloadGuideButton') {
      event.preventDefault(); event.stopImmediatePropagation();
      const link = document.createElement('a'); link.href = './FORMA-AI-GUIDE.md'; link.download = 'FORMA-AI-GUIDE.md'; link.click();
    }
  }, true);
}

function installEditorCompiler() {
  const ids = new Set(['buildButton', 'applyCodeButton', 'formatCodeButton']);
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button || !ids.has(button.id)) return;
    const editor = document.getElementById('codeEditor');
    if (!editor || !looksLikeBlueprintText(editor.value)) return;
    try {
      editor.value = compileSource(editor.value, 'редактор');
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlueprintError(error, editor.value);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
    const editor = event.target?.id === 'codeEditor' ? event.target : null;
    if (!editor || !looksLikeBlueprintText(editor.value)) return;
    try {
      editor.value = compileSource(editor.value, 'редактор');
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlueprintError(error, editor.value);
    }
  }, true);
}

function compileSource(source, origin) {
  const parsed = tolerantJsonParse(source);
  const { document, report } = compileBlueprint(parsed);
  lastBlueprint = String(source);
  lastReport = report;
  lastError = null;
  try { localStorage.setItem(BLUEPRINT_STORAGE, lastBlueprint); } catch {}
  queueMicrotask(() => showBlueprintSuccess(report, origin));
  return serializeDocument(document);
}

function enhanceInterface() {
  injectStyles();
  const toolbarLabel = document.querySelector('.code-toolbar small');
  if (toolbarLabel) toolbarLabel.textContent = 'BLUEPRINT → FORMACODE';
  const applyButton = document.getElementById('applyCodeButton');
  if (applyButton) applyButton.textContent = 'Скомпилировать и собрать';
  const editor = document.getElementById('codeEditor');
  if (editor) editor.placeholder = 'Вставьте FormaBlueprint 1. FORMA сама построит зубья, посадки, оси и корпус.';

  const emptyText = document.querySelector('#emptyStage span');
  if (emptyText) emptyText.textContent = 'Импортируйте Blueprint от нейронки или откройте пример.';

  const preview = document.getElementById('promptPreview');
  if (preview) preview.textContent = AI_BLUEPRINT_PROMPT;

  const dialog = document.getElementById('aiDialog');
  if (dialog) {
    const title = dialog.querySelector('header strong');
    if (title) title.textContent = 'AI описывает — FORMA проектирует';
    const steps = dialog.querySelectorAll('.ai-steps article');
    setStep(steps[0], 'Скопируйте Blueprint-промт', 'Нейронка задаёт детали, размеры и связи — без ручного рисования зубьев.');
    setStep(steps[1], 'Опишите назначение', 'Укажите размеры, движение, способ сборки, принтер и материал.');
    setStep(steps[2], 'Импортируйте JSON', 'FORMA проверит связи и сама сгенерирует печатную геометрию.');
  }

  ensureReportPanel();
  try {
    const saved = localStorage.getItem(BLUEPRINT_STORAGE);
    if (saved) lastBlueprint = saved;
  } catch {}
}

function setStep(article, title, text) {
  if (!article) return;
  const b = article.querySelector('b');
  const p = article.querySelector('p');
  if (b) b.textContent = title;
  if (p) p.textContent = text;
}

function ensureReportPanel() {
  if (document.getElementById('blueprintReport')) return;
  const actions = document.querySelector('.code-actions');
  if (!actions) return;
  const panel = document.createElement('section');
  panel.id = 'blueprintReport';
  panel.className = 'blueprint-report hidden';
  panel.innerHTML = '<div><small>КОМПИЛЯТОР</small><strong>Blueprint ещё не запускался</strong><p></p></div><div class="blueprint-report-actions"></div>';
  actions.before(panel);
}

function showBlueprintSuccess(report, origin) {
  ensureReportPanel();
  const panel = document.getElementById('blueprintReport');
  if (!panel) return;
  panel.className = 'blueprint-report success';
  panel.querySelector('strong').textContent = 'Blueprint скомпилирован';
  panel.querySelector('p').textContent = `${formatBlueprintReport(report)} · источник: ${origin}`;
  const actions = panel.querySelector('.blueprint-report-actions');
  actions.replaceChildren(makeButton('Вернуть Blueprint', restoreBlueprint));
  if (report.warnings?.length) actions.append(makeButton('Скопировать предупреждения', () => copyText(report.warnings.join('\n'))));
}

function showBlueprintError(error, source) {
  lastBlueprint = String(source || lastBlueprint || '');
  lastError = error;
  ensureReportPanel();
  const panel = document.getElementById('blueprintReport');
  if (panel) {
    panel.className = 'blueprint-report error';
    panel.querySelector('strong').textContent = 'Blueprint не принят';
    panel.querySelector('p').textContent = error?.message || String(error);
    const actions = panel.querySelector('.blueprint-report-actions');
    actions.replaceChildren(makeButton('Скопировать repair-пакет', () => copyText(createRepairPacket(lastBlueprint, lastError))));
  }
  const codeError = document.getElementById('codeError');
  if (codeError) {
    codeError.textContent = error?.message || String(error);
    codeError.classList.remove('hidden');
  }
  const codeState = document.getElementById('codeState');
  if (codeState) {
    codeState.textContent = 'ошибка Blueprint';
    codeState.style.color = 'var(--danger)';
  }
}

function restoreBlueprint() {
  if (!lastBlueprint) return;
  const editor = document.getElementById('codeEditor');
  if (!editor) return;
  editor.value = lastBlueprint;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  const codeState = document.getElementById('codeState');
  if (codeState) codeState.textContent = 'исходный Blueprint';
}

function makeButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const host = document.getElementById('toastHost');
  if (host) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = 'Скопировано';
    host.append(toast);
    setTimeout(() => toast.remove(), 2600);
  }
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .blueprint-report{margin:10px 12px 0;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(22,31,30,.72);display:grid;gap:10px}
    .blueprint-report.hidden{display:none}
    .blueprint-report.success{border-color:rgba(83,151,128,.45)}
    .blueprint-report.error{border-color:rgba(190,84,69,.55)}
    .blueprint-report small{display:block;font-size:10px;letter-spacing:.12em;opacity:.65}
    .blueprint-report strong{display:block;margin-top:3px;font-size:13px}
    .blueprint-report p{margin:5px 0 0;white-space:pre-wrap;font-size:12px;line-height:1.45;opacity:.78;max-height:130px;overflow:auto}
    .blueprint-report-actions{display:flex;gap:8px;flex-wrap:wrap}
    .blueprint-report-actions button{min-height:34px;padding:7px 10px;font-size:11px}
  `;
  document.head.append(style);
}
