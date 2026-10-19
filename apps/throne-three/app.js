import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import './js/network.js';
installMobileRuntime();
await import('./js/ui.js');
