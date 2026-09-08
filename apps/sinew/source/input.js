import { bindPointerGesture } from '../../../shared/mobile-runtime.js';
import { clamp } from './core.js';

export class DuelInput {
  constructor(root, storageNamespace) {
    this.root = root;
    this.storageNamespace = storageNamespace;
    this.leftZone = root.querySelector('#move-zone');
    this.rightZone = root.querySelector('#look-zone');
    this.base = root.querySelector('#joystick-base');
    this.knob = root.querySelector('#joystick-knob');
    this.movePointer = null;
    this.lookPointer = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.lookOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.lookAccum = { x: 0, y: 0 };
    this.pose = { x: 0, y: 0 };
    this.keys = new Set();
    this.sensitivity = Number(localStorage.getItem(`${storageNamespace}:sensitivity`) || 1.12);
    this.cleanup = [];
    this.bind();
  }

  bind() {
    this.cleanup.push(bindPointerGesture(this.leftZone, {
      onStart: (event) => this.startMove(event),
      onMove: (event) => this.updateMove(event),
      onEnd: (event) => this.endMove(event),
      onCancel: (event) => this.endMove(event)
    }));
    this.cleanup.push(bindPointerGesture(this.rightZone, {
      onStart: (event) => this.startLook(event),
      onMove: (event) => this.updateLook(event),
      onEnd: (event) => this.endLook(event),
      onCancel: (event) => this.endLook(event)
    }));
    this.onKeyDown = (event) => this.keys.add(event.code);
    this.onKeyUp = (event) => this.keys.delete(event.code);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  startMove(event) {
    if (this.movePointer !== null) return;
    event.preventDefault();
    this.movePointer = event.pointerId;
    this.moveOrigin.x = event.clientX;
    this.moveOrigin.y = event.clientY;
    this.base.classList.add('active');
    this.base.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    this.updateMove(event);
  }

  updateMove(event) {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault();
    const dx = event.clientX - this.moveOrigin.x;
    const dy = event.clientY - this.moveOrigin.y;
    const radius = Math.min(62, Math.max(48, window.innerHeight * .14));
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const px = dx * scale;
    const py = dy * scale;
    const nx = px / radius;
    const ny = -py / radius;
    const magnitude = Math.hypot(nx, ny);
    const dead = .12;
    const filtered = magnitude < dead ? 0 : (magnitude - dead) / (1 - dead);
    const n = magnitude > 1e-5 ? filtered / magnitude : 0;
    this.move.x = nx * n;
    this.move.y = ny * n;
    this.knob.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  }

  endMove(event) {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault();
    this.movePointer = null;
    this.move.x = 0;
    this.move.y = 0;
    this.knob.style.transform = 'translate3d(0,0,0)';
    this.base.classList.remove('active');
  }

  startLook(event) {
    if (this.lookPointer !== null) return;
    event.preventDefault();
    this.lookPointer = event.pointerId;
    this.lookOrigin.x = event.clientX;
    this.lookOrigin.y = event.clientY;
    this.lookLast.x = event.clientX;
    this.lookLast.y = event.clientY;
    this.pose.x = 0;
    this.pose.y = 0;
    this.rightZone.classList.add('engaged');
  }

  updateLook(event) {
    if (event.pointerId !== this.lookPointer) return;
    event.preventDefault();
    const dx = event.clientX - this.lookLast.x;
    const dy = event.clientY - this.lookLast.y;
    this.lookLast.x = event.clientX;
    this.lookLast.y = event.clientY;
    this.lookAccum.x += dx;
    this.lookAccum.y += dy;

    const workspaceX = Math.max(90, window.innerWidth * .17);
    const workspaceY = Math.max(80, window.innerHeight * .28);
    this.pose.x = clamp((event.clientX - this.lookOrigin.x) / workspaceX, -1, 1);
    this.pose.y = clamp((this.lookOrigin.y - event.clientY) / workspaceY, -1, 1);
  }

  endLook(event) {
    if (event.pointerId !== this.lookPointer) return;
    event.preventDefault();
    this.lookPointer = null;
    this.rightZone.classList.remove('engaged');
  }

  getMove() {
    let x = this.move.x;
    let y = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y, magnitude: Math.min(1, Math.hypot(x, y)) };
  }

  consumeLook(dt) {
    const dx = this.lookAccum.x;
    const dy = this.lookAccum.y;
    this.lookAccum.x = 0;
    this.lookAccum.y = 0;
    const safeDt = Math.max(1 / 240, dt);
    const rawYaw = dx * .00535 * this.sensitivity;
    const rawPitch = dy * .00492 * this.sensitivity;
    const gestureYawRate = clamp(rawYaw / safeDt, -16, 16);
    const gesturePitchRate = clamp(rawPitch / safeDt, -15, 15);
    const energy = clamp((Math.hypot(gestureYawRate, gesturePitchRate) - 2.1) / 8.8, 0, 1);
    const cameraShare = 1 - energy * .52;
    const yaw = rawYaw * cameraShare;
    const pitch = rawPitch * cameraShare;
    return {
      yaw,
      pitch,
      yawRate: clamp(yaw / safeDt, -11.5, 11.5),
      pitchRate: clamp(pitch / safeDt, -10.5, 10.5),
      gestureYawRate,
      gesturePitchRate,
      gestureEnergy: energy,
      poseX: this.pose.x,
      poseY: this.pose.y,
      poseEngaged: this.lookPointer !== null
    };
  }

  setSensitivity(value) {
    this.sensitivity = clamp(Number(value) || 1.12, .45, 2.4);
    localStorage.setItem(`${this.storageNamespace}:sensitivity`, String(this.sensitivity));
  }

  resetPointers() {
    this.movePointer = null;
    this.lookPointer = null;
    this.move.x = 0;
    this.move.y = 0;
    this.lookAccum.x = 0;
    this.lookAccum.y = 0;
    this.pose.x = 0;
    this.pose.y = 0;
    this.knob.style.transform = 'translate3d(0,0,0)';
    this.base.classList.remove('active');
    this.rightZone.classList.remove('engaged');
  }

  dispose() {
    for (const cleanup of this.cleanup) cleanup?.();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.keys.clear();
  }
}
