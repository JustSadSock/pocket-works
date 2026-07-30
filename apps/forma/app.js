import { parseFormaCode, normalizeDocument, serializeDocument, compileNode, splitPartDocument, transformPartNode } from './src/engine.js';
import { FormaRenderer } from './src/renderer.js';
import { DEFAULT_DOCUMENT, EXAMPLES, AI_PROMPT, GUIDE_MARKDOWN } from './src/spec.js';
import { exportBinarySTL, exportOBJ, export3MF, exportGLB, downloadBlob, downloadText, safeName } from './src/exporters.js';
import { combineBounds } from './src/mesher.js';

const $ = id => document.getElementById(id);
const qsa = selector => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'pocket-works:forma:project-v1';
const UI_KEY = 'pocket-works:forma:ui-v1';

const state = {
  document: normalizeDocument(DEFAULT_DOCUMENT),
  meshes: [],
  selectedId: 'body',
  history: [],
  future: [],
  buildId: 0,
  building: false,
  worker: null,
  codeDirty: false,
  cutAxis: 'z',
  inspector: 'print',
  mobilePanel: 'model'
};

let renderer;

boot();

function boot() {
  restore();
  bind();
  $('promptPreview').textContent = AI_PROMPT;
  $('selectedName').contentEditable = 'true';
  $('selectedName').spellcheck = false;
  try {
    renderer = new FormaRenderer($('viewport'), { onInteraction: () => setToggle($('rotateButton'), false) });
  } catch (error) {
    toast(error.message, 'error', 6000);
    $('emptyStage').classList.remove('hidden'); $('emptyStage').style.display='flex';
    $('emptyStage').querySelector('span').textContent = 'WebGL недоступен. Код и экспорт останутся доступны после сборки на поддерживаемом устройстве.';
  }
  syncDocumentUI(true);
  registerServiceWorker();
  buildDocument({ silent: true });
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.document) {
      state.document = normalizeDocument(saved.document);
      state.selectedId = saved.selectedId && state.document.parts.some(p => p.id === saved.selectedId) ? saved.selectedId : state.document.parts[0].id;
    }
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (ui?.detail) state.document.settings.detail = clamp(Number(ui.detail), 24, 80);
  } catch (error) {
    console.warn('FORMA restore failed', error);
  }
}

