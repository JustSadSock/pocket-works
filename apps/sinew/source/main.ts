import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.2.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Правая рука переведена с желейного XYZ-following на суставно-мышечную цепь: фиксированные длины плеча/предплечья, угловая инерция, torque limits и жёсткие пределы суставов.',
  'Горизонтальные, диагональные, верхние и восходящие удары теперь строятся forward-kinematics из плеча, локтя и кисти; мягкость находится в суставах, а не в растягивающейся руке.',
  'Торс получает отдельную загрузку и контр-поворот во время load/strike/follow-through, поэтому камера больше не тащит весь верх тела как единый желейный блок.',
  'Добавлен headless muscle-sparring тест: сотни синтетических атак проверяют диапазоны суставов, фиксированную длину руки, разнообразие 3D-траекторий, скорость клинка и возврат в guard.',
  'Силуэт бойцов стал читаемее: появились кисти, ботинки, наплечники, помель меча, ручка щита и дополнительные детали шлема противника.',
  'Щит остаётся отдельным threat-driven контроллером, sword bind/hit-stop/contact physics из 1.1 сохранены поверх новой мышечной модели.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
