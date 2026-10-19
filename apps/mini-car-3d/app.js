import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
installMobileRuntime();
globalThis.makeMiniNet=()=>new PocketNet({serverUrl:location.origin+'/pocketnet',name:'Водитель',storage:{getItem:k=>sessionStorage.getItem('pocket-works:mini-car-3d:'+k),setItem:(k,v)=>sessionStorage.setItem('pocket-works:mini-car-3d:'+k,v),removeItem:k=>sessionStorage.removeItem('pocket-works:mini-car-3d:'+k)}});
await import('./game.bundle.js');