function bind() {
  $('buildButton').addEventListener('click', applyCodeAndBuild);
  $('applyCodeButton').addEventListener('click', applyCodeAndBuild);
  $('importButton').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', importFile);
  $('aiKitButton').addEventListener('click', () => $('aiDialog').showModal());
  $('copyPromptButton').addEventListener('click', () => copyText(AI_PROMPT, 'Мастер-промт скопирован'));
  $('downloadGuideButton').addEventListener('click', () => downloadText(GUIDE_MARKDOWN, 'FORMA-AI-GUIDE.md', 'text/markdown;charset=utf-8'));
  $('exampleButton').addEventListener('click', () => $('examplesDialog').showModal());
  $('homeButton').addEventListener('click', () => $('examplesDialog').showModal());
  qsa('[data-example]').forEach(button => button.addEventListener('click', () => loadExample(button.dataset.example)));

  $('codeEditor').addEventListener('input', () => {
    state.codeDirty = true;
    $('codeState').textContent = 'есть несобранные изменения';
    $('codeState').style.color = 'var(--orange-2)';
    $('codeError').classList.add('hidden');
    setSaveState('не собрано');
  });
  $('codeEditor').addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart, end = el.selectionEnd;
      el.value = el.value.slice(0, start) + '  ' + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + 2;
      el.dispatchEvent(new Event('input'));
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') applyCodeAndBuild();
  });
  $('formatCodeButton').addEventListener('click', () => {
    try {
      const doc = parseFormaCode($('codeEditor').value);
      $('codeEditor').value = serializeDocument(doc);
      setCodeValid();
      toast('Код отформатирован', 'success');
    } catch (error) { showCodeError(error.message); }
  });
  $('copyCodeButton').addEventListener('click', () => copyText($('codeEditor').value, 'FormaCode скопирован'));

  $('projectName').addEventListener('change', () => {
    mutate('Переименование проекта', doc => { doc.name = $('projectName').value.trim() || 'Без названия'; }, { rebuild: false });
  });
  $('undoButton').addEventListener('click', undo);
  $('redoButton').addEventListener('click', redo);
  $('addPartButton').addEventListener('click', addPart);
  $('deletePartButton').addEventListener('click', deleteSelectedPart);
  $('duplicateButton').addEventListener('click', duplicateSelected);
  $('plateButton').addEventListener('click', placeOnPlate);
  $('centerButton').addEventListener('click', centerSelected);
  $('scaleButton').addEventListener('click', scaleSelected);
  $('fitBedButton').addEventListener('click', fitSelectedToBed);
  qsa('[data-rotate-axis]').forEach(b => b.addEventListener('click', () => rotateSelected(b.dataset.rotateAxis)));

  qsa('[data-inspector]').forEach(b => b.addEventListener('click', () => setInspector(b.dataset.inspector)));
  qsa('[data-mobile-panel]').forEach(b => b.addEventListener('click', () => setMobilePanel(b.dataset.mobilePanel)));
  qsa('[data-view]').forEach(b => b.addEventListener('click', () => {
    qsa('[data-view]').forEach(x => x.classList.toggle('active', x === b));
    renderer?.viewPreset(b.dataset.view);
  }));
  $('fitButton').addEventListener('click', () => renderer?.fit());
  $('wireButton').addEventListener('click', () => {
    const on = !$('wireButton').classList.contains('active'); setToggle($('wireButton'), on); renderer?.setWireframe(on);
  });
  $('rotateButton').addEventListener('click', () => {
    const on = !$('rotateButton').classList.contains('active'); setToggle($('rotateButton'), on); renderer?.setAutoRotate(on);
  });
  $('snapshotButton').addEventListener('click', async () => {
    const blob = await renderer?.screenshot(); if (blob) downloadBlob(blob, `${safeName(state.document.name)}-preview.png`);
  });

  $('detailRange').addEventListener('input', () => $('detailLabel').textContent = $('detailRange').value);
  $('detailRange').addEventListener('change', () => {
    state.document.settings.detail = Number($('detailRange').value);
    localStorage.setItem(UI_KEY, JSON.stringify({ detail: state.document.settings.detail }));
    updateCodeFromDocument();
    buildDocument();
  });

  $('cutPosition').addEventListener('input', () => $('cutPositionLabel').textContent = `${$('cutPosition').value}%`);
  qsa('#cutAxis button').forEach(button => button.addEventListener('click', () => {
    state.cutAxis = button.dataset.axis;
    qsa('#cutAxis button').forEach(x => x.classList.toggle('active', x === button));
  }));
  $('cutPins').addEventListener('change', () => $('pinOptions').classList.toggle('disabled', !$('cutPins').checked));
  $('cutButton').addEventListener('click', cutSelected);

  qsa('[data-export]').forEach(button => button.addEventListener('click', () => exportModel(button.dataset.export)));
  $('exportSelectedButton').addEventListener('click', exportSelectedSTL);

  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
}

function syncDocumentUI(forceCode = false) {
  $('projectName').value = state.document.name;
  $('detailRange').value = state.document.settings.detail;
  $('detailLabel').textContent = state.document.settings.detail;
  if (forceCode || !state.codeDirty) $('codeEditor').value = serializeDocument(state.document);
  renderParts();
  updateSelectedUI();
  updateHistoryButtons();
  persist();
}

