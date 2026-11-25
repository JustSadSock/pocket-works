import { createWorkshopMode } from '../../shared/workshop-mode.js';
createWorkshopMode({appName:"Space Run",version:"0.5.0",cachePrefix: 'space-run-',storageNamespace: 'pocket-works:space-run',onReset(){location.reload();}});
