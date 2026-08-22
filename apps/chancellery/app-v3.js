import './app-v2.js';
import { getCampaign, listCampaigns } from './storage.js';
import { createScenario, evaluateScenario, rankScenarios, SCENARIO_TEMPLATES } from './scenario.js';
import { assessWarPlan } from './warfare.js';
import { simulatePolitics } from './politics.js';
import { buildChronicle, sparklinePoints } from './chronicle.js';
import { inspectBinaryFile, isEu5BinaryBytes, validateResolverPack } from './binary-inspector.js';

const STORAGE_PREFIX = 'pocket-works:chancellery:v3';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nullable = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value, digits = 1) => nullable(value) === null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(nullable(value));
const compact = (value) => nullable(value) === null ? '—' : new Intl.NumberFormat('ru-RU', { notation: Math.abs(nullable(value)) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(nullable(value));
const signed = (value, suffix = '') => nullable(value) === null ? '—' : `${nullable(value) > 0 ? '+' : ''}${fmt(value)}${suffix}`;
const safeKey = (value) => String(value || 'unknown').replace(/[^a-z0-9_.:-]+/gi, '_');

const ext = {
  snapshot: null,
  records: [],
  scenarios: [],
  currentScenario: createScenario('construction'),
  warObjectives: [],
  binaryReport: null,
  resolverPacks: [],
  mutationTimer: null
};

function storageKey(kind, snapshot = ext.snapshot) {
  return `${STORAGE_PREFIX}:${safeKey(snapshot?.campaignKey || snapshot?.metadata?.tag || 'unknown')}:${kind}`;
}
function loadJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message; node.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { node.hidden = true; }, 2800);
}