function renderParts() {
  const list = $('partList');
  list.replaceChildren();
  state.document.parts.forEach((part, index) => {
    const card = document.createElement('button');
    card.className = `part-card${part.id === state.selectedId ? ' active' : ''}`;
    card.type = 'button';
    card.dataset.id = part.id;
    const swatch = document.createElement('input');
    swatch.type = 'color'; swatch.className = 'swatch'; swatch.value = part.color; swatch.title = 'Цвет детали';
    swatch.addEventListener('click', e => e.stopPropagation());
    swatch.addEventListener('input', e => {
      e.stopPropagation();
      part.color = swatch.value;
      const mesh = state.meshes.find(m => m.id === part.id); if (mesh) mesh.color = swatch.value;
      renderer?.updateMeshColor(part.id, swatch.value);
      updateSelectedUI(); updateCodeFromDocument(); persist();
    });
    const copy = document.createElement('span'); copy.className = 'copy';
    copy.innerHTML = `<b>${escapeHtml(part.name)}</b><small>${meshSummary(part.id, index)}</small>`;
    const eye = document.createElement('button'); eye.type = 'button'; eye.className = `eye${part.visible ? '' : ' off'}`; eye.textContent = part.visible ? '◉' : '○'; eye.title = part.visible ? 'Скрыть' : 'Показать';
    eye.addEventListener('click', e => { e.stopPropagation(); part.visible = !part.visible; eye.classList.toggle('off', !part.visible); eye.textContent = part.visible ? '◉' : '○'; const mesh=state.meshes.find(m=>m.id===part.id);if(mesh)mesh.visible=part.visible;renderer?.updateMeshVisibility(part.id,part.visible);updateAnalysisUI();updateCodeFromDocument();persist(); });
    card.append(swatch, copy, eye);
    card.addEventListener('click', () => selectPart(part.id));
    list.append(card);
  });
  $('exportPartCount').textContent = plural(state.document.parts.length, 'деталь', 'детали', 'деталей');
}

function meshSummary(id, index) {
  const mesh = state.meshes.find(m => m.id === id);
  return mesh ? `${Math.round(mesh.analysis.triangles).toLocaleString('ru-RU')} треуг. · ${mesh.bounds.size.map(v=>Math.round(v)).join('×')} мм` : `деталь ${index + 1}`;
}

function selectPart(id) {
  state.selectedId = id;
  renderer?.setSelected(id);
  renderParts();
  updateSelectedUI();
  persist();
}

function updateSelectedUI() {
  const part = selectedPart();
  const enabled = Boolean(part);
  $('selectedName').textContent = part?.name || 'Нет детали';
  $('selectedSwatch').style.background = part?.color || '#ccc';
  ['plateButton','centerButton','duplicateButton','scaleButton','fitBedButton','cutButton','deletePartButton','exportSelectedButton'].forEach(id => $(id).disabled = !enabled || state.building);
  qsa('[data-rotate-axis]').forEach(b => b.disabled = !enabled || state.building);
  $('selectedName').contentEditable = enabled ? 'true' : 'false';
  $('selectedName').onblur = () => {
    const p = selectedPart(); if (!p) return;
    const name = $('selectedName').textContent.trim().slice(0,80) || p.name;
    if (name !== p.name) mutate('Переименование детали', doc => { doc.parts.find(x=>x.id===p.id).name=name; }, { rebuild:false });
  };
}

function selectedPart() { return state.document.parts.find(p => p.id === state.selectedId) || null; }
function selectedMesh() { return state.meshes.find(m => m.id === state.selectedId) || null; }

function applyCodeAndBuild() {
  try {
    const doc = parseFormaCode($('codeEditor').value);
    commitSnapshot();
    state.document = doc;
    state.future = [];
    state.selectedId = doc.parts.some(p=>p.id===state.selectedId) ? state.selectedId : doc.parts[0].id;
    state.codeDirty = false;
    setCodeValid();
    syncDocumentUI(true);
    buildDocument();
  } catch (error) {
    showCodeError(error.message);
    setInspector('code');
    setMobilePanel('code');
    toast(error.message, 'error', 6000);
  }
}

