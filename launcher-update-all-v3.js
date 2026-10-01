const REGISTRY_CACHE_KEY='pocket-works:registry:v1';
const VERIFIED_RELEASES_KEY='pocket-works:verified-releases:v1';
const UPDATE_CONCURRENCY=3;
const APP_TIMEOUT=30_000;
const UPDATE_CHECK_TIMEOUT=12_000;
const INSTALL_TIMEOUT=18_000;
const ACTIVATION_TIMEOUT=8_000;

const refreshButton=document.querySelector('#refresh-button');
const syncStatus=document.querySelector('#sync-status');
let bulkUpdateRunning=false;
let completedCount=0;
const wait=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
const errorText=error=>error instanceof Error?error.message:String(error);

const progressRoot=document.createElement('div');
progressRoot.className='pw-update-progress';
progressRoot.hidden=true;
progressRoot.innerHTML='<div class="pw-update-progress__copy"><strong data-pw-update-stage>Syncing shelf</strong><span data-pw-update-count>0 / 0</span></div><div class="pw-update-progress__track"><i data-pw-update-bar></i></div>';
document.querySelector('.command-deck')?.append(progressRoot);
const progressStage=progressRoot.querySelector('[data-pw-update-stage]');
const progressCount=progressRoot.querySelector('[data-pw-update-count]');
const progressBar=progressRoot.querySelector('[data-pw-update-bar]');

function withTimeout(promise,ms,label){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms);})
  ]).finally(()=>clearTimeout(timer));
}

function expectedFingerprint(app){
  return typeof app.fingerprint==='string'&&app.fingerprint?app.fingerprint:`version-${app.version}`;
}

function readVerified(){
  try{return JSON.parse(localStorage.getItem(VERIFIED_RELEASES_KEY)||'{}');}
  catch{return{};}
}

function storeVerified(app){
  try{
    const state=readVerified();
    state[app.slug]={version:app.version,fingerprint:expectedFingerprint(app),verifiedAt:Date.now()};
    localStorage.setItem(VERIFIED_RELEASES_KEY,JSON.stringify(state));
  }catch{}
}

function locallyCurrent(app,verified){
  const saved=verified[app.slug];
  return Boolean(saved&&saved.version===app.version&&saved.fingerprint===expectedFingerprint(app));
}

function writeRegistrySnapshot(apps){
  try{localStorage.setItem(REGISTRY_CACHE_KEY,JSON.stringify({savedAt:Date.now(),apps}));}
  catch{}
}