function loadStyle() {
  if ($('link[data-chancellery-v3]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = './strategic.css'; link.dataset.chancelleryV3 = '';
  document.head.append(link);
}

function makeTab(name, label) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.v3Tab = name; button.textContent = label; button.setAttribute('data-native-press', '');
  button.addEventListener('click', () => activate(name));
  return button;
}

function activate(name) {
  $$('[data-tab]').forEach((button) => button.classList.remove('is-active'));
  $$('[data-v3-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.v3Tab === name));
  $$('[data-panel]').forEach((panel) => { panel.hidden = true; panel.classList.remove('is-active'); });
  $$('[data-v3-panel]').forEach((panel) => { const active = panel.dataset.v3Panel === name; panel.hidden = !active; panel.classList.toggle('is-active', active); });
  refreshSnapshot().then(() => {
    if (name === 'scenarios') renderScenarioLab();
    if (name === 'war-room') renderWarRoom();
    if (name === 'politics') renderPolitics();
    if (name === 'chronicle') renderChronicle();
  });
}

function mountPanels() {
  const tabs = $('.tabs'); const workspace = $('#workspace');
  if (!tabs || !workspace || $('[data-v3-panel]')) return;
  tabs.append(makeTab('scenarios', 'СЦЕНАРИИ'), makeTab('war-room', 'ВОЙНА'), makeTab('politics', 'СОСЛОВИЯ'), makeTab('chronicle', 'ХРОНИКА'));
  $$('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-v3-tab]').forEach((item) => item.classList.remove('is-active'));
    $$('[data-v3-panel]').forEach((panel) => { panel.hidden = true; panel.classList.remove('is-active'); });
  }));

  const scenarios = document.createElement('section');
  scenarios.className = 'tab-panel strategic-panel'; scenarios.dataset.v3Panel = 'scenarios'; scenarios.hidden = true;
  scenarios.innerHTML = `
    <header class="strategic-head"><div><p>ЛАБОРАТОРИЯ РЕШЕНИЙ</p><h2>Сравни решение до клика в EU5</h2></div><span>НЕ СИМУЛЯТОР ДВИЖКА</span></header>
    <div class="strategic-grid scenario-layout">
      <article class="strategic-sheet scenario-form">
        <div class="sheet-title"><b>ГИПОТЕЗА</b><small>Все числа ниже — твои допущения</small></div>
        <label>ШАБЛОН<select id="scenarioTemplate"></select></label>
        <label>НАЗВАНИЕ<input id="scenarioName" type="text" maxlength="60" placeholder="Например: дороги в богатом ядре"></label>
        <label>ТЕРРИТОРИЯ<select id="scenarioTerritory"><option value="">Без конкретной территории</option></select></label>
        <div class="assumption-grid">
          <label>РАЗОВАЯ ЦЕНА<input id="scenarioCost" type="number" step="1"></label>
          <label>Δ КАЗНЫ<input id="scenarioTreasury" type="number" step="1"></label>
          <label>Δ ДОХОДА / МЕС<input id="scenarioIncome" type="number" step="0.1"></label>
          <label>Δ РАСХОДОВ / МЕС<input id="scenarioExpense" type="number" step="0.1"></label>
          <label>Δ ДОЛГА<input id="scenarioDebt" type="number" step="1"></label>
          <label>Δ ЛЮДСКИХ РЕСУРСОВ<input id="scenarioManpower" type="number" step="100"></label>
          <label>Δ СОЛДАТ<input id="scenarioSoldiers" type="number" step="100"></label>
          <label>Δ КОНТРОЛЯ, П.П.<input id="scenarioControl" type="number" step="1"></label>
        </div>
        <div class="strategic-actions"><button id="scenarioCalculate" class="primary-button" type="button">РАССЧИТАТЬ</button><button id="scenarioSave" class="secondary-button" type="button">СОХРАНИТЬ ВАРИАНТ</button><button id="scenarioReset" class="ghost-button" type="button">СБРОС</button></div>
      </article>
      <article class="strategic-sheet result-sheet"><div class="sheet-title"><b>РЕЗУЛЬТАТ</b><small>Прямые эффекты и ограничения</small></div><div id="scenarioResult"></div></article>
    </div>
    <article class="strategic-sheet saved-sheet"><div class="sheet-title"><b>СОХРАНЁННЫЕ ВАРИАНТЫ</b><small id="scenarioSavedCount">0</small></div><div id="scenarioSaved"></div></article>`;

  const war = document.createElement('section');
  war.className = 'tab-panel strategic-panel'; war.dataset.v3Panel = 'war-room'; war.hidden = true;
  war.innerHTML = `
    <header class="strategic-head"><div><p>ВОЕННАЯ КОМНАТА</p><h2>Проверь, не идёшь ли ты в войну с калькулятором из ада</h2></div><span>ОЦЕНКА РИСКА</span></header>
    <div class="war-layout">
      <article class="strategic-sheet">
        <div class="sheet-title"><b>СИЛЫ И БЮДЖЕТ</b><small>Противника можно ввести вручную</small></div>
        <div class="assumption-grid">
          <label>В ПОХОД<input id="warCommitted" type="number" step="100"></label>
          <label>РЕЗЕРВ<input id="warReserve" type="number" step="100"></label>
          <label>ОЦЕНКА ВРАГА<input id="warEnemy" type="number" step="100" placeholder="неизвестно"></label>
          <label>ДОП. РАСХОД / МЕС<input id="warMonthlyCost" type="number" step="0.1"></label>
        </div>
        <div class="objective-picker"><label>ЦЕЛЬ<select id="warObjectiveSelect"></select></label><button id="warAddObjective" type="button" class="secondary-button">ДОБАВИТЬ</button></div>
        <ol id="warObjectives" class="objective-list"></ol>
        <button id="warAssess" type="button" class="primary-button">ОЦЕНИТЬ ПЛАН</button>
      </article>
      <article class="strategic-sheet"><div class="sheet-title"><b>ГОТОВНОСТЬ</b><small>Из известных полей + твоих вводных</small></div><div id="warResult"></div></article>
    </div>`;

  const politics = document.createElement('section');
  politics.className = 'tab-panel strategic-panel'; politics.dataset.v3Panel = 'politics'; politics.hidden = true;
  politics.innerHTML = `
    <header class="strategic-head"><div><p>СОВЕТ СОСЛОВИЙ</p><h2>Кто выигрывает от твоего решения</h2></div><span>ПОЛИТИЧЕСКИЙ ЧЕРНОВИК</span></header>
    <article class="strategic-sheet"><div class="sheet-title"><b>ПЕРЕРАСПРЕДЕЛЕНИЕ</b><small>Сдвиги задаются вручную, текущая база берётся из сейва</small></div><div id="politicsRows" class="politics-rows"></div><div class="strategic-actions"><button id="politicsCalculate" type="button" class="primary-button">КТО ВЫИГРЫВАЕТ?</button><button id="politicsReset" type="button" class="ghost-button">ОБНУЛИТЬ</button></div></article>
    <article class="strategic-sheet politics-result"><div class="sheet-title"><b>ИТОГ</b><small>Без выдуманных бонусов законов</small></div><div id="politicsResult"></div></article>`;

  const chronicle = document.createElement('section');
  chronicle.className = 'tab-panel strategic-panel'; chronicle.dataset.v3Panel = 'chronicle'; chronicle.hidden = true;
  chronicle.innerHTML = `
    <header class="strategic-head"><div><p>ХРОНИКА КАМПАНИИ</p><h2>Государство как временной ряд</h2></div><span id="chronicleCount">0 СНИМКОВ</span></header>
    <article class="strategic-sheet chart-sheet"><div class="chart-toolbar"><label>ПОКАЗАТЕЛЬ<select id="chronicleMetric"><option value="treasury">Казна</option><option value="balance">Баланс</option><option value="population">Население</option><option value="control">Контроль</option><option value="debt">Долг</option></select></label><output id="chronicleRange">—</output></div><svg id="chronicleChart" viewBox="0 0 260 64" preserveAspectRatio="none" aria-label="График показателя"><polyline points=""></polyline></svg></article>
    <div id="chronicleTimeline" class="chronicle-timeline"></div>`;

  workspace.append(scenarios, war, politics, chronicle);
  wireScenario(); wireWar(); wirePolitics(); wireChronicle();
}

