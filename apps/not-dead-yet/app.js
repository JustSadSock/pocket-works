import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();
import('./app.mjs').catch(error => {
  console.error('NOT DEAD YET failed to initialize', error);
  const fatal = document.getElementById('fatal');
  if (fatal) fatal.hidden = false;
});
