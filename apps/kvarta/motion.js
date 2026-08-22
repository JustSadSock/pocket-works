const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const board = document.querySelector('#board');
const pivotLayer = document.querySelector('#pivot-layer');
const boardFrame = document.querySelector('.board-frame');
const successModal = document.querySelector('#success-modal');
let gesture = null;

if (board && pivotLayer && boardFrame) {
  let previous = snapshotBoard();

  const observer = new MutationObserver(() => {
    requestAnimationFrame(() => {
      const next = snapshotBoard();
      if (previous.size) animateBoardTransition(previous, next);
      previous = next;
    });
  });

  observer.observe(board, { childList: true });

  pivotLayer.addEventListener('pointerdown', (event) => {
    const pivot = event.target.closest('.pivot');
    if (!pivot) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, pivot };
    if (!REDUCED_MOTION) {
      pivot.getAnimations().forEach((animation) => animation.cancel());
      pivot.animate([
        { transform: 'translateY(0) scale(1)', boxShadow: '0 2px 0 rgba(0,0,0,.18)' },
        { transform: 'translateY(2px) scale(.86)', boxShadow: '0 0 0 rgba(0,0,0,.18)' }
      ], { duration: 105, easing: 'cubic-bezier(.2,.85,.35,1)', fill: 'forwards' });
    }
  }, true);

  pivotLayer.addEventListener('pointerup', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const dominant = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const dir = Math.abs(dominant) < 15 ? 1 : (dominant > 0 ? 1 : -1);
    animateRivetRelease(gesture.pivot, dir);
    gesture = null;
  }, true);

  pivotLayer.addEventListener('pointercancel', clearGesture, true);
  pivotLayer.addEventListener('lostpointercapture', clearGesture, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      gesture = null;
      board.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    }
  });
}

if (successModal) {
  const successObserver = new MutationObserver(() => {
    if (!successModal.hidden) animateSuccess();
  });
  successObserver.observe(successModal, { attributes: true, attributeFilter: ['hidden'] });
}

function clearGesture() {
  if (!gesture) return;
  const pivot = gesture.pivot;
  gesture = null;
  if (!REDUCED_MOTION && pivot) {
    pivot.getAnimations().forEach((animation) => animation.cancel());
    pivot.animate([
      { transform: 'translateY(2px) scale(.86)' },
      { transform: 'translateY(0) scale(1)' }
    ], { duration: 140, easing: 'cubic-bezier(.2,.9,.35,1)' });
  }
}

function snapshotBoard() {
  const result = new Map();
  if (!board) return result;
  [...board.querySelectorAll('.tile')].forEach((tile, index) => {
    const rect = tile.getBoundingClientRect();
    result.set(Number(tile.dataset.tile), {
      index,
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      rect
    });
  });
  return result;
}

function animateBoardTransition(before, after) {
  const tiles = [...board.querySelectorAll('.tile')];
  if (!tiles.length) return;
  const changed = [];

  after.forEach((entry, tileId) => {
    const old = before.get(tileId);
    if (old && old.index !== entry.index) changed.push({ tileId, old, next: entry });
  });

  if (!changed.length) return;

  tiles.forEach((tile) => tile.getAnimations().forEach((animation) => animation.cancel()));

  if (REDUCED_MOTION) {
    changed.forEach(({ tileId }) => {
      const tile = board.querySelector(`[data-tile="${tileId}"]`);
      tile?.animate([{ opacity: .82 }, { opacity: 1 }], { duration: 80, easing: 'linear' });
    });
    return;
  }

  const isQuartet = changed.length === 4 && occupiesOneQuartet(changed.map(({ next }) => next.index));
  if (isQuartet) {
    animateQuartet(changed);
  } else {
    animateSheetSettle(changed);
  }
}

function occupiesOneQuartet(indices) {
  const rows = indices.map((index) => Math.floor(index / 4));
  const cols = indices.map((index) => index % 4);
  return Math.max(...rows) - Math.min(...rows) === 1 && Math.max(...cols) - Math.min(...cols) === 1;
}