async function currentRecord() {
  const select = $('#currentSnapshotSelect');
  if (select?.value) {
    const record = await getCampaign(select.value);
    if (record) return record;
  }
  const tag = $('#countryTag')?.textContent?.trim(); const date = $('#campaignDate')?.textContent?.trim();
  const records = await listCampaigns();
  return records.find((record) => {
    const snapshot = record.snapshot || record;
    return (!tag || tag === '—' || snapshot.metadata?.tag === tag) && (!date || date === '—' || snapshot.metadata?.date === date);
  }) || null;
}

async function refreshSnapshot(force = false) {
  const record = await currentRecord();
  const snapshot = record?.snapshot || record || null;
  if (!snapshot) return null;
  if (!force && ext.snapshot?.hash === snapshot.hash) return snapshot;
  ext.snapshot = snapshot;
  ext.records = (await listCampaigns()).filter((item) => {
    const s = item.snapshot || item;
    return (s.campaignKey || `${s.metadata?.tag}:unknown`) === (snapshot.campaignKey || `${snapshot.metadata?.tag}:unknown`);
  });
  ext.scenarios = loadJson(storageKey('scenarios'), []);
  ext.warObjectives = loadJson(storageKey('war-objectives'), []);
  renderScenarioLab(); renderWarRoom(); renderPolitics(); renderChronicle();
  return snapshot;
}

