import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import './network.js';
import './achievements.js';
installMobileRuntime();
await import('./game.js');
