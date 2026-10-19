import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import './network.js';
installMobileRuntime();
await import('./game.js');