function fillTerritories(select, includeAll = true) {
  if (!select || !ext.snapshot) return;
  const current = select.value;
  select.replaceChildren();
  if (includeAll) { const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Без конкретной территории'; select.append(blank); }
  const tag = ext.snapshot.metadata?.tag;
  const list = [...(ext.snapshot.locations || [])].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'ru'));
  for (const location of list) {
    const option = document.createElement('option'); option.value = String(location.id); option.textContent = `${location.name || location.id}${location.owner && location.owner !== tag ? ` · ${location.owner}` : ''}`; select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function scenarioFromForm() {
  const base = ext.currentScenario || createScenario($('#scenarioTemplate')?.value || 'custom');
  return {
    ...base,
    name: $('#scenarioName')?.value.trim() || 'Безымянный вариант',
    templateId: $('#scenarioTemplate')?.value || base.templateId,
    territoryId: $('#scenarioTerritory')?.value || null,
    assumptions: {
      cost: num($('#scenarioCost')?.value), treasuryDelta: num($('#scenarioTreasury')?.value), incomeDelta: num($('#scenarioIncome')?.value), expenseDelta: num($('#scenarioExpense')?.value),
      debtDelta: num($('#scenarioDebt')?.value), manpowerDelta: num($('#scenarioManpower')?.value), soldiersDelta: num($('#scenarioSoldiers')?.value), controlDelta: num($('#scenarioControl')?.value)
    }
  };
}

function setScenarioForm(scenario) {
  ext.currentScenario = scenario;
  $('#scenarioTemplate').value = scenario.templateId || 'custom'; $('#scenarioName').value = scenario.name || '';
  $('#scenarioTerritory').value = scenario.territoryId || '';
  const a = scenario.assumptions || {};
  [['scenarioCost','cost'],['scenarioTreasury','treasuryDelta'],['scenarioIncome','incomeDelta'],['scenarioExpense','expenseDelta'],['scenarioDebt','debtDelta'],['scenarioManpower','manpowerDelta'],['scenarioSoldiers','soldiersDelta'],['scenarioControl','controlDelta']].forEach(([id,key]) => { $(`#${id}`).value = a[key] ?? 0; });
}

function resultMetric(item) {
  const row = document.createElement('div'); row.className = 'result-metric';
  const label = document.createElement('span'), value = document.createElement('strong'), detail = document.createElement('small');
  label.textContent = item.label; value.textContent = signed(item.delta, item.label.includes('контроль') ? ' п.п.' : ''); detail.textContent = `${compact(item.before)} → ${compact(item.after)}`;
  row.append(label, value, detail); return row;
}

function renderScenarioResult(result) {
  const target = $('#scenarioResult'); if (!target) return; target.replaceChildren();
  const grid = document.createElement('div'); grid.className = 'result-grid'; result.exact.filter((item) => item.delta !== null && Math.abs(item.delta) > 0.0001).forEach((item) => grid.append(resultMetric(item)));
  if (!grid.children.length) { const p = document.createElement('p'); p.className = 'strategic-empty'; p.textContent = 'Изменений пока нет. Задай допущения слева.'; grid.append(p); }
  target.append(grid);
  const note = document.createElement('div'); note.className = 'certainty-stack';
  for (const [kind, text] of Object.entries(result.classification)) { const p = document.createElement('p'); p.dataset.kind = kind; p.textContent = `${kind === 'direct' ? 'ПРЯМОЙ РАСЧЁТ' : kind === 'estimate' ? 'ОЦЕНКА' : 'НЕИЗВЕСТНО'} · ${text}`; note.append(p); }
  target.append(note);
  if (result.warnings.length) { const ul = document.createElement('ul'); ul.className = 'risk-list'; result.warnings.forEach((text) => { const li=document.createElement('li'); li.textContent=text; ul.append(li); }); target.append(ul); }
}

function renderSavedScenarios() {
  const target = $('#scenarioSaved'); if (!target) return; target.replaceChildren(); $('#scenarioSavedCount').textContent = String(ext.scenarios.length);
  if (!ext.scenarios.length) { target.innerHTML = '<p class="strategic-empty">Сохрани несколько вариантов — здесь появится сравнение.</p>'; return; }
  const ranked = rankScenarios(ext.snapshot, ext.scenarios);
  ranked.forEach((entry, index) => {
    const row = document.createElement('article'); row.className = 'saved-scenario';
    const body=document.createElement('button'); body.type='button'; body.className='saved-scenario-main';
    const title=document.createElement('strong'), meta=document.createElement('small'), score=document.createElement('b'); title.textContent=entry.scenario.name; meta.textContent=`Баланс ${compact(entry.result.after.balance)} · долг ${compact(entry.result.after.debt)}${entry.result.paybackMonths?` · окупаемость ${entry.result.paybackMonths} мес.`:''}`; score.textContent=index===0?'ЛУЧШИЙ ПО МОДЕЛИ':`#${index+1}`; body.append(title,meta,score); body.addEventListener('click',()=>{setScenarioForm(entry.scenario);renderScenarioResult(entry.result);});
    const del=document.createElement('button'); del.type='button'; del.className='scenario-delete'; del.textContent='×'; del.setAttribute('aria-label',`Удалить ${entry.scenario.name}`); del.addEventListener('click',()=>{ext.scenarios=ext.scenarios.filter((s)=>s.id!==entry.scenario.id);saveJson(storageKey('scenarios'),ext.scenarios);renderSavedScenarios();});
    row.append(body,del); target.append(row);
  });
}

function renderScenarioLab() {
  if (!ext.snapshot || !$('#scenarioTemplate')) return;
  const template = $('#scenarioTemplate'); if (!template.options.length) SCENARIO_TEMPLATES.forEach((item)=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;template.append(option);});
  fillTerritories($('#scenarioTerritory'));
  if (!ext.currentScenario) ext.currentScenario = createScenario('construction');
  if (!$('#scenarioName').value) setScenarioForm(ext.currentScenario);
  renderScenarioResult(evaluateScenario(ext.snapshot, scenarioFromForm())); renderSavedScenarios();
}

