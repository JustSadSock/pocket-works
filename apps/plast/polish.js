const HINT_KEY = 'pocket-works:plast:controls-seen:v1';
const hud = document.getElementById('hud');
const placeButton = document.getElementById('placeButton');
const hotbar = document.getElementById('hotbar');

async function enterImmersiveMode() {
  try {
    if (!matchMedia('(display-mode: standalone)').matches && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    }
  } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}

for (const id of ['continueButton', 'newWorldButton']) {
  document.getElementById(id)?.addEventListener('pointerup', enterImmersiveMode, { passive: true });
}

let placeRepeat = 0;
function stopPlaceRepeat() {
  clearInterval(placeRepeat);
  placeRepeat = 0;
}
placeButton?.addEventListener('pointerdown', (event) => {
  if (!event.isTrusted) return;
  if (placeButton.querySelector('small')?.textContent.trim() === 'ЕСТЬ') return;
  stopPlaceRepeat();
  placeRepeat = window.setInterval(() => {
    const repeated = typeof PointerEvent === 'function'
      ? new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9007, pointerType: 'touch' })
      : new Event('pointerdown', { bubbles: true, cancelable: true });
    placeButton.dispatchEvent(repeated);
  }, 185);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
  placeButton?.addEventListener(type, stopPlaceRepeat);
}
for (const type of ['pointerup', 'pointercancel', 'blur']) {
  addEventListener(type, stopPlaceRepeat);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPlaceRepeat();
});

let scrubPointer = null;
let scrubSlot = -1;
function selectHotbarAt(clientX) {
  const slots = [...hotbar.querySelectorAll('.hotbar-slot')];
  if (!slots.length) return;
  const rect = hotbar.getBoundingClientRect();
  const index = Math.max(0, Math.min(slots.length - 1, Math.floor((clientX - rect.left) / Math.max(1, rect.width) * slots.length)));
  if (index === scrubSlot) return;
  scrubSlot = index;
  const event = typeof PointerEvent === 'function'
    ? new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9008, pointerType: 'touch' })
    : new Event('pointerdown', { bubbles: true, cancelable: true });
  slots[index].dispatchEvent(event);
  navigator.vibrate?.(6);
}
hotbar?.addEventListener('pointerdown', (event) => {
  if (!event.isTrusted) return;
  scrubPointer = event.pointerId;
  scrubSlot = -1;
  hotbar.setPointerCapture?.(event.pointerId);
  selectHotbarAt(event.clientX);
});
hotbar?.addEventListener('pointermove', (event) => {
  if (event.pointerId === scrubPointer) selectHotbarAt(event.clientX);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  hotbar?.addEventListener(type, (event) => {
    if (event.pointerId === scrubPointer) {
      scrubPointer = null;
      scrubSlot = -1;
    }
  });
}

function showControlsHint() {
  if (localStorage.getItem(HINT_KEY) === '1' || document.getElementById('controlsHint')) return;
  localStorage.setItem(HINT_KEY, '1');
  const hint = document.createElement('button');
  hint.id = 'controlsHint';
  hint.className = 'controls-hint';
  hint.type = 'button';
  hint.setAttribute('aria-label', 'Закрыть подсказку управления');
  hint.innerHTML = '<span><i class="hint-stick"></i><b>ИДТИ</b></span><span><i class="hint-look"></i><b>СМОТРЕТЬ</b></span><span><i class="hint-block"></i><b>ЛОМАТЬ · СТАВИТЬ</b></span>';
  const close = () => {
    hint.classList.add('leaving');
    setTimeout(() => hint.remove(), 240);
  };
  hint.addEventListener('click', close);
  hud.append(hint);
  setTimeout(close, 6500);
}

if (hud) {
  const observer = new MutationObserver(() => {
    if (!hud.hidden) setTimeout(showControlsHint, 500);
  });
  observer.observe(hud, { attributes: true, attributeFilter: ['hidden'] });
}
