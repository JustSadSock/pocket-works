export type DriveInputState = {
  steer: number;
  throttle: number;
  brake: number;
};

type InputElements = {
  steerPad: HTMLElement;
  steerThumb: HTMLElement;
  drivePedal: HTMLElement;
  brakePedal: HTMLElement;
};

export class MobileDriveInput {
  readonly state: DriveInputState = { steer: 0, throttle: 0, brake: 0 };
  private steerPointer: number | null = null;
  private keys = new Set<string>();

  constructor(private elements: InputElements) {
    const { steerPad, drivePedal, brakePedal } = elements;

    steerPad.addEventListener('pointerdown', (event) => {
      this.steerPointer = event.pointerId;
      steerPad.setPointerCapture?.(event.pointerId);
      this.updateSteer(event);
    });
    steerPad.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.steerPointer) this.updateSteer(event);
    });
    const releaseSteer = (event: PointerEvent) => {
      if (event.pointerId !== this.steerPointer) return;
      this.steerPointer = null;
      this.state.steer = 0;
      this.paintSteer();
    };
    steerPad.addEventListener('pointerup', releaseSteer);
    steerPad.addEventListener('pointercancel', releaseSteer);
    steerPad.addEventListener('lostpointercapture', releaseSteer);

    this.bindPedal(drivePedal, 'throttle');
    this.bindPedal(brakePedal, 'brake');

    addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      this.updateKeyboard();
    });
    addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this.updateKeyboard();
    });
    addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  private bindPedal(element: HTMLElement, key: 'throttle' | 'brake') {
    const down = (event: PointerEvent) => {
      element.setPointerCapture?.(event.pointerId);
      this.state[key] = 1;
      element.classList.add('is-pressed');
    };
    const up = (event: PointerEvent) => {
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture?.(event.pointerId);
      this.state[key] = 0;
      element.classList.remove('is-pressed');
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', () => {
      this.state[key] = 0;
      element.classList.remove('is-pressed');
    });
  }

  private updateSteer(event: PointerEvent) {
    const rect = this.elements.steerPad.getBoundingClientRect();
    const normalized = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    this.state.steer = Math.max(-1, Math.min(1, normalized));
    this.paintSteer();
  }

  private paintSteer() {
    this.elements.steerPad.style.setProperty('--steer', String(this.state.steer));
    this.elements.steerThumb.setAttribute('aria-valuenow', String(Math.round(this.state.steer * 100)));
  }

  private updateKeyboard() {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    this.state.steer = left === right ? 0 : left ? -1 : 1;
    this.state.throttle = this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0;
    this.state.brake = this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0;
    this.paintSteer();
  }

  reset() {
    this.state.steer = 0;
    this.state.throttle = 0;
    this.state.brake = 0;
    this.steerPointer = null;
    this.elements.drivePedal.classList.remove('is-pressed');
    this.elements.brakePedal.classList.remove('is-pressed');
    this.paintSteer();
  }
}
