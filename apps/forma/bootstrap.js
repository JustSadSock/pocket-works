import { tolerantJsonParse, serializeDocument } from './src/engine.js';
import {
  compileCadProject,
  looksLikeCadProjectText,
  parseCadProject,
  serializeCadProject,
  makeRepairPacket,
  AI_CAD_PROMPT,
  CAD_GUIDE_MARKDOWN,
  CAD_EXAMPLE
} from './src/cad-project.js';
import { compileBlueprint, looksLikeBlueprintText } from './src/blueprint-runtime.js';

const CAD_STORAGE = 'pocket-works:forma:cad-session-v2';
const LEGACY_BLUEPRINT_STORAGE = 'pocket-works:forma:last-blueprint-v1';
let session = restoreSession();
let compiling = false;

installFileCompiler();
installEditorCompiler();
installExportGate();
installPromptKit();
await import('./app.js');
enhanceInterface();
applyGate();

function installFileCompiler() {
  if (typeof File === 'undefined' || !File.prototype.text) return;
  const originalText = File.prototype.text;
  if (File.prototype.text.__formaCadPatched) return;
  async function patchedText(...args) {
    const source = await originalText.apply(this, args);
    if (looksLikeCadProjectText(source, this.name || '')) return compileCadSource(source, this.name || 'импортированный CAD-файл');
    if (looksLikeBlueprintText(source)) return compileLegacyBlueprint(source, this.name || 'legacy Blueprint');
    session = { kind: 'legacy', source: '', report: null, error: null };
    persistSession(); queueMicrotask(() => showLegacyNotice('Импортирован низкоуровневый FormaCode без функционального контракта.'));
    return source;
  }
  patchedText.__formaCadPatched = true;
  File.prototype.text = patchedText;
}

function installEditorCompiler() {
  const buildIds = new Set(['buildButton', 'applyCodeButton']);
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const editor = document.getElementById('codeEditor');
    if (!editor) return;

    if (button.id === 'formatCodeButton' && looksLikeCadProjectText(editor.value)) {
      event.preventDefault(); event.stopImmediatePropagation();
      try {
        editor.value = serializeCadProject(parseCadProject(editor.value));
        markEditorState('CAD-проект отформатирован', 'var(--success)');
      } catch (error) { showCadError(error, editor.value); }
      return;
    }

    if (!buildIds.has(button.id)) return;
    if (looksLikeCadProjectText(editor.value)) {
      try { editor.value = compileCadSource(editor.value, 'редактор'); }
      catch (error) { event.preventDefault(); event.stopImmediatePropagation(); showCadError(error, editor.value); }
      return;
    }
    if (looksLikeBlueprintText(editor.value)) {
      try { editor.value = compileLegacyBlueprint(editor.value, 'редактор'); }
      catch (error) { event.preventDefault(); event.stopImmediatePropagation(); showCadError(error, editor.value); }
      return;
    }
    if (!compiling && session.kind === 'cad') {
      session = { kind: 'legacy', source: '', report: null, error: null };
      persistSession(); showLegacyNotice('CAD-контракт потерян: редактор содержит внутренний FormaCode. Для повторной проверки верните CAD-проект.');
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
    const editor = event.target?.id === 'codeEditor' ? event.target : null;
    if (!editor) return;
    if (looksLikeCadProjectText(editor.value)) {
      try { editor.value = compileCadSource(editor.value, 'редактор'); }
      catch (error) { event.preventDefault(); event.stopImmediatePropagation(); showCadError(error, editor.value); }
    } else if (looksLikeBlueprintText(editor.value)) {
      try { editor.value = compileLegacyBlueprint(editor.value, 'редактор'); }
      catch (error) { event.preventDefault(); event.stopImmediatePropagation(); showCadError(error, editor.value); }
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target?.id !== 'codeEditor' || compiling) return;
    if (session.kind === 'cad' && !looksLikeCadProjectText(event.target.value)) {
      session = { ...session, report: { ...(session.report || {}), verified: false, exportAllowed: false, summary: 'Исходный CAD-проект изменён или заменён. Требуется повторная компиляция.' } };
      persistSession(); queueMicrotask(renderReport);
    }
  }, true);
}

function installExportGate() {
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-export], #exportSelectedButton');
    if (!button) return;
    if (session.kind === 'cad' && session.report?.exportAllowed !== true) {
      event.preventDefault(); event.stopImmediatePropagation();
      renderReport();
      toast('Экспорт заблокирован: CAD-контракт не доказан.', 'error');
    }
  }, true);
}