async function fetchLiveRegistry(){
  const response=await fetch(`./apps.json?fingerprints=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}});
  if(!response.ok)throw new Error(`Registry request failed: ${response.status}`);
  const apps=await response.json();
  if(!Array.isArray(apps))throw new TypeError('apps.json must contain an array');
  return apps.filter(app=>app&&app.status!=='archived'&&typeof app.slug==='string'&&typeof app.path==='string'&&typeof app.version==='string');
}

function workerInfoAttempt(worker,timeout){
  if(!worker)return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>resolve(null),timeout);
    channel.port1.onmessage=event=>{
      clearTimeout(timer);
      resolve(event.data||null);
    };
    try{worker.postMessage({type:'GET_UPDATE_INFO'},[channel.port2]);}
    catch{clearTimeout(timer);resolve(null);}
  });
}

async function workerInfo(worker){
  for(const timeout of [450,900]){
    const info=await workerInfoAttempt(worker,timeout);
    if(info)return info;
  }
  return null;
}

function scopeHref(app){
  const url=new URL(app.path,location.href);
  url.hash='';
  url.search='';
  if(!url.pathname.endsWith('/'))url.pathname+='/';
  return url.href;
}

async function collectInstalledTargets(apps){
  const registrations=await navigator.serviceWorker.getRegistrations();
  const byScope=new Map(registrations.map(registration=>{
    const url=new URL(registration.scope);
    url.hash='';
    url.search='';
    if(!url.pathname.endsWith('/'))url.pathname+='/';
    return[url.href,registration];
  }));
  return apps
    .map(app=>({app,registration:byScope.get(scopeHref(app))}))
    .filter(target=>Boolean(target.registration));
}

function waitForWorkerState(worker,accepted,timeout){
  if(!worker)return Promise.resolve(null);
  if(accepted.includes(worker.state))return Promise.resolve(worker.state);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      worker.removeEventListener('statechange',inspect);
      reject(new Error(`worker stayed ${worker.state}`));
    },timeout);
    function inspect(){
      if(!accepted.includes(worker.state))return;
      clearTimeout(timer);
      worker.removeEventListener('statechange',inspect);
      resolve(worker.state);
    }
    worker.addEventListener('statechange',inspect);
  });
}

async function activateCandidate(registration,candidate,onStage){
  if(!candidate)return false;
  if(candidate.state==='installing'){
    onStage('Installing offline files');
    const state=await waitForWorkerState(candidate,['installed','activated','redundant'],INSTALL_TIMEOUT);
    if(state==='redundant')throw new Error('new worker became redundant');
  }

  const waiting=registration.waiting||(candidate.state==='installed'?candidate:null);
  if(waiting){
    onStage('Activating release');
    try{waiting.postMessage({type:'SKIP_WAITING'});}catch{}
  }

  const deadline=Date.now()+ACTIVATION_TIMEOUT;
  while(Date.now()<deadline){
    if(registration.active===candidate||candidate.state==='activated')return true;
    if(candidate.state==='redundant')throw new Error('new worker became redundant');
    await wait(100);
  }
  return registration.active===candidate||candidate.state==='activated';
}

async function updateInstalledApplication(app,registration,verified,onStage){
  try{
    const beforeActive=registration.active;
    const beforeInfo=await workerInfo(beforeActive);

    if(locallyCurrent(app,verified)&&(!beforeInfo?.version||beforeInfo.version===app.version)){
      return{app,status:'current'};
    }

    onStage('Checking installed release');
    await withTimeout(registration.update(),UPDATE_CHECK_TIMEOUT,`${app.name} worker check`);

    let candidate=registration.installing||registration.waiting;
    if(candidate){
      await activateCandidate(registration,candidate,onStage);
    }else if(registration.active!==beforeActive){
      candidate=registration.active;
    }

    const active=registration.active;
    const activeInfo=await workerInfo(active);

    if(activeInfo?.version&&activeInfo.version!==app.version){
      throw new Error(`active worker reports v${activeInfo.version}; expected v${app.version}`);
    }

    if(activeInfo?.version===app.version){
      storeVerified(app);
      return{app,status:candidate||beforeInfo?.version!==app.version?'updated':'current'};
    }

    if(candidate||active!==beforeActive){
      storeVerified(app);
      return{app,status:'updated'};
    }

    if(locallyCurrent(app,readVerified()))return{app,status:'current'};
    return{app,status:'checked'};
  }catch(error){
    return{app,status:'failed',error:errorText(error),timedOut:errorText(error).includes('timed out')};
  }
}

async function mapWithConcurrency(items,concurrency,handler,onProgress){
  const results=new Array(items.length);
  let cursor=0;
  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=items.length)return;
      results[index]=await handler(items[index],index);
      completedCount++;
      onProgress(completedCount,items.length,results[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
  return results;
}

function showProgress({completed,total,label}){
  progressRoot.hidden=false;
  progressStage.textContent=label||'Syncing shelf';
  progressCount.textContent=`${completed} / ${total}`;
  progressBar.style.width=`${total?Math.min(100,completed/total*100):100}%`;
  refreshButton.textContent=total?`${completed}/${total}`:'Sync';
}

function summaryFor(results,onDemand){
  const changed=results.filter(result=>result.status==='updated').length;
  const current=results.filter(result=>result.status==='current').length;
  const checked=results.filter(result=>result.status==='checked').length;
  const failed=results.filter(result=>result.status==='failed');
  const names=failed.slice(0,2).map(result=>result.app.name).join(', ');
  const pieces=[];
  if(changed)pieces.push(`${changed} updated`);
  if(current)pieces.push(`${current} current`);
  if(checked)pieces.push(`${checked} checked`);
  if(onDemand)pieces.push(`${onDemand} on-demand`);
  if(failed.length)pieces.push(`${failed.length} failed${names?`: ${names}`:''}`);
  if(!pieces.length)pieces.push('Shelf synced');
  return{changed,current,checked,failed,onDemand,main:pieces.join(' / ')};
}

async function runBulkUpdate(){
  if(bulkUpdateRunning||!refreshButton||!syncStatus)return;
  bulkUpdateRunning=true;
  completedCount=0;
  refreshButton.disabled=true;
  refreshButton.textContent='…';
  syncStatus.textContent='Reading live shelf';
  showProgress({completed:0,total:0,label:'Reading live shelf'});

  const active=new Map();
  try{
    if(!('serviceWorker'in navigator))throw new Error('Service Workers are unavailable');
    if(!navigator.onLine)throw new Error('No internet connection');

    const apps=await fetchLiveRegistry();
    writeRegistrySnapshot(apps);
    window.dispatchEvent(new CustomEvent('pocketworks:registry-snapshot',{
      detail:{apps,source:'bulk-update'}
    }));

    const targets=await collectInstalledTargets(apps);
    const onDemand=Math.max(0,apps.length-targets.length);
    const verified=readVerified();

    if(targets.length===0){
      const summary=summaryFor([],onDemand);
      window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete',{detail:summary}));
      syncStatus.textContent=summary.main;
      showProgress({completed:0,total:0,label:summary.main});
      navigator.vibrate?.(10);
      return;
    }

    showProgress({completed:0,total:targets.length,label:`Checking ${targets.length} installed app${targets.length===1?'':'s'}`});

    const results=await mapWithConcurrency(
      targets,
      UPDATE_CONCURRENCY,
      target=>withTimeout(
        updateInstalledApplication(target.app,target.registration,verified,stage=>{
        active.set(target.app.slug,`${target.app.name} · ${stage}`);
        showProgress({completed:completedCount,total:targets.length,label:[...active.values()][0]||stage});
          syncStatus.textContent=[...active.values()].slice(0,2).join(' + ');
        }),
        APP_TIMEOUT,
        `${target.app.name} update`
      ).catch(error=>({app:target.app,status:'failed',error:errorText(error),timedOut:errorText(error).includes('timed out')})),
      (completed,total,result)=>{
        active.delete(result.app.slug);
        const label=result.status==='failed'
          ?`${result.app.name} · failed`
          :result.status==='updated'
            ?`${result.app.name} · updated`
            :result.status==='current'
              ?`${result.app.name} · current`
              :`${result.app.name} · checked`;
        showProgress({completed,total,label});
        syncStatus.textContent=result.status==='failed'?`${result.app.name}: ${result.error}`:label;
      }
    );

    const summary=summaryFor(results,onDemand);
    window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete',{detail:summary}));
    syncStatus.textContent=summary.main;
    showProgress({completed:targets.length,total:targets.length,label:summary.main});
    navigator.vibrate?.(summary.failed.length?[10,40,10]:12);
  }catch(error){
    syncStatus.textContent=`${errorText(error)} — previous releases kept`;
    progressStage.textContent=syncStatus.textContent;
  }finally{
    bulkUpdateRunning=false;
    refreshButton.disabled=false;
    refreshButton.textContent='Sync';
    setTimeout(()=>{if(!bulkUpdateRunning)progressRoot.hidden=true;},2800);
  }
}

refreshButton?.addEventListener('click',event=>{
  if(!event.isTrusted)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void runBulkUpdate();
},{capture:true});
