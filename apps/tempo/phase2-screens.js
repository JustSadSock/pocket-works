import { CONTEXTS, TECHNIQUES } from './protocols.js';
import { e } from './screens.js';
import {
  EXPERIMENT_METRICS,
  activeExperiment,
  allProtocols,
  buildFactorInsights,
  evaluateExperiment
} from './phase2.js';

const CONTEXT_LABELS = new Map(CONTEXTS);
const STATUS_LABELS = {
  planned: 'Запланирован',
  active: 'Идёт сейчас',
  paused: 'На паузе',
  completed: 'Завершён',
  archived: 'Архив'
};

function score(value) {
  return value == null ? '—' : Number(value).toFixed(Number(value) % 1 ? 1 : 0);
}

function protocolMap(phase2State) {
  return new Map(allProtocols(TECHNIQUES, phase2State, { includeArchived: true }).map((item) => [item.id, item.title]));
}

function productMap(coreState) {
  return new Map((coreState.products || []).map((item) => [item.id, item.name]));
}

export function factorLabel(coreState, phase2State, kind, value) {
  if (kind === 'technique') return protocolMap(phase2State).get(value) || value;
  if (kind === 'product') return productMap(coreState).get(value) || value;
  if (kind === 'context') return CONTEXT_LABELS.get(value) || value;
  return value || 'Собственное изменение';
}

function directionCopy(result) {
  if (result.direction === 'positive') return 'Изменение выглядит полезным';
  if (result.direction === 'negative') return 'Изменение выглядит хуже базы';
  if (result.direction === 'flat') return 'Явного сдвига пока нет';
  return 'Данных пока недостаточно';
}

function experimentCard(coreState, phase2State, experiment) {
  const result = evaluateExperiment(coreState, phase2State, experiment);
  const baselineWidth = Math.round(result.progress.baseline * 100);
  const interventionWidth = Math.round(result.progress.intervention * 100);
  const actions = experiment.status === 'active'
    ? `<button class="outline" data-experiment-status="paused" data-experiment-id="${e(experiment.id)}">Пауза</button><button class="solid" data-experiment-status="completed" data-experiment-id="${e(experiment.id)}">Завершить</button>`
    : experiment.status === 'completed' || experiment.status === 'archived'
      ? `<button class="outline" data-experiment-status="archived" data-experiment-id="${e(experiment.id)}">В архив</button>`
      : `<button class="solid" data-experiment-status="active" data-experiment-id="${e(experiment.id)}">Сделать активным</button><button class="outline" data-experiment-status="archived" data-experiment-id="${e(experiment.id)}">В архив</button>`;
  return `<article class="experiment ${result.direction}">
    <div class="experiment-head"><div><p class="eyebrow">${e(STATUS_LABELS[experiment.status] || experiment.status)}</p><h2>${e(experiment.title)}</h2></div><b>${e(result.metric.label)}</b></div>
    <p>${e(experiment.hypothesis || `Проверяем фактор: ${experiment.factorLabel}`)}</p>
    <div class="progress-pair"><div><span>База ${result.baselineCount}/${experiment.sampleTarget}</span><i><b style="width:${baselineWidth}%"></b></i></div><div><span>Изменение ${result.interventionCount}/${experiment.sampleTarget}</span><i><b style="width:${interventionWidth}%"></b></i></div></div>
    <div class="result-line"><strong>${directionCopy(result)}</strong><span>${score(result.baselineMedian)} → ${score(result.interventionMedian)} · ${e(result.confidence)}</span></div>
    ${result.confounders.length ? `<div class="confounders">${result.confounders.map((item) => `<p>${e(item)}</p>`).join('')}</div>` : ''}
    <div class="experiment-actions">${actions}</div>
  </article>`;
}

function insightLabel(coreState, phase2State, insight) {
  return factorLabel(coreState, phase2State, insight.kind, insight.value);
}

