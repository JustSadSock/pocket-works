import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import Phaser from 'phaser';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import * as core from './core';
import chunk1 from './runtime-chunk-1';
import chunk2 from './runtime-chunk-2';
import chunk3 from './runtime-chunk-3';
import chunk4 from './runtime-chunk-4';

const payload = chunk1 + chunk2 + chunk3 + chunk4;
const RELEASE_VERSION = '1.0.1';

async function unpackRuntime(): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack the offline match engine.');
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function createStablePhaser(): typeof Phaser {
  const BaseGame = Phaser.Game;

  class StableGame extends BaseGame {
    constructor(config: Phaser.Types.Core.GameConfig) {
      super({
        ...config,
        type: Phaser.CANVAS,
        autoFocus: false,
        fps: {
          ...(config.fps ?? {}),
          target: 45,
          forceSetTimeOut: true,
          smoothStep: true
        },
        render: {
          ...(config.render ?? {}),
          antialias: true,
          powerPreference: 'default'
        }
      });

      const keepLoopAlive = (): void => {
        if (document.hidden) return;
        this.loop?.focus();
        if (this.loop && !this.loop.running) this.loop.wake();
      };

      window.addEventListener('pageshow', keepLoopAlive, { passive: true });
      window.addEventListener('focus', keepLoopAlive, { passive: true });
      document.addEventListener('pointerdown', keepLoopAlive, { passive: true });
    }
  }

  const stable = Object.create(Phaser) as typeof Phaser;
  Object.defineProperty(stable, 'Game', { value: StableGame, enumerable: true });
  return stable;
}

try {
  const runtime = await unpackRuntime();
  const stablePhaser = createStablePhaser();
  const stableRegisterEnhancedUpdate = (options: Record<string, unknown>): void => registerEnhancedUpdate({
    ...options,
    version: RELEASE_VERSION,
    releaseNotes: [
      'Исправлен фриз матча на iPhone и в standalone-PWA.',
      'Рендер переведён на стабильный Canvas, игровой цикл отвязан от проблемного mobile RAF.',
      'Добавлено автоматическое восстановление цикла после возврата в приложение.'
    ]
  });
  const stableCreateWorkshopMode = (options: Record<string, unknown>): void => createWorkshopMode({
    ...options,
    version: RELEASE_VERSION
  });
  const launch = new Function('Phaser', 'installMobileRuntime', 'createWorkshopMode', 'registerEnhancedUpdate', 'core', runtime);
  launch(stablePhaser, installMobileRuntime, stableCreateWorkshopMode, stableRegisterEnhancedUpdate, core);
} catch (error) {
  console.error('СВИСТОК 90 failed to start', error);
  const loading = document.querySelector<HTMLElement>('#loadingScreen');
  const title = loading?.querySelector<HTMLElement>('h1');
  const label = document.querySelector<HTMLElement>('#loadingLabel');
  if (title) title.textContent = 'МАТЧ НЕ ЗАПУЩЕН';
  if (label) label.textContent = error instanceof Error ? error.message : 'Неизвестная ошибка запуска';
}
