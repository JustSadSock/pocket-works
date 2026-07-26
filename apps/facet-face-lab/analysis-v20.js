// FACET v2.0 — evidence-calibrated appearance interpretation.
const __facetV20Version = '2.0.0';

function __facetV20Clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function __facetV20Mean(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function __facetV20Median(values) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function __facetV20Number(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function __facetV20Text(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function __facetV20NormalizeDescriptor(item, index, result) {
  const advanced = result?.advanced || {};
  const traits = new Map((result?.traits || []).map((trait) => [trait.key, trait]));
  const key = item?.key || `feature-${index}`;
  const trait = traits.get(key);
  const label = __facetV20Text(item?.label, item?.name, trait?.label, key);
  const classification = __facetV20Text(
    item?.classification,
    item?.typeLabel,
    item?.result,
    item?.title,
    trait?.label,
    item?.level === 'distinctive' ? 'Выраженная особенность' : '',
    item?.level === 'moderate' ? 'Умеренная особенность' : '',
    'Измерено'
  );
  const confidence = __facetV20Clamp(__facetV20Number(item?.confidence, trait?.confidence, advanced.confidence, result?.reliability, 60));
  const stability = __facetV20Clamp(__facetV20Number(item?.stability, trait?.stability, advanced.landmarkStability, result?.consistency, 60));
  const rawSalience = __facetV20Number(item?.salience, item?.importance, item?.weight ? item.weight * 100 : NaN);
  const z = Math.abs(__facetV20Number(item?.z, item?.signedZ, item?.deviation));
  const salience = __facetV20Clamp(rawSalience || Math.min(100, 34 + z * 27));
  const thresholdMargin = __facetV20Clamp(__facetV20Number(item?.margin, item?.classMargin, item?.separation, confidence));
  const evidence = __facetV20Clamp(
    Math.sqrt(Math.max(0, confidence * stability)) * 0.84 + thresholdMargin * 0.16
  );
  const evidenceText = __facetV20Text(item?.evidence, item?.description, trait?.evidence, trait?.description);
  const zone = typeof __facetV18Zone === 'function'
    ? __facetV18Zone(__facetV20Text(item?.zone, item?.group, item?.category, key))
    : 'frame';
  const ambiguous = evidence < 64 || /погранич|не определ|смешан|неустойчив/i.test(`${classification} ${evidenceText}`);
  return {
    key,
    label,
    classification,
    confidence: Math.round(confidence),
    stability: Math.round(stability),
    salience: Math.round(salience),
    evidence: Math.round(evidence),
    evidenceText,
    zone,
    ambiguous,
    score: evidence * (0.45 + salience / 182)
  };
}

function __facetV20Descriptors(result) {
  const advanced = result?.advanced || {};
  const candidate = advanced.descriptors || result?.descriptors || result?.featureDetails || result?.traits || [];
  const source = Array.isArray(candidate) ? candidate : Object.values(candidate || {});
  return source.map((item, index) => __facetV20NormalizeDescriptor(item, index, result));
}

function __facetV20Relations(result) {
  const advanced = result?.advanced || {};
  const candidate = advanced.relations || result?.interactions || result?.relations || [];
  const source = Array.isArray(candidate) ? candidate : Object.values(candidate || {});
  return source.map((item) => __facetV20Clamp(__facetV20Number(item?.score, item?.coherence, item?.compatibility, item?.value, 50)));
}

function __facetV20Axis(descriptors, pattern, fallback = 50) {
  const matches = descriptors.filter((item) => pattern.test(`${item.label} ${item.classification} ${item.evidenceText}`));
  if (!matches.length) return fallback;
  return __facetV20Clamp(__facetV20Mean(matches.map((item) => item.salience * 0.55 + item.evidence * 0.45)));
}

function __facetV20Suggestions(descriptors) {
  const text = descriptors
    .filter((item) => item.evidence >= 64)
    .map((item) => `${item.label} ${item.classification}`.toLowerCase())
    .join(' · ');
  const suggestions = [];
  const push = (title, copy) => {
    if (!suggestions.some((item) => item.title === title)) suggestions.push({ title, copy });
  };

  if (/удлин|вытянут/.test(text)) push('Баланс контура', 'Боковой объём причёски и оправы средней или большой ширины визуально уравновешивают выраженную вертикаль лица.');
  else if (/округл/.test(text)) push('Геометрия образа', 'Угловатые оправы, диагональные линии и умеренный объём сверху добавляют структуру, не пытаясь «исправлять» контур.');
  else if (/квадрат|угловат|широкая челюсть|выраженная челюсть/.test(text)) push('Смягчение или акцент', 'Овальные формы смягчат каркас, а прямоугольные и массивные оправы, наоборот, подчеркнут его. Выбор зависит от желаемого характера образа.');
  else if (/сердцевид|узкая челюсть/.test(text)) push('Равновесие верхней и нижней части', 'Объём около нижней части лица и оправы с более заметной нижней линией помогают перераспределить визуальный вес.');
  else if (/ромбовид|выраженные скулы/.test(text)) push('Работа со скулами', 'Оправа с выразительной верхней линией поддержит скулы; мягкий объём у висков сделает переходы спокойнее.');
  else push('Контур', 'Выбирай между поддержкой текущей геометрии и намеренным контрастом: FACET показывает структуру, но не назначает один «правильный» образ.');

  if (/восходящ/.test(text)) push('Линия глаз', 'Восходящую линию лучше либо продолжать формой оправы и бровей, либо контрастировать с ней явно; случайно нисходящие детали чаще создают визуальный конфликт.');
  else if (/нисходящ/.test(text)) push('Линия глаз', 'Небольшой подъём внешней части оправы или брови может добавить динамики; нейтральная форма сохранит более спокойное выражение.');
  else if (/округлые.*глаз|глаза.*округл/.test(text)) push('Акцент глаз', 'Более вытянутые оправы и горизонтальные линии подчеркнут ширину; округлые формы усилят открытость взгляда.');

  if (/широкий нос|выраженная проекция|проекция носа/.test(text)) push('Камера', 'Для портретов отодвинь телефон и используй 1.5–2×: близкая широкоугольная камера заметно усиливает центральную проекцию лица.');
  else push('Камера', 'Для честного сравнения образов держи одинаковыми расстояние, фокусное расстояние, высоту камеры и мягкий фронтальный свет.');

  if (/полные губы|широкие губы|широкий рот/.test(text)) push('Центр внимания', 'Выраженная нижняя центральная зона уже создаёт акцент; дополнительные сильные детали рядом могут конкурировать с ней.');
  if (/выраженная дуга|прямые брови|мягкая дуга/.test(text)) push('Брови', 'Форма бровей заметно меняет ритм верхней трети. Сохраняй естественное направление и меняй прежде всего толщину или длину, а не полностью геометрию.');

  return suggestions.slice(0, 4);
}

function __facetV20BuildProfile(result) {
  const descriptors = __facetV20Descriptors(result);
  const advanced = result?.advanced || {};
  const measurementQuality = __facetV20Clamp(__facetV20Number(advanced.confidence, result?.reliability, 60));
  const repeatability = __facetV20Clamp(__facetV20Number(advanced.landmarkStability, result?.featureStability, result?.geometryConsistency, result?.consistency, 60));
  const classificationCertainty = descriptors.length ? __facetV20Median(descriptors.map((item) => item.evidence)) : __facetV20Mean([measurementQuality, repeatability]);
  const coverage = descriptors.length ? descriptors.filter((item) => item.evidence >= 64).length / descriptors.length * 100 : 0;
  const relationValues = __facetV20Relations(result);
  const relationalCoherence = relationValues.length ? __facetV20Mean(relationValues) : __facetV20Number(advanced.configurationScore, result?.coordinationScore, 50);
  const robust = descriptors.filter((item) => !item.ambiguous && item.evidence >= 68).sort((left, right) => right.score - left.score).slice(0, 6);
  const fallback = descriptors.filter((item) => !item.ambiguous).sort((left, right) => right.score - left.score);
  while (robust.length < Math.min(4, fallback.length)) {
    const next = fallback.find((item) => !robust.includes(item));
    if (!next) break;
    robust.push(next);
  }
  const ambiguous = descriptors.filter((item) => item.ambiguous).sort((left, right) => left.evidence - right.evidence).slice(0, 5);
  const support = __facetV20Clamp(
    measurementQuality * 0.28 + repeatability * 0.28 + classificationCertainty * 0.28 + coverage * 0.16
  );
  const cameraSensitive = descriptors.filter((item) => item.stability + 9 < item.confidence).sort((left, right) => left.stability - right.stability).slice(0, 3);
  const axes = [
    { key: 'coherence', label: 'Связность черт', value: Math.round(relationalCoherence), low: 'контрастная', high: 'согласованная' },
    { key: 'definition', label: 'Выраженность структуры', value: Math.round(__facetV20Mean(robust.map((item) => item.salience)) || 50), low: 'мягкая', high: 'выраженная' },
    { key: 'angularity', label: 'Угловатость', value: Math.round(__facetV20Axis(descriptors, /челю|подбор|скул|углов|квадрат|восход|дуга/, 50)), low: 'плавная', high: 'угловатая' },
    { key: 'centrality', label: 'Акцент центра лица', value: Math.round(__facetV20Axis(descriptors, /нос|губ|рот|центр|перенос/, 50)), low: 'распределённый', high: 'центральный' }
  ];

  return {
    measurementQuality: Math.round(measurementQuality),
    repeatability: Math.round(repeatability),
    classificationCertainty: Math.round(classificationCertainty),
    coverage: Math.round(coverage),
    support: Math.round(support),
    robust,
    ambiguous,
    cameraSensitive,
    axes,
    suggestions: __facetV20Suggestions(descriptors),
    descriptorCount: descriptors.length,
    summary: robust.slice(0, 3).map((item) => `${item.label}: ${item.classification}`)
  };
}

function __facetV20CalibrateResult(result) {
  if (!result || typeof result !== 'object') return result;
  const profile = __facetV20BuildProfile(result);
  const rawRating = __facetV20Number(result.rating, 3);
  const evidenceFactor = __facetV20Clamp(profile.support, 0, 100) / 100;
  const calibratedRating = __facetV20Clamp(3 + (rawRating - 3) * (0.48 + evidenceFactor * 0.42), 1.25, 4.65);
  const ambiguityPenalty = profile.ambiguous.length / Math.max(1, profile.descriptorCount) * 0.42;
  const supportPenalty = Math.max(0, 72 - profile.support) * 0.009;
  const previousHalfWidth = __facetV20Number(result.halfWidth, 0.65);
  const halfWidth = Math.min(1.45, Math.max(previousHalfWidth, 0.62 + ambiguityPenalty + supportPenalty));
  return {
    ...result,
    rating: calibratedRating,
    interval: [Math.max(1, calibratedRating - halfWidth), Math.min(5, calibratedRating + halfWidth)],
    halfWidth,
    appearanceV2: {
      ...profile,
      experimentalRating: calibratedRating,
      experimentalInterval: [Math.max(1, calibratedRating - halfWidth), Math.min(5, calibratedRating + halfWidth)]
    },
    model: {
      ...(result.model || {}),
      interpretation: 'evidence-calibrated-v2',
      scoreRole: 'experimental-secondary'
    }
  };
}

if (typeof combineProtocolAssessments === 'function') {
  const __facetV20BaseCombine = combineProtocolAssessments;
  combineProtocolAssessments = function combineProtocolAssessmentsV20(values) {
    return __facetV20CalibrateResult(__facetV20BaseCombine(values));
  };
}

function __facetV20Node(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function __facetV20Meter(label, value, note) {
  const card = __facetV20Node('article', 'facet-v20-evidence-card');
  const top = __facetV20Node('div');
  top.append(__facetV20Node('span', '', label), __facetV20Node('strong', '', `${Math.round(value)}%`));
  const track = __facetV20Node('i');
  const fill = __facetV20Node('b');
  fill.style.width = `${__facetV20Clamp(value)}%`;
  track.append(fill);
  card.append(top, track, __facetV20Node('p', '', note));
  return card;
}

function __facetV20FeatureCard(item) {
  const card = __facetV20Node('article', 'facet-v20-feature-card');
  const heading = __facetV20Node('div');
  heading.append(__facetV20Node('span', '', item.label), __facetV20Node('small', '', `${item.evidence}% опоры`));
  card.append(heading, __facetV20Node('strong', '', item.classification));
  if (item.evidenceText) card.append(__facetV20Node('p', '', item.evidenceText));
  const meta = __facetV20Node('div', 'facet-v20-feature-meta');
  meta.append(__facetV20Node('span', '', `граница ${item.confidence}%`), __facetV20Node('span', '', `повтор ${item.stability}%`));
  card.append(meta);
  return card;
}

function __facetV20AxisRow(axis) {
  const row = __facetV20Node('div', 'facet-v20-axis');
  const top = __facetV20Node('div');
  top.append(__facetV20Node('span', '', axis.label), __facetV20Node('strong', '', `${axis.value}%`));
  const labels = __facetV20Node('div', 'facet-v20-axis-labels');
  labels.append(__facetV20Node('small', '', axis.low), __facetV20Node('small', '', axis.high));
  const track = __facetV20Node('i');
  const marker = __facetV20Node('b');
  marker.style.left = `${axis.value}%`;
  track.append(marker);
  row.append(top, track, labels);
  return row;
}

function __facetV20Overview(profile) {
  const section = __facetV20Node('section', 'facet-v20-overview');
  section.dataset.facetV20 = 'true';
  const heading = __facetV20Node('div', 'detail-heading');
  const title = __facetV20Node('div');
  title.innerHTML = '<p class="section-number">03 · APPEARANCE</p><h3>Профиль внешности</h3>';
  heading.append(title, __facetV20Node('span', '', 'устойчивые черты важнее одной оценки'));

  const signature = __facetV20Node('div', 'facet-v20-signature');
  signature.append(__facetV20Node('span', '', 'ГЛАВНЫЙ ВЫВОД'));
  const signatureTitle = profile.summary.length
    ? profile.summary.join(' · ')
    : 'Выраженного устойчивого типажа пока недостаточно';
  signature.append(__facetV20Node('strong', '', signatureTitle));
  signature.append(__facetV20Node('p', '', profile.support >= 72
    ? 'Вывод поддержан несколькими ракурсами и согласованными измерениями.'
    : 'Часть признаков зависит от ракурса или находится близко к границе категорий.'));

  const evidence = __facetV20Node('div', 'facet-v20-evidence-grid');
  evidence.append(
    __facetV20Meter('Качество кадра', profile.measurementQuality, 'Свет, резкость, видимость и положение лица.'),
    __facetV20Meter('Повторяемость', profile.repeatability, 'Насколько одинаково определились ориентиры в разных ракурсах.'),
    __facetV20Meter('Уверенность черт', profile.classificationCertainty, 'Насколько признаки удалены от границ между категориями.'),
    __facetV20Meter('Покрытие анализа', profile.coverage, `Устойчиво описано ${profile.robust.length} из ${profile.descriptorCount} измеренных признаков.`)
  );

  const robustHeading = __facetV20Node('div', 'facet-v20-subheading');
  robustHeading.append(__facetV20Node('strong', '', 'Устойчивые особенности'), __facetV20Node('span', '', 'что действительно повторилось'));
  const robust = __facetV20Node('div', 'facet-v20-feature-grid');
  profile.robust.slice(0, 4).forEach((item) => robust.append(__facetV20FeatureCard(item)));
  if (!profile.robust.length) robust.append(__facetV20Node('p', 'facet-v20-empty', 'Ни один признак не прошёл порог устойчивости. Нужна новая серия с ровным светом и фиксированной камерой.'));

  const lower = __facetV20Node('div', 'facet-v20-lower-grid');
  const axes = __facetV20Node('article', 'facet-v20-axis-panel');
  axes.append(__facetV20Node('h4', '', 'Визуальный баланс'));
  profile.axes.forEach((axis) => axes.append(__facetV20AxisRow(axis)));

  const guidance = __facetV20Node('article', 'facet-v20-guidance');
  guidance.append(__facetV20Node('h4', '', 'Как использовать профиль'));
  profile.suggestions.forEach((suggestion) => {
    const row = __facetV20Node('div');
    row.append(__facetV20Node('strong', '', suggestion.title), __facetV20Node('p', '', suggestion.copy));
    guidance.append(row);
  });
  lower.append(axes, guidance);

  section.append(heading, signature, evidence, robustHeading, robust, lower);

  if (profile.ambiguous.length || profile.cameraSensitive.length) {
    const caution = __facetV20Node('aside', 'facet-v20-caution');
    const ambiguousNames = profile.ambiguous.slice(0, 3).map((item) => item.label);
    const sensitiveNames = profile.cameraSensitive.slice(0, 3).map((item) => item.label);
    caution.append(
      __facetV20Node('strong', '', 'Что пока нельзя считать точным'),
      __facetV20Node('p', '', ambiguousNames.length
        ? `${ambiguousNames.join(', ')} находятся близко к границе категорий или слабо повторились.`
        : `${sensitiveNames.join(', ')} заметно меняются между ракурсами и чувствительны к перспективе.`)
    );
    section.append(caution);
  }
  return section;
}

function __facetV20ExperimentalToggle(scoreBlock, profile) {
  const wrap = __facetV20Node('section', 'facet-v20-experimental-control');
  wrap.dataset.facetV20 = 'true';
  const button = __facetV20Node('button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  const copy = __facetV20Node('span');
  copy.append(__facetV20Node('strong', '', 'Экспериментальная оценка восприятия'), __facetV20Node('small', '', `опора модели ${profile.support}% · не объективная мера красоты`));
  button.append(copy, __facetV20Node('b', '', 'Показать'));
  scoreBlock.hidden = true;
  scoreBlock.classList.add('facet-v20-experimental-score');
  button.addEventListener('click', () => {
    const open = scoreBlock.hidden;
    scoreBlock.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.querySelector('b').textContent = open ? 'Скрыть' : 'Показать';
  });
  wrap.append(button);
  return wrap;
}

function __facetV20RefreshMethod() {
  const methodCopy = document.querySelector('.method-copy');
  if (!methodCopy) return;
  methodCopy.innerHTML = `
    <section><h3>Что FACET анализирует</h3><p>Приложение измеряет геометрию и взаимное расположение видимых зон лица по пяти управляемым ракурсам. Главный результат — устойчивые особенности и их сочетания, а не одна цифра.</p></section>
    <section><h3>Четыре разных уровня уверенности</h3><p><b>Качество кадра</b> описывает свет и резкость. <b>Повторяемость</b> показывает совпадение ориентиров между ракурсами. <b>Уверенность черты</b> зависит от расстояния до границы категории. <b>Покрытие</b> показывает долю признаков, прошедших минимальный порог опоры.</p></section>
    <section><h3>Почему пять ракурсов</h3><p>Фронтальные кадры проверяют повторяемость, а небольшие повороты помогают отделить реальную структуру от перспективного искажения. 2.5D-профиль по RGB-камере остаётся приближением и не заменяет TrueDepth или фотограмметрию.</p></section>
    <section><h3>Пограничные признаки</h3><p>Если классификация меняется между ракурсами или находится близко к порогу, FACET показывает несколько допустимых интерпретаций и не выдаёт одну из них за точный факт.</p></section>
    <section><h3>Оценка восприятия</h3><p>Шкала 1–5 оставлена только как вторичный экспериментальный прогноз. Она сжимается к нейтральному значению и получает более широкий диапазон при слабой опоре. Это не объективная мера красоты и не диагноз.</p></section>
    <section><h3>Ограничения данных</h3><p>Результат не учитывает движение, голос, харизму, стиль, культурный контекст и индивидуальный вкус. Он не должен использоваться для решений о здоровье, найме, доступе к услугам или ценности человека.</p></section>
    <section class="sources"><h3>Исследовательская основа</h3><a href="https://doi.org/10.1038/s41598-025-86974-0" target="_blank" rel="noreferrer">Lee et al., 2025</a><a href="https://arxiv.org/abs/1801.06345" target="_blank" rel="noreferrer">SCUT-FBP5500</a></section>`;
}

function __facetV20Report(profile) {
  const lines = [
    `FACET v${__facetV20Version} — профиль внешности`,
    '',
    'ГЛАВНЫЕ УСТОЙЧИВЫЕ ОСОБЕННОСТИ',
    ...(profile.robust.length
      ? profile.robust.map((item) => `• ${item.label}: ${item.classification} — опора ${item.evidence}% (граница ${item.confidence}%, повторяемость ${item.stability}%).${item.evidenceText ? ` ${item.evidenceText}` : ''}`)
      : ['• Недостаточно устойчивых признаков.']),
    '',
    'КАЧЕСТВО ДОКАЗАТЕЛЬСТВ',
    `• Качество кадра: ${profile.measurementQuality}%`,
    `• Повторяемость ракурсов: ${profile.repeatability}%`,
    `• Уверенность классификаций: ${profile.classificationCertainty}%`,
    `• Покрытие устойчивыми признаками: ${profile.coverage}%`,
    '',
    'ВИЗУАЛЬНЫЙ БАЛАНС',
    ...profile.axes.map((axis) => `• ${axis.label}: ${axis.value}% (${axis.low} ↔ ${axis.high})`),
    '',
    'ПРАКТИЧЕСКОЕ ПРИМЕНЕНИЕ',
    ...profile.suggestions.map((item) => `• ${item.title}: ${item.copy}`),
    '',
    'ОСТОРОЖНОСТЬ',
    ...(profile.ambiguous.length
      ? profile.ambiguous.map((item) => `• ${item.label}: только ${item.evidence}% опоры, не считать точной классификацией.`)
      : ['• Критически слабых выводов в выбранной серии нет.']),
    '',
    `Экспериментальная оценка восприятия: ${combined.rating.toFixed(1)}/5, диапазон ${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}.`,
    'Это геометрическая модель, а не объективная мера красоты или ценности человека.'
  ];
  return lines.join('\n');
}

function __facetV20Render() {
  if (!combined || !finalized || !el?.result) return;
  el.result.querySelectorAll('[data-facet-v20]').forEach((node) => node.remove());
  if (!combined.appearanceV2) combined = __facetV20CalibrateResult(combined);
  const profile = combined.appearanceV2;
  const heading = el.result.querySelector('.result-heading');
  const scoreBlock = el.result.querySelector('.score-block');
  const overview = __facetV20Overview(profile);
  if (heading) heading.after(overview);
  else el.result.prepend(overview);
  if (scoreBlock) {
    const toggle = __facetV20ExperimentalToggle(scoreBlock, profile);
    overview.after(toggle, scoreBlock);
  }

  const labelMap = [
    [el.reliability, 'Качество кадра'],
    [el.consistency, 'Повторяемость'],
    [el.typicality, 'Центральность'],
    [el.occlusion, 'Видимость'],
    [el.protocol, 'Ракурсы']
  ];
  labelMap.forEach(([valueNode, label]) => {
    const labelNode = valueNode?.previousElementSibling;
    if (labelNode) labelNode.textContent = label;
  });
  if (el.resultMode) el.resultMode.textContent = '5 РАКУРСОВ · ЛОКАЛЬНО';
  if (el.stabilityNote) {
    el.stabilityNote.textContent = profile.ambiguous.length
      ? `${profile.ambiguous.length} признаков оставлены пограничными — FACET не принуждает их к одной категории.`
      : 'Все показанные основные особенности повторились между ракурсами.';
  }
  const scoreCopy = scoreBlock?.querySelector('.score-copy > span');
  if (scoreCopy) scoreCopy.innerHTML = `экспериментальный диапазон <b id="score-range">${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}</b>`;

  document.querySelectorAll('.facet-v18-summary, .facet-v18-explanation').forEach((node) => node.classList.add('facet-v20-legacy-analysis'));
}

if (typeof renderResult === 'function') {
  const __facetV20BaseRenderResult = renderResult;
  renderResult = function renderResultV20() {
    __facetV20BaseRenderResult();
    requestAnimationFrame(() => requestAnimationFrame(__facetV20Render));
  };
}

__facetV20RefreshMethod();
const __facetV20Footer = document.querySelector('.app-footer span:first-child');
if (__facetV20Footer) __facetV20Footer.textContent = `FACET v${__facetV20Version}`;
const __facetV20Hero = document.querySelector('.hero > p:last-child');
if (__facetV20Hero) __facetV20Hero.textContent = 'Пять ракурсов. Устойчивые особенности, пограничные признаки и визуальный баланс — без приговора по одному селфи.';

if (el?.share) {
  const __facetV20Share = el.share.cloneNode(true);
  el.share.replaceWith(__facetV20Share);
  el.share = __facetV20Share;
  el.share.addEventListener('click', async () => {
    if (!combined || !finalized) return;
    if (!combined.appearanceV2) combined = __facetV20CalibrateResult(combined);
    const text = __facetV20Report(combined.appearanceV2);
    try {
      if (navigator.share) await navigator.share({ title: 'FACET — профиль внешности', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Профиль внешности скопирован.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Не удалось поделиться отчётом.');
    }
  });
}