function wireScenario() {
  $('#scenarioTemplate')?.addEventListener('change', (event) => { const scenario=createScenario(event.target.value); setScenarioForm(scenario); renderScenarioResult(evaluateScenario(ext.snapshot, scenario)); });
  $('#scenarioCalculate')?.addEventListener('click', () => renderScenarioResult(evaluateScenario(ext.snapshot, scenarioFromForm())));
  $('#scenarioSave')?.addEventListener('click', () => { const scenario=scenarioFromForm(); scenario.id = globalThis.crypto?.randomUUID?.() || `${Date.now()}`; ext.scenarios=[...ext.scenarios,scenario].slice(-20); saveJson(storageKey('scenarios'), ext.scenarios); ext.currentScenario=scenario; renderSavedScenarios(); toast('Вариант сохранён локально'); });
  $('#scenarioReset')?.addEventListener('click', () => { const scenario=createScenario($('#scenarioTemplate')?.value || 'construction'); setScenarioForm(scenario); renderScenarioResult(evaluateScenario(ext.snapshot,scenario)); });
}

function renderObjectiveList() {
  const target=$('#warObjectives'); if(!target)return;target.replaceChildren();
  if(!ext.warObjectives.length){target.innerHTML='<li class="strategic-empty">Маршрут пуст. Добавь цели по порядку.</li>';return;}
  ext.warObjectives.forEach((id,index)=>{const location=ext.snapshot?.locations?.find((item)=>String(item.id)===String(id));const li=document.createElement('li'),span=document.createElement('span'),button=document.createElement('button');span.textContent=`${index+1}. ${location?.name||id}`;button.type='button';button.textContent='×';button.setAttribute('aria-label','Убрать цель');button.addEventListener('click',()=>{ext.warObjectives.splice(index,1);saveJson(storageKey('war-objectives'),ext.warObjectives);renderObjectiveList();renderWarAssessment();});li.append(span,button);target.append(li);});
}
function warPlan(){return{committedTroops:num($('#warCommitted')?.value),reserveTroops:num($('#warReserve')?.value),enemyTroops:num($('#warEnemy')?.value),monthlyWarCost:num($('#warMonthlyCost')?.value),objectiveIds:[...ext.warObjectives]};}
function renderWarAssessment(){if(!ext.snapshot)return;const result=assessWarPlan(ext.snapshot,warPlan()),target=$('#warResult');if(!target)return;target.replaceChildren();const dial=document.createElement('div');dial.className='war-readiness';dial.style.setProperty('--readiness',`${result.readiness}%`);dial.innerHTML=`<strong>${result.readiness}</strong><span>ГОТОВНОСТЬ / 100</span>`;target.append(dial);const metrics=document.createElement('div');metrics.className='war-metrics';[['Задействовано',result.ratios.commitShare===null?'—':`${result.ratios.commitShare}%`],['Резерв',result.ratios.reserveShare===null?'—':`${result.ratios.reserveShare}%`],['Силы',result.ratios.forceRatio===null?'—':`${result.ratios.forceRatio}×`],['Запас казны',result.ratios.runwayMonths===null?'—':`${result.ratios.runwayMonths} мес.`],['Маршрут',result.ratios.routeDistance===null?'—':result.ratios.routeDistance]].forEach(([a,b])=>{const node=document.createElement('div');node.innerHTML=`<span>${a}</span><strong>${b}</strong>`;metrics.append(node);});target.append(metrics);[['РИСКИ',result.risks,'danger'],['СИЛЬНЫЕ СТОРОНЫ',result.strengths,'positive'],['НЕИЗВЕСТНО',result.unknowns,'unknown']].forEach(([title,items,tone])=>{if(!items.length)return;const section=document.createElement('section');section.className=`war-notes is-${tone}`;const h=document.createElement('h3');h.textContent=title;const ul=document.createElement('ul');items.forEach((text)=>{const li=document.createElement('li');li.textContent=text;ul.append(li);});section.append(h,ul);target.append(section);});}
function renderWarRoom(){if(!ext.snapshot||!$('#warObjectiveSelect'))return;fillTerritories($('#warObjectiveSelect'),false);const soldiers=num(ext.snapshot.military?.soldiers);if(!$('#warCommitted').value)$('#warCommitted').value=Math.round(soldiers*.55);if(!$('#warReserve').value)$('#warReserve').value=Math.round(soldiers*.2);renderObjectiveList();renderWarAssessment();}
function wireWar(){$('#warAddObjective')?.addEventListener('click',()=>{const id=$('#warObjectiveSelect')?.value;if(!id)return;if(!ext.warObjectives.includes(id))ext.warObjectives.push(id);saveJson(storageKey('war-objectives'),ext.warObjectives);renderObjectiveList();renderWarAssessment();});$('#warAssess')?.addEventListener('click',renderWarAssessment);['warCommitted','warReserve','warEnemy','warMonthlyCost'].forEach((id)=>$(`#${id}`)?.addEventListener('change',renderWarAssessment));}

