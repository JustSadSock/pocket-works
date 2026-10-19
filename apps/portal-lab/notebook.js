/**
 * ШОВ 1.0 — versioned, fully local scientific experiment notebook.
 *
 * A record freezes (1) preparation parameters used to reconstruct a NEW run,
 * (2) observed measurements at capture time. An observed state is NOT faked
 * on restore: it is retained immutably as a historic record, and the mode's
 * solver is restarted with exactly the captured initial conditions.
 */
export const NOTEBOOK_SCHEMA="shov-experiments-v1";
export const NOTEBOOK_MAX=32;
export const MODE_LABELS=Object.freeze({
 observer:"Наблюдатель",matter:"Материя",wave:"Волны",designer:"Конструктор",
 rotation:"Вращение",causality:"Причинность",atlas:"Атлас",
 map:"Топология",profile:"Профиль"
});
const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function finite(n){return typeof n==="number"&&Number.isFinite(n);}
function title(t){
 if(typeof t!=="string")throw Error("Название опыта должно быть текстом");
 const v=t.trim().replace(/\s+/g," ");
 if(!v||v.length>80)throw Error("Название должно содержать от 1 до 80 символов");
 return v;
}
function cleanParams(value,where,depth=0){
 if(depth>5)throw Error("Слишком сложные параметры "+where);
 if(value===null||typeof value==="boolean")return value;
 if(finite(value))return value;
 if(typeof value==="string"&&value.length<=256)return value;
 if(Array.isArray(value)){
  if(value.length>40)throw Error("Слишком много элементов в "+where);
  return value.map((x,i)=>cleanParams(x,where+"."+i,depth+1));
 }
 if(plain(value)){
  const keys=Object.keys(value);
  if(keys.length>32)throw Error("Слишком много свойств в "+where);
  const out={};
  for(const key of keys){
   if(!/^[a-zA-Z][\w-]{0,35}$/.test(key)||["__proto__","constructor","prototype"].includes(key))
    throw Error("Некорректное поле "+where);
   Object.defineProperty(out,key,{value:cleanParams(value[key],where+"."+key,depth+1),
    writable:true,enumerable:true,configurable:true});
  }
  return out;
 }
 throw Error("Неподдерживаемое значение "+where);
}
function cleanMetrics(value){
 if(!plain(value)||Object.keys(value).length<1||Object.keys(value).length>18)
  throw Error("Нужны численные измерения опыта");
 const out={};
 for(const [key,item] of Object.entries(value)){
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(key)||!plain(item)||
     !finite(item.value)||typeof item.unit!=="string"||item.unit.length>22||
     typeof item.label!=="string"||item.label.length>58||!item.label)
   throw Error("Некорректное измерение: "+key);
  out[key]={value:item.value,label:item.label,unit:item.unit};
 }
 return out;
}
export function makeRecord(raw){
 if(!plain(raw))throw Error("Ожидалась запись опыта");
 if(!hasOwn(MODE_LABELS,raw.mode))throw Error("Неизвестный режим опыта");
 const id=raw.id;
 if(typeof id!=="string"||!/^[a-zA-Z0-9_-]{5,70}$/.test(id))
  throw Error("Некорректный идентификатор опыта");
 const at=raw.at;
 if(!finite(at)||at<0||at>1e15)throw Error("Некорректное время опыта");
 if(!plain(raw.metric)||!plain(raw.setup))throw Error("Отсутствует исходная конфигурация");
 const metric=cleanParams(raw.metric,"metric"),setup=cleanParams(raw.setup,"setup");
 if(JSON.stringify(metric).length>1500||JSON.stringify(setup).length>3500)
  throw Error("Слишком большой протокол подготовки");
 return {id,at,mode:raw.mode,title:title(raw.title),metric,setup,
  measures:cleanMetrics(raw.measures),note:raw.note?title(String(raw.note)).slice(0,80):""};
}
export function createRecord({id,at,mode,title:label,metric,setup,measures,note}){
 return makeRecord({id,at,mode,title:label||MODE_LABELS[mode],metric,setup,measures,note});
}
export function validateRecords(records){
 if(!Array.isArray(records)||records.length>NOTEBOOK_MAX)
  throw Error("Слишком много записей — максимум "+NOTEBOOK_MAX);
 const ids=new Set(),clean=[];
 for(const record of records){
  const item=makeRecord(record);
  if(ids.has(item.id))throw Error("Повторяющийся ID в журнале");
  ids.add(item.id);clean.push(item);
 }
 return clean;
}
export function appendRecord(records,record){
 const current=validateRecords(records),r=makeRecord(record);
 if(current.some(x=>x.id===r.id))throw Error("Запись с этим ID уже существует");
 // Keep 32 most recent and do not mutate caller.
 return [...current,r].slice(-NOTEBOOK_MAX);
}
export function removeRecord(records,id){
 const current=validateRecords(records);
 return current.filter(x=>x.id!==id);
}
export function renameRecord(records,id,nextTitle){
 const safe=title(nextTitle);
 return validateRecords(records).map(x=>x.id===id?{...x,title:safe}:x);
}
export function compareRecords(left,right){
 const a=makeRecord(left),b=makeRecord(right);
 const keys=new Set([...Object.keys(a.measures),...Object.keys(b.measures)]);
 const rows=[];
 for(const key of keys){
  const x=a.measures[key],y=b.measures[key];
  // Only compare values if they mean the same measurement AND have the same unit.
  const comparable=!!(x&&y&&x.unit===y.unit&&x.label===y.label);
  rows.push({key,label:x?.label||y.label,unit:x?.unit||y.unit,
   left:x?.value??null,right:y?.value??null,
   comparable,delta:comparable?y.value-x.value:null});
 }
 return {left:{id:a.id,title:a.title,mode:a.mode},right:{id:b.id,title:b.title,mode:b.mode},
  sameMode:a.mode===b.mode,rows,
  shared:rows.filter(r=>r.comparable).length};
}
export function exportNotebook(records){
 return JSON.stringify({schema:NOTEBOOK_SCHEMA,exportedAt:new Date().toISOString(),
  app:"portal-lab",records:validateRecords(records)},null,2);
}
export function importNotebook(raw,current=[],mode="merge"){
 if(typeof raw!=="string"||raw.length>250000)throw Error("Слишком большой файл журнала");
 let data;
 try{data=JSON.parse(raw)}catch{throw Error("Повреждённый JSON")}
 if(!plain(data)||data.schema!==NOTEBOOK_SCHEMA||data.app!=="portal-lab")
  throw Error("Неизвестная версия формата. Нужен SHOV experiments v1");
 const imported=validateRecords(data.records),existing=validateRecords(current);
 if(mode==="replace")return imported;
 if(mode!=="merge")throw Error("Некорректный режим импорта");
 const merged=new Map(existing.map(x=>[x.id,x]));
 for(const x of imported){
  if(merged.has(x.id)){
   if(JSON.stringify(merged.get(x.id))===JSON.stringify(x))continue;
   // Colliding ID with conflicting data is not silently overwritten.
   throw Error("Конфликт ID: "+x.id);
  }
  merged.set(x.id,x);
 }
 return [...merged.values()].sort((a,b)=>a.at-b.at).slice(-NOTEBOOK_MAX);
}
export function metric(value,label,unit=""){
 if(!finite(value))return null;
 return {value,label,unit};
}
