const REGISTRY_CACHE_KEY='pocket-works:registry:v1';
const UPDATE_CONCURRENCY=2;
const APP_TIMEOUT=55_000;
const INSTALL_TIMEOUT=38_000;
const ACTIVATION_TIMEOUT=12_000;
const INFO_TIMEOUTS=[900,1600,2600];

const refreshButton=document.querySelector('#refresh-button');
const syncStatus=document.querySelector('#sync-status');
const sortButton=document.querySelector('#sort-button');
const appList=document.querySelector('#app-list');
let bulkUpdateRunning=false;
let orderRepairQueued=false;
let repairingOrder=false;

const wait=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function writeRegistrySnapshot(apps){try{localStorage.setItem(REGISTRY_CACHE_KEY,JSON.stringify({savedAt:Date.now(),apps}))}catch{}}
function errorText(error){return error instanceof Error?error.message:String(error)}
function timeoutResult(app,stage='update'){return{app,status:'failed',error:`${stage} exceeded ${Math.round(APP_TIMEOUT/1000)}s`,timedOut:true}}

async function withTimeout(promise,ms,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(`${label} timed out`)),ms)})])}
  finally{window.clearTimeout(timer)}
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
    const timer=window.setTimeout(()=>resolve(null),timeout);
    channel.port1.onmessage=event=>{window.clearTimeout(timer);resolve(event.data||null)};
    try{worker.postMessage({type:'GET_UPDATE_INFO'},[channel.port2])}catch{window.clearTimeout(timer);resolve(null)}
  });
}
async function workerInfo(worker){for(const timeout of INFO_TIMEOUTS){const info=await workerInfoAttempt(worker,timeout);if(info)return info;await wait(40)}return null}

function waitForWorkerState(worker,accepted,timeout){
  if(!worker)return Promise.resolve(null);
  if(accepted.includes(worker.state))return Promise.resolve(worker.state);
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>{worker.removeEventListener('statechange',inspect);reject(new Error(`worker stayed ${worker.state}`))},timeout);
    function inspect(){if(!accepted.includes(worker.state))return;window.clearTimeout(timer);worker.removeEventListener('statechange',inspect);resolve(worker.state)}
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

function exactRegistrationForScope(registration,scopeUrl){return registration&&new URL(registration.scope).href===scopeUrl.href?registration:null}

async function updateApplicationCore(app,onStage){
  const scopeUrl=new URL(app.path,window.location.href);
  const workerUrl=new URL('sw.js',scopeUrl);
  onStage?.('registration');
  const found=await withTimeout(navigator.serviceWorker.getRegistration(scopeUrl.href),6000,`${app.name} registration lookup`);
  const matched=exactRegistrationForScope(found,scopeUrl);
  const previousWorker=matched?.active||null;
  const previousInfo=await workerInfo(previousWorker);
  onStage?.('download');
  const registration=await withTimeout(navigator.serviceWorker.register(workerUrl.href,{scope:scopeUrl.href,updateViaCache:'none'}),9000,`${app.name} registration`);
  try{await withTimeout(registration.update(),9000,`${app.name} update request`)}catch(error){if(!registration.installing&&!registration.active)throw error}
  await settleInstallation(registration);
  onStage?.('activation');
  const downloadedInfo=await activateWaitingWorker(registration,app.version);
  const activeWorker=await waitForRegistrationActive(registration);
  const activeInfo=await workerInfo(activeWorker)||downloadedInfo;
  if(activeInfo?.version&&app.version&&activeInfo.version!==app.version)throw new Error(`expected v${app.version}; activated v${activeInfo.version}`);
  const changedWorker=Boolean(previousWorker&&activeWorker!==previousWorker);
  const changedVersion=Boolean(previousInfo?.version&&activeInfo?.version&&previousInfo.version!==activeInfo.version);
  return{app,status:previousWorker?(changedWorker||changedVersion?'updated':'current'):'installed',version:activeInfo?.version||app.version||''};
}

async function updateApplication(app,onStage){
  try{return await withTimeout(updateApplicationCore(app,onStage),APP_TIMEOUT,`${app.name} full update`)}
  catch(error){const message=errorText(error);return message.includes('full update timed out')?timeoutResult(app):{app,status:'failed',error:message}}
}

