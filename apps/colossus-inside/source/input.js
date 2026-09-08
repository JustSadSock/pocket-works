import { clamp, normalizedOrZero } from './core.js';

export function createInput({ canvas, joystick, knob, actionButton, onFirstGesture }) {
  const state = {
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    actionHeld: false,
    actionPressed: false,
    sprint: false
  };

  let movePointer = null;
  let lookPointer = null;
  let actionPointer = null;
  let joyRect = null;
  let lookLastX = 0;
  let lookLastY = 0;
  const keys = new Set();
  let firstGestureDone = false;

  const firstGesture = () => {
    if (firstGestureDone) return;
    firstGestureDone = true;
    onFirstGesture?.();
  };

  function updateJoystick(clientX, clientY) {
    if (!joyRect) joyRect = joystick.getBoundingClientRect();
    const cx = joyRect.left + joyRect.width / 2;
    const cy = joyRect.top + joyRect.height / 2;
    const radius = joyRect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = dx / length * radius;
      dy = dy / length * radius;
    }
    const normalized = normalizedOrZero(dx, dy);
    const strength = clamp(length / radius, 0, 1);
    state.moveX = normalized.x * strength;
    state.moveY = -normalized.y * strength;
    state.sprint = strength > 0.78;
    knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  function resetJoystick() {
    movePointer = null;
    state.moveX = 0;
    state.moveY = 0;
    state.sprint = false;
    knob.style.transform = 'translate3d(0, 0, 0)';
    joystick.classList.remove('active');
  }

  joystick.addEventListener('pointerdown', (event) => {
    if (movePointer !== null) return;
    firstGesture();
    event.preventDefault();
    movePointer = event.pointerId;
    joyRect = joystick.getBoundingClientRect();
    joystick.setPointerCapture(event.pointerId);
    joystick.classList.add('active');
    updateJoystick(event.clientX, event.clientY);
  }, { passive: false });

  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== movePointer) return;
    event.preventDefault();
    updateJoystick(event.clientX, event.clientY);
  }, { passive: false });

  joystick.addEventListener('pointerup', (event) => { if (event.pointerId === movePointer) resetJoystick(); });
  joystick.addEventListener('pointercancel', (event) => { if (event.pointerId === movePointer) resetJoystick(); });

  actionButton.addEventListener('pointerdown', (event) => {
    if (actionPointer !== null) return;
    firstGesture();
    event.preventDefault();
    actionPointer = event.pointerId;
    actionButton.setPointerCapture(event.pointerId);
    state.actionHeld = true;
    state.actionPressed = true;
    actionButton.classList.add('pressed');
  }, { passive: false });

  function releaseAction(event) {
    if (event.pointerId !== actionPointer) return;
    actionPointer = null;
    state.actionHeld = false;
    actionButton.classList.remove('pressed');
  }
  actionButton.addEventListener('pointerup', releaseAction);
  actionButton.addEventListener('pointercancel', releaseAction);

  canvas.addEventListener('pointerdown', (event) => {
    if (lookPointer !== null || event.clientX < window.innerWidth * 0.33) return;
    firstGesture();
    event.preventDefault();
    lookPointer = event.pointerId;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    document.body.classList.add('looking');
  }, { passive: false });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointer) return;
    event.preventDefault();
    const dx = event.clientX - lookLastX;
    const dy = event.clientY - lookLastY;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    state.lookX += dx;
    state.lookY += dy;
  }, { passive: false });

  function releaseLook(event) {
    if (event.pointerId !== lookPointer) return;
    lookPointer = null;
    document.body.classList.remove('looking');
  }
  canvas.addEventListener('pointerup', releaseLook);
  canvas.addEventListener('pointercancel', releaseLook);

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyE' || event.code === 'Space') {
      state.actionHeld = true;
      if (!event.repeat) state.actionPressed = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (event.code === 'KeyE' || event.code === 'Space') state.actionHeld = false;
  });

  function sample() {
    let moveX = state.moveX;
    let moveY = state.moveY;
    let sprint = state.sprint;
    if (keys.size) {
      moveX += (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      moveY += (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const n = normalizedOrZero(moveX, moveY);
      moveX = n.x;
      moveY = n.y;
      sprint ||= keys.has('ShiftLeft') || keys.has('ShiftRight');
    }
    const out = {
      moveX: clamp(moveX, -1, 1),
      moveY: clamp(moveY, -1, 1),
      lookX: state.lookX,
      lookY: state.lookY,
      actionHeld: state.actionHeld,
      actionPressed: state.actionPressed,
      sprint
    };
    state.lookX = 0;
    state.lookY = 0;
    state.actionPressed = false;
    return out;
  }

  function cancelAll() {
    resetJoystick();
    lookPointer = null;
    actionPointer = null;
    state.actionHeld = false;
    state.actionPressed = false;
    state.lookX = 0;
    state.lookY = 0;
  }

  window.addEventListener('blur', cancelAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });

  return { sample, cancelAll };
}