function politicsChanges(){const changes={};$$('[data-estate-change]').forEach((input)=>{const id=input.dataset.estateChange;changes[id]??={};changes[id][input.dataset.kind]=num(input.value);});return changes;}
function renderPoliticsResult(){if(!ext.snapshot)return;const result=simulatePolitics(ext.snapshot.estates||[],politicsChanges()),target=$('#politicsResult');if(!target)return;target.replaceChildren();const columns=document.createElement('div');columns.className='politics-summary';[['ВЫИГРЫВАЮТ',result.winners,'positive'],['ТЕРЯЮТ',result.losers,'danger']].forEach(([title,rows,tone])=>{const col=document.createElement('section');col.className=`is-${tone}`;const h=document.createElement('h3');h.textContent=title;col.append(h);if(!rows.length){const p=document.createElement('p');p.textContent='—';col.append(p);}rows.forEach((row)=>{const p=document.createElement('p');p.textContent=`${row.name}: влияние ${signed(row.powerDelta,' п.п.')}, лояльность ${signed(row.satisfactionDelta,' п.п.')}`;col.append(p);});columns.append(col);});target.append(columns);if(result.risks.length){const ul=document.createElement('ul');ul.className='risk-list';result.risks.forEach((text)=>{const li=document.createElement('li');li.textContent=text;ul.append(li);});target.append(ul);}}
function renderPolitics(){const target=$('#politicsRows');if(!target||!ext.snapshot)return;const saved=loadJson(storageKey('politics'),{});target.replaceChildren();const estates=ext.snapshot.estates||[];if(!estates.length){target.innerHTML='<p class="strategic-empty">Сословия не распознаны в этом снимке.</p>';renderPoliticsResult();return;}estates.forEach((estate)=>{const id=String(estate.id??estate.name);const row=document.createElement('article');row.className='estate-control';const head=document.createElement('div');head.innerHTML=`<strong>${estate.name||id}</strong><small>сейчас: влияние ${fmt(estate.power)} · удовлетворённость ${fmt(estate.satisfaction)}</small>`;const fields=document.createElement('div');fields.className='estate-sliders';[['powerDelta','Δ ВЛИЯНИЯ',-30,30],['satisfactionDelta','Δ ЛОЯЛЬНОСТИ',-50,50]].forEach(([kind,label,min,max])=>{const wrap=document.createElement('label');const title=document.createElement('span'),input=document.createElement('input'),output=document.createElement('output');title.textContent=label;input.type='range';input.min=min;input.max=max;input.step=1;input.value=saved[id]?.[kind]??0;input.dataset.estateChange=id;input.dataset.kind=kind;output.textContent=signed(input.value);input.addEventListener('input',()=>{output.textContent=signed(input.value);const changes=politicsChanges();saveJson(storageKey('politics'),changes);renderPoliticsResult();});wrap.append(title,input,output);fields.append(wrap);});row.append(head,fields);target.append(row);});renderPoliticsResult();}
function wirePolitics(){$('#politicsCalculate')?.addEventListener('click',renderPoliticsResult);$('#politicsReset')?.addEventListener('click',()=>{saveJson(storageKey('politics'),{});renderPolitics();});}

