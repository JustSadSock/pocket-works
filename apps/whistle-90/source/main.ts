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

async function unpackRuntime(): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack the offline match engine.');
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

try {
  const runtime = await unpackRuntime();
  const launch = new Function('Phaser', 'installMobileRuntime', 'createWorkshopMode', 'registerEnhancedUpdate', 'core', runtime);
  launch(Phaser, installMobileRuntime, createWorkshopMode, registerEnhancedUpdate, core);
} catch (error) {
  console.error('СВИСТОК 90 failed to start', error);
  const loading = document.querySelector<HTMLElement>('#loadingScreen');
  const title = loading?.querySelector<HTMLElement>('h1');
  const label = document.querySelector<HTMLElement>('#loadingLabel');
  if (title) title.textContent = 'МАТЧ НЕ ЗАПУЩЕН';
  if (label) label.textContent = error instanceof Error ? error.message : 'Неизвестная ошибка запуска';
}
