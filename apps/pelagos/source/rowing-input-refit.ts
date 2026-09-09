import type { ShipControls } from './core';
import { PelagosGame } from './game';

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
  game.controls.rowing = active ? 1 : 0;
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

const prototype = PelagosGame.prototype as unknown as PelagosRowingInternals & { __pelagosRowingInputV2?: boolean };

if (!prototype.__pelagosRowingInputV2) {
  prototype.__pelagosRowingInputV2 = true;
  const previousInstallUI = prototype.installUI;
  prototype.installUI = function rowingInputInstall(): void {
    previousInstallUI.call(this);
    const game = this as unknown as PelagosRowingInternals;
    game.rowButton.setAttribute('aria-pressed', 'false');

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
    const blur = () => setRowing(game, false);

    game.rowButton.addEventListener('keydown', keyDown);
    game.rowButton.addEventListener('keyup', keyUp);
    game.rowButton.addEventListener('blur', blur);
    game.cleanup.push(() => game.rowButton.removeEventListener('keydown', keyDown));
    game.cleanup.push(() => game.rowButton.removeEventListener('keyup', keyUp));
    game.cleanup.push(() => game.rowButton.removeEventListener('blur', blur));
  };
}
