(() => {
  'use strict';

  const NativeWorker = window.Worker;
  function PocketWorker(url, options) {
    const source = String(url || '');
    if (source.endsWith('/tracker-worker.js') || source === './tracker-worker.js' || source.includes('tracker-worker.js')) {
      return new NativeWorker(url);
    }
    return new NativeWorker(url, options);
  }
  PocketWorker.prototype = NativeWorker.prototype;
  Object.setPrototypeOf(PocketWorker, NativeWorker);
  window.Worker = PocketWorker;

  const INTRO_KEY = 'pocket-works:myalo:camera-guide:v1';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const startButton = document.querySelector('#start-button');
  const startup = document.querySelector('#startup');
  const errorPanel = document.querySelector('#permission-error');
  const retryButton = document.querySelector('#retry-button');
  let bypassStartGuide = false;
  let lastErrorMode = 'help';
  let primaryAction = null;
  let secondaryAction = null;

  const style = document.createElement('style');
  style.textContent = `
    .myalo-help-button{width:42px!important;padding:0!important;font-size:17px!important}
    .myalo-text-help{margin-top:14px;padding:0;border:0;background:transparent;color:rgba(242,238,227,.72);font:600 12px/1.3 ui-sans-serif,-apple-system,sans-serif;text-decoration:underline;text-underline-offset:4px}
    .myalo-error-steps,.myalo-guide-steps{width:min(100%,560px);margin:0 0 20px;padding:0;display:grid;gap:9px;list-style:none;counter-reset:myalo-step}
    .myalo-error-steps li,.myalo-guide-steps li{counter-increment:myalo-step;display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:start;color:#f2eee3;font-size:13px;line-height:1.35}
    .myalo-error-steps li:before,.myalo-guide-steps li:before{content:counter(myalo-step,decimal-leading-zero);display:grid;place-items:center;width:30px;min-height:30px;background:#b8ff68;color:#171816;font:900 10px/1 ui-monospace,monospace;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%)}
    .myalo-error-help,.myalo-guide-secondary{width:min(100%,430px);min-height:50px;margin-top:10px;border:1px solid rgba(242,238,227,.45);padding:0 16px;background:rgba(18,19,17,.76);color:#f2eee3;font-weight:850;text-transform:uppercase;letter-spacing:.03em;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}
    .myalo-guide{position:absolute;z-index:40;inset:0;display:grid;align-items:end;padding:max(12px,var(--safe-top)) max(12px,var(--safe-right)) max(12px,var(--safe-bottom)) max(12px,var(--safe-left))}
    .myalo-guide[hidden]{display:none!important}
    .myalo-guide-scrim{position:absolute;inset:0;border:0;background:rgba(8,9,8,.76);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
    .myalo-guide-panel{position:relative;z-index:1;width:min(100%,620px);max-height:calc(100dvh - var(--safe-top) - var(--safe-bottom) - 24px);overflow:auto;margin:0 auto;padding:20px 18px 18px;background:#20221f;border:1px solid rgba(242,238,227,.34);clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px));box-shadow:0 -22px 70px rgba(0,0,0,.38)}
    .myalo-guide-head{display:flex;align-items:center;justify-content:space-between;gap:14px}.myalo-guide-kicker{margin:0;color:#b8ff68;font:800 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
    .myalo-guide-close{width:42px;height:42px;border:1px solid rgba(242,238,227,.38);background:transparent;color:#f2eee3;font-size:26px;line-height:1}
    .myalo-guide h2{margin:18px 0 0;max-width:560px;font-size:clamp(34px,10vw,58px);line-height:.9;letter-spacing:-.065em;text-transform:uppercase}.myalo-guide-copy{margin:18px 0;max-width:540px;color:rgba(242,238,227,.72);font-size:14px;line-height:1.45}
    .myalo-guide-primary{width:100%;max-width:560px}.myalo-guide-secondary{max-width:560px}.myalo-guide-note{min-height:1.2em;margin:14px 0 0;color:rgba(242,238,227,.58);font:600 11px/1.4 ui-monospace,monospace}
    @media(max-width:430px){.control--back{width:44px!important;overflow:hidden;color:transparent!important;padding:0!important}.control--back:after{content:'PW';color:#f2eee3;position:absolute}.control--icon{width:48px!important}.top-actions{gap:4px!important}.myalo-guide h2{font-size:clamp(32px,10vw,46px)}}
  `;
  document.head.append(style);

  const guide = document.createElement('div');
  guide.className = 'myalo-guide';
  guide.hidden = true;
  guide.setAttribute('role', 'dialog');
  guide.setAttribute('aria-modal', 'true');
  guide.innerHTML = `
    <button class="myalo-guide-scrim" type="button" aria-label="Закрыть помощь"></button>
    <section class="myalo-guide-panel">
      <div class="myalo-guide-head"><p class="myalo-guide-kicker"></p><button class="myalo-guide-close" type="button" aria-label="Закрыть">×</button></div>
      <h2></h2><p class="myalo-guide-copy"></p><ol class="myalo-guide-steps"></ol>
      <button class="start-button myalo-guide-primary" type="button"><span></span><span aria-hidden="true">↗</span></button>
      <button class="myalo-guide-secondary" type="button" hidden></button>
      <p class="myalo-guide-note"></p>
    </section>`;
  document.querySelector('#mirror')?.append(guide);

  const kicker = guide.querySelector('.myalo-guide-kicker');
  const title = guide.querySelector('h2');
  const copy = guide.querySelector('.myalo-guide-copy');
  const steps = guide.querySelector('.myalo-guide-steps');
  const primary = guide.querySelector('.myalo-guide-primary');
  const primaryLabel = primary.querySelector('span');
  const secondary = guide.querySelector('.myalo-guide-secondary');
  const note = guide.querySelector('.myalo-guide-note');

  function setSteps(items) {
    steps.replaceChildren(...items.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }

  function closeGuide() {
    guide.hidden = true;
    primaryAction = secondaryAction = null;
  }

  async function copyAddress() {
    const address = location.href.split('#')[0];
    try {
      await navigator.clipboard.writeText(address);
      note.textContent = 'Адрес скопирован. Вставь его в Safari.';
    } catch {
      note.textContent = address;
    }
  }

  function openInSafari() {
    const address = location.href.split('#')[0];
    const opened = window.open(address, '_blank', 'noopener,noreferrer');
    if (!opened) copyAddress();
    else note.textContent = 'Safari открыт. После изменения разрешения вернись в МЯЛО.';
  }

  function runOriginalStart() {
    localStorage.setItem(INTRO_KEY, '1');
    closeGuide();
    bypassStartGuide = true;
    startButton?.click();
  }

  function definition(mode) {
    if (mode === 'intro') return {
      kicker: 'Перед запуском · iPhone', title: 'Сейчас появится системный запрос',
      copy: 'Нажатие ниже попросит iOS дать доступ к фронтальной камере. Если доступ уже выдан, окно не появится и запуск продолжится сразу.',
      steps: ['Нажми «Показать запрос».', 'В системном окне выбери «Разрешить».', 'Оставь интернет включённым: при первом запуске загрузятся модели распознавания.'],
      primary: 'Показать запрос', secondary: '', note: 'Кадры обрабатываются на телефоне и не отправляются на сервер.', primaryAction: runOriginalStart
    };
    if (mode === 'permission') return {
      kicker: 'Доступ · PWA', title: 'Разреши камеру через Safari',
      copy: 'У приложения на главном экране нет адресной строки. Поэтому разрешение сайта удобнее изменить в Safari.',
      steps: ['Нажми «Открыть в Safari».', 'Открой меню страницы → «Настройки веб-сайта».', 'Установи «Камера: Разрешить», вернись сюда и нажми «Проверить снова».'],
      primary: 'Проверить снова', secondary: 'Открыть в Safari', note: 'Запасной путь: Настройки → Приложения → Safari → Камера → Спрашивать или Разрешить.', primaryAction: runOriginalStart, secondaryAction: openInSafari
    };
    if (mode === 'vision') return {
      kicker: 'Движок зрения', title: 'Камера уже разрешена',
      copy: 'Эта ошибка не связана с разрешением камеры. Не запустился локальный MediaPipe/WASM-движок распознавания.',
      steps: ['Установи обновление МЯЛО 1.1.0.', 'Полностью закрой PWA через переключатель приложений.', 'Открой снова с включённым интернетом и нажми «Повторить».'],
      primary: 'Повторить запуск', secondary: 'Скопировать адрес', note: 'Зелёный индикатор и видимый кадр означают, что доступ к камере уже получен.', primaryAction: runOriginalStart, secondaryAction: copyAddress
    };
    return {
      kicker: 'Как это работает', title: 'Камера, модели, жест',
      copy: 'МЯЛО отдельно проверяет камеру и движок зрения. Для каждого сбоя теперь показываются конкретные действия.',
      steps: ['Камера: iOS показывает системный запрос.', 'Зрение: модели загружаются один раз и кешируются.', 'Жест: сведи большой и указательный пальцы на светящейся точке и потяни.'],
      primary: 'Закрыть помощь', secondary: standalone ? 'Открыть в Safari' : '', note: 'Кнопка «?» открывает эту инструкцию в любой момент.', primaryAction: closeGuide, secondaryAction: standalone ? openInSafari : null
    };
  }

  function openGuide(mode) {
    const data = definition(mode);
    kicker.textContent = data.kicker;
    title.textContent = data.title;
    copy.textContent = data.copy;
    setSteps(data.steps);
    primaryLabel.textContent = data.primary;
    secondary.hidden = !data.secondary;
    secondary.textContent = data.secondary || '';
    note.textContent = data.note || '';
    primaryAction = data.primaryAction;
    secondaryAction = data.secondaryAction || null;
    guide.hidden = false;
  }

  guide.querySelector('.myalo-guide-scrim').addEventListener('click', closeGuide);
  guide.querySelector('.myalo-guide-close').addEventListener('click', closeGuide);
  primary.addEventListener('click', () => primaryAction?.());
  secondary.addEventListener('click', () => secondaryAction?.());

  const topActions = document.querySelector('.top-actions');
  if (topActions) {
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'control myalo-help-button';
    help.textContent = '?';
    help.setAttribute('aria-label', 'Открыть помощь');
    help.addEventListener('click', () => openGuide('help'));
    topActions.prepend(help);
  }

  if (startup && !startup.querySelector('.myalo-text-help')) {
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'myalo-text-help';
    help.textContent = 'Как работает доступ к камере';
    help.addEventListener('click', () => openGuide('intro'));
    startButton?.insertAdjacentElement('afterend', help);
  }

  startButton?.addEventListener('click', async (event) => {
    if (bypassStartGuide) {
      bypassStartGuide = false;
      return;
    }
    let state = 'unknown';
    try { state = (await navigator.permissions?.query({ name: 'camera' }))?.state || 'unknown'; } catch {}
    if (state === 'granted' || localStorage.getItem(INTRO_KEY) === '1') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openGuide('intro');
  }, true);

  function decorateError() {
    if (!errorPanel || errorPanel.hidden) return;
    const errorTitle = errorPanel.querySelector('#error-title')?.textContent || '';
    const errorCopy = errorPanel.querySelector('#error-copy')?.textContent || '';
    const vision = /зрени|ModuleFactory|модел|MediaPipe|WASM/i.test(`${errorTitle} ${errorCopy}`);
    const denied = /запрещ|доступ|NotAllowed|Security/i.test(`${errorTitle} ${errorCopy}`);
    lastErrorMode = vision ? 'vision' : denied ? 'permission' : 'help';
    const code = errorPanel.querySelector('.error-code');
    if (code) code.textContent = vision ? 'Ошибка движка зрения' : denied ? 'Нужен доступ к камере' : 'Ошибка запуска';
    if (vision) {
      const copyNode = errorPanel.querySelector('#error-copy');
      if (copyNode) copyNode.textContent = 'Камера уже работает. Менять разрешения не нужно: не запустился локальный движок распознавания.';
    }
    let list = errorPanel.querySelector('.myalo-error-steps');
    if (!list) {
      list = document.createElement('ol');
      list.className = 'myalo-error-steps';
      retryButton?.insertAdjacentElement('beforebegin', list);
    }
    const items = vision
      ? ['Установи обновление МЯЛО 1.1.0.', 'Полностью закрой PWA.', 'Открой снова с интернетом и нажми «Повторить».']
      : denied
        ? ['Открой сайт в Safari.', 'Разреши камеру в настройках веб-сайта.', 'Вернись и нажми «Повторить».']
        : ['Полностью закрой приложение.', 'Закрой другие приложения с камерой.', 'Открой МЯЛО снова.'];
    list.replaceChildren(...items.map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    if (!errorPanel.querySelector('.myalo-error-help')) {
      const help = document.createElement('button');
      help.type = 'button';
      help.className = 'myalo-error-help';
      help.textContent = 'Пошаговая помощь';
      help.addEventListener('click', () => openGuide(lastErrorMode));
      retryButton?.insertAdjacentElement('afterend', help);
    }
  }

  if (errorPanel) {
    new MutationObserver(decorateError).observe(errorPanel, { attributes: true, childList: true, subtree: true, characterData: true });
  }
})();
