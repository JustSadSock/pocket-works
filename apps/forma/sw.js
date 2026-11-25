const RELEASE_NOTES = ["Основным форматом стал настоящий OpenSCAD-файл с тонким блоком FORMA_PROJECT вместо ограниченного FormaBlueprint.","Добавлен строгий OpenSCAD-совместимый интерпретатор с модулями, параметрами, локальными переменными, циклами, трансформациями, булевыми операциями и экструзиями.","Геометрия отделена от функционального контракта: неподвижные части, степени свободы, передачи и численные цели проверяются независимо от рендера.","FORMA измеряет фактические межосевые расстояния и планетарную раскладку из CAD-трансформаций, рассчитывает направление и величину передаточного отношения.","Экспорт CAD-проекта блокируется, если механизм не доказан; приложение создаёт точный repair-пакет.","Неподдерживаемые дифференциалы и недоказанное удержание корпусом теперь честно отклоняются вместо генерации декоративных заглушек.","FormaBlueprint 1 отключён как недоказуемый путь; низкоуровневый FormaCode 1 сохранён только для ручной статической геометрии."];
const RELEASE_DATE = "2026-07-30";
const APP_VERSION = "2.0.0";
const CACHE_NAME='forma-v2.0.0';
const ASSETS=["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",'./','./index.html','./styles.css','./bootstrap.js','./app.js','./manifest.webmanifest','./icons/icon.svg','./FORMA-AI-GUIDE.md','./src/cad-project.js','./src/scad.js','./src/contract.js','./src/contract-strict.js','./src/blueprint.js','./src/blueprint-runtime.js','./src/engine.js','./src/mesher.js','./src/renderer.js','./src/exporters.js','./src/spec.js','./src/worker.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('forma-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response&&response.ok&&new URL(event.request.url).origin===location.origin){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match('./index.html'))));
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"forma-v2.0.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
