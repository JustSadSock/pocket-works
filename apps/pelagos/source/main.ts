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
  version,
  releaseNotes: [
    'Единое пятикомпонентное поле волн используется и водным шейдером, и восьмиточечной плавучестью.',
    'Корабль получил силовую модель инерции, бокового сопротивления, руля, паруса, гребли и воздействия ветра.',
    'Портретная камера, Safari-safe multi-touch, fixed timestep, background/resume и adaptive quality настроены под iPhone.',
    'Добавлены погода, цикл суток, процедурный океан, spray, дождь, адаптивный звук и офлайн-режим.'
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
