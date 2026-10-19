import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();
await import('./main.js');
