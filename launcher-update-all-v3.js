import { loadRegistry as requestRegistry } from './shared/launcher-registry.js';
import { installedTargets, updateInstalledApplication, withTimeout, getVerifiedReleases } from './shared/release-coordinator.js';

const UPDATE_CONCURRENCY=3;
const APP_TIMEOUT=30_000;

const refreshButton=document.querySelector('#update-installed-button');
const syncStatus=document.querySelector('#sync-status');
let bulkUpdateRunning=false;
let completedCount=0;
const errorText=error=>error instanceof Error?error.message:String(error);

const progressRoot=document.createElement('div');
progressRoot.className='pw-update-progress';
progressRoot.hidden=true;
progressRoot.innerHTML='<div class="pw-update-progress__copy"><strong data-pw-update-stage>Syncing shelf</strong><span data-pw-update-count>0 / 0</span></div><div class="pw-update-progress__track"><i data-pw-update-bar></i></div>';
document.querySelector('.command-deck')?.append(progressRoot);
const progressStage=progressRoot.querySelector('[data-pw-update-stage]');
const progressCount=progressRoot.querySelector('[data-pw-update-count]');
const progressBar=progressRoot.querySelector('[data-pw-update-bar]');

async function fetchLiveRegistry(){
  const snapshot=await requestRegistry({force:true});
  return snapshot.apps.filter(app=>app&&app.status!=='archived'&&typeof app.slug==='string'&&typeof app.path==='string'&&typeof app.version==='string');
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
  refreshButton.textContent=total?`${completed}/${total}` : 'Update apps';
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
    window.dispatchEvent(new CustomEvent('pocketworks:registry-snapshot',{
      detail:{apps,source:'bulk-update'}
    }));

    const targets=await installedTargets(apps);
    const onDemand=Math.max(0,apps.length-targets.length);
    const verified=getVerifiedReleases();

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
        updateInstalledApplication(target.app,target.registration,{verified,onStage:stage=>{
        active.set(target.app.slug,`${target.app.name} · ${stage}`);
        showProgress({completed:completedCount,total:targets.length,label:[...active.values()][0]||stage});
          syncStatus.textContent=[...active.values()].slice(0,2).join(' + ');
        }}),
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
    refreshButton.textContent='Update apps';
    setTimeout(()=>{if(!bulkUpdateRunning)progressRoot.hidden=true;},2800);
  }
}

refreshButton?.addEventListener('click', () => { void runBulkUpdate(); });
