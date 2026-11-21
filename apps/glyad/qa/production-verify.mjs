// Cloudflare production check: run after main merge via Universal QA, suite production.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ORIGIN=(process.env.PW_PRODUCTION_ORIGIN||'https://pocket-works.illya07kov.workers.dev').replace(/\/+$/,'');
const PATH='/apps/glyad/';
const attempts=Number(process.env.PW_VERIFY_ATTEMPTS||8);
const pauseMs=Number(process.env.PW_VERIFY_INTERVAL_MS||15000);
const sha256=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const localRoot=new URL('../',import.meta.url);
async function get(path){
  const url=new URL(path,ORIGIN);
  const response=await fetch(url,{
    redirect:'follow',cache:'no-store',
    headers:{'cache-control':'no-cache','user-agent':'PocketWorks-Wildcard-Production-Verify/1.0'},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error('HTTP '+response.status+' for '+url.href);
  if(response.url&&new URL(response.url).origin!==url.origin)
    throw new Error('Unexpected cross-origin redirect: '+response.url);
  return {text:await response.text(),response};
}
async function confirm(){
  const home=await get(PATH);
  if(!home.text.includes('ГЛЯДЬ')||!home.text.includes('app.js'))
    throw new Error('Published app HTML does not contain expected product and script');
  const config=JSON.parse((await get(PATH+'app.config.json')).text);
  if(config.slug!=='glyad'||config.version!=='1.0.1'||config.cacheName!=='glyad-v1.0.1')
    throw new Error('Wrong production app metadata: '+JSON.stringify(config));
  const release=JSON.parse((await get(PATH+'release.json')).text);
  if(release.slug!=='glyad'||release.version!=='1.0.1')
    throw new Error('Production release fingerprint does not match 1.0.1');
  const reg=JSON.parse((await get('/apps.json')).text);
  const entries=Array.isArray(reg)?reg:Array.isArray(reg.apps)?reg.apps:[];
  const registered=entries.find(item=>item.slug==='glyad');
  if(!registered||registered.version!=='1.0.1')
    throw new Error('PocketWorks public launcher is missing GLYAD 1.0.1');
  for(const file of ['app.js','core.mjs','styles.css','sw.js','icons/icon.svg','manifest.webmanifest']){
    const [local,live]=await Promise.all([readFile(new URL(file,localRoot),'utf8'),get(PATH+file)]);
    // Production packaging adds a release banner to *.js and version pins
    // relative imports. It deliberately does not stamp *.mjs or other assets.
    let packaged=live.text;
    if(file.endsWith('.js')){
      const banner='/* pocket-works-release:glyad@1.0.1:'+file+' */\n';
      if(!packaged.startsWith(banner))
        throw new Error('Published script has missing or wrong release banner: '+file);
      packaged=packaged.slice(banner.length).replaceAll('?pw_release=1.0.1','');
    }
    if(file==='manifest.webmanifest'){
      const contentType=live.response.headers.get('content-type')||'unknown';
      console.log('Manifest: HTTP '+live.response.status+', content-type '+contentType+', source '+local.length+' bytes, live '+packaged.length+' bytes');
      try{
        const expected=JSON.parse(local),actual=JSON.parse(packaged);
        if(JSON.stringify(expected)!==JSON.stringify(actual)){
          console.error('Expected manifest: '+JSON.stringify(expected));
          console.error('Actual manifest: '+JSON.stringify(actual));
          throw new Error('Production manifest JSON differs from merged source');
        }
        // JSON whitespace is irrelevant to PWA manifest semantics.
        packaged=local;
      }catch(error){
        console.error('Live manifest preview: '+packaged.slice(0,450));
        throw error;
      }
    }
    if(sha256(local)!==sha256(packaged)){
      console.error('Mismatch '+file+', expected '+sha256(local)+' ('+local.length+' bytes), live '+sha256(packaged)+' ('+packaged.length+' bytes), content-type '+live.response.headers.get('content-type'));
      console.error('Live file preview: '+packaged.slice(0,350));
      throw new Error('Deployed normalized source differs from merged main for '+file);
    }
    console.log('Verified '+file+' normalized SHA256 '+sha256(local).slice(0,20)+' HTTP '+live.response.status);
  }
  console.log('PRODUCTION VERIFIED: '+ORIGIN+PATH+'; HTTP '+home.response.status+'; version 1.0.1; server '+(home.response.headers.get('server')||'unavailable'));
  console.log('Live Cloudflare-hosted app, release and registry match repository source.');
}
let lastError;
for(let attempt=1;attempt<=attempts;attempt++){
  try{console.log('Production proof attempt '+attempt+'/'+attempts+': '+ORIGIN+PATH);await confirm();process.exit(0)}
  catch(error){lastError=error;console.error('Production not confirmed: '+(error.stack||error.message));if(attempt<attempts)await sleep(pauseMs)}
}
console.error('PRODUCTION NOT VERIFIED: '+lastError?.message);
process.exitCode=1;
