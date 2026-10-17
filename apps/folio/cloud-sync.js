import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {PocketCloudClient} from '../../shared/capabilities/cloud.js';

const OWNER='pocket-works:folio:cloud-owner';
const metadataKey=id=>'pocket-works:folio:cloud-meta:'+id;
const validDoc=d=>d&&typeof d.id==='string'&&/^[\w-]{1,80}$/.test(d.id)&&
 typeof d.title==='string'&&Number.isFinite(d.updatedAt)&&Array.isArray(d.layers);
const clone=d=>typeof structuredClone==='function'?structuredClone(d):JSON.parse(JSON.stringify(d));
const changed=(doc,meta)=>!meta||doc.updatedAt>meta.updatedAt;
const uniqueId=()=>crypto.randomUUID();
export function createFolioCloudSync({loadWorks,putWork,removeWork,onUpdate,getOpenId=()=>null,notify}){
 const status=document.querySelector('#folio-cloud-status');
 const action=document.querySelector('#folio-cloud-action');
 let user=null,client=null,working=false,timer=null,enabled=false,rerun=false;
 let stats={uploads:0,downloads:0,copies:0,deletions:0};
 const setStatus=(label,busy=false)=>{
  status.textContent=label;
  status.dataset.busy=String(busy);
  action.disabled=busy;
  action.textContent=busy?'Синхронизируем…':user?'Синхронизировать':'Войти в Pocket ID';
 };
 const loadMeta=()=>{try{return JSON.parse(localStorage.getItem(metadataKey(user.id))||'{}')}catch{return{}}};
 const saveMeta=meta=>{try{localStorage.setItem(metadataKey(user.id),JSON.stringify(meta))}catch{}};
 const localOwner=()=>{try{return localStorage.getItem(OWNER)}catch{return null}};
 const setOwner=owner=>{try{localStorage.setItem(OWNER,owner)}catch{}};
 async function authorize(manual){
  const identity=await getPocketIdentity({force:true});
  if(!identity?.complete){
   user=null;client=null;enabled=false;
   setStatus('Только на устройстве · войди в Pocket ID');
   return false;
  }
  const former=user?.id;user=identity;client=new PocketCloudClient('folio',user.id);
  const owner=localOwner();
  if(owner!==user.id){
   const docs=await loadWorks();
   // First Pocket ID on this browser inherits its existing local album.
   // A DIFFERENT user must explicitly consent before uploading those files.
   if(!manual&&owner&&docs.length){
    enabled=false;
    setStatus('Другой аккаунт · выбери синхронизацию');
    return false;
   }
   if(!manual&&!owner||!docs.length){setOwner(user.id)}
   else {
   const question=owner
    ?'На этом устройстве есть рисунки другого профиля. Перенести их копии в облако текущего аккаунта? Локальные оригиналы сохранятся.'
    :'Подключить текущий локальный альбом к Pocket ID и загрузить рисунки в облако?';
   if(docs.length&&!confirm(question)) {
    enabled=false;setStatus('Локальные рисунки не загружены');return false;
   }
   setOwner(user.id);
   }
  }
  enabled=true;
  if(former&&former!==user.id)stats={uploads:0,downloads:0,copies:0,deletions:0};
  return true;
 }
 const fork=async doc=>{
  const copy=clone(doc);
  copy.id=uniqueId();copy.title=doc.title+' · локальная версия';copy.updatedAt=Date.now();
  await putWork(copy);stats.copies++;return copy;
 };
 async function push(id,doc,remoteVersion,meta){
  const result=await client.write(id,doc,{baseRevision:remoteVersion,title:doc.title,updatedAt:doc.updatedAt});
  meta[id]={revision:result.item.revision,updatedAt:doc.updatedAt};
  saveMeta(meta);stats.uploads++;
 };
 async function pull(id,meta){
  const value=await client.read(id);
  if(!validDoc(value.document)||value.document.id!==id)throw Error('Облачный рисунок имеет неверный формат');
  await putWork(value.document);
  meta[id]={revision:value.metadata.revision,updatedAt:value.document.updatedAt};
  saveMeta(meta);stats.downloads++;
 };
 async function run({manual=false}={}){
  if(working){rerun=true;return;}
  if(!navigator.onLine){setStatus('Нет сети · рисунки сохранены локально');return}
  working=true;setStatus('Соединяем альбом с Pocket ID…',true);
  let failures=[],deferred=false;
  try{
   if(!await authorize(manual))return;
   setStatus('Сверяем версии рисунков…',true);
   const remote=await client.list();
   const meta=loadMeta();
   const local=new Map((await loadWorks()).filter(validDoc).map(d=>[d.id,d]));
   const remoteIds=new Set();
   const forks=[];
   stats={uploads:0,downloads:0,copies:0,deletions:0};
   for(const item of remote.items){
    const id=item.id,doc=local.get(id),prior=meta[id];
    remoteIds.add(id);
    if(getOpenId()===id){
     // Never replace a live editor's document. Safe outgoing saves can still be
     // uploaded if the server's revision has not moved since our last snapshot.
     if(doc&&!item.deleted&&prior&&changed(doc,prior)&&item.revision===prior.revision){
      try{await push(id,doc,item.revision,meta)}catch(error){failures.push(doc.title+': '+error.message)}
     }else deferred=true;
     continue;
    }
    try{
     if(item.deleted){
      if(doc){
       if(changed(doc,prior))forks.push(await fork(doc));
       await removeWork(id);local.delete(id);
      }
      meta[id]={revision:item.revision,updatedAt:0,deleted:true};saveMeta(meta);
      continue;
     }
     if(!doc){
      // When a user deletes a previously synced local drawing, propagate the deletion.
      if(prior&&!prior.deleted&&item.revision===prior.revision){
       const result=await client.remove(id,item.revision);
       meta[id]={revision:result.revision,updatedAt:0,deleted:true};stats.deletions++;saveMeta(meta);
      }else await pull(id,meta);
      continue;
     }
     if(!prior){
      // Same UUID from another device: preserve both documents.
      forks.push(await fork(doc));await pull(id,meta);continue;
     }
     const dirty=changed(doc,prior),serverChanged=item.revision!==prior.revision;
     if(dirty&&serverChanged){
      forks.push(await fork(doc));await pull(id,meta);
     }else if(dirty){
      await push(id,doc,item.revision,meta);
     }else if(serverChanged){
      await pull(id,meta);
     }
    }catch(error){failures.push(doc?.title||item.title||id+': '+error.message)}
   }
   for(const [id,doc] of [...local,...forks.map(d=>[d.id,d])]){
    if(remoteIds.has(id))continue;
    try{await push(id,doc,0,meta)}
    catch(error){failures.push(doc.title+': '+error.message)}
   }
   await onUpdate();
   if(failures.length){
    setStatus('Часть работ осталась только на устройстве · '+failures.length+' ошибок');
    notify(failures[0].slice(0,140));
   }else {
    const total=stats.uploads+stats.downloads+stats.copies+stats.deletions;
    setStatus(deferred?'Открытый рисунок сверим после выхода в альбом':total
      ?'Облако готово · ↑'+stats.uploads+' ↓'+stats.downloads+(stats.copies?' · '+stats.copies+' версии сохранены':'')
      :'Все рисунки синхронизированы');
   }
  }catch(error){
   setStatus('Облако недоступно · рисунки сохранены локально');
   if(manual)notify(error.message||'Ошибка синхронизации');
  }finally{working=false;if(rerun){rerun=false;schedule()}}
 }
 function schedule(){
  if(!enabled)return;
  clearTimeout(timer);
  timer=setTimeout(()=>{void run()},2200);
 }
 function start(){void authorize(false).then(ok=>{if(ok)void run()}).catch(()=>setStatus('Локальный режим'))}
 action.addEventListener('click',()=>{if(!user){location.assign('/?pocket-id=login');return}void run({manual:true})});
 window.addEventListener('online',()=>schedule());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void run()});
 return {start,schedule,sync:()=>run({manual:true})};
}
