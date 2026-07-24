import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  clampPeople,
  createBirthdayModel,
  createSample
} from './math.js';

installMobileRuntime();

const STORAGE_NAMESPACE = 'pocket-works:sovpalo';
const DEFAULT_STATE = {
  people: 23,
  showRare: false,
  sampleSeed: 365023
};

const store = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: DEFAULT_STATE,
  validate(value) {
    return value
      && Number.isInteger(value.people)
      && value.people >= MIN_PEOPLE
      && value.people <= MAX_PEOPLE
      && typeof value.showRare === 'boolean'
      && Number.isInteger(value.sampleSeed);
  }
});

const elements = {
  appShell: document.querySelector('[data-app-shell]'),
  peopleInput: document.querySelector('#peopleInput'),
  peopleWord: document.querySelector('#peopleWord'),
  peopleRange: document.querySelector('#peopleRange'),
  decreaseButton: document.querySelector('#decreaseButton'),
  increaseButton: document.querySelector('#increaseButton'),
  probabilityStamp: document.querySelector('#probabilityStamp'),
  mainProbability: document.querySelector('#mainProbability'),
  heroNote: document.querySelector('#heroNote'),
  tripleProbability: document.querySelector('#tripleProbability'),
  twoDatesProbability: document.querySelector('#twoDatesProbability'),
  quartetProbability: document.querySelector('#quartetProbability'),
  expectationLine: document.querySelector('#expectationLine'),
  yearGrid: document.querySelector('#yearGrid'),
  sampleResult: document.querySelector('#sampleResult'),
  shuffleButton: document.querySelector('#shuffleButton'),
  scenarioList: document.querySelector('#scenarioList'),
  scenarioCount: document.querySelector('#scenarioCount'),
  moreButton: document.querySelector('#moreButton'),
  moreButtonLabel: document.querySelector('#moreButtonLabel'),
  infoButton: document.querySelector('#infoButton'),
  sheetBackdrop: document.querySelector('#sheetBackdrop'),
  bottomSheet: document.querySelector('#bottomSheet'),
  sheetKicker: document.querySelector('#sheetKicker'),
  sheetTitle: document.querySelector('#sheetTitle'),
  sheetContent: document.querySelector('#sheetContent'),
  sheetActions: document.querySelector('#sheetActions'),
  sheetClose: document.querySelector('#sheetClose'),
  networkStatus: document.querySelector('#networkStatus')
};

const monthStarts = new Set([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]);
const dayCells = [];
let currentModel = null;
let renderFrame = 0;
let lastFocusedElement = null;

for (let day = 0; day < 365; day += 1) {
  const cell = document.createElement('span');
  cell.className = `day-cell${monthStarts.has(day) ? ' month-start' : ''}`;
  elements.yearGrid.append(cell);
  dayCells.push(cell);
}