function renderChronicleChart(data){const metric=$('#chronicleMetric')?.value||'treasury';const values=data.series[metric]||[],points=sparklinePoints(values);const line=$('#chronicleChart polyline');if(line)line.setAttribute('points',points);const known=values.filter((value)=>nullable(value)!==null);$('#chronicleRange').textContent=known.length?`${compact(known[0])} → ${compact(known.at(-1))}`:'—';}
function renderChronicle(){if(!ext.snapshot||!$('#chronicleTimeline'))return;const data=buildChronicle(ext.records);$('#chronicleCount').textContent=`${data.entries.length} СНИМКОВ`;renderChronicleChart(data);const target=$('#chronicleTimeline');target.replaceChildren();if(!data.entries.length){target.innerHTML='<p class="strategic-empty">Добавь сохранения этой кампании.</p>';return;}[...data.entries].reverse().forEach((entry)=>{const article=document.createElement('article');article.className='chronicle-entry';const date=document.createElement('time');date.textContent=entry.date;const events=document.createElement('div');entry.events.forEach((item)=>{const row=document.createElement('div');row.className=`chronicle-event is-${item.tone}`;const h=document.createElement('strong'),p=document.createElement('p');h.textContent=item.title;p.textContent=item.detail;row.append(h,p);events.append(row);});article.append(date,events);target.append(article);});}
function wireChronicle(){$('#chronicleMetric')?.addEventListener('change',()=>renderChronicle());}

