const CACHE_PREFIX='pocket-works-launcher-';
const CACHE_NAME='pocket-works-launcher-v0.9.1';
const APP_VERSION='0.9.1';
const RELEASE_DATE='2026-07-18';
const CACHE_PROTOCOL=4;
const RELEASE_NOTES=[
  'Application releases are now verified against their live entry document and release manifest.',
  'Launcher links include the expected application version so reopening cannot silently reuse an older document.',
  'Production builds stamp every application entry point and JavaScript module graph with one release key.',
  'БЛАЗОН starts its functional core before optional heraldic enhancements.'
];
const APP_SHELL=[
  './','./index.html','./styles.css','./launcher-performance.css','./launcher-sync.css','./app.js',
  './launcher-update-all-v3.js','./launcher-release-links.js','./launcher-sync.js','./apps.json','./manifest.webmanifest',
  './shared/pocket-works-icon.svg','./shared/mobile-runtime.css','./shared/mobile-runtime.js',
  './shared/update-manager.css','./shared/update-manager.js','./shared/release-guard.js','./shared/view-transition-guard.js',
  './shared/app-icon-previews.css','./shared/app-icon-previews.js','./shared/launcher-list-motion.css','./shared/launcher-list-motion.js'
];
const SCOPE_URL=new URL('./',self.registration.scope);
const APPLICATIONS_PATH=new URL('./apps/',SCOPE_URL).pathname;
const BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return[url.pathname,url.href]}));
function buildNetworkUrl(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fetchFresh(input){const response=await fetch(buildNetworkUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!response?.ok)throw new Error(`Fresh launcher request failed: ${response?.status||'network'}`);return response}
async function precacheFreshShell(){const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async canonical=>cache.put(canonical,await fetchFresh(canonical))))}
async function networkFirstFresh(request,canonical,fallback=canonical){try{const response=await fetchFresh(request);const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response}catch{return(await caches.match(canonical))||(await caches.match(fallback))||Response.error()}}
self.addEventListener('install',event=>event.waitUntil(precacheFreshShell()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;if(url.pathname.startsWith(APPLICATIONS_PATH))return;if(event.request.mode==='navigate'){event.respondWith(networkFirstFresh(event.request,SCOPE_URL.href,SCOPE_URL.href));return}const canonical=SHELL_KEYS.get(url.pathname);if(canonical)event.respondWith(networkFirstFresh(event.request,canonical,SCOPE_URL.href))});