function plural(number, forms) {
  const absolute = Math.abs(number) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function peopleWord(number) {
  return plural(number, ['человек', 'человека', 'человек']);
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function superscript(value) {
  const map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(value).split('').map((character) => map[character] || character).join('');
}

function formatPercent(probability, logProbability = null) {
  if (probability >= 1) return '100%';
  if (probability > 0.9999995) return '≈100%';
  if (probability <= 0 && logProbability == null) return '0%';

  const percent = probability * 100;
  if (percent >= 10) return `${formatNumber(percent, 2)}%`;
  if (percent >= 1) return `${formatNumber(percent, 2)}%`;
  if (percent >= 0.01) return `${formatNumber(percent, 3)}%`;
  if (percent >= 0.0001) return `${formatNumber(percent, 5)}%`;

  const usableLog = logProbability ?? Math.log(Math.max(probability, Number.MIN_VALUE));
  const log10Percent = usableLog / Math.LN10 + 2;
  const exponent = Math.floor(log10Percent);
  const mantissa = 10 ** (log10Percent - exponent);
  return `${formatNumber(mantissa, 2)}×10${superscript(exponent)}%`;
}

function formatOneIn(logProbability) {
  if (!Number.isFinite(logProbability) || logProbability >= 0) return '1 из 1';
  const log10Value = -logProbability / Math.LN10;
  if (log10Value < 6) {
    return `1 из ${Math.max(1, Math.round(Math.exp(-logProbability))).toLocaleString('ru-RU')}`;
  }
  const exponent = Math.floor(log10Value);
  const mantissa = 10 ** (log10Value - exponent);
  return `1 из ${formatNumber(mantissa, 2)}×10${superscript(exponent)}`;
}

function peopleToSlider(people) {
  const ratio = (people - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE);
  return Math.round((Math.max(0, ratio) ** (1 / 2.25)) * 1000);
}

function sliderToPeople(value) {
  const ratio = Number(value) / 1000;
  return clampPeople(Math.round(MIN_PEOPLE + (MAX_PEOPLE - MIN_PEOPLE) * (ratio ** 2.25)));
}

function groupName(size, count) {
  const forms = {
    2: ['пара', 'пары', 'пар'],
    3: ['тройка', 'тройки', 'троек'],
    4: ['четвёрка', 'четвёрки', 'четвёрок'],
    5: ['пятёрка', 'пятёрки', 'пятёрок'],
    6: ['шестёрка', 'шестёрки', 'шестёрок'],
    7: ['семёрка', 'семёрки', 'семёрок'],
    8: ['восьмёрка', 'восьмёрки', 'восьмёрок']
  };
  if (!forms[size]) return `${count} ${plural(count, ['группа', 'группы', 'групп'])} по ${size}`;
  if (count === 1) {
    const one = { 2: 'Одна пара', 3: 'Одна тройка', 4: 'Одна четвёрка', 5: 'Одна пятёрка', 6: 'Одна шестёрка', 7: 'Одна семёрка', 8: 'Одна восьмёрка' };
    return one[size];
  }
  return `${count} ${plural(count, forms[size])}`;
}

function describeScenario(scenario, people) {
  if (scenario.groups.length === 0) return 'Все даты разные';
  if (scenario.groups.length === 1 && scenario.groups[0].count === 1 && scenario.groups[0].size === people) {
    return `Все ${people} в один день`;
  }
  return scenario.groups.map(({ size, count }, index) => {
    const phrase = groupName(size, count);
    return index === 0 ? phrase : phrase.toLocaleLowerCase('ru-RU');
  }).join(' + ');
}

function scenarioSubtitle(scenario) {
  if (scenario.singletons === 0) return `${scenario.occupiedDays} ${plural(scenario.occupiedDays, ['занятая дата', 'занятые даты', 'занятых дат'])}, без одиночных дней`;
  return `${scenario.singletons} ${plural(scenario.singletons, ['остальной человек', 'остальных человека', 'остальных человек'])} — каждый в свою дату`;
}

function buildClusterPreview(scenario) {
  if (scenario.groups.length === 0) {
    return '<span class="unique-preview" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
  }

  const clusters = [];
  let shown = 0;
  let totalGroups = 0;
  for (const group of scenario.groups) totalGroups += group.count;

  for (const group of scenario.groups) {
    for (let index = 0; index < group.count && shown < 3; index += 1) {
      const dots = Array.from({ length: Math.min(group.size, 6) }, () => '<i></i>').join('');
      clusters.push(`<span class="preview-group" aria-hidden="true">${dots}</span>`);
      shown += 1;
    }
  }

  if (totalGroups > shown) clusters.push(`<span class="preview-more">+${totalGroups - shown}</span>`);
  return clusters.join('');
}

function renderSample(people, seed) {
  const sample = createSample(people, seed);
  sample.counts.forEach((count, day) => {
    const cell = dayCells[day];
    cell.classList.remove('count-1', 'count-2', 'count-3', 'count-4');
    if (count === 1) cell.classList.add('count-1');
    if (count === 2) cell.classList.add('count-2');
    if (count === 3) cell.classList.add('count-3');
    if (count >= 4) cell.classList.add('count-4');
  });

  const fragments = [];
  for (let size = 2; size <= sample.largestGroup; size += 1) {
    const count = sample.occupancy.get(size) || 0;
    if (!count) continue;
    if (size <= 8) fragments.push(groupName(size, count).toLocaleLowerCase('ru-RU'));
    else fragments.push(`${count} ${plural(count, ['группа', 'группы', 'групп'])} по ${size}`);
  }

  if (fragments.length === 0) {
    elements.sampleResult.textContent = `В этом броске все ${people} дат разошлись. Чисто, скучно, статистически законно.`;
  } else {
    elements.sampleResult.textContent = `В этом броске: ${fragments.join(', ')}. Занято ${sample.occupiedDays} из 365 дней.`;
  }
}

function renderScenarios(model, showRare) {
  const scenarios = showRare ? model.scenarios.expanded : model.scenarios.compact;
  elements.scenarioList.innerHTML = scenarios.map((scenario) => `
    <button class="scenario-row" type="button" data-scenario-key="${scenario.key}" data-native-press>
      <span class="cluster-preview">${buildClusterPreview(scenario)}</span>
      <span class="scenario-row-copy">
        <strong>${describeScenario(scenario, model.people)}</strong>
        <span>${scenarioSubtitle(scenario)}</span>
      </span>
      <span class="scenario-row-probability">${formatPercent(scenario.probability, scenario.logProbability)}</span>
    </button>
  `).join('');
  elements.scenarioCount.textContent = `${scenarios.length} ${plural(scenarios.length, ['вариант', 'варианта', 'вариантов'])}`;
  elements.moreButtonLabel.textContent = showRare ? 'Скрыть редкие расклады' : 'Показать редкие расклады';
  elements.moreButton.lastElementChild.textContent = showRare ? '↑' : '↓';
}

function milestoneText(people, probability) {
  if (people === 23) return 'Классический порог: при 23 людях вероятность впервые становится выше 50%.';
  if (people < 23) return `До знаменитого порога в 50% не хватает ${23 - people} ${plural(23 - people, ['человека', 'человек', 'человек'])}.`;
  if (people > 365) return 'Совпадение гарантировано: людей уже больше, чем дней в обычном году.';
  if (probability > 0.999) return 'Совпадение почти неизбежно. Интереснее уже смотреть на тройки и несколько общих дат.';
  if (probability > 0.9) return 'Пара почти наверняка найдётся; редким исходом теперь становится полное отсутствие совпадений.';
  return `Шанс совпадения уже ${formatPercent(probability)} — человеческая интуиция обычно занижает его весьма бодро.`;
}

function render() {
  renderFrame = 0;
  const state = store.getAll();
  const people = clampPeople(state.people);
  currentModel = createBirthdayModel(people);

  elements.peopleInput.value = String(people);
  elements.peopleWord.textContent = peopleWord(people);
  elements.peopleRange.value = String(peopleToSlider(people));
  elements.peopleRange.setAttribute('aria-valuenow', String(people));
  elements.peopleRange.setAttribute('aria-valuetext', `${people} ${peopleWord(people)}`);
  elements.decreaseButton.disabled = people <= MIN_PEOPLE;
  elements.increaseButton.disabled = people >= MAX_PEOPLE;

  elements.mainProbability.textContent = formatPercent(currentModel.anyMatch);
  elements.probabilityStamp.style.setProperty('--probability-angle', `${Math.max(0, Math.min(360, currentModel.anyMatch * 360))}deg`);
  elements.heroNote.textContent = milestoneText(people, currentModel.anyMatch);
  elements.tripleProbability.textContent = formatPercent(currentModel.tripleOrMore);
  elements.twoDatesProbability.textContent = formatPercent(currentModel.twoSharedDatesOrMore);
  elements.quartetProbability.textContent = formatPercent(currentModel.quartetOrMore);
  elements.expectationLine.textContent = `Ожидаемое число дат с несколькими именинниками — ${formatNumber(currentModel.expectedSharedDates, 2)}; «лишних» людей поверх уникальных дат — ${formatNumber(currentModel.expectedDuplicatePeople, 2)}.`;

  renderSample(people, state.sampleSeed);
  renderScenarios(currentModel, state.showRare);
}

function scheduleRender() {
  if (renderFrame) cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(render);
}

function setPeople(nextPeople) {
  const people = clampPeople(nextPeople);
  if (people === store.get('people')) return;
  store.set('people', people);
  scheduleRender();
}

function freshSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function openSheet({ kicker, title, content, actions = '' }, trigger = document.activeElement) {
  lastFocusedElement = trigger instanceof HTMLElement ? trigger : null;
  elements.sheetKicker.textContent = kicker;
  elements.sheetTitle.textContent = title;
  elements.sheetContent.innerHTML = content;
  elements.sheetActions.innerHTML = actions;
  elements.sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    elements.sheetBackdrop.classList.add('is-open');
    elements.bottomSheet.focus({ preventScroll: true });
  });
}

