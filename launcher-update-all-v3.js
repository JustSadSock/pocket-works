const REGISTRY_CACHE_KEY='pocket-works:registry:v1';
const VERIFIED_RELEASES_KEY='pocket-works:verified-releases:v1';
const UPDATE_CONCURRENCY=3;
const APP_TIMEOUT=30_000;
const INSTALL_TIMEOUT=22_000;
const ACTIVATION_TIMEOUT=10_000;

const refreshButton=document.querySelector('#refresh-button');
const syncStatus=document.querySelector('#sync-status');
let bulkUpdateRunning=false;
let completedCount=0;
const wait=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
const errorText=error=>error instanceof Error?error.message:String(error);

const progressRoot=document.createElement('div');
progressRoot.className='pw-update-progress';
progressRoot.hidden=true;
progressRoot.innerHTML='<div class="pw-update-progress__copy"><strong data-pw-update-stage>Checking fingerprints</strong><span data-pw-update-count>0 / 0</span></div><div class="pw-update-progress__track"><i data-pw-update-bar></i></div>';
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
  if(!saved||saved.version!==app.version)return false;
  const fingerprint=expectedFingerprint(app);
  if(saved.fingerprint===fingerprint)return true;
  if(!saved.fingerprint){
    storeVerified(app);
    return true;
  }
  return false;
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

function workerMatches(worker,app){
  if(!worker)return false;
  try{
    const url=new URL(worker.scriptURL);
    return url.searchParams.get('pw_release')===app.version&&url.searchParams.get('pw_fp')===expectedFingerprint(app);
  }catch{return false;}
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

async function waitForCandidate(registration){
  if(registration.installing||registration.waiting)return registration.installing||registration.waiting;
  return new Promise(resolve=>{
    const deadline=Date.now()+2600;
    const inspect=()=>{
      const candidate=registration.installing||registration.waiting;
      if(candidate||Date.now()>=deadline){
        registration.removeEventListener('updatefound',inspect);
        resolve(candidate||null);
        return;
      }
      setTimeout(inspect,80);
    };
    registration.addEventListener('updatefound',inspect);
    inspect();
  });
}

async function activateExpectedWorker(registration,app){
  const deadline=Date.now()+ACTIVATION_TIMEOUT;
  while(Date.now()<deadline){
    if(workerMatches(registration.active,app))return registration.active;
    if(registration.waiting){
      try{registration.waiting.postMessage({type:'SKIP_WAITING'});}catch{}
    }
    await wait(100);
  }
  throw new Error('new release did not become active');
}

async function installRelease(app,onStage){
  const scopeUrl=new URL(app.path,location.href);
  const previous=await navigator.serviceWorker.getRegistration(scopeUrl.href);
  if(workerMatches(previous?.active,app)){
    storeVerified(app);
    return{app,status:'current'};
  }

  onStage('Downloading service worker');
  const workerUrl=new URL('sw.js',scopeUrl);
  workerUrl.searchParams.set('pw_release',app.version);
  workerUrl.searchParams.set('pw_fp',expectedFingerprint(app));
  const registration=await navigator.serviceWorker.register(workerUrl.href,{scope:scopeUrl.href,updateViaCache:'none'});

  if(!workerMatches(registration.active,app)&&!registration.installing&&!registration.waiting){
    try{await registration.update();}catch{}
  }

  const candidate=await waitForCandidate(registration);
  if(candidate&&candidate.state==='installing'){
    onStage('Installing offline files');
    const state=await waitForWorkerState(candidate,['installed','activated','redundant'],INSTALL_TIMEOUT);
    if(state==='redundant')throw new Error('new worker became redundant');
  }

  onStage('Activating release');
  await activateExpectedWorker(registration,app);
  storeVerified(app);
  return{app,status:previous?'updated':'installed'};
}

async function updateApplication(app,verified,onStage){
  if(locallyCurrent(app,verified))return{app,status:'current'};
  try{return await withTimeout(installRelease(app,onStage),APP_TIMEOUT,`${app.name} update`);}
  catch(error){return{app,status:'failed',error:errorText(error),timedOut:errorText(error).includes('timed out')};}
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
  progressStage.textContent=label||'Checking fingerprints';
  progressCount.textContent=`${completed} / ${total}`;
  progressBar.style.width=`${total?Math.min(100,completed/total*100):0}%`;
  refreshButton.textContent=`${completed}/${total}`;
}

function summaryFor(results){
  const changed=results.filter(result=>['updated','installed'].includes(result.status)).length;
  const current=results.filter(result=>result.status==='current').length;
  const failed=results.filter(result=>result.status==='failed');
  const names=failed.slice(0,3).map(result=>result.app.name).join(', ');
  return{
    changed,current,failed,
    main:failed.length
      ?`${changed} updated / ${current} current / ${failed.length} skipped${names?`: ${names}`:''}`
      :`${changed} updated / ${current} current`
  };
}

async function runBulkUpdate(){
  if(bulkUpdateRunning||!refreshButton||!syncStatus)return;
  bulkUpdateRunning=true;
  completedCount=0;
  refreshButton.disabled=true;
  refreshButton.textContent='0/…';
  syncStatus.textContent='Reading release fingerprints';
  showProgress({completed:0,total:0,label:'Reading release fingerprints'});

  const active=new Map();
  try{
    if(!('serviceWorker'in navigator))throw new Error('Service Workers are unavailable');
    if(!navigator.onLine)throw new Error('No internet connection');

    const apps=await fetchLiveRegistry();
    writeRegistrySnapshot(apps);
    const verified=readVerified();
    showProgress({completed:0,total:apps.length,label:'Comparing local fingerprints'});

    const results=await mapWithConcurrency(
      apps,
      UPDATE_CONCURRENCY,
      app=>updateApplication(app,verified,stage=>{
        active.set(app.slug,`${app.name} · ${stage}`);
        showProgress({completed:completedCount,total:apps.length,label:[...active.values()][0]||stage});
        syncStatus.textContent=[...active.values()].slice(0,2).join(' + ');
      }),
      (completed,total,result)=>{
        active.delete(result.app.slug);
        const label=result.status==='failed'
          ?`${result.app.name} · skipped`
          :result.status==='current'
            ?`${result.app.name} · fingerprint matches`
            :`${result.app.name} · ${result.status}`;
        showProgress({completed,total,label});
        syncStatus.textContent=result.status==='failed'?`${result.app.name}: ${result.error}`:label;
      }
    );

    const summary=summaryFor(results);
    window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete',{detail:summary}));
    syncStatus.textContent=summary.main;
    showProgress({completed:apps.length,total:apps.length,label:summary.main});
    navigator.vibrate?.(summary.failed.length?[10,40,10]:12);
    setTimeout(()=>{if(!bulkUpdateRunning)progressRoot.hidden=true;},2600);
  }catch(error){
    syncStatus.textContent=`${errorText(error)} — previous releases kept`;
    progressStage.textContent=syncStatus.textContent;
  }finally{
    bulkUpdateRunning=false;
    refreshButton.disabled=false;
    refreshButton.textContent='Update';
  }
}

refreshButton?.addEventListener('click',event=>{
  if(!event.isTrusted)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runBulkUpdate();
},{capture:true});
