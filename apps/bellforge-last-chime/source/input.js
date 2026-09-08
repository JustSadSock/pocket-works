const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function naturalLookDelta(current, previous) {
  return {
    x: previous.x - current.x,
    y: previous.y - current.y
  };
}

export function shapeLookDelta(x, y) {
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.18) return { x: 0, y: 0 };
  const normalized = Math.min(1, magnitude / 28);
  const gain = 1 + normalized * normalized * 0.52;
  return { x: x * gain, y: y * gain };
}

export function shapeStick(dx, dy, radius = 60, deadzone = 0.08) {
  const rawLength = Math.hypot(dx, dy);
  if (rawLength < radius * deadzone) return { x: 0, y: 0, magnitude: 0 };
  const normalized = clamp((rawLength / radius - deadzone) / (1 - deadzone), 0, 1);
  const eased = normalized * (0.72 + normalized * 0.28);
  const inv = rawLength > 0 ? 1 / rawLength : 0;
  return {
    x: dx * inv * eased,
    y: -dy * inv * eased,
    magnitude: eased
  };
}

export function createInput({ canvas, joystick, knob, lookZone, actionButton }) {
  const state = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, action: false, sprint: false };
  const pointers = new Set();
  const keys = new Set();
  let joyId = null;
  let lookId = null;
  let joyOrigin = { x: 0, y: 0 };
  let lookLast = { x: 0, y: 0 };
  let sprintLatched = false;
  let knobFrame = 0;
  let pendingKnobX = 0;
  let pendingKnobY = 0;

  const setKnob = (x, y) => {
    const radius = 39;
    const length = Math.hypot(x, y) || 1;
    const scale = Math.min(1, radius / length);
    knob.style.transform = `translate3d(${x * scale}px, ${y * scale}px, 0)`;
  };

  const scheduleKnob = (x, y) => {
    pendingKnobX = x;
    pendingKnobY = y;
    if (knobFrame) return;
    knobFrame = requestAnimationFrame(() => {
      knobFrame = 0;
      setKnob(pendingKnobX, pendingKnobY);
    });
  };

  const placeFloatingJoystick = (x, y) => {
    const margin = 62;
    const maxX = Math.max(margin, innerWidth * 0.43 - margin * 0.35);
    const clampedX = clamp(x, margin, maxX);
    const clampedY = clamp(y, margin, innerHeight - margin);
    joystick.style.left = `${clampedX}px`;
    joystick.style.top = `${clampedY}px`;
    joystick.style.bottom = 'auto';
    joystick.style.transform = 'translate(-50%, -50%)';
  };

  const resetJoystickPosition = () => {
    joystick.style.removeProperty('left');
    joystick.style.removeProperty('top');
    joystick.style.removeProperty('bottom');
    joystick.style.removeProperty('transform');
  };

  const clearJoy = () => {
    joyId = null;
    state.moveX = 0;
    state.moveY = 0;
    state.sprint = false;
    sprintLatched = false;
    pendingKnobX = 0;
    pendingKnobY = 0;
    if (knobFrame) {
      cancelAnimationFrame(knobFrame);
      knobFrame = 0;
    }
    setKnob(0, 0);
    joystick.classList.remove('active');
    resetJoystickPosition();
  };

  const clearLook = () => {
    lookId = null;
    state.lookX = 0;
    state.lookY = 0;
    lookZone.classList.remove('active');
  };

  const releaseCapture = (event) => {
    try {
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const down = (event) => {
    if (event.target === actionButton || actionButton.contains(event.target)) return;
    event.preventDefault();

    const leftControlBoundary = innerWidth * 0.43;
    const lookControlBoundary = innerWidth * 0.47;
    const wantsJoy = event.clientX < leftControlBoundary;
    const wantsLook = event.clientX >= lookControlBoundary;
    if ((wantsJoy && joyId !== null) || (wantsLook && lookId !== null) || (!wantsJoy && !wantsLook)) return;

    if (event.pointerType !== 'mouse') {
      try { canvas.setPointerCapture?.(event.pointerId); } catch {}
    }
    pointers.add(event.pointerId);

    if (wantsJoy) {
      joyId = event.pointerId;
      joyOrigin = { x: event.clientX, y: event.clientY };
      placeFloatingJoystick(event.clientX, event.clientY);
      joystick.classList.add('active');
      setKnob(0, 0);
      return;
    }

    lookId = event.pointerId;
    lookLast = { x: event.clientX, y: event.clientY };
    lookZone.classList.add('active');
  };

  const move = (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();

    if (event.pointerId === joyId) {
      const dx = event.clientX - joyOrigin.x;
      const dy = event.clientY - joyOrigin.y;
      const shaped = shapeStick(dx, dy);
      state.moveX = shaped.x;
      state.moveY = shaped.y;
      if (sprintLatched) sprintLatched = shaped.magnitude > 0.69;
      else sprintLatched = shaped.magnitude > 0.84;
      state.sprint = sprintLatched;
      scheduleKnob(dx, dy);
    } else if (event.pointerId === lookId) {
      const current = { x: event.clientX, y: event.clientY };
      const raw = naturalLookDelta(current, lookLast);
      const delta = shapeLookDelta(raw.x, raw.y);
      state.lookX += delta.x;
      state.lookY += delta.y;
      lookLast = current;
    }
  };

  const up = (event) => {
    pointers.delete(event.pointerId);
    releaseCapture(event);
    if (event.pointerId === joyId) clearJoy();
    if (event.pointerId === lookId) clearLook();
  };

  const lostCapture = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (event.pointerId === joyId) clearJoy();
    if (event.pointerId === lookId) clearLook();
  };

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', move, { passive: false });
  canvas.addEventListener('pointerup', up, { passive: true });
  canvas.addEventListener('pointercancel', up, { passive: true });
  canvas.addEventListener('lostpointercapture', lostCapture, { passive: true });

  actionButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.action = true;
    actionButton.classList.add('pressed');
  }, { passive: false });
  const releaseAction = () => actionButton.classList.remove('pressed');
  actionButton.addEventListener('pointerup', releaseAction, { passive: true });
  actionButton.addEventListener('pointercancel', releaseAction, { passive: true });

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyE' || event.code === 'Space') state.action = true;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    clearJoy();
    clearLook();
    pointers.clear();
    keys.clear();
  });

  return {
    sample() {
      let x = state.moveX;
      let y = state.moveY;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      const out = {
        moveX: x,
        moveY: y,
        lookX: state.lookX,
        lookY: state.lookY,
        action: state.action,
        sprint: state.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight')
      };
      state.lookX = 0;
      state.lookY = 0;
      state.action = false;
      return out;
    },
    destroy() {
      clearJoy();
      clearLook();
      pointers.clear();
      keys.clear();
    }
  };
}
