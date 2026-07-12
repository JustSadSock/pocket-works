const root = document.documentElement;

let installedRuntime = null;
let scrollLockY = 0;
let scrollLocked = false;

function px(value) {
  return `${Math.max(0, Math.round(value * 100) / 100)}px`;
}

export function getViewportState() {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const layoutHeight = window.innerHeight;
  const keyboardInset = Math.max(0, layoutHeight - height - offsetTop);

  return {
    width,
    height,
    offsetTop,
    keyboardInset,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  };
}

function writeViewportState() {
  const state = getViewportState();
  root.style.setProperty('--app-viewport-width', px(state.width));
  root.style.setProperty('--app-viewport-height', px(state.height));
  root.style.setProperty('--app-viewport-offset-top', px(state.offsetTop));
  root.style.setProperty('--app-keyboard-inset', px(state.keyboardInset));
  root.classList.toggle('is-app-standalone', state.standalone);
  root.classList.toggle('is-app-browser', !state.standalone);
  root.classList.toggle('is-app-keyboard-open', state.keyboardInset > 80);
  window.dispatchEvent(new CustomEvent('appviewportchange', { detail: state }));
  return state;
}

export function capturePointer(element, pointerId) {
  if (!element?.setPointerCapture || pointerId == null) return false;
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function releasePointer(element, pointerId) {
  if (!element?.releasePointerCapture || pointerId == null) return false;
  try {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export function bindPointerGesture(element, handlers = {}, options = {}) {
  if (!element) throw new TypeError('bindPointerGesture requires an element');

  const controller = new AbortController();
  const activePointers = new Map();
  const signal = controller.signal;
  const capture = options.capture !== false;

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    activePointers.set(event.pointerId, event);
    if (capture) capturePointer(element, event.pointerId);
    handlers.onStart?.(event, activePointers);
  }, { signal });

  element.addEventListener('pointermove', (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, event);
    handlers.onMove?.(event, activePointers);
  }, { signal });

  const finish = (event, cancelled) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    releasePointer(element, event.pointerId);
    if (cancelled) handlers.onCancel?.(event, activePointers);
    else handlers.onEnd?.(event, activePointers);
  };

  element.addEventListener('pointerup', (event) => finish(event, false), { signal });
  element.addEventListener('pointercancel', (event) => finish(event, true), { signal });
  element.addEventListener('lostpointercapture', (event) => finish(event, true), { signal });

  return () => {
    controller.abort();
    activePointers.clear();
  };
}

export function setDocumentScrollLocked(locked) {
  if (Boolean(locked) === scrollLocked) return;
  scrollLocked = Boolean(locked);

  if (scrollLocked) {
    scrollLockY = window.scrollY;
    root.classList.add('is-app-scroll-locked');
    document.body.classList.add('is-app-scroll-locked');
    document.body.style.top = `${-scrollLockY}px`;
    return;
  }

  root.classList.remove('is-app-scroll-locked');
  document.body.classList.remove('is-app-scroll-locked');
  document.body.style.removeProperty('top');
  window.scrollTo({ top: scrollLockY, behavior: 'instant' });
}

function installPressFeedback(controller, selector) {
  const active = new Map();
  const signal = controller.signal;

  const clear = (pointerId) => {
    const element = active.get(pointerId);
    element?.classList.remove('is-pressed');
    active.delete(pointerId);
  };

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const element = event.target.closest?.(selector);
    if (!element || element.matches(':disabled, [aria-disabled="true"]')) return;
    active.set(event.pointerId, element);
    element.classList.add('is-pressed');
  }, { capture: true, signal });

  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, (event) => clear(event.pointerId), { capture: true, signal });
  }

  document.addEventListener('lostpointercapture', (event) => clear(event.pointerId), { capture: true, signal });
  window.addEventListener('blur', () => {
    for (const pointerId of active.keys()) clear(pointerId);
  }, { signal });
}

export function installMobileRuntime(options = {}) {
  if (installedRuntime) return installedRuntime;

  const controller = new AbortController();
  const signal = controller.signal;
  const pressSelector = options.pressSelector ?? 'button, [role="button"], [data-pressable]';
  const calloutSelector = options.calloutSelector ?? '[data-block-callout], [data-gesture-surface]';

  root.classList.add('has-mobile-runtime');
  writeViewportState();

  window.addEventListener('resize', writeViewportState, { passive: true, signal });
  window.addEventListener('orientationchange', () => requestAnimationFrame(writeViewportState), { passive: true, signal });
  window.visualViewport?.addEventListener('resize', writeViewportState, { passive: true, signal });
  window.visualViewport?.addEventListener('scroll', writeViewportState, { passive: true, signal });

  installPressFeedback(controller, pressSelector);

  document.addEventListener('dragstart', (event) => {
    const image = event.target.closest?.('img');
    if (image && !image.hasAttribute('data-native-drag')) event.preventDefault();
  }, { capture: true, signal });

  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.(calloutSelector)) event.preventDefault();
  }, { capture: true, signal });

  document.addEventListener('gesturestart', (event) => {
    if (event.target.closest?.('[data-gesture-surface]')) event.preventDefault();
  }, { capture: true, signal, passive: false });

  const runtime = {
    getViewportState,
    refreshViewport: writeViewportState,
    setScrollLocked: setDocumentScrollLocked,
    destroy() {
      controller.abort();
      setDocumentScrollLocked(false);
      root.classList.remove('has-mobile-runtime', 'is-app-standalone', 'is-app-browser', 'is-app-keyboard-open');
      installedRuntime = null;
    }
  };

  installedRuntime = runtime;
  return runtime;
}