export function experimentsScreen(coreState, phase2State) {
  const experiments = [...phase2State.experiments].sort((a, b) => {
    const order = { active: 0, planned: 1, paused: 2, completed: 3, archived: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(b.createdAt) - new Date(a.createdAt);
  });
  const insights = buildFactorInsights(coreState, 'control').slice(0, 4);
  return `<div class="pagehead"><p class="eyebrow">ПРОВЕРКА ГИПОТЕЗ</p><h1>Менять по одной вещи.</h1><p>Сначала база, потом изменение. Три наблюдения на группу — минимальный порог, а не магическое доказательство.</p><button class="solid" data-action="experiment">Новый эксперимент</button></div>
    <section class="experiment-list">${experiments.length ? experiments.map((item) => experimentCard(coreState, phase2State, item)).join('') : '<div class="empty">Экспериментов пока нет. Создай один вопрос, а не лабораторию из пятнадцати переменных.</div>'}</section>
    <section class="section"><div class="sectionhead"><div><p class="eyebrow">АВТОМАТИЧЕСКИЙ ОБЗОР</p><h2>Факторы с данными</h2></div><small>минимум 3 + 3</small></div>
    ${insights.length ? `<div class="insights">${insights.map((item) => `<article><b>${e(insightLabel(coreState, phase2State, item))}</b><span>${item.adjustedDelta > 0 ? '+' : ''}${score(item.adjustedDelta)} к метрике «${e(item.metric.label)}»</span><small>${item.presentCount} с фактором · ${item.absentCount} без</small></article>`).join('')}</div>` : '<div class="empty">Пока ни у одного фактора нет хотя бы трёх записей с ним и трёх без него.</div>'}
    <div class="note">Это поиск направлений, а не диагноз и не доказательство причины. Если одновременно поменялись сон, техника и сценарий — статистика тоже пожмёт плечами.</div></section>`;
}

export function experimentForm(coreState, phase2State) {
  const protocols = allProtocols(TECHNIQUES, phase2State);
  const options = [
    ...protocols.map((item) => [`technique:${item.id}`, `Техника — ${item.title}`]),
    ...(coreState.products || []).map((item) => [`product:${item.id}`, `Средство — ${item.name}`]),
    ...CONTEXTS.map(([value, label]) => [`context:${value}`, `Контекст — ${label}`]),
    ['custom:other', 'Другое изменение']
  ];
  return `<form id="experiment-form">
    <label class="field"><span>Название эксперимента</span><input name="title" maxlength="160" required placeholder="Например: Stop–start против обычного сценария"></label>
    <label class="field"><span>Что меняем</span><select name="factorKey" required>${options.map(([value, label]) => `<option value="${e(value)}">${e(label)}</option>`).join('')}</select></label>
    <label class="field"><span>Своё описание изменения</span><input name="customFactor" maxlength="160" placeholder="Нужно только для варианта «Другое»"></label>
    <label class="field"><span>Главная метрика</span><select name="targetMetric">${EXPERIMENT_METRICS.map((item) => `<option value="${item.id}">${e(item.label)}</option>`).join('')}</select></label>
    <fieldset><legend>Наблюдений в каждой группе</legend><div class="choices">${[3,5,7].map((value) => `<label><input type="radio" name="sampleTarget" value="${value}" ${value === 3 ? 'checked' : ''}><span>${value}</span></label>`).join('')}</div></fieldset>
    <label class="field"><span>Гипотеза</span><textarea name="hypothesis" rows="4" maxlength="1200" placeholder="Что именно должно измениться и почему?"></textarea></label>
    <div class="warning">Новый эксперимент поставит текущий активный эксперимент на паузу. Старые записи никуда не денутся.</div>
    <div class="form-actions"><button class="solid" type="submit">Начать с базовой группы</button></div>
  </form>`;
}

export function customProtocolForm() {
  return `<form id="protocol-form">
    <label class="field"><span>Название</span><input name="title" maxlength="140" required></label>
    <label class="field"><span>Короткое объяснение</span><textarea name="summary" rows="3" maxlength="500"></textarea></label>
    <div class="split-fields"><label class="field"><span>Циклы</span><input name="cycles" type="number" min="0" max="8" value="3"></label><label class="field"><span>Пауза, секунд</span><input name="pause" type="number" min="0" max="180" value="30"></label></div>
    <label class="field"><span>Шаги — каждый с новой строки</span><textarea name="steps" rows="7" maxlength="5000" required placeholder="Заметь уровень возбуждения\nОстановись заранее\nВернись после снижения"></textarea></label>
    <div class="form-actions"><button class="solid" type="submit">Сохранить протокол</button></div>
  </form>`;
}

export function replaceCustomProtocolNames(html, phase2State) {
  let output = String(html || '');
  for (const protocol of normalizeCustomProtocols(phase2State)) {
    output = output.replaceAll(e(protocol.id), e(protocol.title));
  }
  return output;
}

function normalizeCustomProtocols(phase2State) {
  return Array.isArray(phase2State?.customProtocols) ? phase2State.customProtocols : [];
}

export function episodeFormWithExperiment(baseHtml, coreState, phase2State) {
  const protocolOptions = allProtocols(TECHNIQUES, phase2State)
    .map((item) => `<option value="${e(item.id)}">${e(item.title)}</option>`)
    .join('');
  let enhanced = baseHtml.replace(/<select name="techniqueId">[\s\S]*?<\/select>/, `<select name="techniqueId"><option value="">Нет</option>${protocolOptions}</select>`);
  const experiment = activeExperiment(phase2State);
  if (!experiment) return enhanced;
  const result = evaluateExperiment(coreState, phase2State, experiment);
  const defaultPhase = result.baselineCount < experiment.sampleTarget ? 'baseline' : 'intervention';
  const block = `<fieldset class="experiment-link"><legend>Активный эксперимент: ${e(experiment.title)}</legend><p>${e(experiment.factorLabel)}</p><div class="choices"><label><input type="radio" name="experimentPhase" value="baseline" ${defaultPhase === 'baseline' ? 'checked' : ''}><span>База</span></label><label><input type="radio" name="experimentPhase" value="intervention" ${defaultPhase === 'intervention' ? 'checked' : ''}><span>С изменением</span></label><label><input type="radio" name="experimentPhase" value=""><span>Не связывать</span></label></div></fieldset>`;
  return enhanced.replace('<div class="form-actions">', `${block}<div class="form-actions">`);
}

export function techniquesWithCustom(baseHtml, phase2State) {
  const custom = phase2State.customProtocols.filter((item) => !item.archived);
  const section = `<section class="products custom-protocols"><div class="sectionhead"><div><p class="eyebrow">СВОИ СЦЕНАРИИ</p><h2>Пользовательские протоколы</h2></div><button data-action="protocol">Создать</button></div>
    ${custom.length ? custom.map((item) => `<article class="product"><div><b>${e(item.title)}</b><span>${item.cycles} цикл(а) · пауза ${item.pause} с · ${e(item.summary)}</span></div><span><button class="link" data-technique="${e(item.id)}">Запустить</button><button class="link" data-protocol-archive="${e(item.id)}">Архив</button></span></article>`).join('') : '<div class="empty">Можно собрать собственный сценарий из шагов, циклов и паузы — без правки кода.</div>'}</section>`;
  return `${baseHtml}${section}`;
}

export function todayWithPhase2(baseHtml, coreState, phase2State) {
  const experiment = activeExperiment(phase2State);
  if (!experiment) {
    return `${baseHtml}<section class="section experiment-teaser"><div class="sectionhead"><div><p class="eyebrow">ВТОРОЙ ЭТАП</p><h2>Проверить одну гипотезу</h2></div><button data-tab="experiments">Открыть</button></div><p>Собери базу, измени один фактор и сравни медианы без самообмана по одной удачной попытке.</p></section>`;
  }
  const result = evaluateExperiment(coreState, phase2State, experiment);
  return `${baseHtml}<section class="section active-experiment"><div class="sectionhead"><div><p class="eyebrow">АКТИВНЫЙ ЭКСПЕРИМЕНТ</p><h2>${e(experiment.title)}</h2></div><button data-tab="experiments">Подробнее</button></div><p>${e(experiment.hypothesis || experiment.factorLabel)}</p><div class="metrics"><div class="metric"><b>${result.baselineCount}/${experiment.sampleTarget}</b><span>база</span></div><div class="metric"><b>${result.interventionCount}/${experiment.sampleTarget}</b><span>изменение</span></div><div class="metric"><b>${score(result.adjustedDelta)}</b><span>направление</span></div></div></section>`;
}

export function sessionExperimentNotice(phase2State) {
  const experiment = activeExperiment(phase2State);
  if (!experiment) return '';
  if (!['control', 'pleasure', 'anxiety'].includes(experiment.targetMetric)) {
    return `<div class="note">Эксперимент «${e(experiment.title)}» измеряет показатель, которого нет в форме практики. Связать с ним можно следующий эпизод.</div>`;
  }
  return `<label class="check experiment-session"><input id="session-experiment" type="checkbox" checked><span>Связать практику с экспериментом «${e(experiment.title)}» как изменение</span></label>`;
}
