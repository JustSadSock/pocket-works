import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {PocketCloudClient} from '../../shared/capabilities/cloud.js';
const OWNER='pocket-works:zamazka:cloud-owner';
const META=id=>'pocket-works:zamazka:cloud-meta:'+id;
const SIGNATURE=data=>JSON.stringify(data);
const keyOf=g=>String(g.time)+'/'+g.art+'/'+g.variation+'/'+JSON.stringify(g.strokes||[]).length;
function combine(local,remote){
 const byKey=new Map();
 for(const g of [...remote,...local]){
  if(!g||!Number.isFinite(g.time)||!Number.isFinite(g.art)||!Array.isArray(g.strokes))continue;
  byKey.set(keyOf(g),g);
 }
 return [...byKey.values()].sort((a,b)=>b.time-a.time).slice(0,96);
}
const hash=async value=>{
 const bytes=new TextEncoder().encode(SIGNATURE(value));
 const sum=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(sum,n=>n.toString(16).padStart(2,'0')).join('');
};
export function createZamazkaCloud({getArchive,setArchive,getEmblem,setEmblem,notify}){
 let user=null,client=null,working=false,enabled=false,timer=null;
 let status='Только на этом устройстве';
 const render=()=>{
  document.querySelectorAll('[data-cloud-status]').forEach(el=>el.textContent=status);
  document.querySelectorAll('[data-action="cloud-sync"]').forEach(el=>{el.disabled=working;el.textContent=working?'Синхронизация…':'☁ Синхронизировать'});
 };
 const update=(s)=>{status=s;render()};
 const getMeta=id=>{try{return JSON.parse(localStorage.getItem(META(user.id)+':'+id)||'null')}catch{return null}};
 const saveMeta=(id,data)=>{try{localStorage.setItem(META(user.id)+':'+id,JSON.stringify(data))}catch{}};
 async function allow(manual){
  const identity=await getPocketIdentity({force:true});
  if(!identity?.complete){user=null;client=null;enabled=false;update('Войди в Pocket ID для облака');return false}
  user=identity;client=new PocketCloudClient('zamazka');
  const owner=localStorage.getItem(OWNER);
  if(owner&&owner!==user.id){
   if(!manual){enabled=false;update('Другой аккаунт · требуется подтверждение');return false}
   if(!confirm('На устройстве есть работы другого Pocket ID. Добавить их копии в этот аккаунт? Исходные файлы останутся локально.')){
    update('Синхронизация отменена');return false;
   }
  }
  try{localStorage.setItem(OWNER,user.id)}catch{}
  enabled=true;return true;
 }
 async function put(id,doc,revision,label){
  const data=await client.write(id,doc,{baseRevision:revision,title:label,updatedAt:Date.now()});
  saveMeta(id,{revision:data.item.revision,signature:await hash(doc)});
  return data.item;
 }
 async function archiveSync(items){
  const local=getArchive(),prior=getMeta('archive');
  const found=items.find(x=>x.id==='archive'&&!x.deleted);
  if(!found){
   if(local.length)await put('archive',local,items.find(x=>x.id==='archive')?.revision||0,'Реставрации');
   return;
  }
  const remote=(await client.read('archive')).document;
  if(!Array.isArray(remote))throw Error('Повреждённый архив в облаке');
  const merged=combine(local,remote);
  const localHash=await hash(local),remoteHash=await hash(remote),mergedHash=await hash(merged);
  if(localHash!==mergedHash)setArchive(merged);
  if(remoteHash!==mergedHash){
   await put('archive',merged,found.revision,'Реставрации');
  }else if(!prior||prior.signature!==mergedHash||prior.revision!==found.revision){
   saveMeta('archive',{revision:found.revision,signature:mergedHash});
  }
 }
 async function emblemSync(items,manual){
  const local=getEmblem(),prior=getMeta('emblem');
  const found=items.find(x=>x.id==='emblem'&&!x.deleted);
  if(!found){
   if(local?.strokes?.length)await put('emblem',local,items.find(x=>x.id==='emblem')?.revision||0,'Личный знак');
   return;
  }
  const remote=(await client.read('emblem')).document;
  if(!remote||!Array.isArray(remote.strokes)||typeof remote.image!=='string')throw Error('Облачный знак повреждён');
  const lh=await hash(local),rh=await hash(remote);
  if(lh===rh){saveMeta('emblem',{revision:found.revision,signature:lh});return}
  const dirty=prior&&prior.signature!==lh;
  const serverChanged=prior&&prior.revision!==found.revision;
  if(!local?.strokes?.length||prior&&!dirty&&serverChanged){
   setEmblem(remote);saveMeta('emblem',{revision:found.revision,signature:rh});return;
  }
  if(prior&&dirty&&!serverChanged){
   await put('emblem',local,found.revision,'Личный знак');return;
  }
  if(!manual){
   update('Знаки на устройствах отличаются · выбери версию вручную');
   return 'conflict';
  }
  const fromCloud=confirm('Личный знак отличается. OK — применить облачный знак. Отмена — оставить и загрузить текущий. Вторая версия будет сохранена в локальном резерве.');
  const backup=fromCloud?local:remote;
  try{localStorage.setItem('pocket-works:zamazka:emblem-cloud-backup:'+Date.now(),JSON.stringify(backup))}catch{}
  if(fromCloud){setEmblem(remote);saveMeta('emblem',{revision:found.revision,signature:rh})}
  else await put('emblem',local,found.revision,'Личный знак');
 }
 async function sync(manual=false){
  if(working)return;
  if(!navigator.onLine){update('Нет сети · фонд сохранён локально');return}
  working=true;update('Обновляем личный фонд…');
  try{
   if(!await allow(manual))return;
   const list=(await client.list()).items;
   // Archive is a mergeable collection: paintings from both devices survive.
   // On optimistic-write conflict, retry against the latest cloud archive.
   try{await archiveSync(list)}catch(error){
    if(error.code==='revision_conflict')await archiveSync((await client.list()).items);
    else throw error;
   }
   const emblemConflict=await emblemSync((await client.list()).items,manual);
   if(!emblemConflict)update('Фонд и личный знак синхронизированы');
  }catch(error){
   update('Ошибка облака · локальные рисунки не затронуты');
   if(manual)notify(error.message||'Не удалось синхронизировать');
  }finally{working=false;render()}
 }
 function schedule(){if(!enabled)return;clearTimeout(timer);timer=setTimeout(()=>void sync(),1500)}
 function start(){void sync();window.addEventListener('online',()=>schedule());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync()})}
 return {start,schedule,sync:()=>sync(true),render};
}
