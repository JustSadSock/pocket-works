const REGISTRY_CACHE_KEY='pocket-works:registry:v1';
const VERIFIED_RELEASES_KEY='pocket-works:verified-releases:v1';
const UPDATE_CONCURRENCY=2;
const APP_TIMEOUT=55_000;
const INSTALL_TIMEOUT=38_000;
const ACTIVATION_TIMEOUT=12_000;
const INFO_TIMEOUTS=[900,1600,2600];

const refreshButton=document.querySelector('#refresh-button');
const syncStatus=document.querySelector('#sync-status');
let bulkUpdateRunning=false;
let completedCount=0;
const wait=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
const errorText=error=>error instanceof Error?error.message:String(error);

function withTimeout(promise,ms,label){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms)})]).finally(()=>clearTimeout(timer));
}

function writeRegistrySnapshot(apps){
  try{localStorage.setItem(REGISTRY_CACHE_KEY,JSON.stringify({savedAt:Date.now(),apps}))}catch{}
}

function storeVerified(app,version){
  try{
    const state=JSON.parse(localStorage.getItem(VERIFIED_RELEASES_KEY)||'{}');
    state[app.slug]={version,verifiedAt:Date.now()};
    localStorage.setItem(VERIFIED_RELEASES_KEY,JSON.stringify(state));
  }catch{}
}