function buildDocument({ silent = false } = {}) {
  if (state.worker) state.worker.terminate();
  state.building = true;
  const id = ++state.buildId;
  const worker = new Worker('./src/worker.js', { type: 'module' });
  state.worker = worker;
  setBuildOverlay(true, 'Подготовка геометрии', 'Проверяем FormaCode…', 0);
  disableDuringBuild(true);
  worker.onmessage = event => {
    const data = event.data || {};
    if (data.id !== id) return;
    if (data.type === 'progress') {
      const total = Math.max(1, data.total);
      const value = ((data.part + data.progress) / total) * 100;
      setBuildOverlay(true, `Строим: ${data.name}`, `Деталь ${Math.min(data.part + 1,total)} из ${total}`, value);
    } else if (data.type === 'result') {
      state.meshes = data.meshes.map(mesh => ({ ...mesh, visible: state.document.parts.find(p=>p.id===mesh.id)?.visible !== false }));
      state.worker?.terminate(); state.worker = null; state.building = false;
      renderer?.setMeshes(state.meshes); renderer?.setSelected(state.selectedId);
      setBuildOverlay(false); disableDuringBuild(false);
      $('emptyStage').classList.toggle('hidden', state.meshes.length > 0); $('emptyStage').style.display = state.meshes.length > 0 ? '' : 'flex';
      state.codeDirty = false; setCodeValid(); setSaveState('сохранено');
      renderParts(); updateSelectedUI(); updateAnalysisUI(); persist();
      if (!silent) toast('Модель собрана', 'success');
    } else if (data.type === 'error') {
      finishBuildError(data.message);
    }
  };
  worker.onerror = event => finishBuildError(event.message || 'Ошибка фонового построения.');
  worker.postMessage({ id, document: state.document, detail: state.document.settings.detail, margin: state.document.settings.margin });
}

function finishBuildError(message) {
  state.worker?.terminate(); state.worker = null; state.building = false;
  setBuildOverlay(false); disableDuringBuild(false); showCodeError(message); setInspector('code'); setMobilePanel('code'); toast(message, 'error', 7000);
}

function setBuildOverlay(show, title='', detail='', progress=0) {
  $('buildOverlay').classList.toggle('hidden', !show);
  if(show){$('buildStatus').textContent=title;$('buildDetail').textContent=detail;$('buildProgress').style.width=`${clamp(progress,0,100)}%`;}
}

function disableDuringBuild(value) {
  $('buildButton').disabled = value;
  $('applyCodeButton').disabled = value;
  updateSelectedUI();
}

function updateAnalysisUI() {
  const visible = state.meshes.filter(m => m.visible !== false);
  const bounds = combineBounds(visible);
  const triangles = visible.reduce((n,m)=>n+m.analysis.triangles,0);
  const volume = visible.reduce((n,m)=>n+m.analysis.volume,0);
  const weight = visible.reduce((n,m)=>n+m.analysis.plaWeight,0);
  const boundaries = visible.reduce((n,m)=>n+m.analysis.boundaryEdges,0);
  const nonManifold = visible.reduce((n,m)=>n+m.analysis.nonManifoldEdges,0);
  const degenerate = visible.reduce((n,m)=>n+m.analysis.degenerate,0);
  const onPlate = visible.length && Math.min(...visible.map(m=>m.bounds.min[2])) >= -0.15;
  const withinBed = bounds.size[0] <= 220.01 && bounds.size[1] <= 220.01 && bounds.size[2] <= 250.01;
  const watertight = visible.length && boundaries === 0 && nonManifold === 0 && degenerate === 0;
  const score = visible.length ? Math.max(0, 100 - (watertight?0:38) - (onPlate?0:18) - (withinBed?0:24) - (triangles>900000?12:0)) : 0;

  $('trianglesReadout').textContent = Math.round(triangles).toLocaleString('ru-RU');
  $('dimensionsReadout').textContent = visible.length ? bounds.size.map(v=>formatMm(v)).join(' × ') : '0 × 0 × 0';
  $('qualityReadout').textContent = watertight ? 'замкнутая сетка' : visible.length ? 'нужна проверка' : 'нет модели';
  $('qualityReadout').className = watertight ? 'status-good' : 'status-warn';
  $('printScore').textContent = visible.length ? score : '—';
  $('printScoreRing').style.borderColor = score >= 90 ? '#3f7869' : score >= 65 ? '#df8a52' : '#af4c3d';
  $('printVerdict').textContent = !visible.length ? 'Соберите модель' : score >= 90 ? 'Готово к слайсеру' : score >= 65 ? 'Почти готово' : 'Нужна правка';
  $('printHint').textContent = !visible.length ? 'FORMA проверит оболочку, объём и платформу.' : watertight ? 'Сетка замкнута; проверьте ориентацию и настройки материала в слайсере.' : 'Есть открытые или неоднозначные рёбра. Попробуйте увеличить детализацию.';
  $('statSize').textContent = visible.length ? `${formatMm(bounds.size[0])}×${formatMm(bounds.size[1])}×${formatMm(bounds.size[2])} мм` : '—';
  $('statVolume').textContent = visible.length ? volume >= 1000 ? `${(volume/1000).toFixed(1)} см³` : `${Math.round(volume)} мм³` : '—';
  $('statWeight').textContent = visible.length ? `≈ ${weight.toFixed(1)} г` : '—';
  $('statMesh').textContent = visible.length ? watertight ? 'замкнута' : `${boundaries} краёв` : '—';
  $('printChecklist').innerHTML = [
    checklist(watertight, 'Замкнутая оболочка', watertight ? 'Каждое ребро принадлежит двум треугольникам.' : `Граничных рёбер: ${boundaries}; неманифолдных: ${nonManifold}.`),
    checklist(onPlate, 'Положение на платформе', onPlate ? 'Ни одна деталь не уходит ниже Z = 0.' : 'Часть модели находится ниже платформы. Используйте «Поставить на стол».'),
    checklist(withinBed, 'Габариты 220×220×250', withinBed ? 'Модель помещается на типовой стол.' : 'Габариты превышают типовой стол. Масштабируйте или разрежьте.'),
    checklist(triangles <= 900000, 'Вес сетки', triangles <= 900000 ? `${triangles.toLocaleString('ru-RU')} треугольников — нормально для экспорта.` : 'Сетка очень тяжёлая; снизьте детализацию.')
  ].join('');
}

