import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
__ENHANCED_IMPORTS__

installMobileRuntime();
registerEnhancedUpdate({
  appName: '__APP_NAME__',
  version: '__APP_VERSION__',
  releaseNotes: __APP_CHANGELOG_JSON__
});

createWorkshopMode({
  appName: '__APP_NAME__',
  version: '__APP_VERSION__',
  cachePrefix: '__APP_SLUG__-',
  storageNamespace: '__APP_STORAGE_NAMESPACE__'
});

__ENHANCED_SCRIPT__
