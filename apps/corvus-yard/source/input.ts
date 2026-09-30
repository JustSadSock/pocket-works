import type { Controls } from './flight';

/** One pointer owns the stick; independent fingers can hold either wing action. */
export class CrowInput {
  readonly controls: Controls = { turn: 0, pitch: 0, flap: 0, brake: 0 };
  private keys = new Set<string>();
  private stickPointer: number | null = null;
  private buttonPointers = new Map<number, 'flap' | 'brake'>();
  private touchTurn = 0;
  private touchPitch = 0;
  private launchPending = false;
  private removeListeners: Array<() => void> = [];
  private thumb: HTMLElement | null;

  constructor(private canvas: HTMLElement, private stick: HTMLElement, private flap: HTMLElement, private brake: HTMLElement) {
    this.thumb = stick.querySelector<HTMLElement>('.thumb');
    for (const element of [stick, flap, brake]) {
      element.style.touchAction = 'none';
      this.listen(element, 'contextmenu', (e: Event) => e.preventDefault());
    }
    this.listen(stick, 'pointerdown', (event: Event) => {
      const e = event as PointerEvent;
      if (this.stickPointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stick.classList.add('pressed');
      this.moveStick(e);
    });
    this.listen(stick, 'pointermove', (event: Event) => this.moveStick(event as PointerEvent));
    const endStick = (event: Event) => {
      const e = event as PointerEvent;
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.touchTurn = this.touchPitch = 0;
      stick.classList.remove('pressed');
      if (this.thumb) this.thumb.style.transform = 'translate(0px, 0px)';
      this.sync();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(stick, name, endStick);
    for (const [element, action] of [[flap, 'flap'], [brake, 'brake']] as const) {
      this.listen(element, 'pointerdown', (event: Event) => {
        const e = event as PointerEvent;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        if (action === 'flap' && ![...this.buttonPointers.values()].includes('flap')) this.launchPending = true;
        this.buttonPointers.set(e.pointerId, action);
        element.setPointerCapture(e.pointerId);
        this.sync();
      });
      const end = (event: Event) => {
        this.buttonPointers.delete((event as PointerEvent).pointerId);
        this.sync();
      };
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(element, name, end);
    }
    this.listen(window, 'keydown', (event: Event) => {
      const e = event as KeyboardEvent;
      if (!this.isControl(e.code) || this.isEditable(e.target)) return;
      e.preventDefault();
      if (e.code === 'Space' && !this.keys.has('Space')) this.launchPending = true;
      this.keys.add(e.code);
      this.sync();
    });
    this.listen(window, 'keyup', (event: Event) => {
      const e = event as KeyboardEvent;
      if (!this.isControl(e.code)) return;
      e.preventDefault();
      this.keys.delete(e.code);
      this.sync();
    });
    this.listen(window, 'blur', () => this.reset());
    this.listen(window, 'orientationchange', () => this.reset());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  private listen(target: EventTarget, name: string, listener: EventListener) {
    target.addEventListener(name, listener, { passive: false });
    this.removeListeners.push(() => target.removeEventListener(name, listener));
  }
  private isEditable(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }
  private isControl(code: string) {
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(code);
  }
  private moveStick(e: PointerEvent) {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    const rect = this.stick.getBoundingClientRect();
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.38);
    let x = (e.clientX - rect.left - rect.width * 0.5) / radius;
    let y = (rect.top + rect.height * 0.5 - e.clientY) / radius;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    const deadzone = 0.08;
    const normalized = magnitude < deadzone ? 0 : Math.min(1, (magnitude - deadzone) / (1 - deadzone));
    const scale = magnitude > 0 ? normalized / Math.min(1, magnitude) : 0;
    this.touchTurn = x * scale;
    this.touchPitch = y * scale;
    if (this.thumb) this.thumb.style.transform = `translate(${x * radius}px, ${-y * radius}px)`;
    this.sync();
  }
  private sync() {
    const has = (...keys: string[]) => keys.some(key => this.keys.has(key));
    const keyboardTurn = Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft'));
    const keyboardPitch = Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown'));
    this.controls.turn = Math.max(-1, Math.min(1, this.touchTurn + keyboardTurn));
    this.controls.pitch = Math.max(-1, Math.min(1, this.touchPitch + keyboardPitch));
    this.controls.flap = Number(this.keys.has('Space') || [...this.buttonPointers.values()].includes('flap'));
    this.controls.brake = Number(has('ShiftLeft', 'ShiftRight') || [...this.buttonPointers.values()].includes('brake'));
    this.flap.classList.toggle('pressed', this.controls.flap > 0);
    this.brake.classList.toggle('pressed', this.controls.brake > 0);
  }
  consumeLaunch() {
    const launch = this.launchPending;
    this.launchPending = false;
    return launch;
  }
  reset() {
    const stickPointer = this.stickPointer;
    const buttons = [...this.buttonPointers];
    this.stickPointer = null;
    this.buttonPointers.clear();
    this.keys.clear();
    this.touchTurn = this.touchPitch = 0;
    this.launchPending = false;
    this.stick.classList.remove('pressed');
    if (this.thumb) this.thumb.style.transform = 'translate(0px, 0px)';
    if (stickPointer !== null && this.stick.hasPointerCapture(stickPointer)) this.stick.releasePointerCapture(stickPointer);
    for (const [pointer, action] of buttons) {
      const element = action === 'flap' ? this.flap : this.brake;
      if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
    }
    this.sync();
  }
  dispose() {
    this.reset();
    this.removeListeners.splice(0).forEach(remove => remove());
  }
}
