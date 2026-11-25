import { createWorkshopMode } from '../../shared/workshop-mode.js';
createWorkshopMode({appName:"Skyforge Relay",version:"0.1.0",cachePrefix: 'skyforge-relay-',storageNamespace: 'pocket-works:skyforge-relay',onReset(){location.reload();}});
