import { clamp } from './core.js';

export class MobileInput {
  constructor(root) {
    this.root = root;
    this.leftZone = root.querySelector('#move-zone');
    this.rightZone = root.querySelector('#look-zone');
    this.base = root.querySelector('#joystick-base');
    this.knob = root.querySelector('#joystick-knob');
    this.movePointer = null;
    this.lookPointer = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.lookAccum = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.keys = new Set();
    this.sensitivity = Number(localStorage.getItem('pocket-works:sirocco:sensitivity') || 1);
    this.bind();
  }

  bind() {
    const options = { passive: false };
    this.leftZone.addEventListener('pointerdown', (e) => this.startMove(e), options);
    this.leftZone.addEventListener('pointermove', (e) => this.updateMove(e), options);
    this.leftZone.addEventListener('pointerup', (e) => this.endMove(e), options);
    this.leftZone.addEventListener('pointercancel', (e) => this.endMove(e), options);
    this.rightZone.addEventListener('pointerdown', (e) => this.startLook(e), options);
    this.rightZone.addEventListener('pointermove', (e) => this.updateLook(e), options);
    this.rightZone.addEventListener('pointerup', (e) => this.endLook(e), options);
    this.rightZone.addEventListener('pointercancel', (e) => this.endLook(e), options);
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('gesturestart', (e) => e.preventDefault(), options);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  startMove(e) {
    if (this.movePointer !== null) return;
    e.preventDefault();
    this.movePointer = e.pointerId;
    this.moveOrigin.x = e.clientX;
    this.moveOrigin.y = e.clientY;
    this.leftZone.setPointerCapture?.(e.pointerId);
    this.base.classList.add('active');
    this.base.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    this.updateMove(e);
  }

  updateMove(e) {
    if (e.pointerId !== this.movePointer) return;
    e.preventDefault();
    const dx = e.clientX - this.moveOrigin.x;
    const dy = e.clientY - this.moveOrigin.y;
    const radius = 54;
    const len = Math.hypot(dx, dy);
    const scale = len > radius ? radius / len : 1;
    const px = dx * scale;
    const py = dy * scale;
    const dead = 0.12;
    const nx = px / radius;
    const ny = py / radius;
    const mag = Math.hypot(nx, ny);
    const filtered = mag < dead ? 0 : (mag - dead) / (1 - dead);
    const inv = mag > 0 ? filtered / mag : 0;
    this.move.x = nx * inv;
    this.move.y = -ny * inv;
    this.knob.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  }

  endMove(e) {
    if (e.pointerId !== this.movePointer) return;
    e.preventDefault();
    this.movePointer = null;
    this.move.x = 0; this.move.y = 0;
    this.knob.style.transform = 'translate3d(0,0,0)';
    this.base.classList.remove('active');
  }

  startLook(e) {
    if (this.lookPointer !== null) return;
    e.preventDefault();
    this.lookPointer = e.pointerId;
    this.lookLast.x = e.clientX;
    this.lookLast.y = e.clientY;
    this.rightZone.setPointerCapture?.(e.pointerId);
  }

  updateLook(e) {
    if (e.pointerId !== this.lookPointer) return;
    e.preventDefault();
    const dx = e.clientX - this.lookLast.x;
    const dy = e.clientY - this.lookLast.y;
    this.lookLast.x = e.clientX;
    this.lookLast.y = e.clientY;
    this.lookAccum.x += dx;
    this.lookAccum.y += dy;
  }

  endLook(e) {
    if (e.pointerId !== this.lookPointer) return;
    e.preventDefault();
    this.lookPointer = null;
  }

  getMove() {
    let x = this.move.x;
    let y = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, magnitude: Math.min(1, Math.hypot(x, y)) };
  }

  consumeLook() {
    const result = {
      x: this.lookAccum.x * 0.0032 * this.sensitivity,
      y: this.lookAccum.y * 0.003 * this.sensitivity
    };
    this.lookAccum.x = 0; this.lookAccum.y = 0;
    return result;
  }

  setSensitivity(value) {
    this.sensitivity = clamp(Number(value) || 1, 0.45, 1.8);
    localStorage.setItem('pocket-works:sirocco:sensitivity', String(this.sensitivity));
  }
}