function installPromptKit() {
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (button?.id === 'copyPromptButton') {
      event.preventDefault(); event.stopImmediatePropagation(); copyText(AI_CAD_PROMPT);
    }
    if (button?.id === 'downloadGuideButton') {
      event.preventDefault(); event.stopImmediatePropagation(); downloadText(CAD_GUIDE_MARKDOWN, 'FORMA-AI-GUIDE.md');
    }
  }, true);
}

function compileCadSource(source, origin) {
  compiling = true;
  try {
    const result = compileCadProject(source, { fileName: origin });
    session = {
      kind: 'cad',
      source: typeof source === 'string' ? source : JSON.stringify(source),
      project: result.project,
      report: result.report,
      error: null,
      origin,
      compiledAt: Date.now()
    };
    persistSession();
    queueMicrotask(() => { renderReport(); applyGate(); });
    return serializeDocument(result.document);
  } catch (error) {
    session = { kind: 'cad', source: String(source || ''), report: null, error: serializableError(error), origin };
    persistSession();
    throw error;
  } finally { compiling = false; }
}

function compileLegacyBlueprint(source, origin) {
  const parsed = tolerantJsonParse(source);
  const { document, report } = compileBlueprint(parsed);
  try { localStorage.setItem(LEGACY_BLUEPRINT_STORAGE, String(source)); } catch {}
  session = { kind: 'blueprint', source: String(source), report: { verified: false, exportAllowed: true, warnings: report.warnings || [], summary: 'Legacy Blueprint скомпилирован без функционального доказательства.' }, origin };
  persistSession(); queueMicrotask(() => showLegacyNotice(session.report.summary));
  return serializeDocument(document);
}

function enhanceInterface() {
  injectStyles();
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = 'FORMA компилирует OpenSCAD-код, проверяет функциональный контракт и экспортирует модели для 3D-печати.';
  const toolbarLabel = document.querySelector('.code-toolbar small');
  if (toolbarLabel) toolbarLabel.textContent = 'OPENSCAD + CONTRACT';
  const applyButton = document.getElementById('applyCodeButton');
  if (applyButton) applyButton.textContent = 'Проверить и собрать';
  const editor = document.getElementById('codeEditor');
  if (editor) editor.placeholder = 'Вставьте forma-cad-project-1 или обычный .scad. Механические проекты требуют contract.';
  const emptyText = document.querySelector('#emptyStage span');
  if (emptyText) emptyText.textContent = 'Импортируйте CAD-проект от нейронки, .scad или откройте проверяемый пример.';
  const preview = document.getElementById('promptPreview');
  if (preview) preview.textContent = AI_CAD_PROMPT;
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.accept = '.json,.cad.json,.scad,.forma,.formacode,.blueprint,.txt,application/json,text/plain';
  const importSmall = document.querySelector('#importButton small');
  if (importSmall) importSmall.textContent = '.cad.json / .scad';
  const kitSmall = document.querySelector('#aiKitButton small');
  if (kitSmall) kitSmall.textContent = 'OpenSCAD + contract';

  const dialog = document.getElementById('aiDialog');
  if (dialog) {
    const title = dialog.querySelector('header strong');
    if (title) title.textContent = 'AI пишет CAD — FORMA доказывает функцию';
    const steps = dialog.querySelectorAll('.ai-steps article');
    setStep(steps[0], 'Скопируйте CAD-промт', 'Нейронка пишет OpenSCAD-код и отдельный проверяемый контракт задачи.');
    setStep(steps[1], 'Опишите результат', 'Укажите неподвижные части, вход, выход, требуемую скорость, сборку и ограничения печати.');
    setStep(steps[2], 'Импортируйте проект', 'FORMA измерит раскладку, рассчитает кинематику и заблокирует ложный экспорт.');
  }

  ensureReportPanel();
  renderReport();
  const verdict = document.getElementById('printVerdict');
  if (verdict) new MutationObserver(() => { if (session.kind === 'cad' && session.report?.exportAllowed !== true && verdict.textContent !== 'Контракт не доказан') applyGate(); }).observe(verdict, { childList: true, subtree: true });
}

