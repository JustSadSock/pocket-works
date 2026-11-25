import { createWorkshopMode } from '../../shared/workshop-mode.js';
createWorkshopMode({appName:"Blockies",version:"0.5.17",cachePrefix: 'blockies-',storageNamespace: 'pocket-works:blockies',onReset(){location.reload();}});
