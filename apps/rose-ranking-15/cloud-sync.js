import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {PocketCloudClient} from '../../shared/capabilities/cloud.js';
import {cleanEpisode} from './model.js';

// One cloud item per episode: editing series 2 offline cannot erase series 3.
const APP='rose-ranking-15';
const META='pocket-works:rose-ranking-15:sync:';
const CONFLICTS='pocket-works:rose-ranking-15:conflicts:';
const KEY=id=>META+id;
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const itemId=n=>'episode-'+n;
const episodeNumber=id=>/^episode-(?:[1-9]|[1-9][0-9]|100)$/.test(id)?Number(id.slice(8)):null;
const normalizeDoc=(id,document,ids)=>{
 if(id==='profile'){
  if(!document||document.type!=='profile'||typeof document.nicknames!=='object')throw Error('Недопустимый профиль');
  const names={};
  for(const [key,value] of Object.entries(document.nicknames||{}))if(ids.includes(key)&&typeof value==='string')names[key]=value.slice(0,38);
  return {type:'profile',nicknames:names,showAll:document.showAll!==false,current:Number.isInteger(document.current)&&document.current>=1&&document.current<=100?document.current:1,edited:Math.max(0,Number(document.edited)||0)};
 }
 const n=episodeNumber(id);
 if(!n||document?.type!=='episode'||document.number!==n)throw Error('Недопустимая серия');
 const ep=cleanEpisode(document.data,ids);
 return {type:'episode',number:n,data:ep};
};
const getMeta=(account)=>{try{return JSON.parse(localStorage.getItem(KEY(account))||'{}')}catch{return{}}};
const saveMeta=(account,meta)=>{try{localStorage.setItem(KEY(account),JSON.stringify(meta))}catch{}};
const readConflicts=account=>{try{return JSON.parse(localStorage.getItem(CONFLICTS+account)||'[]')}catch{return[]}};
function preserveConflict(account,id,local){
 const history=readConflicts(account);
 if(history.some(record=>record.id===id&&same(record.data,local)))return;
 history.unshift({id,data:clone(local),at:Date.now()});
 try{localStorage.setItem(CONFLICTS+account,JSON.stringify(history.slice(0,20)))}catch{}
}
function docsFromState(state){
 const docs=new Map();
 docs.set('profile',{type:'profile',nicknames:clone(state.nicknames),showAll:state.showAll,current:state.current,edited:state.profileEdited||0});
 for(const [key,ep] of Object.entries(state.episodes)){
  const n=Number(key);
  if(Number.isInteger(n)&&n>=1&&n<=100)docs.set(itemId(n),{type:'episode',number:n,data:clone(ep)});
 }
 return docs;
}
export function createRoseCloudSync({ids,getState,setCloudDocument,activateAccount,notify}){
 const status=document.getElementById('cloudStatus');
 const button=document.getElementById('cloudAction');
 let identity=null,client=null,working=false,enabled=false,rerun=false,timer=null,epoch=0;
 const setStatus=(message,busy=false)=>{
  status.textContent=message;status.dataset.busy=String(busy);
  button.disabled=busy;
  button.textContent=busy?'Синхронизация…':identity?'Обновить':'Войти в Pocket ID';
 };
 function schedule(delay=1300){
  if(!enabled)return;
  clearTimeout(timer);
  timer=setTimeout(()=>void sync(),delay);
 }
 async function authorize(){
  const user=await getPocketIdentity({force:true});
  if(!user?.complete){
   let cachedAccount=false;
   try{cachedAccount=Boolean(localStorage.getItem('pocket-works:rose-ranking-15:last-active-account'))}catch{}
   if(identity||cachedAccount){identity=null;client=null;enabled=false;epoch++;await activateAccount(null);}
   identity=null;client=null;enabled=false;
   setStatus('Только на устройстве · войди в Pocket ID');
   return false;
  }
  if(user.id!==identity?.id){
   epoch++;
   clearTimeout(timer);
   identity=user;
   client=new PocketCloudClient(APP,user.id);
   enabled=true;
   await activateAccount(user.id);
  }
  return true;
 }
 async function sync({manual=false}={}){
  if(working){rerun=true;return;}
  if(!navigator.onLine){setStatus('Нет сети · сохранено локально');return;}
  working=true;
  setStatus('Проверяем Pocket ID…',true);
  try{
   if(!await authorize())return;
   const account=identity.id,runEpoch=epoch;
   const cloud=client,remote=await cloud.list();
   if(epoch!==runEpoch)return;
   const original=getMeta(account);
   const meta={...original};
   const docs=docsFromState(getState());
   const items=new Map(remote.items.filter(item=>!item.deleted).map(item=>[item.id,item]));
   let uploads=0,downloads=0,conflicts=0;
   for(const id of new Set([...docs.keys(),...items.keys()])){
    if(epoch!==runEpoch)return;
    if(id!=='profile'&&episodeNumber(id)===null)continue;
    const row=items.get(id),before=meta[id]||null;
    const local=docs.get(id);
    // Keep a text snapshot of our last confirmed common revision.
    const dirty=local && (!before||!same(local,before.snapshot));
    if(!row){
     if(!local)continue;
     try{
      const result=await cloud.write(id,local,{baseRevision:0,title:id==='profile'?'Прозвища и настройки':'Серия '+episodeNumber(id),updatedAt:Date.now()});
      meta[id]={revision:result.item.revision,snapshot:local};
      uploads++;
     }catch(e){if(e.code!=='revision_conflict')throw e;rerun=true;}
     saveMeta(account,meta);
     continue;
    }
    const remoteChanged=!before||before.revision!==row.revision;
    if(!remoteChanged&&!dirty)continue;
    if(dirty&&!remoteChanged){
     try{
      const result=await cloud.write(id,local,{baseRevision:row.revision,title:id==='profile'?'Прозвища и настройки':'Серия '+episodeNumber(id),updatedAt:Date.now()});
      meta[id]={revision:result.item.revision,snapshot:local};
      uploads++;
     }catch(e){if(e.code!=='revision_conflict')throw e;rerun=true;}
     saveMeta(account,meta);
     continue;
    }
    if(remoteChanged){
     // If both sides were edited, preserve the complete losing local version.
     // Avoid overwriting active editors before their current changes are saved.
     if(document.querySelector('#modalRoot:not([hidden])')){rerun=true;continue;}
     const read=await cloud.read(id);
     if(epoch!==runEpoch)return;
     const remoteDoc=normalizeDoc(id,read.document,ids);
     const latest=docsFromState(getState()).get(id);
     if(local&&!same(latest,local)){rerun=true;continue;}
     if(local&&dirty&&!same(local,remoteDoc)){
      const meaningful=id==='profile'?(Object.keys(local.nicknames||{}).length>0||local.edited>0):local.data?.edited>0;
      if(meaningful){preserveConflict(account,id,local);conflicts++;}
     }
     if(!same(local,remoteDoc)){
      await setCloudDocument(id,remoteDoc);
      downloads++;
     }
     meta[id]={revision:read.metadata.revision,snapshot:remoteDoc};
     saveMeta(account,meta);
    }
   }
   if(epoch!==runEpoch)return;
   setStatus('Pocket Cloud · ↑'+uploads+' ↓'+downloads+(conflicts?' · '+conflicts+' копий сохранено':'') );
   if(conflicts)notify('Изменения с другого устройства: конфликтные версии сохранены в архиве');
  }catch(error){
   setStatus('Облако недоступно · данные на устройстве');
   if(manual)notify(error.message||'Не удалось синхронизировать');
  }finally{
   working=false;
   if(rerun){rerun=false;schedule(2500);}
  }
 }
 function start(){
  void sync();
  window.addEventListener('online',()=>schedule(300));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync()});
  window.addEventListener('focus',()=>{void sync()});
  button.addEventListener('click',()=>{
   if(!identity){location.assign('/?pocket-id=login');return;}
   void sync({manual:true});
  });
 }
 return {
  start,schedule,sync:()=>sync({manual:true}),
  conflicts:()=>identity?readConflicts(identity.id):[],
  account:()=>identity?.id||null,
  clearConflict:index=>{
   if(!identity)return;
   const entries=readConflicts(identity.id);
   entries.splice(index,1);
   try{localStorage.setItem(CONFLICTS+identity.id,JSON.stringify(entries))}catch{}
  }
 };
}