function ensureReportPanel() {
  if (document.getElementById('cadReport')) return;
  const old = document.getElementById('blueprintReport');
  old?.remove();
  const actions = document.querySelector('.code-actions');
  if (!actions) return;
  const panel = document.createElement('section');
  panel.id = 'cadReport';
  panel.className = 'cad-report neutral';
  panel.innerHTML = `
    <div class="cad-report-head"><div><small>CAD CONTRACT</small><strong>Контракт ещё не проверялся</strong></div><span class="cad-badge">LEGACY</span></div>
    <p class="cad-summary">Обычный FormaCode остаётся доступен, но механические свойства у него не доказаны.</p>
    <div class="cad-issues"></div>
    <div class="cad-report-actions"></div>`;
  actions.before(panel);
}

function renderReport() {
  ensureReportPanel();
  const panel = document.getElementById('cadReport');
  if (!panel) return;
  const title = panel.querySelector('strong');
  const badge = panel.querySelector('.cad-badge');
  const summary = panel.querySelector('.cad-summary');
  const issues = panel.querySelector('.cad-issues');
  const actions = panel.querySelector('.cad-report-actions');
  issues.replaceChildren(); actions.replaceChildren();

  if (session.kind === 'cad' && session.error) {
    panel.className = 'cad-report error'; badge.textContent = 'BLOCKED';
    title.textContent = 'OpenSCAD не скомпилирован';
    summary.textContent = session.error.message || 'Ошибка CAD-кода.';
    actions.append(makeButton('Скопировать repair-пакет', () => copyText(makeRepairPacket(session.source, null, session.error))));
    actions.append(makeButton('Вернуть CAD-код', restoreCadSource));
  } else if (session.kind === 'cad' && session.report) {
    const good = session.report.exportAllowed === true;
    panel.className = `cad-report ${good ? 'success' : 'error'}`;
    badge.textContent = good ? 'VERIFIED' : 'BLOCKED';
    title.textContent = good ? 'Функциональный контракт доказан' : 'Модель собрана, экспорт закрыт';
    summary.textContent = session.report.summary || '';
    for (const item of session.report.issues || []) {
      const row = document.createElement('div'); row.className = `cad-issue ${item.severity || 'error'}`;
      row.innerHTML = `<b>${escapeHtml(item.code || 'CHECK')}</b><span>${escapeHtml(item.message || '')}</span><small>${escapeHtml(item.fix || '')}</small>`;
      issues.append(row);
    }
    for (const item of session.report.objectives || []) {
      const row = document.createElement('div'); row.className = 'cad-issue pass';
      row.innerHTML = `<b>PASS</b><span>${escapeHtml(item.label || '')}</span><small>${Number.isFinite(item.actual) ? `рассчитано: ${Number(item.actual).toFixed(4)}` : 'выполнено'}</small>`;
      issues.append(row);
    }
    actions.append(makeButton('Вернуть CAD-проект', restoreCadSource));
    if (!good) actions.append(makeButton('Скопировать repair-пакет', () => copyText(makeRepairPacket(session.source, session.report))));
    actions.append(makeButton('Копировать отчёт', () => copyText(reportText(session.report))));
  } else {
    panel.className = 'cad-report warning'; badge.textContent = session.kind === 'blueprint' ? 'BLUEPRINT 1' : 'LEGACY';
    title.textContent = 'Функция не доказана';
    summary.textContent = session.report?.summary || 'Низкоуровневый FormaCode можно экспортировать как геометрию, но FORMA не подтверждает его механику.';
    if (session.source) actions.append(makeButton('Вернуть исходник', restoreCadSource));
  }
  actions.append(makeButton('Проверяемый пример 5×', loadCertifiedExample));
  applyGate();
}

function loadCertifiedExample() {
  const editor = document.getElementById('codeEditor');
  if (!editor) return;
  editor.value = JSON.stringify(CAD_EXAMPLE, null, 2);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('applyCodeButton')?.click();
}

function showCadError(error, source) {
  session = { kind: 'cad', source: String(source || ''), report: null, error: serializableError(error) };
  persistSession(); renderReport(); applyGate();
  const codeError = document.getElementById('codeError');
  if (codeError) { codeError.textContent = error?.message || String(error); codeError.classList.remove('hidden'); }
  markEditorState('ошибка CAD', 'var(--danger)');
  toast(error?.message || String(error), 'error');
}

function showLegacyNotice(message) {
  renderReport(); applyGate();
  if (message) toast(message, 'warning');
}

function restoreCadSource() {
  if (!session.source) return;
  const editor = document.getElementById('codeEditor');
  if (!editor) return;
  editor.value = session.source;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  markEditorState(session.kind === 'cad' ? 'исходный CAD-проект' : 'legacy исходник', 'var(--orange-2)');
}

