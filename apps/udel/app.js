import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { loadGameModule } from './game-loader.js';

installMobileRuntime();

const workshop = createWorkshopMode({
  appName: 'УДЕЛ',
  version: '1.5.0',
  storageNamespace: 'pocket-works:udel',
  cachePrefix: 'udel-',
  onReset: async () => {
    localStorage.removeItem('pocket-works:udel:state');
    location.reload();
  }
});

try {
  const { bootUdel } = await loadGameModule();
  bootUdel({ workshop });
} catch (error) {
  console.error('UDEL failed to load', error);
  document.querySelector('#app').innerHTML = `
    <section class="boot">
      <a href="../../" data-app-control data-native-press>← Pocket Works</a>
      <strong>КАРТА НЕ РАЗВЕРНУЛАСЬ</strong>
      <span>Обновите приложение или проверьте соединение.</span>
    </section>`;
}
