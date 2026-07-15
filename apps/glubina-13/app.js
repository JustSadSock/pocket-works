import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  CHUNK_SIZE,
  TREASURE_TYPES,
  canExtract,
  cargoValue,
  chunkCoordinate,
  chunkKey,
  circleVsCircle,
  clamp,
  distanceToBase,
  generateChunk,
  lerp,
  listenerStep,
  movementNoise,
  mulberry32,
  resolveCircleObstacle,
  sanitizeProfile,
  sanitizeSavedRun,
  upgradeCost,
} from './game-core.js';
import {
  DeepEngine,
  boxGeometry,
  cylinderGeometry,
  octaGeometry,
  tetraGeometry,
} from './engine.js';

const RUNTIME_PARTS = [
  './runtime/part-00.txt',
  './runtime/part-01.txt',
  './runtime/part-02.txt',
  './runtime/part-03.txt',
  './runtime/part-04.txt',
];
const runtimeResponses = await Promise.all(RUNTIME_PARTS.map((path) => fetch(path, { cache: 'no-store' })));
if (runtimeResponses.some((response) => !response.ok)) throw new Error('Не удалось загрузить runtime экспедиции');
const runtimeSource = (await Promise.all(runtimeResponses.map((response) => response.text()))).join('\n');
eval(runtimeSource);
