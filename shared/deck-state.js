// Independent personal launcher layout. No application storage or cache is touched.
const KEY = 'pocket-works:deck:v1';
const BACKUP_SCHEMA = 'pocket-works-deck-v1';
const DB = 'pocket-works-deck';
const SLUG = /^[a-z0-9-]{1,96}$/;
const KINDS = new Set(['continue','saved','new','projects','random','collection','spotlight']);
const SIZES = new Set(['wide','half','large']);
const VIEWS = new Set(['home','library','archive']);
const DENSITIES = new Set(['comfortable','compact','micro']);

const BASE_WIDGETS = Object.freeze([
  { id: 'continue', kind: 'continue', size: 'large', tag: '', slug: '' },
  { id: 'saved', kind: 'saved', size: 'wide', tag: '', slug: '' },
  { id: 'new', kind: 'new', size: 'wide', tag: '', slug: '' }
]);

export function defaultDeckState() {
  return { view: 'home', density: 'compact', widgets: BASE_WIDGETS.map(w => ({...w})), archived: [],
    projectStages: {}, projectNotes: {}, releaseHistory: {}, order: [], tagFilter: '', archivedSearch: '' };
}
function cleanText(value, max=500) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g,'').slice(0,max) : ''; }
export function cleanDeckState(raw) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const used = new Set();
  const widgets = (Array.isArray(data.widgets) ? data.widgets : BASE_WIDGETS).slice(0,20).flatMap(widget => {
    if (!widget || !KINDS.has(widget.kind) || typeof widget.id !== 'string' ||
        !/^[a-z0-9-]{1,64}$/.test(widget.id) || used.has(widget.id)) return [];
    used.add(widget.id);
    return [{ id:widget.id, kind:widget.kind, size:SIZES.has(widget.size)?widget.size:'wide',
      tag:cleanText(widget.tag,64), slug:SLUG.test(widget.slug)?widget.slug:'' }];
  });
  const stages = {};
  for (const [slug,stage] of Object.entries(data.projectStages || {}).slice(0,2000)) {
    if (SLUG.test(slug) && ['trial','building','kept','archive'].includes(stage)) stages[slug] = stage;
  }
  const notes = {};
  for (const [slug,note] of Object.entries(data.projectNotes || {}).slice(0,2000)) {
    if (SLUG.test(slug) && typeof note === 'string' && note.trim()) notes[slug] = cleanText(note,750);
  }
  const releaseHistory={};
  for(const [slug,items] of Object.entries(data.releaseHistory||{}).slice(0,1200)){
    if(!SLUG.test(slug)||!Array.isArray(items))continue;
    const used=new Set();
    releaseHistory[slug]=items.slice(0,16).flatMap(item=>{
      if(!item||typeof item.version!=='string'||!/^[0-9A-Za-z.+-]{1,40}$/.test(item.version)||used.has(item.version))return [];
      used.add(item.version);
      return [{version:item.version,seenAt:Number.isFinite(item.seenAt)&&item.seenAt>0?item.seenAt:0,
        note:cleanText(item.note,220)}];
    }).slice(0,10);
  }
  return {
    view:VIEWS.has(data.view)?data.view:'home',
    density:DENSITIES.has(data.density)?data.density:'compact',
    widgets,
    archived:[...new Set(Array.isArray(data.archived) ? data.archived.filter(s=>typeof s==='string'&&SLUG.test(s)) : [])].slice(0,2000),
    projectStages:stages, projectNotes:notes, releaseHistory,
    order:[...new Set(Array.isArray(data.order)?data.order.filter(s=>typeof s==='string'&&SLUG.test(s)):[])].slice(0,2000),
    tagFilter:cleanText(data.tagFilter,64), archivedSearch:cleanText(data.archivedSearch,120)
  };
}

export function createDeckStateStore(options={}) {
  const onChange=options.onChange||(()=>{});
  let storage=options.storage;
  let database=options.database;
  if(!Object.hasOwn(options,'storage')){try{storage=globalThis.localStorage;}catch{storage=null;}}
  if(!Object.hasOwn(options,'database')){try{database=globalThis.indexedDB;}catch{database=null;}}
  let state=defaultDeckState(), stamp=0, revision=0, writeQueue=Promise.resolve(), warning='';
  const parse = raw => {try{return JSON.parse(raw||'null');}catch{return null;}};
  let existing;
  try {existing=parse(storage?.getItem(KEY));} catch {storage=null;}
  if(existing?.schema===BACKUP_SCHEMA){state=cleanDeckState(existing.data);stamp=Number(existing.savedAt)||0;}
  const envelope=()=>({schema:BACKUP_SCHEMA,savedAt:stamp,data:cleanDeckState(state)});
  async function withDb(mode,record){
    if(!database?.open)throw Error('IndexedDB unavailable');
    const db=await new Promise((resolve,reject)=>{
      const req=database.open(DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('state'))req.result.createObjectStore('state');};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('state',mode);
      const req=mode==='readonly'?tx.objectStore('state').get('layout'):tx.objectStore('state').put(record,'layout');
      let data;req.onsuccess=()=>{data=req.result;};req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>resolve(data);tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }
  const saveLocal=record=>{try{storage?.setItem(KEY,JSON.stringify(record));warning='';return Boolean(storage);}catch{warning='Device storage unavailable; export your layout to keep changes.';return false;}};
  function save(raw) {
    state=cleanDeckState(raw);revision++;stamp=Math.max(Date.now(),stamp+1);
    const record=envelope();saveLocal(record);onChange({...state});
    writeQueue=writeQueue.catch(()=>{}).then(()=>withDb('readwrite',record)).catch(()=>{});
    return writeQueue;
  }
  async function hydrate(){
    const before=revision;
    try{
      const remote=await withDb('readonly');
      if(remote?.schema===BACKUP_SCHEMA && Number(remote.savedAt)>stamp && before===revision) {
        stamp=Number(remote.savedAt);state=cleanDeckState(remote.data);saveLocal(envelope());onChange({...state});
      } else if(!remote&&before===revision) await withDb('readwrite',envelope());
    }catch{/* No IndexedDB in private browsing; local storage remains usable. */}
    return get();
  }
  function get(){return cleanDeckState(state);}
  function update(change){return save({...get(),...change});}
  function exportBackup(){return {...envelope(),exportedAt:new Date().toISOString()};}
  function importBackup(record){
    if(record?.schema!==BACKUP_SCHEMA || !record.data || typeof record.data!=='object'||Array.isArray(record.data))
      throw new TypeError('Not a PocketWorks layout backup');
    return save(record.data);
  }
  function onStorage(record){
    if(record?.schema!==BACKUP_SCHEMA || !Number.isFinite(record.savedAt)||record.savedAt<=stamp)return false;
    stamp=record.savedAt;revision++;state=cleanDeckState(record.data);onChange(get());return true;
  }
  return {get,save,update,hydrate,flush:()=>writeQueue,exportBackup,importBackup,onStorage,getWarning:()=>warning};
}

export const DECK_WIDGET_KINDS = [
  {kind:'continue',title:'Continue',description:'Return to a recently opened project'},
  {kind:'saved',title:'On my shelf',description:'Favorite applications'},
  {kind:'new',title:'Just made',description:'Recent releases and experiments'},
  {kind:'projects',title:'In progress',description:'Projects selected for further work'},
  {kind:'random',title:'Rediscover',description:'A random work from your library'},
  {kind:'collection',title:'A collection',description:'Projects with a chosen tag'},
  {kind:'spotlight',title:'Spotlight',description:'One selected application'}
];
