// FACET v1.9.1 — explicit head-turn coaching.
const __facetV191Steps = [
  {
    key: 'front',
    kicker: 'КАДР 1 · ПРЯМО',
    title: 'Смотри прямо в объектив',
    instruction: 'Нос остаётся по центру. Подбородок не поднимай и не опускай.'
  },
  {
    key: 'left',
    kicker: 'КАДР 2 · ЛЕВЫЙ ПОВОРОТ',
    title: 'Поверни нос к своему левому плечу',
    instruction: 'Поверни всю голову примерно на 15°. Это движение как при жесте «нет», а не наклон уха к плечу.'
  },
  {
    key: 'right',
    kicker: 'КАДР 3 · ПРАВЫЙ ПОВОРОТ',
    title: 'Поверни нос к своему правому плечу',
    instruction: 'Поверни всю голову в другую сторону примерно на 15°. Глазами следуй за носом.'
  },
  {
    key: 'front-return',
    kicker: 'КАДР 4 · ВОЗВРАТ',
    title: 'Верни лицо точно в центр',
    instruction: 'Снова смотри прямо. Приложение сравнит форму после возврата из боковых ракурсов.'
  },
  {
    key: 'front-control',
    kicker: 'КАДР 5 · КОНТРОЛЬ',
    title: 'Останься прямо ещё один кадр',
    instruction: 'Не меняй выражение и дистанцию. Это финальная проверка повторяемости.'
  }
];