function applyGate() {
  const blocked = session.kind === 'cad' && session.report?.exportAllowed !== true;
  document.querySelectorAll('[data-export], #exportSelectedButton').forEach(button => {
    button.classList.toggle('contract-blocked', blocked);
    button.setAttribute('aria-disabled', String(blocked));
    if (blocked) button.title = 'Экспорт заблокирован функциональным контрактом';
    else if (button.title.includes?.('контрактом')) button.title = '';
  });
  const verdict = document.getElementById('printVerdict');
  const hint = document.getElementById('printHint');
  if (blocked && verdict && hint) {
    if (verdict.textContent !== 'Контракт не доказан') verdict.textContent = 'Контракт не доказан';
    const contractHint = 'Сетка может выглядеть нормально, но заявленная функция не подтверждена. Исправьте CAD-проект.';
    if (hint.textContent !== contractHint) hint.textContent = contractHint;
  }
}

function setStep(article, title, text) {
  if (!article) return;
  const b = article.querySelector('b'); const p = article.querySelector('p');
  if (b) b.textContent = title; if (p) p.textContent = text;
}
function markEditorState(text, color) { const state = document.getElementById('codeState'); if (state) { state.textContent = text; state.style.color = color; } }
function makeButton(label, handler) { const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = label; button.addEventListener('click', handler); return button; }
function reportText(report) { return [report.summary, ...(report.issues || []).map(i => `${i.code}: ${i.message}\nFIX: ${i.fix}`), ...(report.objectives || []).map(i => `PASS: ${i.label} = ${i.actual ?? 'ok'}`)].filter(Boolean).join('\n\n'); }
function serializableError(error) { return { name: error?.name || 'Error', message: error?.message || String(error), line: error?.line, col: error?.col, issues: error?.issues || [] }; }
function restoreSession() { try { return JSON.parse(localStorage.getItem(CAD_STORAGE) || 'null') || { kind: 'legacy', source: '', report: null, error: null }; } catch { return { kind: 'legacy', source: '', report: null, error: null }; } }
function persistSession() { try { localStorage.setItem(CAD_STORAGE, JSON.stringify(session)); } catch {} }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text)); }
  catch { const area=document.createElement('textarea');area.value=String(text);document.body.append(area);area.select();document.execCommand('copy');area.remove(); }
  toast('Скопировано', 'success');
}
function downloadText(text, fileName) { const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000); }
function toast(message, type = 'success') { const host=document.getElementById('toastHost');if(!host)return;const item=document.createElement('div');item.className=`toast ${type}`;item.textContent=message;host.append(item);setTimeout(()=>item.remove(),4200); }

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .cad-report{margin:10px 12px 0;padding:12px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(22,31,30,.76);display:grid;gap:9px}
    .cad-report.success{border-color:rgba(83,151,128,.65)}.cad-report.error{border-color:rgba(190,84,69,.72)}.cad-report.warning{border-color:rgba(224,112,67,.5)}
    .cad-report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.cad-report small{font-size:10px;line-height:1.35;opacity:.68}.cad-report strong{display:block;margin-top:3px;font-size:13px}
    .cad-badge{font:700 9px/1 system-ui;letter-spacing:.1em;padding:6px 7px;border-radius:999px;background:rgba(255,255,255,.08)}
    .cad-report.success .cad-badge{background:rgba(83,151,128,.22);color:#9ed4c3}.cad-report.error .cad-badge{background:rgba(190,84,69,.22);color:#f0a397}
    .cad-summary{margin:0;white-space:pre-wrap;font-size:12px;line-height:1.45;opacity:.82}.cad-issues{display:grid;gap:6px;max-height:190px;overflow:auto}
    .cad-issue{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;padding:8px;border-radius:8px;background:rgba(190,84,69,.1)}.cad-issue>b{font-size:9px;letter-spacing:.07em;color:#f0a397}.cad-issue>span{font-size:11px}.cad-issue>small{grid-column:2;font-size:10px;opacity:.65}
    .cad-issue.pass{background:rgba(83,151,128,.1)}.cad-issue.pass>b{color:#9ed4c3}.cad-report-actions{display:flex;gap:7px;flex-wrap:wrap}.cad-report-actions button{min-height:34px;padding:7px 10px;font-size:11px}
    .contract-blocked{filter:saturate(.25);opacity:.48}.contract-blocked::after{content:' · BLOCKED';font-size:8px;letter-spacing:.08em;color:#f0a397}
  `;
  document.head.append(style);
}
