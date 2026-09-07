import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.3.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Локальный high-detail песок теперь физически заменяет coarse terrain под игроком вместо наложения поверх него: отрицательная часть отпечатка больше не скрывается базовой поверхностью, а на High сетка имеет шаг около 11 см.',
  'Добавлена локальная релаксация песка по углу естественного откоса: выдавленные валики и осыпавшийся материал продолжают понемногу переноситься вниз по склону после шага.',
  'Убран ложный эффект гигантской тени по радиусу рендера: near/far terrain используют одинаковую PBR-реакцию без разных vertex tint, а realtime shadow map больше не применяется к поверхности пустыни; вместо неё добавлена компактная стабильная контактная тень персонажа.',
  'First-person камера вынесена дальше вперёд по фактическому направлению взгляда и получила больший near clip, чтобы голова и шея импортированной модели не могли снова попадать в обзор при рассинхроне взгляда и корпуса.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.3.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