function __facetV191Node(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function __facetV191EnsureFiveDots(container, className) {
  if (!container) return;
  while (container.children.length < 5) container.append(__facetV191Node('i', className));
  while (container.children.length > 5) container.lastElementChild.remove();
}

function __facetV191BuildCoach() {
  const cameraView = document.getElementById('camera-view');
  if (!cameraView || document.getElementById('pose-coach')) return document.getElementById('pose-coach');

  const coach = __facetV191Node('section', 'pose-coach');
  coach.id = 'pose-coach';
  coach.dataset.pose = 'demo';
  coach.dataset.state = 'waiting';
  coach.setAttribute('aria-live', 'polite');

  const visual = __facetV191Node('div', 'pose-coach-visual');
  visual.setAttribute('aria-hidden', 'true');
  const shoulderLeft = __facetV191Node('span', 'pose-coach-shoulder is-left', 'ТВОЁ ЛЕВОЕ');
  const shoulderRight = __facetV191Node('span', 'pose-coach-shoulder is-right', 'ТВОЁ ПРАВОЕ');
  const headWrap = __facetV191Node('div', 'pose-coach-head-wrap');
  const head = __facetV191Node('div', 'pose-coach-head');
  head.append(
    __facetV191Node('i', 'pose-coach-ear is-left'),
    __facetV191Node('i', 'pose-coach-ear is-right'),
    __facetV191Node('b', 'pose-coach-nose'),
    __facetV191Node('em', 'pose-coach-eye is-left'),
    __facetV191Node('em', 'pose-coach-eye is-right')
  );
  headWrap.append(head, __facetV191Node('div', 'pose-coach-turn-arrow'));
  visual.append(shoulderLeft, headWrap, shoulderRight);

  const copy = __facetV191Node('div', 'pose-coach-copy');
  copy.append(
    __facetV191Node('span', 'pose-coach-kicker', 'СНАЧАЛА ПОСМОТРИ ДВИЖЕНИЕ'),
    __facetV191Node('strong', 'pose-coach-title', 'Поворачивай голову как при жесте «нет»'),
    __facetV191Node('p', 'pose-coach-instruction', 'Телефон и плечи остаются на месте. Двигается вся голова вместе с носом и глазами.'),
    __facetV191Node('small', 'pose-coach-warning', 'Не наклоняй ухо к плечу · не поворачивай только глаза · не двигай телефон')
  );

  const readiness = __facetV191Node('div', 'pose-coach-readiness');
  readiness.append(__facetV191Node('i'), __facetV191Node('span', '', 'Приложение само подтвердит правильный угол'));
  copy.append(readiness);
  coach.append(visual, copy);

  cameraView.insertAdjacentElement('afterend', coach);
  return coach;
}

function __facetV191AcceptedCount() {
  const counter = document.getElementById('camera-counter');
  const match = counter?.textContent?.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Math.max(0, Math.min(5, Number(match[1]))) : 0;
}

function __facetV191SeriesStarted() {
  const label = document.getElementById('camera-capture-label')?.textContent || '';
  const status = document.getElementById('camera-status')?.dataset.state || '';
  return !/начать/i.test(label) || ['countdown', 'analyzing', 'accepted', 'retry'].includes(status);
}

function __facetV191UpdateCoach() {
  const coach = __facetV191BuildCoach();
  if (!coach) return;
  const accepted = __facetV191AcceptedCount();
  const statusNode = document.getElementById('camera-status');
  const state = statusNode?.dataset.state || 'waiting';
  const started = __facetV191SeriesStarted();

  if (accepted >= 5) {
    coach.dataset.pose = 'done';
    coach.dataset.state = 'accepted';
    coach.querySelector('.pose-coach-kicker').textContent = 'СЕРИЯ ЗАВЕРШЕНА';
    coach.querySelector('.pose-coach-title').textContent = 'Все пять ракурсов приняты';
    coach.querySelector('.pose-coach-instruction').textContent = 'Можно расслабиться. FACET объединяет фронтальные и боковые измерения.';
    coach.querySelector('.pose-coach-readiness span').textContent = 'Формирую результат';
    return;
  }

  if (!started && accepted === 0) {
    coach.dataset.pose = 'demo';
    coach.dataset.state = 'waiting';
    coach.querySelector('.pose-coach-kicker').textContent = 'СНАЧАЛА ПОСМОТРИ ДВИЖЕНИЕ';
    coach.querySelector('.pose-coach-title').textContent = 'Поворачивай голову как при жесте «нет»';
    coach.querySelector('.pose-coach-instruction').textContent = 'Телефон и плечи остаются на месте. Двигается вся голова вместе с носом и глазами.';
    coach.querySelector('.pose-coach-readiness span').textContent = 'После запуска FACET будет вести по пяти ракурсам';
    return;
  }

  const step = __facetV191Steps[Math.min(accepted, __facetV191Steps.length - 1)];
  coach.dataset.pose = step.key;
  coach.dataset.state = state;
  coach.querySelector('.pose-coach-kicker').textContent = step.kicker;
  coach.querySelector('.pose-coach-title').textContent = step.title;
  coach.querySelector('.pose-coach-instruction').textContent = step.instruction;

  const readinessText = state === 'countdown'
    ? 'Угол найден — замри до снимка'
    : state === 'accepted'
      ? 'Кадр принят — готовься к следующему движению'
      : state === 'retry'
        ? 'Угол пока не совпал — двигайся медленнее'
        : state === 'analyzing'
          ? 'Проверяю положение и качество'
          : step.key === 'left' || step.key === 'right'
            ? 'Остановись, когда приложение начнёт отсчёт'
            : 'Совмести лицо с центральной направляющей';
  coach.querySelector('.pose-coach-readiness span').textContent = readinessText;
}

function __facetV191RefreshStaticCopy() {
  const heroIndex = document.querySelector('.hero-index');
  if (heroIndex) heroIndex.innerHTML = '<span>5 VIEWS</span><span>2.5D</span><span>LOCAL</span>';
  const heroCopy = document.querySelector('.hero > p:last-child');
  if (heroCopy) heroCopy.textContent = 'Одна управляемая серия: прямо, два небольших поворота и два контрольных фронтальных кадра.';
  const captureHint = document.getElementById('capture-hint');
  if (captureHint) captureHint.textContent = 'FACET сам покажет направление и сделает кадр только после достижения правильного угла.';
  const sessionReadout = document.getElementById('session-readout');
  if (sessionReadout && /3 кадр/i.test(sessionReadout.textContent)) sessionReadout.textContent = 'Автосъёмка · 5 ракурсов · управляемый поворот головы';
  const scanCounter = document.getElementById('scan-counter');
  if (scanCounter && /\/3/.test(scanCounter.textContent)) scanCounter.textContent = '0/5';
  const cameraCounter = document.getElementById('camera-counter');
  if (cameraCounter && /\/3/.test(cameraCounter.textContent)) cameraCounter.textContent = '0/5';
  const protocolItems = document.querySelectorAll('.protocol-strip > div');
  if (protocolItems.length >= 3) {
    protocolItems[0].innerHTML = '<strong>5</strong><span>управляемых ракурсов</span>';
    protocolItems[1].innerHTML = '<strong>≈15°</strong><span>небольшой поворот</span>';
    protocolItems[2].innerHTML = '<strong>авто</strong><span>снимок при верном угле</span>';
  }
  const uploadLabel = document.getElementById('upload-label');
  if (uploadLabel) {
    const textNode = [...uploadLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && /Выбрать/.test(node.textContent || ''));
    if (textNode) textNode.textContent = ' Выбрать 5 фото ';
  }
  const cameraSeriesText = document.querySelector('.camera-series-bar > span');
  if (cameraSeriesText) cameraSeriesText.textContent = 'не нажимай повторно — следуй подсказке и дождись автоснимка';
  const cameraHeader = document.querySelector('.camera-header h2');
  if (cameraHeader) cameraHeader.textContent = 'Пять управляемых ракурсов';
  const methodCopy = document.querySelector('.method-copy');
  if (methodCopy) methodCopy.innerHTML = `
    <section><h3>Как поворачивать голову</h3><p>Поворот — это движение как при жесте «нет». Телефон и плечи остаются на месте, а нос движется к твоему левому или правому плечу. Не наклоняй ухо к плечу и не двигай только глазами.</p></section>
    <section><h3>Пять ракурсов</h3><p>Серия состоит из фронтального кадра, небольшого поворота к левому плечу, поворота к правому плечу и двух контрольных фронтальных кадров. Приложение само начинает отсчёт, когда угол стабилен.</p></section>
    <section><h3>Почему не 90°</h3><p>Нужен небольшой поворот примерно на 15°, а не профиль. Оба глаза и большая часть второго уха должны оставаться видимыми.</p></section>
    <section><h3>Неопределённость</h3><p>Если ракурс, контур или сегментация нестабильны, FACET помечает признак как пограничный или не определённый и расширяет диапазон.</p></section>
    <section><h3>Ограничение</h3><p>2.5D-профиль восстанавливается по обычной RGB-камере и не является точным TrueDepth-сканированием. Оценка остаётся модельной интерпретацией, а не объективной мерой внешности.</p></section>`;
}

__facetV191RefreshStaticCopy();
__facetV191EnsureFiveDots(document.getElementById('scan-progress'), 'scan-dot');
__facetV191EnsureFiveDots(document.getElementById('camera-frames'), 'camera-frame-dot');
__facetV191BuildCoach();
__facetV191UpdateCoach();

const __facetV191Observed = [
  document.getElementById('camera-counter'),
  document.getElementById('camera-status'),
  document.getElementById('camera-message'),
  document.getElementById('camera-capture-label')
].filter(Boolean);
const __facetV191Observer = new MutationObserver(() => requestAnimationFrame(__facetV191UpdateCoach));
for (const node of __facetV191Observed) __facetV191Observer.observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
const __facetV191Dialog = document.getElementById('camera-dialog');
if (__facetV191Dialog) __facetV191Observer.observe(__facetV191Dialog, { attributes: true, attributeFilter: ['open'] });

document.getElementById('camera-capture')?.addEventListener('click', () => {
  const coach = __facetV191BuildCoach();
  if (coach) coach.dataset.pose = 'front';
  requestAnimationFrame(__facetV191UpdateCoach);
});
document.getElementById('camera-open')?.addEventListener('click', () => setTimeout(__facetV191UpdateCoach, 120));

const __facetV191Footer = document.querySelector('.app-footer span:first-child');
if (__facetV191Footer) __facetV191Footer.textContent = 'FACET v1.9.1';