function closeSheet() {
  elements.sheetBackdrop.classList.remove('is-open');
  setTimeout(() => {
    elements.sheetBackdrop.hidden = true;
    elements.sheetContent.innerHTML = '';
    elements.sheetActions.innerHTML = '';
    lastFocusedElement?.focus?.({ preventScroll: true });
  }, 190);
}

function openInfoSheet() {
  openSheet({
    kicker: 'МЕТОД / БЕЗ МАГИИ',
    title: 'Как считаем',
    content: `
      <div class="sheet-list">
        <div><b>1</b><p><strong>365 равновероятных дней.</strong> 29 февраля не учитывается, а каждый день считается одинаково вероятным.</p></div>
        <div><b>2</b><p><strong>Дни рождения независимы.</strong> Близнецы, сезонность рождений и реальные демографические перекосы не моделируются.</p></div>
        <div><b>3</b><p><strong>Основные проценты точные.</strong> Приложение перебирает допустимые способы разложить людей по датам через комбинаторные коэффициенты.</p></div>
        <div><b>4</b><p><strong>Сетка года — только пример.</strong> Кнопка «Перебросить» создаёт один случайный зал, но не используется для расчёта процентов.</p></div>
      </div>
      <p class="formula-note">P(без совпадений) = 365 × 364 × … × (365 − n + 1) / 365ⁿ</p>
      <p>Для троек, четвёрок и точных раскладов считаются все допустимые разбиения людей на группы: пары, тройки и так далее. Поэтому «две пары» не смешиваются с «одной тройкой», хотя в обоих случаях два человека оказываются поверх уникальных дат.</p>
    `
  }, elements.infoButton);
}

