import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.0.0';
const namespace = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

registerEnhancedUpdate({
  appName,
  version: '1.0.0',
  releaseNotes: [
    'Добавлено единое физическое поле волн для рендера и восьмиточечной плавучести.',
    'Реализованы инерция корпуса, руль, парусная полярная диаграмма, гребля и динамический ветер.',
    'Добавлены портретная chase-камера, адаптивное качество, погода, время суток и процедурный океан.',
    'Игра интегрирована в Pocket Works Enhanced runtime с офлайн-режимом, persistence и Safari-safe touch input.'
  ]
});

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas');
if (!canvas) throw new Error('Pelagos render canvas is missing');

const game = new PelagosGame(canvas);
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'pelagos-',
  storageNamespace: namespace,
  onReset: () => game.resetAll()
});

void game.boot().catch((error: unknown) => {
  console.error('[PELAGOS] Critical boot failure.', error);
  game.showBootError(error);
  document.documentElement.dataset.bootError = error instanceof Error ? error.message : String(error);
});