function checklist(ok, title, detail) { return `<div class="check-item ${ok?'':'warn'}"><i>${ok?'✓':'!'}</i><div><b>${title}</b><small>${detail}</small></div></div>`; }

function addPart() {
  mutate('Добавление детали', doc => {
    const id = uniquePartId(doc, 'new-part');
    doc.parts.push({ id, name:'Новая деталь', color:'#7f9088', visible:true, node:{type:'roundedBox',size:[20,20,10],radius:2,position:[0,0,5]}, meta:{} });
    state.selectedId = id;
  });
}

function deleteSelectedPart() {
  const part = selectedPart(); if (!part) return;
  if (!confirm(`Удалить деталь «${part.name}»? Отменить можно кнопкой ↶.`)) return;
  mutate('Удаление детали', doc => {
    const index=doc.parts.findIndex(p=>p.id===part.id);doc.parts.splice(index,1);
    state.selectedId = doc.parts[Math.min(index,doc.parts.length-1)]?.id || null;
  });
}

function duplicateSelected() {
  const part=selectedPart(),mesh=selectedMesh();if(!part)return;
  mutate('Дублирование детали', doc => {
    const source=doc.parts.find(p=>p.id===part.id);const copy=deepClone(source);copy.id=uniquePartId(doc,`${source.id}-copy`);copy.name=`${source.name} · копия`;const shift=Math.max(8,mesh?.bounds.size[0]*0.35||10);copy.node=transformPartNode(copy.node,{position:[shift,0,0]});const i=doc.parts.indexOf(source);doc.parts.splice(i+1,0,copy);state.selectedId=copy.id;
  });
}

function placeOnPlate() {
  const part=selectedPart(),mesh=selectedMesh();if(!part||!mesh)return;
  const dz=-mesh.bounds.min[2]; if(Math.abs(dz)<0.01){toast('Деталь уже стоит на платформе');return;}
  mutate('Установка на платформу',doc=>{const p=doc.parts.find(x=>x.id===part.id);p.node=transformPartNode(p.node,{position:[0,0,dz]});});
}

function centerSelected() {
  const part=selectedPart(),mesh=selectedMesh();if(!part||!mesh)return;
  mutate('Центрирование детали',doc=>{const p=doc.parts.find(x=>x.id===part.id);p.node=transformPartNode(p.node,{position:[-mesh.bounds.center[0],-mesh.bounds.center[1],0]});});
}

function rotateSelected(axis) {
  const part=selectedPart(),mesh=selectedMesh();if(!part||!mesh)return;
  const rotation=[0,0,0];rotation[axis==='x'?0:axis==='y'?1:2]=90;
  mutate(`Поворот ${axis.toUpperCase()}`,doc=>{const p=doc.parts.find(x=>x.id===part.id);p.node=aroundCenter(p.node,mesh.bounds.center,{rotation});});
}

