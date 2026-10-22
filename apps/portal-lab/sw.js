const PREFIX='portal-lab-',CACHE='portal-lab-v1.5.0',CACHE_NAME=CACHE;
const APP_VERSION='1.5.0',RELEASE_DATE='2026-10-20',VERSION=APP_VERSION,RELEASE=RELEASE_DATE;
const RELEASE_NOTES = ["Тринадцатый режим «Синхронно»: одновременно работающие 3D координатный атлас фотонных геодезических и оптическое изображение неба из того же статического наблюдателя, в одной метрике, без имитации линзирования скриншотом 3D.","Два отдельных Canvas с независимой оптимизацией размеров и отрисовки: рядом на десктопе и вертикально на телефоне. Перетаскивание 3D и направления взгляда в оптическом окне действуют непосредственно на реальные приборы.","Единая физическая позиция с signed l/a, регионом A/B, долготой и широтой; изменение любого параметра синхронизирует маркер в 3D и оптические нулевые геодезические.","В 3D поверх маркера отображается стрелка направления центрального луча оптической камеры. Длина стрелки условна, её мировая угловая ориентация получена из локального ортонормированного базиса.","Глобальная пауза и запуск, собственные кнопки управления пучком, перенос камеры к выбранному текущему фотону, проверка центрального луча с выводом b/a, числа переходов и невязки H=0; переход к каждому виду отдельно и обратно без потери точки.","Глобальный конструктор метрики обновляет оба прибора. Условия совмещённого эксперимента, координаты, оптические проценты A/B и геодезические инварианты сохраняются в научном журнале; воспроизведение восстанавливает исходную подготовку.","Оптика и 3D-поле используют разные сохранённые настройки и независимые обработчики ввода, без дублирования глобальных кнопок при одновременном запуске. Статические координатные сетки кэшируются, быстрые показания не сериализуют полные траектории.","18 новых численных тестов, плюс виртуальный интеграционный прогон переключений и научный регрессионный набор 243/243."];
const NOTES=RELEASE_NOTES;
const OWN=['../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','./','./index.html','./styles.css','./app.js','./relativity.js','./optics.js','./tidal.js','./observatory.js','./optical-display.js','./embedded-space.js','./embedded-view.js','./light-field.js','./light-field-view.js','./observer-bridge.js','./dual-observatory.js','./material.js','./material-view.js','./waves.js','./wave-view.js','./spacetime.js','./designer.js','./rotation.js','./rotation-view.js','./causality.js','./causality-view.js','./chronology.js','./atlas-view.js','./notebook.js','./notebook-view.js','./audio.js','./manifest.webmanifest','./app.config.json','./icons/icon.svg'];
const SCOPE=new URL('./',self.registration.scope);
const ASSETS=new Map(OWN.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{
 await Promise.all([...new Set(ASSETS.values())].map(async url=>{
  const response=await fetch(new Request(url,{cache:'reload'}));
  if(!response.ok)throw Error('Unable to precache '+url);
  await c.put(url,response);
 }));
})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{const e=event;if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE,releaseNotes:NOTES,cacheProtocol:2,cacheName:CACHE});if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
 const canonical= e.request.mode==='navigate'?SCOPE.href:ASSETS.get(u.pathname);if(!canonical)return;
 e.respondWith((async()=>{
  try{
   const response=await fetch(e.request);
   if(!response.ok)throw Error(String(response.status));
   const cache=await caches.open(CACHE);await cache.put(canonical,response.clone());
   return response;
  }catch{const cached=await caches.match(canonical);return cached||Response.error();}
 })());
});
