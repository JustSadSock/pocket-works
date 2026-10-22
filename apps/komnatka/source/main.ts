import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
// The 3D editor owns installation and its initial scroll lock.
void installMobileRuntime;
import './main.js';
registerEnhancedUpdate({
 appName:'КОМНАТКА',version: '1.2.0',
 releaseNotes:["Пять самостоятельных назначений комнат с сохранениями и рекомендованным каталогом: гостиная, спальня, кухня, детская, кабинет.","16 новых настоящих моделей мебели и декора — всего 46, материалы от льна и бархата до дерева, керамики и металла.","Новые фактурные обои и покрытия: штукатурка, панели, лен, паркет ёлочкой и терраццо.","PocketNet v3: пространственные задачи жильцов, три уровня сложности и точный разбор игры по памяти.","Сравнение комнаты до и после с интерактивной границей, старые комнаты и правила v1/v2 сохранены."]
});
createWorkshopMode({
 appName:'КОМНАТКА',version:'1.2.0',
 cachePrefix: 'komnatka-',
 storageNamespace: 'pocket-works:komnatka',
 onReset(){window.location.reload();}
});
window.addEventListener('workshopclose',()=>installMobileRuntime().setScrollLocked(true));