function openScenarioSheet(scenario, trigger) {
  const title = describeScenario(scenario, currentModel.people);
  const preview = buildClusterPreview(scenario);
  openSheet({
    kicker: 'ТОЧНЫЙ РАСКЛАД',
    title,
    content: `
      <div class="scenario-detail-visual"><span class="cluster-preview">${preview}</span></div>
      <div class="scenario-detail-probability">
        <div><span>ВЕРОЯТНОСТЬ</span><strong>${formatPercent(scenario.probability, scenario.logProbability)}</strong></div>
        <div><span>ПРИМЕРНО</span><strong>${formatOneIn(scenario.logProbability)}</strong></div>
      </div>
      <p><strong>${scenarioSubtitle(scenario)}.</strong> Совпавших дат: ${scenario.collisionGroups}. Всего занято дат: ${scenario.occupiedDays}.</p>
      <p>Это вероятность именно такого состава групп. Любая дополнительная пара, тройка или другое совпадение уже считается другим раскладом.</p>
    `
  }, trigger);
}

elements.decreaseButton.addEventListener('click', () => setPeople(store.get('people') - 1));
elements.increaseButton.addEventListener('click', () => setPeople(store.get('people') + 1));

elements.peopleInput.addEventListener('input', () => {
  const value = Number.parseInt(elements.peopleInput.value, 10);
  if (Number.isInteger(value) && value >= MIN_PEOPLE && value <= MAX_PEOPLE) setPeople(value);
});

elements.peopleInput.addEventListener('change', () => {
  const people = clampPeople(elements.peopleInput.value);
  elements.peopleInput.value = String(people);
  setPeople(people);
});

elements.peopleInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') elements.peopleInput.blur();
});

elements.peopleRange.addEventListener('input', () => setPeople(sliderToPeople(elements.peopleRange.value)));

elements.shuffleButton.addEventListener('click', () => {
  store.set('sampleSeed', freshSeed());
  renderSample(store.get('people'), store.get('sampleSeed'));
});

elements.moreButton.addEventListener('click', () => {
  store.set('showRare', !store.get('showRare'));
  renderScenarios(currentModel, store.get('showRare'));
});

elements.scenarioList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-scenario-key]');
  if (!button) return;
  const scenario = currentModel.scenarios.expanded.find((item) => item.key === button.dataset.scenarioKey);
  if (scenario) openScenarioSheet(scenario, button);
});

elements.infoButton.addEventListener('click', openInfoSheet);
elements.sheetClose.addEventListener('click', closeSheet);
elements.sheetBackdrop.addEventListener('click', (event) => {
  if (event.target === elements.sheetBackdrop) closeSheet();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.sheetBackdrop.hidden) closeSheet();
});

window.addEventListener('appdatareset', () => {
  scheduleRender();
});

createWorkshopMode({
  appName: 'СОВПАЛО',
  version: '1.0.0',
  cachePrefix: 'sovpalo-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    store.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
  elements.networkStatus.textContent = online ? 'онлайн · офлайн-копия готова' : 'офлайн · всё работает';
});

render();
