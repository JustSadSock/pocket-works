import { createWorkshopMode } from '../../shared/workshop-mode.js';
createWorkshopMode({appName:"Katana Echo",version:"0.3.0",cachePrefix: 'katana-echo-',storageNamespace: 'pocket-works:katana-echo',onReset(){location.reload();}});
