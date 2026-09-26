import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'КОМОК';
const version = '1.0.1';
const storageNamespace = 'pocket-works:komok';
const releaseNotes = [
  'Сваренная icosphere-сетка устраняет разрывы и белые треугольники при сглаживании.',
  'Глиняная фактура больше не ломает нормали в WebKit, а портретная камера держит скульптуру целиком в кадре.',
  'Сохранения геометрии стали значительно компактнее и устойчивее к переполнению localStorage.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'komok-', storageNamespace, onReset: () => location.reload() });

void import('./sculpt.js').catch((error) => {
  console.error('КОМОК failed to start', error);
  const loading = document.querySelector<HTMLElement>('#loading');
  const panel = document.querySelector<HTMLElement>('#errorPanel');
  const text = document.querySelector<HTMLElement>('#errorText');
  loading?.classList.add('done');
  if (text) text.textContent = error instanceof Error ? error.message : 'Неизвестная ошибка запуска.';
  if (panel) panel.hidden = false;
});