function mountBinaryDialog(){if($('#binaryDialog'))return;const dialog=document.createElement('dialog');dialog.id='binaryDialog';dialog.className='binary-dialog';dialog.innerHTML=`<form method="dialog"><header><div><p>БИНАРНЫЙ СЕЙВ</p><h2>Инспектор совместимости</h2></div><button value="cancel" aria-label="Закрыть">×</button></header><div id="binaryReport"></div><div class="binary-actions"><button id="binaryExport" type="button" class="secondary-button">ЭКСПОРТ ОТЧЁТА</button><label class="resolver-button">ЗАГРУЗИТЬ RESOLVER JSON<input id="resolverInput" type="file" accept="application/json,.json" hidden></label></div><p class="binary-note">Resolver-пакет здесь только валидируется и сопоставляется с версией. Декодирование бинарного gamestate не включается, пока формат не подтверждён тестами.</p></form>`;document.body.append(dialog);$('#binaryExport',dialog).addEventListener('click',exportBinaryReport);$('#resolverInput',dialog).addEventListener('change',importResolverPack);}
function renderBinaryReport(){const report=ext.binaryReport,target=$('#binaryReport');if(!target||!report)return;target.replaceChildren();const dl=document.createElement('dl');[['Файл',report.fileName],['Размер',`${Math.round(report.size/1024)} КБ`],['Заголовок',report.header],['Версия-подсказка',report.versionHint||'не найдена'],['Дата-подсказка',report.dateHint||'не найдена'],['Fingerprint',report.fingerprint],['Resolver',report.resolver.status==='matched'?report.resolver.id:'не найден']].forEach(([a,b])=>{const row=document.createElement('div');const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;row.append(dt,dd);dl.append(row);});target.append(dl);const tokens=document.createElement('div');tokens.className='token-sample';const h=document.createElement('h3');h.textContent='Частые 16-битные слова';tokens.append(h);report.commonWords.slice(0,8).forEach((item)=>{const span=document.createElement('span');span.textContent=`${item.token} ×${item.count}`;tokens.append(span);});target.append(tokens);const ul=document.createElement('ul');report.limitations.forEach((text)=>{const li=document.createElement('li');li.textContent=text;ul.append(li);});target.append(ul);}
function exportBinaryReport(){if(!ext.binaryReport)return;const blob=new Blob([JSON.stringify(ext.binaryReport,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${ext.binaryReport.fileName||'eu5-binary'}-diagnostic.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importResolverPack(event){const file=event.target.files?.[0];if(!file)return;try{const pack=JSON.parse(await file.text());const check=validateResolverPack(pack);if(!check.valid)throw new Error(check.errors.join(' '));ext.resolverPacks=[...ext.resolverPacks.filter((item)=>item.id!==pack.id),pack].slice(-8);saveJson(`${STORAGE_PREFIX}:resolver-packs`,ext.resolverPacks);toast(`Resolver ${pack.id} сохранён для диагностики`);}catch(error){toast(`Resolver отклонён: ${error.message}`);}finally{event.target.value='';}}
async function interceptBinary(event){const input=event.target;if(input.dataset.v3Bypass==='1'){delete input.dataset.v3Bypass;return;}const file=input.files?.[0];if(!file)return;event.preventDefault();event.stopImmediatePropagation();const head=new Uint8Array(await file.slice(0,64).arrayBuffer());if(!isEu5BinaryBytes(head)){input.dataset.v3Bypass='1';input.dispatchEvent(new Event('change',{bubbles:true}));return;}ext.resolverPacks=loadJson(`${STORAGE_PREFIX}:resolver-packs`,[]);ext.binaryReport=await inspectBinaryFile(file,{resolverPacks:ext.resolverPacks});renderBinaryReport();$('#binaryDialog')?.showModal();input.value='';}

function watchSnapshotChanges(){const target=$('#workspace');if(!target)return;const observer=new MutationObserver(()=>{clearTimeout(ext.mutationTimer);ext.mutationTimer=setTimeout(()=>refreshSnapshot(),80);});observer.observe(target,{subtree:true,childList:true,characterData:true});$('#currentSnapshotSelect')?.addEventListener('change',()=>setTimeout(()=>refreshSnapshot(true),0));}

function mount() {
  loadStyle(); mountPanels(); mountBinaryDialog();
  const fileInput=$('#fileInput'); fileInput?.addEventListener('change',interceptBinary,true);
  watchSnapshotChanges(); refreshSnapshot(true);
}

mount();
