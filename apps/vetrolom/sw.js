const CACHE_PREFIX='vetrolom-';
const CACHE_NAME='vetrolom-v1.5.2';
const APP_VERSION='1.5.2';
const RELEASE_DATE='2026-07-18';
const CACHE_PROTOCOL=3;
const RELEASE_NOTES=[
  'Обновление ВЕТРОЛОМА больше не может остановить общий счётчик Pocket Works.',
  'Каждый файл ядра имеет собственный таймаут загрузки.',
  'При временной ошибке runtime-фрагмент берётся из предыдущего рабочего офлайн-кэша.'
];
const CORE_SHELL=['./','./index.html','./app.config.json','./styles.css','./polish-1.1.css','./polish-1.2.css','./polish-1.3.css','./polish-1.4.css','./polish-1.5.css','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/update-manager.css','../../shared/update-manager.js'];
const RUNTIME_SHELL=['./runtime/part-00.txt','./runtime/part-01.txt','./runtime/part-02.txt','./runtime/part-03.txt','./runtime/part-04.txt','./runtime/part-05.txt','./runtime/patch-1.2.txt','./runtime/patch-1.3-a.txt','./runtime/patch-1.3-b.txt','./runtime/patch-1.3-c.txt','./runtime/patch-1.4-a.txt','./runtime/patch-1.4-b.txt','./runtime/patch-1.4-c.txt','./runtime/patch-1.5-a.txt','./runtime/patch-1.5-b.txt','./runtime/patch-1.5-c.txt'];
const APP_SHELL=[...CORE_SHELL,...RUNTIME_SHELL];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return[url.pathname,url.href]}));
let installReport={downloaded:0,reused:0,failed:[]};
function buildNetworkUrl(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fetchFresh(input,timeout=9000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(buildNetworkUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow',signal:controller.signal});if(!response?.ok)throw new Error(`HTTP ${response?.status||'network'}`);return response}finally{clearTimeout(timer)}}
async function cacheOne(cache,entry,required=false){const canonical=new URL(entry,SCOPE_URL).href;try{const response=await fetchFresh(canonical);await cache.put(canonical,response);installReport.downloaded++;return true}catch(error){const previous=await caches.match(canonical);if(previous){await cache.put(canonical,previous.clone());installReport.reused++;return true}installReport.failed.push({entry,error:error?.message||String(error)});if(required)throw new Error(`${entry}: ${error?.message||error}`);return false}}
async function precacheFreshShell(){installReport={downloaded:0,reused:0,failed:[]};const cache=await caches.open(CACHE_NAME);for(const entry of CORE_SHELL)await cacheOne(cache,entry,true);await Promise.allSettled(RUNTIME_SHELL.map(entry=>cacheOne(cache,entry,false)))}
async function networkFirstFresh(request,canonicalUrl,fallbackUrl=canonicalUrl){try{const response=await fetchFresh(request);const cache=await caches.open(CACHE_NAME);await cache.put(canonicalUrl,response.clone());return response}catch{return caches.match(canonicalUrl).then(cached=>cached||caches.match(fallbackUrl))}}
self.addEventListener('install',event=>event.waitUntil(precacheFreshShell()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME,installReport});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const requestUrl=new URL(event.request.url);if(requestUrl.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(networkFirstFresh(event.request,SCOPE_URL.href,SCOPE_URL.href));return}const canonicalUrl=SHELL_KEYS.get(requestUrl.pathname);if(!canonicalUrl)return;event.respondWith(networkFirstFresh(event.request,canonicalUrl,SCOPE_URL.href))});