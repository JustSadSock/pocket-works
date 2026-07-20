import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import * as core from './core';
import chunk1 from './runtime-chunk-1';
import chunk2 from './runtime-chunk-2';
import chunk3 from './runtime-chunk-3';
import chunk4 from './runtime-chunk-4';

const matchPayload = chunk1 + chunk2 + chunk3 + chunk4;
const PHASER_CHUNK_COUNT = 32;

async function unpack(payload: string, label: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error(`Этот браузер не может распаковать ${label}.`);
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function loadPhaser(): Promise<unknown> {
  const chunks = await Promise.all(Array.from({ length: PHASER_CHUNK_COUNT }, async (_, index) => {
    const url = new URL(`./phaser/phaser-runtime-chunk-${index + 1}.txt`, document.baseURI).href;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не загружен модуль движка ${index + 1}.`);
    return response.text();
  }));
  const engineCode = await unpack(chunks.join(''), 'движок матча');
  new Function(engineCode)();
  const phaser = (globalThis as typeof globalThis & { Phaser?: unknown }).Phaser;
  if (!phaser) throw new Error('Движок матча распакован, но не запустился.');
  return phaser;
}

try {
  const [Phaser, runtime] = await Promise.all([loadPhaser(), unpack(matchPayload, 'футбольный симулятор')]);
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
