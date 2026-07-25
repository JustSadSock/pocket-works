/*
 * ПРЕЛОМ 1.0 — mobile geometric optics laboratory.
 * Computational concepts are informed by Ray Optics Simulation
 * (ricktu288/ray-optics), Apache-2.0. This implementation is an
 * independent TypeScript rewrite; see NOTICE and licenses/.
 */

import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const RELEASE_NOTES = [
  'Добавлен собственный мобильный движок геометрической оптики с отражением, преломлением, дисперсией, полным внутренним отражением, поглощением и частичным отражением.',
  'Реализованы семь режимов визуализации, измерительные инструменты, 12 готовых экспериментов и 15 задач с автоматической проверкой.',
  'Добавлены локальные сохранения, автосохранение, восстановление повреждённых данных, импорт и экспорт JSON, офлайн-режим и обучение поверх стартовой сцены с призмой.',
  'Добавлены жесты мобильного редактирования, динамическое качество, ограничение вычислительной нагрузки, звуки и вибрация с отдельными выключателями.',
  'Добавлены Apache-2.0 attribution и NOTICE для идей и вычислительных подходов Ray Optics Simulation.'
];

installMobileRuntime();
registerEnhancedUpdate({ appName: 'ПРЕЛОМ', version: '1.0.0', releaseNotes: RELEASE_NOTES });
createWorkshopMode({
  appName: 'ПРЕЛОМ',
  version: '1.0.0',
  cachePrefix: 'prelom-',
  storageNamespace: 'pocket-works:prelom'
});

void import('./runtime-generated').catch(() => {
  const status = typeof document !== 'undefined' ? document.getElementById('stageStatus') : null;
  if (status) status.textContent = 'Не удалось запустить оптический движок. Перезагрузите приложение.';
});