async function mapWithConcurrency(items,concurrency,handler,{onStart,onProgress}={}){
  const results=new Array(items.length);let cursor=0,completed=0;
  async function worker(){
    while(true){
      const index=cursor++;if(index>=items.length)return;
      const item=items[index];onStart?.(item,index,completed,items.length);
      results[index]=await handler(item,index);
      completed++;onProgress?.(completed,items.length,results[index]);
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
  return results;
}

function updateSummary(results){
  const updated=results.filter(r=>r.status==='updated').length;
  const installed=results.filter(r=>r.status==='installed').length;
  const current=results.filter(r=>r.status==='current').length;
  const failed=results.filter(r=>r.status==='failed');
  const changed=updated+installed;
  const names=failed.slice(0,3).map(r=>r.app.name).join(', ');
  const main=failed.length?`${changed} updated / ${current} current / ${failed.length} skipped${names?`: ${names}`:''}`:changed?`${changed} updated / ${current} current`:`All ${current} applications are current`;
  return{main,updated,installed,current,failed};
}

async function runBulkUpdate(){
  if(bulkUpdateRunning||!refreshButton||!syncStatus)return;
  bulkUpdateRunning=true;refreshButton.disabled=true;refreshButton.textContent='Checking…';syncStatus.textContent='Checking the live application registry';
  try{
    if(!('serviceWorker'in navigator))throw new Error('Service Workers are unavailable');
    if(!navigator.onLine)throw new Error('No internet connection');
    const apps=await fetchLiveRegistry();writeRegistrySnapshot(apps);
    const active=new Set();
    const showActive=(completed,total)=>{const names=[...active].slice(0,2).join(' + ');refreshButton.textContent=`${completed}/${total}`;syncStatus.textContent=names?`Updating: ${names}`:'Finishing update'};
    const results=await mapWithConcurrency(apps,UPDATE_CONCURRENCY,(app)=>updateApplication(app,stage=>{active.delete(app.name);active.add(`${app.name} · ${stage}`);showActive(resultsCompleted,apps.length)}),{
      onStart(app,index,completed,total){active.add(app.name);showActive(completed,total)},
      onProgress(completed,total,result){resultsCompleted=completed;for(const name of [...active])if(name===result.app.name||name.startsWith(`${result.app.name} ·`))active.delete(name);refreshButton.textContent=`${completed}/${total}`;syncStatus.textContent=result.status==='failed'?`${result.app.name}: skipped — ${result.error}`:`${result.app.name}: ${result.status}`}
    });
    const summary=updateSummary(results);window.dispatchEvent(new CustomEvent('pocketworks:bulk-update-complete',{detail:summary}));
    syncStatus.textContent=summary.main;navigator.vibrate?.(summary.failed.length?[10,40,10]:12);
  }catch(error){syncStatus.textContent=`${errorText(error)} — existing offline caches kept`}
  finally{bulkUpdateRunning=false;refreshButton.disabled=false;refreshButton.textContent='Update'}
}
let resultsCompleted=0;

function updatedTimestamp(value){if(typeof value==='number'&&Number.isFinite(value))return value;if(typeof value!=='string'||!value.trim())return Number.NEGATIVE_INFINITY;const parsed=Date.parse(value.trim());return Number.isFinite(parsed)?parsed:Number.NEGATIVE_INFINITY}
function repairSortLabel(){if(!sortButton)return;const labels={updated:'Updated ↓',recent:'Opened ↓',name:'Name A–Z'};const expected=labels[sortButton.dataset.sort];if(expected&&sortButton.textContent!==expected)sortButton.textContent=expected}
function repairUpdatedOrder(){orderRepairQueued=false;repairSortLabel();if(repairingOrder||!appList||sortButton?.dataset.sort!=='updated')return;const registry=readJson(REGISTRY_CACHE_KEY)?.apps;if(!Array.isArray(registry))return;const metadata=new Map(registry.map(app=>[app.slug,app]));const entries=[...appList.querySelectorAll('.app-entry[data-slug]')];const ordered=[...entries].sort((a,b)=>updatedTimestamp(metadata.get(b.dataset.slug)?.updatedAt)-updatedTimestamp(metadata.get(a.dataset.slug)?.updatedAt)||String(metadata.get(a.dataset.slug)?.name||a.dataset.slug).localeCompare(String(metadata.get(b.dataset.slug)?.name||b.dataset.slug)));if(ordered.every((entry,index)=>entry===entries[index]))return;repairingOrder=true;const fragment=document.createDocumentFragment();ordered.forEach(entry=>fragment.append(entry));appList.append(fragment);repairingOrder=false}
function queueOrderRepair(){repairSortLabel();if(orderRepairQueued)return;orderRepairQueued=true;requestAnimationFrame(repairUpdatedOrder)}

refreshButton?.addEventListener('click',event=>{if(!event.isTrusted)return;event.preventDefault();event.stopImmediatePropagation();runBulkUpdate()},{capture:true});
new MutationObserver(()=>{if(!bulkUpdateRunning&&!refreshButton.disabled&&refreshButton.textContent==='Sync')refreshButton.textContent='Update'}).observe(refreshButton,{childList:true,characterData:true,subtree:true});
new MutationObserver(queueOrderRepair).observe(sortButton,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-sort']});
new MutationObserver(queueOrderRepair).observe(appList,{childList:true});
sortButton?.addEventListener('click',queueOrderRepair);window.addEventListener('pocketworks:bulk-update-complete',queueOrderRepair);repairSortLabel();queueOrderRepair();