function animateQuartet(changed) {
  const pivot = {
    x: changed.reduce((sum, item) => sum + item.next.center.x, 0) / 4,
    y: changed.reduce((sum, item) => sum + item.next.center.y, 0) / 4
  };

  const sample = changed[0];
  const oldVector = {
    x: sample.old.center.x - pivot.x,
    y: sample.old.center.y - pivot.y
  };
  const newVector = {
    x: sample.next.center.x - pivot.x,
    y: sample.next.center.y - pivot.y
  };
  const cross = oldVector.x * newVector.y - oldVector.y * newVector.x;
  const dir = cross >= 0 ? 1 : -1;

  changed.forEach(({ tileId, old, next }, index) => {
    const tile = board.querySelector(`[data-tile="${tileId}"]`);
    if (!tile) return;

    const start = {
      x: old.center.x - next.center.x,
      y: old.center.y - next.center.y
    };
    const oldRel = { x: old.center.x - pivot.x, y: old.center.y - pivot.y };
    const rel28 = rotateVector(oldRel, dir * Math.PI * .155);
    const rel52 = rotateVector(oldRel, dir * Math.PI * .29);
    const p28 = { x: pivot.x + rel28.x - next.center.x, y: pivot.y + rel28.y - next.center.y };
    const p52 = { x: pivot.x + rel52.x - next.center.x, y: pivot.y + rel52.y - next.center.y };

    tile.style.zIndex = String(10 + index);
    const animation = tile.animate([
      { transform: `translate3d(${start.x}px, ${start.y}px, 0) scale(1)`, filter: 'drop-shadow(0 0 0 rgba(23,50,74,0))', offset: 0 },
      { transform: `translate3d(${p28.x}px, ${p28.y}px, 0) scale(1.035)`, filter: 'drop-shadow(4px 7px 3px rgba(23,50,74,.18))', offset: .3 },
      { transform: `translate3d(${p52.x}px, ${p52.y}px, 0) scale(1.055)`, filter: 'drop-shadow(7px 10px 4px rgba(23,50,74,.22))', offset: .58 },
      { transform: 'translate3d(0, 0, 0) scale(1.016)', filter: 'drop-shadow(2px 3px 1px rgba(23,50,74,.12))', offset: .88 },
      { transform: 'translate3d(0, 0, 0) scale(1)', filter: 'drop-shadow(0 0 0 rgba(23,50,74,0))', offset: 1 }
    ], {
      duration: 330,
      easing: 'cubic-bezier(.18,.82,.28,1)',
      fill: 'both'
    });
    animation.finished.finally(() => { tile.style.zIndex = ''; }).catch(() => {});
  });

  boardFrame.getAnimations().forEach((animation) => animation.cancel());
  boardFrame.animate([
    { transform: 'translate3d(0,0,0) rotate(0deg)' },
    { transform: `translate3d(${dir * .8}px,-1px,0) rotate(${dir * .22}deg)`, offset: .42 },
    { transform: `translate3d(${-dir * .35}px,.45px,0) rotate(${-dir * .08}deg)`, offset: .78 },
    { transform: 'translate3d(0,0,0) rotate(0deg)' }
  ], { duration: 350, easing: 'cubic-bezier(.2,.76,.24,1)' });
}

function animateSheetSettle(changed) {
  changed.forEach(({ tileId, old, next }, index) => {
    const tile = board.querySelector(`[data-tile="${tileId}"]`);
    if (!tile) return;
    const dx = old.center.x - next.center.x;
    const dy = old.center.y - next.center.y;
    tile.animate([
      { transform: `translate3d(${dx * .16}px, ${dy * .16}px, 0) scale(.985)`, opacity: .72 },
      { transform: 'translate3d(0,0,0) scale(1.012)', opacity: 1, offset: .74 },
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 }
    ], {
      duration: 220 + Math.min(index, 7) * 12,
      easing: 'cubic-bezier(.2,.8,.3,1)',
      delay: Math.min(index, 7) * 7
    });
  });

  boardFrame.animate([
    { transform: 'scale(.996)' },
    { transform: 'scale(1.002)', offset: .62 },
    { transform: 'scale(1)' }
  ], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
}

function animateRivetRelease(pivot, dir) {
  if (!pivot || REDUCED_MOTION) return;
  pivot.getAnimations().forEach((animation) => animation.cancel());
  pivot.animate([
    { transform: 'translateY(2px) scale(.86) rotate(0deg)', boxShadow: '0 0 0 rgba(0,0,0,.18)' },
    { transform: `translateY(-1px) scale(1.08) rotate(${dir * 72}deg)`, boxShadow: '0 5px 0 rgba(0,0,0,.16)', offset: .55 },
    { transform: `translateY(0) scale(.98) rotate(${dir * 92}deg)`, boxShadow: '0 2px 0 rgba(0,0,0,.18)', offset: .84 },
    { transform: `translateY(0) scale(1) rotate(${dir * 90}deg)`, boxShadow: '0 2px 0 rgba(0,0,0,.18)' }
  ], { duration: 300, easing: 'cubic-bezier(.16,.82,.28,1)' });
}

function animateSuccess() {
  if (REDUCED_MOTION) return;
  const sheet = successModal.querySelector('.success-sheet');
  const seal = successModal.querySelector('.success-seal');

  sheet?.animate([
    { transform: 'translateY(34px) scale(.985)', opacity: 0 },
    { transform: 'translateY(-4px) scale(1.008)', opacity: 1, offset: .7 },
    { transform: 'translateY(0) scale(1)', opacity: 1 }
  ], { duration: 360, easing: 'cubic-bezier(.18,.82,.26,1)' });

  seal?.animate([
    { transform: 'rotate(-16deg) scale(1.7)', opacity: 0 },
    { transform: 'rotate(5deg) scale(.9)', opacity: 1, offset: .58 },
    { transform: 'rotate(-2deg) scale(1.06)', opacity: 1, offset: .82 },
    { transform: 'rotate(0deg) scale(1)', opacity: 1 }
  ], { duration: 440, delay: 70, easing: 'cubic-bezier(.18,.82,.28,1)' });
}

function rotateVector(vector, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}
