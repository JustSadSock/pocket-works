const BUILD='5.3.0';
const CACHE=`blazon-v${BUILD}`;
const ESSENTIAL=[
  './','./index.html','./styles.css','./living-battle.css','./armorial-progression.css','./armorial-composition.css',
  './app.js','./engine.js','./core-engine.js','./progression-engine.js','./combat-clarity.js','./heraldry.js',
  './menu-input-hotfix.js','./critical-readability.js','./progression-art.js','./progression-runtime.js',
  './armorial-composition-runtime.js','./release-indicator.js','./reset.html','./manifest.webmanifest','./icons/icon.svg'
];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(ESSENTIAL.map(async path=>{
    const request=new Request(path,{cache:'reload'});
    const response=await fetch(request);
    if(response.ok)await cache.put(path,response.clone());
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('blazon-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){
    try{
      const url=new URL(client.url);
      if(!url.pathname.endsWith('/reset.html')&&url.searchParams.get('build')!==BUILD){
        url.searchParams.set('build',BUILD);
        url.searchParams.set('sw-recovered',Date.now().toString(36));
        await client.navigate(url.href);
      }
    }catch{}
  }
})()));

async function freshRequest(request){
  try{return await fetch(new Request(request,{cache:'no-store'}));}
  catch{return null;}
}

async function networkFirst(request){
  const response=await freshRequest(request);
  if(response?.ok){
    const cache=await caches.open(CACHE);
    cache.put(request,response.clone()).catch(()=>{});
    return response;
  }
  return(await caches.match(request,{ignoreSearch:true}))||Response.error();
}

async function navigationResponse(request){
  const response=await freshRequest(request);
  if(response?.ok){
    const type=response.headers.get('content-type')||'';
    if(type.includes('text/html')){
      let html=await response.text();
      html=html.replaceAll('v=4.3.0',`v=${BUILD}`).replace('./app.js?v=4.3.0',`./app.js?v=${BUILD}`);
      const headers=new Headers(response.headers);headers.set('cache-control','no-store');
      const upgraded=new Response(html,{status:response.status,statusText:response.statusText,headers});
      const cache=await caches.open(CACHE);cache.put('./index.html',upgraded.clone()).catch(()=>{});
      return upgraded;
    }
    return response;
  }
  return(await caches.match('./index.html'))||Response.error();
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(navigationResponse(event.request));
    return;
  }
  const destination=event.request.destination;
  if(['script','style','worker','manifest'].includes(destination)||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('.webmanifest')){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||networkFirst(event.request)));
});
