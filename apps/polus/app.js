import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const data = window.POLUS_DATA;
if (!data || !Array.isArray(data.dimensions) || !Array.isArray(data.questions)) {
  throw new Error('POLUS data failed to load');
}

const dimensions = data.dimensions;
const questions = data.questions;
const references = data.references || [];
const byId = new Map(questions.map(function (item) { return [item.id, item]; }));
const dimById = new Map(dimensions.map(function (item) { return [item.id, item]; }));
const anchors = dimensions.map(function (d) {
  const item = questions.find(function (q) { return q.axis === d.id; });
  return item ? item.id : null;
}).filter(Boolean);

const store = createVersionedStore({
  namespace: 'pocket-works:polus',
  version: 1,
  defaults: { depth: 50, session: null, result: null }
});

function $(selector) { return document.querySelector(selector); }
function $$(selector) { return Array.from(document.querySelectorAll(selector)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const views = new Map($$('[data-view]').map(function (node) { return [node.dataset.view, node]; }));
const depthRange = $('#depthRange');
const depthValue = $('#depthValue');
const depthBadge = $('#depthBadge');
const depthNote = $('#depthNote');
const startBtn = $('#startBtn');
const resumeChip = $('#resumeChip');
const lastResultBtn = $('#lastResultBtn');
const lastResultMeta = $('#lastResultMeta');
const qIndex = $('#qIndex');
const qTotal = $('#qTotal');
const progressFill = $('#progressFill');
const liveAxis = $('#liveAxis');
const questionDomain = $('#questionDomain');
const questionText = $('#questionText');
const answerScale = $('#answerScale');
const backQuestionBtn = $('#backQuestionBtn');
const skipQuestionBtn = $('#skipQuestionBtn');
const confirmDialog = $('#confirmDialog');
const confirmTitle = $('#confirmTitle');
const confirmText = $('#confirmText');
const confirmOk = $('#confirmOk');
const referenceList = $('#referenceList');
const referenceDetail = $('#referenceDetail');

let referenceType = 'country';
let selectedReference = null;

function route(name, options) {
  const opts = options || {};
  const target = views.has(name) ? name : 'home';
  views.forEach(function (view, key) {
    view.classList.toggle('active', key === target);
  });
  refreshHomeState();
  if (opts.replaceHash !== false) history.replaceState(null, '', '#' + target);
  if (target === 'results') renderResults();
  if (target === 'compare') renderReferences();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function depthCopy(value) {
  if (value <= 20) return ['набросок', 'Одна–две проверки каждой оси. Быстро, но широкий диапазон неопределённости.'];
  if (value <= 40) return ['контур', 'Несколько формулировок на ось; уже видно противоречия и смешанные позиции.'];
  if (value <= 60) return ['подробно', 'Пять–шесть заходов на каждую ось в среднем; адаптивный выбор уточнит спорные зоны.'];
  if (value <= 80) return ['глубоко', 'Алгоритм чаще возвращается к осям с противоречивыми ответами и сужает неопределённость.'];
  return ['максимум', 'Вся сотня утверждений: десять формулировок на каждую ось и самая устойчивая версия профиля.'];
}

function updateDepthUI(value, persist) {
  const depth = Number(value);
  const copy = depthCopy(depth);
  depthValue.textContent = String(depth);
  depthBadge.textContent = copy[0];
  depthNote.textContent = copy[1];
  const percentage = ((depth - 10) / 90) * 100;
  depthRange.style.setProperty('--depth-percent', percentage + '%');
  if (persist !== false) store.set('depth', depth);
}

function renderHeroGlyph() {
  const host = $('#heroGlyph');
  host.innerHTML = '';
  for (let i = 0; i < 10; i += 1) {
    const line = document.createElement('i');
    line.style.transform = 'translate(-50%,-50%) rotate(' + (i * 18) + 'deg)';
    host.appendChild(line);
  }
}

function renderAxisPreview() {
  $('#axisPreviewList').innerHTML = dimensions.map(function (d, index) {
    return '<div class="axis-preview-row">' +
      '<span>' + String(index + 1).padStart(2, '0') + '</span>' +
      '<div><b>' + esc(d.n) + '</b><div class="mini-poles"><span>' + esc(d.left) +
      '</span><span>' + esc(d.right) + '</span></div></div></div>';
  }).join('');
}

function startSession() {
  const total = Number(depthRange.value);
  const session = {
    total: total,
    asked: [],
    answers: {},
    cursor: 0,
    startedAt: new Date().toISOString()
  };
  store.set('session', session);
  ensureCurrentQuestion(session);
  route('quiz');
  renderQuestion();
  refreshHomeState();
}

function signedAnswer(question, value) {
  if (value == null) return null;
  return (Number(value) / 3) * question.polarity;
}

function axisStatsFromAnswers(answers) {
  const stats = {};
  dimensions.forEach(function (dim) {
    const items = questions.filter(function (question) {
      return question.axis === dim.id && Object.prototype.hasOwnProperty.call(answers, question.id);
    });
    const usable = items.filter(function (question) {
      return answers[question.id] != null;
    });
    let numerator = 0;
    let denominator = 0;
    const signed = [];

    usable.forEach(function (item) {
      const value = signedAnswer(item, answers[item.id]);
      numerator += value * item.weight;
      denominator += item.weight;
      signed.push(value);
    });

    const mean = denominator ? numerator / denominator : 0;
    const average = signed.length
      ? signed.reduce(function (sum, value) { return sum + value; }, 0) / signed.length
      : 0;
    const variance = signed.length > 1
      ? signed.reduce(function (sum, value) { return sum + Math.pow(value - average, 2); }, 0) / signed.length
      : 0.45;
    const spread = Math.sqrt(variance);
    const coverage = Math.min(1, usable.length / 6);
    const consistency = clamp(1 - spread / 1.05, 0, 1);
    const confidence = clamp(
      0.18 + coverage * 0.57 + consistency * 0.25 - (items.length - usable.length) * 0.025,
      0.12,
      1
    );

    stats[dim.id] = {
      asked: items.length,
      usable: usable.length,
      score: Math.round(mean * 100),
      spread: spread,
      confidence: confidence
    };
  });
  return stats;
}

function chooseNextQuestion(session) {
  const used = new Set(session.asked);

  for (let i = 0; i < anchors.length; i += 1) {
    if (!used.has(anchors[i])) return anchors[i];
  }

  const stats = axisStatsFromAnswers(session.answers);
  const target = session.total / dimensions.length;
  let bestAxis = null;
  let bestNeed = -Infinity;

  dimensions.forEach(function (dim) {
    const remaining = questions.some(function (question) {
      return question.axis === dim.id && !used.has(question.id);
    });
    if (!remaining) return;

    const stat = stats[dim.id];
    const under = Math.max(0, target - stat.asked) / Math.max(1, target);
    const uncertainty = 1 - stat.confidence;
    const contradiction = clamp(stat.spread / 0.9, 0, 1);
    const need = under * 1.5 + uncertainty * 0.9 + contradiction * 0.55 - stat.asked * 0.01;
    if (need > bestNeed) {
      bestNeed = need;
      bestAxis = dim.id;
    }
  });

  const candidates = questions.filter(function (question) {
    return question.axis === bestAxis && !used.has(question.id);
  });

  if (!candidates.length) {
    const fallback = questions.find(function (question) { return !used.has(question.id); });
    return fallback ? fallback.id : null;
  }

  const polarityBalance = questions
    .filter(function (question) {
      return question.axis === bestAxis && Object.prototype.hasOwnProperty.call(session.answers, question.id);
    })
    .reduce(function (sum, question) { return sum + question.polarity; }, 0);

  candidates.sort(function (a, b) {
    const aBalance = Math.abs(polarityBalance + a.polarity);
    const bBalance = Math.abs(polarityBalance + b.polarity);
    return aBalance - bBalance || b.weight - a.weight || a.id.localeCompare(b.id);
  });

  return candidates[0].id;
}

function ensureCurrentQuestion(session) {
  if (!session.asked.length) {
    const first = chooseNextQuestion(session);
    if (first) session.asked.push(first);
  }
  store.set('session', session);
}

function renderQuestion() {
  const session = store.get('session');
  if (!session) {
    route('home');
    return;
  }

  ensureCurrentQuestion(session);
  const questionId = session.asked[session.cursor];
  const question = byId.get(questionId);
  if (!question) return;

  qIndex.textContent = String(session.cursor + 1);
  qTotal.textContent = String(session.total);
  progressFill.style.width = ((session.cursor / session.total) * 100) + '%';

  const dim = dimById.get(question.axis);
  questionDomain.textContent = dim.n.toUpperCase();
  questionText.textContent = question.text;
  liveAxis.textContent = dim.left + '  ←  ' + dim.short + '  →  ' + dim.right;
  backQuestionBtn.disabled = session.cursor === 0;

  const hasSaved = Object.prototype.hasOwnProperty.call(session.answers, questionId);
  const saved = hasSaved ? session.answers[questionId] : undefined;
  $$('#answerScale button').forEach(function (button) {
    const selected = saved != null && Number(button.dataset.value) === saved;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function answerCurrent(value) {
  const session = store.get('session');
  if (!session) return;

  const questionId = session.asked[session.cursor];
  session.answers[questionId] = value;

  if (session.cursor + 1 >= session.total) {
    finishSession(session);
    return;
  }

  if (session.cursor < session.asked.length - 1) {
    session.cursor += 1;
  } else {
    const next = chooseNextQuestion(session);
    if (!next) {
      finishSession(session);
      return;
    }
    session.asked.push(next);
    session.cursor += 1;
  }

  store.set('session', session);
  renderQuestion();
}

function finishSession(session) {
  const stats = axisStatsFromAnswers(session.answers);
  const values = Object.values(session.answers);
  const result = {
    completedAt: new Date().toISOString(),
    total: session.total,
    answered: values.filter(function (value) { return value != null; }).length,
    skipped: values.filter(function (value) { return value == null; }).length,
    axes: Object.fromEntries(dimensions.map(function (dim) {
      return [dim.id, stats[dim.id]];
    }))
  };
  store.patch({ result: result, session: null });
  refreshHomeState();
  route('results');
}

function resultProjection(result) {
  const axes = result.axes;
  return {
    economic: Math.round((axes.economy.score + axes.redistribution.score) / 2),
    authority: Math.round((axes.civil.score + axes.power.score) / 2)
  };
}

function zoneName(projection) {
  const economy = Math.abs(projection.economic) < 18
    ? 'экономический центр'
    : projection.economic < 0 ? 'экономически левее' : 'экономически правее';
  const authority = Math.abs(projection.authority) < 18
    ? 'баланс свободы и власти'
    : projection.authority < 0 ? 'больше личной свободы' : 'больше государственной власти';
  return economy + ' · ' + authority;
}

function endpointText(dim, score) {
  if (Math.abs(score) < 12) return 'почти посередине';
  return score < 0 ? dim.left : dim.right;
}

function renderResults() {
  const result = store.get('result');
  if (!result) {
    route('home');
    return;
  }

  const projection = resultProjection(result);
  $('#quadrantName').textContent = zoneName(projection);
  const averageConfidence = dimensions.reduce(function (sum, dim) {
    return sum + result.axes[dim.id].confidence;
  }, 0) / dimensions.length;
  $('#resultConfidence').textContent = 'уверенность ' + Math.round(averageConfidence * 100) + '%';
  $('#compassDot').style.left = (50 + projection.economic * 0.42) + '%';
  $('#compassDot').style.top = (50 - projection.authority * 0.42) + '%';

  $('#axesResultsList').innerHTML = dimensions.map(function (dim, index) {
    const stat = result.axes[dim.id];
    const position = clamp(50 + stat.score / 2, 0, 100);
    const sign = stat.score > 0 ? '+' : '';
    return '<article class="axis-result">' +
      '<div class="axis-result-head"><b>' + String(index + 1).padStart(2, '0') + ' · ' + esc(dim.n) +
      '</b><span>' + sign + stat.score + ' · ' + esc(endpointText(dim, stat.score)) + '</span></div>' +
      '<div class="axis-bar"><i style="left:' + position + '%"></i></div>' +
      '<div class="axis-poles"><span>' + esc(dim.left) + '</span><span>' + esc(dim.right) + '</span></div>' +
      '<div class="axis-confidence">уверенность ' + Math.round(stat.confidence * 100) +
      '% · содержательных ответов ' + stat.usable + '/' + stat.asked + '</div></article>';
  }).join('');
}

function renderReferences() {
  const list = references.filter(function (item) { return item.type === referenceType; });
  referenceList.innerHTML = list.map(function (item, index) {
    return '<button class="reference-card ' + (selectedReference === item.id ? 'selected' : '') +
      '" type="button" data-ref-id="' + esc(item.id) + '" data-native-press>' +
      '<span class="ref-index">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span><b>' + esc(item.name) + '</b><small>' + esc(item.subtitle) +
      '</small></span><span>→</span></button>';
  }).join('');

  if (selectedReference) renderReferenceDetail(selectedReference);
}

function renderReferenceDetail(id) {
  const item = references.find(function (ref) {
    return ref.id === id && ref.type === referenceType;
  });
  if (!item) {
    referenceDetail.hidden = true;
    return;
  }

  referenceDetail.hidden = false;
  const factHtml = item.facts.map(function (fact) {
    const tags = fact.axes.map(function (axis) {
      const dim = dimById.get(axis);
      return '<span>' + esc(dim ? dim.n : axis) + '</span>';
    }).join('');
    return '<div class="fact"><b>' + esc(fact.title) + '</b><p>' + esc(fact.text) +
      '</p><div class="fact-tags">' + tags + '</div></div>';
  }).join('');

  referenceDetail.innerHTML =
    '<p class="eyebrow">' + (item.type === 'country' ? 'СОВРЕМЕННОЕ ГОСУДАРСТВО' : 'ИСТОРИЧЕСКАЯ ФИГУРА') + '</p>' +
    '<h2>' + esc(item.name) + '</h2>' +
    '<p>' + esc(item.subtitle) + '. Ниже — не оценка идеологии, а несколько проверяемых характеристик, которые можно сопоставить со своими осями.</p>' +
    '<div class="fact-list">' + factHtml + '</div>' +
    '<a class="source-link" href="' + esc(item.source) + '" target="_blank" rel="noreferrer">' +
    esc(item.sourceLabel) + ' ↗</a>';

  referenceDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function refreshHomeState() {
  const session = store.get('session');
  const result = store.get('result');

  const quizActive = views.get('quiz') && views.get('quiz').classList.contains('active');
  resumeChip.hidden = !session || Boolean(quizActive);
  if (session) resumeChip.textContent = 'Продолжить ' + (session.cursor + 1) + '/' + session.total;

  lastResultBtn.hidden = !result;
  if (result) {
    const date = new Date(result.completedAt);
    lastResultMeta.textContent = result.total + ' вопросов · ' + date.toLocaleDateString('ru-RU');
  }
}

function shareResult() {
  const result = store.get('result');
  if (!result) return;

  const projection = resultProjection(result);
  const topAxes = dimensions
    .map(function (dim) { return { dim: dim, score: result.axes[dim.id].score }; })
    .sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); })
    .slice(0, 3)
    .map(function (entry) {
      return entry.dim.n + ': ' + (entry.score > 0 ? '+' : '') + entry.score +
        ' (' + endpointText(entry.dim, entry.score) + ')';
    })
    .join('\n');

  const text = 'ПОЛЮС — мой политический профиль\n' +
    zoneName(projection) + '\n' + topAxes + '\n' + result.total + ' вопросов.';

  if (navigator.share) {
    navigator.share({ title: 'ПОЛЮС — политический профиль', text: text }).catch(function () {});
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      const button = $('#shareBtn');
      const old = button.textContent;
      button.textContent = '✓';
      window.setTimeout(function () { button.textContent = old; }, 1200);
    }).catch(function () {});
  }
}

function openConfirm(options) {
  confirmTitle.textContent = options.title;
  confirmText.textContent = options.text;
  confirmOk.textContent = options.actionLabel || 'Продолжить';
  confirmDialog.returnValue = '';

  function handler() {
    confirmDialog.removeEventListener('close', handler);
    if (confirmDialog.returnValue === 'ok' && typeof options.onConfirm === 'function') {
      options.onConfirm();
    }
  }

  confirmDialog.addEventListener('close', handler);
  confirmDialog.showModal();
}

depthRange.value = String(store.get('depth', 50));
updateDepthUI(depthRange.value, false);

depthRange.addEventListener('input', function (event) {
  updateDepthUI(event.target.value, true);
});

startBtn.addEventListener('click', function () {
  const existing = store.get('session');
  if (!existing) {
    startSession();
    return;
  }
  openConfirm({
    title: 'Начать новый тест?',
    text: 'Незавершённый тест ' + (existing.cursor + 1) + '/' + existing.total + ' будет заменён.',
    actionLabel: 'Начать заново',
    onConfirm: startSession
  });
});

resumeChip.addEventListener('click', function () {
  route('quiz');
  renderQuestion();
});

answerScale.addEventListener('click', function (event) {
  const button = event.target.closest('button[data-value]');
  if (!button) return;
  button.classList.add('selected');
  window.setTimeout(function () {
    answerCurrent(Number(button.dataset.value));
  }, 90);
});

skipQuestionBtn.addEventListener('click', function () {
  answerCurrent(null);
});

backQuestionBtn.addEventListener('click', function () {
  const session = store.get('session');
  if (!session || session.cursor <= 0) return;
  session.cursor -= 1;
  store.set('session', session);
  renderQuestion();
});

$('#quitQuizBtn').addEventListener('click', function () {
  openConfirm({
    title: 'Выйти из теста?',
    text: 'Прогресс сохранён локально. Продолжить можно с главного экрана.',
    actionLabel: 'Выйти',
    onConfirm: function () {
      route('home');
      refreshHomeState();
    }
  });
});

$('#restartBtn').addEventListener('click', function () {
  route('home');
  window.setTimeout(function () { startBtn.focus(); }, 120);
});

$('#shareBtn').addEventListener('click', shareResult);

document.addEventListener('click', function (event) {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton && !routeButton.matches('a[href^="../../"]')) {
    event.preventDefault();
    const target = routeButton.dataset.route;
    if (target === 'results' && !store.get('result')) route('home');
    else route(target);
  }

  const refButton = event.target.closest('[data-ref-id]');
  if (refButton) {
    selectedReference = refButton.dataset.refId;
    renderReferences();
  }

  const typeButton = event.target.closest('[data-ref-type]');
  if (typeButton) {
    referenceType = typeButton.dataset.refType;
    selectedReference = null;
    $$('[data-ref-type]').forEach(function (button) {
      button.classList.toggle('active', button === typeButton);
    });
    renderReferences();
    referenceDetail.hidden = true;
  }
});

window.addEventListener('hashchange', function () {
  const name = location.hash.slice(1);
  if (name === 'quiz' && store.get('session')) {
    route('quiz', { replaceHash: false });
    renderQuestion();
  } else {
    route(name || 'home', { replaceHash: false });
  }
});

createWorkshopMode({
  appName: 'ПОЛЮС',
  version: '1.0.0',
  cachePrefix: 'polus-',
  storageNamespace: 'pocket-works:polus',
  onReset: function () {
    store.reset();
    depthRange.value = '50';
    updateDepthUI(50, false);
    refreshHomeState();
    route('home');
  }
});

watchConnectivity(function (online) {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

renderHeroGlyph();
renderAxisPreview();
refreshHomeState();

const initial = location.hash.slice(1);
if (initial === 'quiz' && store.get('session')) {
  route('quiz');
  renderQuestion();
} else if (initial === 'results' && store.get('result')) {
  route('results');
} else if (initial === 'compare' || initial === 'method') {
  route(initial);
} else {
  route('home');
}