function scaleSelected() {
  const percent=Number($('scaleInput').value);if(!Number.isFinite(percent)||percent<=0||percent>1000){toast('Масштаб должен быть от 1 до 1000%', 'error');return;}
  scaleSelectedBy(percent/100,'Масштабирование детали');
}

function fitSelectedToBed() {
  const mesh=selectedMesh();if(!mesh)return;const factors=[220/Math.max(mesh.bounds.size[0],.001),220/Math.max(mesh.bounds.size[1],.001),250/Math.max(mesh.bounds.size[2],.001)];const factor=Math.min(1,...factors)*0.96;if(factor>=.999){toast('Деталь уже помещается на стол');return;}$('scaleInput').value=Math.round(factor*100);scaleSelectedBy(factor,'Вписывание в платформу');
}

function scaleSelectedBy(factor,label) {
  const part=selectedPart(),mesh=selectedMesh();if(!part||!mesh)return;
  mutate(label,doc=>{const p=doc.parts.find(x=>x.id===part.id);p.node=aroundCenter(p.node,mesh.bounds.center,{scale:[factor,factor,factor]});});
}

function cutSelected() {
  const part=selectedPart(),mesh=selectedMesh();if(!part||!mesh)return;
  const axis=state.cutAxis,idx=axis==='x'?0:axis==='y'?1:2,percent=Number($('cutPosition').value)/100;
  const position=mesh.bounds.min[idx]+mesh.bounds.size[idx]*percent;
  commitSnapshot();
  try {
    state.document=splitPartDocument(state.document,part.id,{axis,position,gap:0.15,pins:$('cutPins').checked?2:0,pinDiameter:Number($('pinDiameter').value),clearance:Number($('pinClearance').value),pinDepth:5});
    state.selectedId=state.document.parts.find(p=>p.id.startsWith(`${part.id}-a`))?.id||state.document.parts[0].id;
    state.future=[];state.codeDirty=false;syncDocumentUI(true);buildDocument();toast('Разрез создан. Обе половины остаются замкнутыми.', 'success');
  } catch(error){state.history.pop();toast(error.message,'error');}
}

function aroundCenter(node, center, transform) {
  return {
    type:'union', position:center, rotation:transform.rotation||[0,0,0], scale:transform.scale||[1,1,1],
    children:[{type:'union',position:center.map(v=>-v),children:[deepClone(node)]}]
  };
}

function exportModel(format) {
  const visible=state.meshes.filter(m=>m.visible!==false);if(!visible.length){toast('Сначала соберите модель','error');return;}
  const name=safeName(state.document.name);
  try {
    if(format==='stl') downloadBlob(exportBinarySTL(visible,state.document.name),`${name}.stl`);
    else if(format==='3mf') downloadBlob(export3MF(visible,state.document.name),`${name}.3mf`);
    else if(format==='glb') downloadBlob(exportGLB(visible,state.document.name),`${name}.glb`);
    else if(format==='obj'){const {obj,mtl}=exportOBJ(visible,state.document.name);downloadBlob(mtl,`${name}.mtl`);setTimeout(()=>downloadBlob(obj,`${name}.obj`),120);}
    toast(`${format.toUpperCase()} подготовлен`, 'success');
  } catch(error){toast(`Экспорт не удался: ${error.message}`,'error',6000);}
}

function exportSelectedSTL() {
  const mesh=selectedMesh();if(!mesh){toast('Выберите собранную деталь','error');return;}downloadBlob(exportBinarySTL([mesh],mesh.name),`${safeName(mesh.name)}.stl`);toast('STL детали подготовлен','success');
}

function mutate(label, fn, { rebuild = true } = {}) {
  commitSnapshot();
  try { fn(state.document); state.document=normalizeDocument(state.document); state.future=[]; state.codeDirty=false; syncDocumentUI(true); if(rebuild)buildDocument(); else {renderParts();updateSelectedUI();persist();} setSaveState(label); }
  catch(error){const previous=state.history.pop();if(previous)restoreSnapshot(previous);toast(error.message,'error');}
}

