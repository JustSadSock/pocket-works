import type { ShipControls } from './core';
import { PelagosGame } from './game';
import { resetRowingDemand, setRowingDemand } from './rowing-state';

type PelagosRowingInternals = {
  installUI: () => void;
  rowButton: HTMLButtonElement;
  controls: ShipControls;
  running: boolean;
  paused: boolean;
  learned: { row: boolean };
  updateOnboarding: () => void;
  cleanup: Array<() => void>;
};

function isRowKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter';
}

function setRowing(game: PelagosRowingInternals, active: boolean): void {
  if (active && (!game.running || game.paused)) return;
  const value = active ? 1 : 0;
  game.controls.rowing = value;
  setRowingDemand(value);
  game.rowButton.classList.toggle('active', active);
  game.rowButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) {
    game.learned.row = true;
    game.updateOnboarding();
  }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosRowInput = active ? '1' : '0';
  }
}

const prototype = PelagosGame.prototype as unknown as PelagosRowingInternals & { __pelagosRowingInputV3?: boolean };

if (!prototype.__pelagosRowingInputV3) {
  prototype.__pelagosRowingInputV3 = true;
  const previousInstallUI = prototype.installUI;
  prototype.installUI = function rowingInputInstall(): void {
    previousInstallUI.call(this);
    const game = this as unknown as PelagosRowingInternals;
    game.rowButton.setAttribute('aria-pressed', 'false');
    resetRowingDemand();

    const keyDown = (event: KeyboardEvent) => {
      if (!isRowKey(event) || event.repeat || document.activeElement !== game.rowButton) return;
      event.preventDefault();
      setRowing(game, true);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (!isRowKey(event) || document.activeElement !== game.rowButton) return;
      event.preventDefault();
      setRowing(game, false);
    };
    // The base mobile gesture already drives controls.rowing. Mirroring the same physical press
    // into an explicit demand channel makes the oar rig independent of the long OceanWorld wrapper
    // chain, where an older sail/oar compatibility wrapper intentionally zeroes legacy rowing.
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      setRowing(game, true);
    };
    const pointerUp = () => setRowing(game, false);
    const blur = () => setRowing(game, false);
    const reset = () => setRowing(game, false);

    game.rowButton.addEventListener('keydown', keyDown);
    game.rowButton.addEventListener('keyup', keyUp);
    game.rowButton.addEventListener('pointerdown', pointerDown);
    game.rowButton.addEventListener('pointerup', pointerUp);
    game.rowButton.addEventListener('pointercancel', pointerUp);
    game.rowButton.addEventListener('lostpointercapture', pointerUp);
    game.rowButton.addEventListener('blur', blur);
    window.addEventListener('blur', reset, { passive: true });
    document.addEventListener('visibilitychange', reset, { passive: true });

    game.cleanup.push(() => game.rowButton.removeEventListener('keydown', keyDown));
    game.cleanup.push(() => game.rowButton.removeEventListener('keyup', keyUp));
    game.cleanup.push(() => game.rowButton.removeEventListener('pointerdown', pointerDown));
    game.cleanup.push(() => game.rowButton.removeEventListener('pointerup', pointerUp));
    game.cleanup.push(() => game.rowButton.removeEventListener('pointercancel', pointerUp));
    game.cleanup.push(() => game.rowButton.removeEventListener('lostpointercapture', pointerUp));
    game.cleanup.push(() => game.rowButton.removeEventListener('blur', blur));
    game.cleanup.push(() => window.removeEventListener('blur', reset));
    game.cleanup.push(() => document.removeEventListener('visibilitychange', reset));
  };
}