async function fetchLiveRegistry(){
  const response=await fetch(`./apps.json?update=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});
  if(!response.ok)throw new Error(`Registry request failed: ${response.status}`);
  const apps=await response.json();
  if(!Array.isArray(apps))throw new TypeError('apps.json must contain an array');
  return apps.filter(app=>app&&app.status!=='archived'&&typeof app.slug==='string'&&typeof app.path==='string');
}

function workerInfoAttempt(worker,timeout){
  if(!worker)return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>resolve(null),timeout);
    channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data||null)};
    try{worker.postMessage({type:'GET_UPDATE_INFO'},[channel.port2])}catch{clearTimeout(timer);resolve(null)}
  });
}
async function workerInfo(worker){for(const timeout of INFO_TIMEOUTS){const info=await workerInfoAttempt(worker,timeout);if(info)return info;await wait(40)}return null}

function waitForWorkerState(worker,accepted,timeout){
  if(!worker)return Promise.resolve(null);
  if(accepted.includes(worker.state))return Promise.resolve(worker.state);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{worker.removeEventListener('statechange',inspect);reject(new Error(`worker stayed ${worker.state}`))},timeout);
    function inspect(){if(!accepted.includes(worker.state))return;clearTimeout(timer);worker.removeEventListener('statechange',inspect);resolve(worker.state)}
    worker.addEventListener('statechange',inspect);
  });
}

async function settleInstallation(registration){
  let installing=registration.installing;
  if(!installing){await wait(100);installing=registration.installing}
  if(!installing)return;
  const state=await waitForWorkerState(installing,['installed','activated','redundant'],INSTALL_TIMEOUT);
  if(state==='redundant')throw new Error('new worker became redundant while downloading');
}

async function waitForRegistrationActive(registration,preferred=null){
  const deadline=Date.now()+ACTIVATION_TIMEOUT;
  while(Date.now()<deadline){
    const active=registration.active;
    if(active&&(!preferred||active===preferred||preferred.state==='activated'))return active;
    if(preferred?.state==='redundant')throw new Error('downloaded worker became redundant during activation');
    await wait(100);
  }
  throw new Error('downloaded worker did not activate');
}

async function activateWaitingWorker(registration,expectedVersion){
  const waiting=registration.waiting;
  if(!waiting)return null;
  const info=await workerInfo(waiting);
  if(info?.version&&expectedVersion&&info.version!==expectedVersion)throw new Error(`downloaded v${info.version}; registry expects v${expectedVersion}`);
  waiting.postMessage({type:'SKIP_WAITING'});
  await waitForWorkerState(waiting,['activated','redundant'],ACTIVATION_TIMEOUT);
  if(waiting.state==='redundant')throw new Error('new worker failed during activation');
  await waitForRegistrationActive(registration,waiting);
  return info;
}

async function verifyServerRelease(app,scopeUrl){
  const nonce=Date.now().toString(36);
  const configUrl=new URL('app.config.json',scopeUrl);configUrl.searchParams.set('__pw_verify',nonce);
  const releaseUrl=new URL('release.json',scopeUrl);releaseUrl.searchParams.set('__pw_verify',nonce);
  const indexUrl=new URL(scopeUrl.href);indexUrl.searchParams.set('pw_release',app.version);indexUrl.searchParams.set('__pw_verify',nonce);
  const [configResponse,releaseResponse,indexResponse]=await Promise.all([
    fetch(configUrl,{cache:'no-store',headers:{'cache-control':'no-cache'}}),
    fetch(releaseUrl,{cache:'no-store',headers:{'cache-control':'no-cache'}}),
    fetch(indexUrl,{cache:'no-store',headers:{'cache-control':'no-cache'}})
  ]);
  if(!configResponse.ok)throw new Error(`config verification HTTP ${configResponse.status}`);
  if(!releaseResponse.ok)throw new Error(`release manifest HTTP ${releaseResponse.status}`);
  if(!indexResponse.ok)throw new Error(`entry verification HTTP ${indexResponse.status}`);
  const [config,release,index]=await Promise.all([configResponse.json(),releaseResponse.json(),indexResponse.text()]);
  if(config.version!==app.version)throw new Error(`server config is v${config.version||'unknown'}, registry expects v${app.version}`);
  if(release.version!==app.version)throw new Error(`release manifest is v${release.version||'unknown'}, registry expects v${app.version}`);
  const stamped=index.includes(`name="pocket-works-release" content="${app.version}"`)||index.includes(`data-pw-release="${app.version}"`);
  if(!stamped)throw new Error(`entry document is not stamped v${app.version}`);
  return app.version;
}

async function updateApplicationCore(app,onStage){
  const scopeUrl=new URL(app.path,location.href);
  const workerUrl=new URL('sw.js',scopeUrl);workerUrl.searchParams.set('pw_release',app.version);
  onStage('registration');
  const previousRegistration=await withTimeout(navigator.serviceWorker.getRegistration(scopeUrl.href),6000,`${app.name} registration lookup`);
  const previousWorker=previousRegistration?.active||null;
  const previousInfo=await workerInfo(previousWorker);
  onStage('download');
  const registration=await withTimeout(navigator.serviceWorker.register(workerUrl.href,{scope:scopeUrl.href,updateViaCache:'none'}),9000,`${app.name} registration`);
  try{await withTimeout(registration.update(),9000,`${app.name} update request`)}catch(error){if(!registration.installing&&!registration.active)throw error}
  await settleInstallation(registration);
  onStage('activation');
  const downloadedInfo=await activateWaitingWorker(registration,app.version);
  const activeWorker=await waitForRegistrationActive(registration);
  const activeInfo=await workerInfo(activeWorker)||downloadedInfo;
  if(activeInfo?.version&&activeInfo.version!==app.version)throw new Error(`activated v${activeInfo.version}; registry expects v${app.version}`);
  onStage('verification');
  const verifiedVersion=await verifyServerRelease(app,scopeUrl);
  storeVerified(app,verifiedVersion);
  const changed=Boolean(!previousWorker||activeWorker!==previousWorker||previousInfo?.version!==activeInfo?.version);
  return{app,status:previousWorker?(changed?'updated':'current'):'installed',version:verifiedVersion,verified:true};
}

async function updateApplication(app,onStage){
  try{return await withTimeout(updateApplicationCore(app,onStage),APP_TIMEOUT,`${app.name} full update`)}
  catch(error){return{app,status:'failed',error:errorText(error),timedOut:errorText(error).includes('timed out')}}
}

async function mapWithConcurrency(items,concurrency,handler,onProgress){
  const results=new Array(items.length);let cursor=0;
  async function worker(){
    while(true){
      const index=cursor++;if(index>=items.length)return;
      results[index]=await handler(items[index],index);
      completedCount++;onProgress(completedCount,items.length,results[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
  return results;
}

function summaryFor(results){
  const changed=results.filter(result=>['updated','installed'].includes(result.status)).length;
  const current=results.filter(result=>result.status==='current').length;
  const failed=results.filter(result=>result.status==='failed');
  const names=failed.slice(0,3).map(result=>result.app.name).join(', ');
  return{changed,current,failed,main:failed.length?`${changed} updated / ${current} verified / ${failed.length} skipped${names?`: ${names}`:''}`:`${changed} updated / ${current} verified`};
}

async function runBulkUpdate(){
  if(bulkUpdateRunning||!refreshButton||!syncStatus)return;
  bulkUpdateRunning=true;completedCount=0;refreshButton.disabled=true;refreshButton.textContent='Checking…';syncStatus.textContent='Reading live release registry';
  const active=new Map();
  const show=(completed,total)=>{refreshButton.textContent=`${completed}/${total}`;const labels=[...active.values()].slice(0,2);syncStatus.textContent=labels.length?`Updating: ${labels.join(' + ')}`:'Finishing verified update'};
  try{
    if(!('serviceWorker'in navigator))throw new Error('Service Workers are unavailable');
    if(!navigator.onLine)throw new Error('No internet connection');
    const apps=await fetchLiveRegistry();writeRegistrySnapshot(apps);
    const results=await mapWithConcurrency(apps,UPDATE_CONCURRENCY,app=>updateApplication(app,stage=>{active.set(app.slug,`${app.name} · ${stage}`);show(completedCount,apps.length)}),(completed,total,result)=>{
      active.delete(result.app.slug);show(completed,total);syncStatus.textContent=result.status==='failed'?`${result.app.name}: skipped — ${result.error}`:`${result.app.name}: ${result.status} and verified`;
    });
    const summary=summaryFor(results);
    window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete',{detail:summary}));
    syncStatus.textContent=summary.main;navigator.vibrate?.(summary.failed.length?[10,40,10]:12);
  }catch(error){syncStatus.textContent=`${errorText(error)} — previous verified releases kept`}
  finally{bulkUpdateRunning=false;refreshButton.disabled=false;refreshButton.textContent='Update'}
}

refreshButton?.addEventListener('click',event=>{if(!event.isTrusted)return;event.preventDefault();event.stopImmediatePropagation();runBulkUpdate()},{capture:true});
