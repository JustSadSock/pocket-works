const root = document.documentElement;

let installedRuntime = null;
let scrollLockY = 0;
let scrollLocked = false;

function px(value) {
  return `${Math.max(0, Math.round(value * 100) / 100)}px`;
}

function closestElement(target, selector) {
  const element = target instanceof Element ? target : target?.parentElement;
  return element?.closest?.(selector) || null;
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

function vibrateFor(element) {
  const haptic = element?.dataset?.haptic;
  if (!haptic || !navigator.vibrate) return;
  const pattern = haptic === 'success'
    ? [8, 24, 8]
    : haptic === 'warning'
      ? [12, 36, 12]
      : haptic === 'selection'
        ? 5
        : 8;
  navigator.vibrate(pattern);
}

function installPressFeedback(controller, selector) {
  const active = new Map();
  const signal = controller.signal;

  const clear = (pointerId, delayed = false) => {
    const state = active.get(pointerId);
    if (!state) return;
    active.delete(pointerId);
    const remove = () => state.element.classList.remove('is-pressed');
    if (delayed && !state.cancelled) window.setTimeout(remove, 35);
    else remove();
  };

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const element = event.target.closest?.(selector);
    if (!element || element.matches(':disabled, [aria-disabled="true"]')) return;
    active.set(event.pointerId, {
      element,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false
    });
    element.classList.add('is-pressed');
  }, { capture: true, signal });

  document.addEventListener('pointermove', (event) => {
    const state = active.get(event.pointerId);
    if (!state || state.cancelled) return;
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (distance <= 12) return;
    state.cancelled = true;
    state.element.classList.remove('is-pressed');
  }, { capture: true, signal, passive: true });

  document.addEventListener('pointerup', (event) => {
    const state = active.get(event.pointerId);
    if (state && !state.cancelled) vibrateFor(state.element);
    clear(event.pointerId, true);
  }, { capture: true, signal });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, (event) => clear(event.pointerId), { capture: true, signal });
  }

  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const element = event.target.closest?.(selector);
    if (!element || element.matches(':disabled, [aria-disabled="true"]')) return;
    element.classList.add('is-keyboard-pressed');
  }, { capture: true, signal });

  document.addEventListener('keyup', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const element = event.target.closest?.(selector);
    if (!element) return;
    element.classList.remove('is-keyboard-pressed');
    vibrateFor(element);
  }, { capture: true, signal });

  window.addEventListener('blur', () => {
    for (const pointerId of [...active.keys()]) clear(pointerId);
    for (const element of document.querySelectorAll('.is-keyboard-pressed')) {
      element.classList.remove('is-keyboard-pressed');
    }
  }, { signal });
}

function rangeProgress(input) {
  const minimum = Number.parseFloat(input.min || '0');
  const maximum = Number.parseFloat(input.max || '100');
  const value = Number.parseFloat(input.value || '0');
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return 0;
  return Math.min(100, Math.max(0, ((value - minimum) / (maximum - minimum)) * 100));
}

function syncRange(input) {
  if (!(input instanceof HTMLInputElement) || input.type !== 'range') return;
  const progress = rangeProgress(input);
  input.style.setProperty('--app-range-progress', `${progress}%`);
  input.dataset.rangeReady = 'true';
  window.dispatchEvent(new CustomEvent('appcontrolchange', {
    detail: { type: 'range', element: input, value: input.value, progress }
  }));
}

function installRangeFeedback(controller) {
  const signal = controller.signal;
  const rangeSelector = 'input[type="range"]:not([data-native-range="false"])';

  const syncAllRanges = (scope = document) => {
    if (scope instanceof HTMLInputElement && scope.matches(rangeSelector)) syncRange(scope);
    for (const input of scope.querySelectorAll?.(rangeSelector) || []) syncRange(input);
  };

  syncAllRanges();

  document.addEventListener('input', (event) => syncRange(event.target), { capture: true, signal, passive: true });
  document.addEventListener('change', (event) => syncRange(event.target), { capture: true, signal, passive: true });

  document.addEventListener('pointerdown', (event) => {
    const input = event.target.closest?.(rangeSelector);
    if (!input || input.disabled) return;
    input.classList.add('is-dragging');
  }, { capture: true, signal });

  const finishDrag = (event) => {
    const input = event.target.closest?.(rangeSelector) || document.querySelector(`${rangeSelector}.is-dragging`);
    if (!input) return;
    input.classList.remove('is-dragging');
    syncRange(input);
  };
  document.addEventListener('pointerup', finishDrag, { capture: true, signal });
  document.addEventListener('pointercancel', finishDrag, { capture: true, signal });

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) syncAllRanges(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });

  return syncAllRanges;
}

export function installMobileRuntime(options = {}) {
  if (installedRuntime) return installedRuntime;

  const controller = new AbortController();
  const signal = controller.signal;
  const pressSelector = options.pressSelector
    ?? '[data-native-press], button, [role="button"], [data-pressable], a[href]';
  const selectableSelector = options.selectableSelector
    ?? 'input, textarea, select, [contenteditable="true"], [data-selectable], .selectable-content';
  const calloutSelector = options.calloutSelector ?? 'body';

  root.classList.add('has-mobile-runtime');
  writeViewportState();

  window.addEventListener('resize', writeViewportState, { passive: true, signal });
  window.addEventListener('orientationchange', () => requestAnimationFrame(writeViewportState), { passive: true, signal });
  window.visualViewport?.addEventListener('resize', writeViewportState, { passive: true, signal });
  window.visualViewport?.addEventListener('scroll', writeViewportState, { passive: true, signal });

  installPressFeedback(controller, pressSelector);
  const refreshControls = installRangeFeedback(controller);

  document.addEventListener('dragstart', (event) => {
    const image = event.target.closest?.('img');
    if (image && !image.hasAttribute('data-native-drag')) event.preventDefault();
  }, { capture: true, signal });

  document.addEventListener('selectstart', (event) => {
    if (!closestElement(event.target, selectableSelector)) event.preventDefault();
  }, { capture: true, signal });

  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    if (!closestElement(selection.anchorNode, selectableSelector)) selection.removeAllRanges();
  }, { signal });

  document.addEventListener('contextmenu', (event) => {
    if (closestElement(event.target, selectableSelector)) return;
    if (closestElement(event.target, calloutSelector)) event.preventDefault();
  }, { capture: true, signal });

  document.addEventListener('gesturestart', (event) => {
    if (event.target.closest?.('[data-gesture-surface]')) event.preventDefault();
  }, { capture: true, signal, passive: false });

  const runtime = {
    getViewportState,
    refreshViewport: writeViewportState,
    refreshControls,
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
