import {installMobileRuntime} from '../../shared/mobile-runtime.js';
// Fog keeps its original classic and module entrypoints. This independent
// bootstrap adds the shared mobile lifecycle without changing combat code.
installMobileRuntime();
