import { clamp } from './core.js';
import { bindPointerGesture } from '../../../shared/mobile-runtime.js';

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
    this.cleanup = [];
    this.bind();
  }

  bind() {
    this.cleanup.push(bindPointerGesture(this.leftZone, {
      onStart: (event) => this.startMove(event), onMove: (event) => this.updateMove(event),
      onEnd: (event) => this.endMove(event), onCancel: (event) => this.endMove(event)
    }));
    this.cleanup.push(bindPointerGesture(this.rightZone, {
      onStart: (event) => this.startLook(event), onMove: (event) => this.updateLook(event),
      onEnd: (event) => this.endLook(event), onCancel: (event) => this.endLook(event)
    }));
    this.onKeyDown = (event) => this.keys.add(event.code);
    this.onKeyUp = (event) => this.keys.delete(event.code);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  startMove(event) {
    if (this.movePointer !== null) return;
    event.preventDefault(); this.movePointer = event.pointerId;
    this.moveOrigin.x = event.clientX; this.moveOrigin.y = event.clientY;
    this.base.classList.add('active');
    this.base.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    this.updateMove(event);
  }

  updateMove(event) {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault();
    const dx = event.clientX - this.moveOrigin.x, dy = event.clientY - this.moveOrigin.y;
    const radius = 54, len = Math.hypot(dx, dy), scale = len > radius ? radius / len : 1;
    const px = dx * scale, py = dy * scale, dead = 0.12, nx = px / radius, ny = py / radius;
    const mag = Math.hypot(nx, ny), filtered = mag < dead ? 0 : (mag - dead) / (1 - dead), inv = mag > 0 ? filtered / mag : 0;
    this.move.x = nx * inv; this.move.y = -ny * inv;
    this.knob.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  }

  endMove(event) {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault(); this.movePointer = null; this.move.x = 0; this.move.y = 0;
    this.knob.style.transform = 'translate3d(0,0,0)'; this.base.classList.remove('active');
  }

  startLook(event) {
    if (this.lookPointer !== null) return;
    event.preventDefault(); this.lookPointer = event.pointerId;
    this.lookLast.x = event.clientX; this.lookLast.y = event.clientY;
  }

  updateLook(event) {
    if (event.pointerId !== this.lookPointer) return;
    event.preventDefault();
    const dx = event.clientX - this.lookLast.x, dy = event.clientY - this.lookLast.y;
    this.lookLast.x = event.clientX; this.lookLast.y = event.clientY;
    this.lookAccum.x += dx; this.lookAccum.y += dy;
  }

  endLook(event) { if (event.pointerId === this.lookPointer) { event.preventDefault(); this.lookPointer = null; } }

  getMove() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    return { x, y, magnitude: Math.min(1, Math.hypot(x, y)) };
  }

  consumeLook() {
    const result = {
      x: -this.lookAccum.x * 0.0032 * this.sensitivity,
      y: -this.lookAccum.y * 0.003 * this.sensitivity
    };
    this.lookAccum.x = 0; this.lookAccum.y = 0;
    return result;
  }

  setSensitivity(value) { this.sensitivity = clamp(Number(value) || 1, 0.45, 1.8); localStorage.setItem('pocket-works:sirocco:sensitivity', String(this.sensitivity)); }
  dispose() {
    for (const cleanup of this.cleanup) cleanup?.(); this.cleanup.length = 0;
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp); this.keys.clear();
  }
}
