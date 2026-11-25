import { createWorkshopMode } from '../../shared/workshop-mode.js';
createWorkshopMode({appName:"Венец",version:"1.1.0",cachePrefix: 'venets-',storageNamespace: 'pocket-works:venets',onReset(){location.reload();}});