function commitSnapshot() {
  state.history.push({document:deepClone(state.document),selectedId:state.selectedId});
  if(state.history.length>40)state.history.shift();updateHistoryButtons();
}
function undo(){if(!state.history.length)return;state.future.push({document:deepClone(state.document),selectedId:state.selectedId});restoreSnapshot(state.history.pop());buildDocument();}
function redo(){if(!state.future.length)return;state.history.push({document:deepClone(state.document),selectedId:state.selectedId});restoreSnapshot(state.future.pop());buildDocument();}
function restoreSnapshot(snapshot){state.document=normalizeDocument(snapshot.document);state.selectedId=snapshot.selectedId&&state.document.parts.some(p=>p.id===snapshot.selectedId)?snapshot.selectedId:state.document.parts[0]?.id||null;state.codeDirty=false;syncDocumentUI(true);updateHistoryButtons();}
function updateHistoryButtons(){$('undoButton').disabled=!state.history.length||state.building;$('redoButton').disabled=!state.future.length||state.building;}

function setInspector(name) {
  state.inspector=name;qsa('[data-inspector]').forEach(b=>b.classList.toggle('active',b.dataset.inspector===name));qsa('[data-inspector-panel]').forEach(p=>p.classList.toggle('active',p.dataset.inspectorPanel===name));
}
function setMobilePanel(name){state.mobilePanel=name;$('app').dataset.panel=name;qsa('[data-mobile-panel]').forEach(b=>b.classList.toggle('active',b.dataset.mobilePanel===name));if(['print','edit','code'].includes(name))setInspector(name);}
function setToggle(button,on){button.classList.toggle('active',on);}

function loadExample(key) {
  const source=EXAMPLES[key];if(!source)return;commitSnapshot();state.document=normalizeDocument(deepClone(source));state.selectedId=state.document.parts[0].id;state.future=[];state.codeDirty=false;syncDocumentUI(true);$('examplesDialog').close();setMobilePanel('model');buildDocument();
}

async function importFile() {
  const file=$('fileInput').files?.[0];$('fileInput').value='';if(!file)return;
  try {const text=await file.text();const doc=parseFormaCode(text);commitSnapshot();state.document=doc;state.selectedId=doc.parts[0].id;state.future=[];state.codeDirty=false;syncDocumentUI(true);buildDocument();toast(`Импортирован ${file.name}`,'success');}
  catch(error){showCodeError(error.message);setInspector('code');setMobilePanel('code');toast(error.message,'error',7000);}
}

function updateCodeFromDocument() { if(!state.codeDirty)$('codeEditor').value=serializeDocument(state.document);persist(); }
function setCodeValid(){$('codeState').textContent='валидный код';$('codeState').style.color='var(--green)';$('codeError').classList.add('hidden');}
function showCodeError(message){$('codeError').textContent=message;$('codeError').classList.remove('hidden');$('codeState').textContent='ошибка';$('codeState').style.color='var(--danger)';}
function setSaveState(text){$('saveState').textContent=text;}

function persist() {
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify({document:state.document,selectedId:state.selectedId,savedAt:Date.now()}));setSaveState(state.codeDirty?'не собрано':'сохранено');}
  catch(error){setSaveState('не сохранено');}
}

function disableAll(value) { document.querySelectorAll('button').forEach(b=>{if(!b.closest('dialog'))b.disabled=value;}); }

function uniquePartId(doc,base){const ids=new Set(doc.parts.map(p=>p.id));let id=base,n=2;while(ids.has(id))id=`${base}-${n++}`;return id;}
function deepClone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function formatMm(v){return Math.abs(v)>=100?Math.round(v):Number(v).toFixed(1).replace('.0','');}
function plural(n,one,few,many){const m10=n%10,m100=n%100;return`${n} ${m10===1&&m100!==11?one:m10>=2&&m10<=4&&(m100<12||m100>14)?few:many}`;}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(message,type='',duration=3000){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('toastHost').append(el);setTimeout(()=>el.remove(),duration);}
async function copyText(text,message){try{await navigator.clipboard.writeText(text);toast(message,'success');}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove();toast(message,'success');}}
function registerServiceWorker(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('FORMA SW',error));}
