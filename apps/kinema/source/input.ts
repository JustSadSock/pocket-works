export type MoveInput = { x: number; y: number; magnitude: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const POINTER_RELEASE_GRACE_MS = 90;

export class InputController {
  readonly move: MoveInput = { x: 0, y: 0, magnitude: 0 };
  cameraYaw = 0;
  cameraPitch = 0.22;
  onInteract: (() => void) | null = null;
  private movePointer: number | null = null;
  private lookPointer: number | null = null;
  private moveGraceUntil = 0;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };
  private keys = new Set<string>();
  private interacted = false;

  constructor(
    private joystick: HTMLElement,
    private knob: HTMLElement,
    private lookZone: HTMLElement
  ) {
    this.bindMove();
    this.bindLook();
    this.bindKeyboard();
  }

  private touch(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onInteract?.();
  }

  private clearMove(): void {
    Object.assign(this.move, { x: 0, y: 0, magnitude: 0 });
  }

  private bindMove(): void {
    const radius = 49;
    const update = (x: number, y: number) => {
      let dx = x - this.origin.x;
      let dy = y - this.origin.y;
      const length = Math.hypot(dx, dy);
      if (length > radius) {
        dx = dx / length * radius;
        dy = dy / length * radius;
      }
      this.move.x = dx / radius;
      this.move.y = -dy / radius;
      this.move.magnitude = clamp(Math.hypot(this.move.x, this.move.y), 0, 1);
      this.knob.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    };
    this.joystick.addEventListener('pointerdown', (event) => {
      if (this.movePointer !== null) return;
      this.touch();
      this.movePointer = event.pointerId;
      this.moveGraceUntil = 0;
      this.joystick.setPointerCapture(event.pointerId);
      const ring = this.joystick.querySelector('.joystick-ring') as HTMLElement;
      const rect = ring.getBoundingClientRect();
      this.origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.joystick.classList.add('active');
      update(event.clientX, event.clientY);
    });
    this.joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.movePointer) update(event.clientX, event.clientY);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.movePointer) return;
      this.movePointer = null;
      // Keep the final intent for a fraction of a frame budget so very fast taps/flicks
      // cannot disappear entirely between two WebGL frames. The visual control still
      // recenters immediately; sustained movement always requires sustained contact.
      this.moveGraceUntil = performance.now() + POINTER_RELEASE_GRACE_MS;
      this.knob.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
      this.joystick.classList.remove('active');
    };
    this.joystick.addEventListener('pointerup', release);
    this.joystick.addEventListener('pointercancel', release);
    this.joystick.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.movePointer) release(event);
    });
  }

  private bindLook(): void {
    this.lookZone.addEventListener('pointerdown', (event) => {
      if (this.lookPointer !== null) return;
      this.touch();
      this.lookPointer = event.pointerId;
      this.lookZone.setPointerCapture(event.pointerId);
      this.lastLook = { x: event.clientX, y: event.clientY };
    });
    this.lookZone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer) return;
      const dx = event.clientX - this.lastLook.x;
      const dy = event.clientY - this.lastLook.y;
      this.lastLook = { x: event.clientX, y: event.clientY };
      this.cameraYaw -= dx * 0.0062;
      this.cameraPitch = clamp(this.cameraPitch - dy * 0.0046, 0.03, 0.5);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.lookPointer) this.lookPointer = null;
    };
    this.lookZone.addEventListener('pointerup', release);
    this.lookZone.addEventListener('pointercancel', release);
    this.lookZone.addEventListener('lostpointercapture', release);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (/^(Key[WASD]|Arrow(Left|Right|Up|Down))$/.test(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.movePointer = null;
      this.lookPointer = null;
      this.moveGraceUntil = 0;
      this.clearMove();
      this.knob.style.transform = 'translate(-50%, -50%) translate(0px, 0px)';
      this.joystick.classList.remove('active');
    });
  }

  sample(dt: number): MoveInput {
    if (this.movePointer === null) {
      const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      const y = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
      const length = Math.hypot(x, y);
      if (length) {
        this.move.x = x / length;
        this.move.y = y / length;
        this.move.magnitude = 1;
        this.moveGraceUntil = 0;
      } else if (performance.now() >= this.moveGraceUntil) {
        this.clearMove();
      }
    }
    const orbit = 1.55 * dt;
    if (this.keys.has('ArrowLeft')) this.cameraYaw += orbit;
    if (this.keys.has('ArrowRight')) this.cameraYaw -= orbit;
    if (this.keys.has('ArrowUp')) this.cameraPitch = clamp(this.cameraPitch + orbit * 0.55, 0.03, 0.5);
    if (this.keys.has('ArrowDown')) this.cameraPitch = clamp(this.cameraPitch - orbit * 0.55, 0.03, 0.5);
    return this.move;
  }
}
