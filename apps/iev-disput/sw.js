const CACHE_PREFIX='iev-disput-';
const CACHE_NAME='iev-disput-v1.4.0';
const APP_VERSION='1.4.0';
const RELEASE_DATE='2026-08-30';
const CACHE_PROTOCOL=2;
const RELEASE_NOTES=[
  'Додано окремий рандомний тренажер по всіх 57 темах курсу.',
  'Банк містить 570 питань — по 10 на кожну тему — і не повторює питання, доки не закінчиться вся перемішана колода.',
  'Після помилки показуються правильна відповідь, пояснення помилки та конкретний фрагмент конспекту, на якому ґрунтується питання.',
  'Помилкові питання зберігаються в окремій черзі для усвідомленого повторення; статистика тренажера не змінює прогрес навчального курсу.'
];
const APP_SHELL=[
  './','./index.html','./app.config.json','./styles.css','./learning.css','./full-course.css','./random-trainer.css','./app.js','./full-course-entry.js','./plain-language.js','./random-trainer.js','./course-completion-guard.js','./manifest.webmanifest','./icons/icon.svg',
  './learning-data.js','./learning-extra.js','./learning-expansion.js','./quiz-1.js','./quiz-2.js','./quiz-3.js','./source-loader.js',
  './full-coverage-1.js','./full-coverage-2.js','./full-coverage-3.js','./full-coverage-4.js','./full-coverage-5.js','./full-coverage-6.js','./full-coverage-7.js','./full-coverage-8.js',
  './source-pack-1.js','./source-pack-2.js','./source-pack-3.js','./source-pack-4.js',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'
];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return[url.pathname,url.href]}));
function buildNetworkUrl(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fetchFresh(input){const response=await fetch(buildNetworkUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!response||!response.ok)throw new Error(`Fresh request failed: ${response?.status||'network'}`);return response}
async function precacheFreshShell(){const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async canonical=>{const response=await fetchFresh(canonical);await cache.put(canonical,response)}))}
async function networkFirstFresh(request,canonical,fallback=canonical){try{const response=await fetchFresh(request);const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response}catch{return caches.match(canonical).then(cached=>cached||caches.match(fallback))}}
self.addEventListener('install',event=>{event.waitUntil(precacheFreshShell())});
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const requestUrl=new URL(event.request.url);if(requestUrl.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(networkFirstFresh(event.request,SCOPE_URL.href,SCOPE_URL.href));return}
  const canonical=SHELL_KEYS.get(requestUrl.pathname);if(!canonical)return;
  event.respondWith(networkFirstFresh(event.request,canonical,SCOPE_URL.href));
});
