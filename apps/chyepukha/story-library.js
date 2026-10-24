// Completed manuscripts stay on this device. PocketNet v1–v3 remain unchanged.
export const MAX_EDITIONS = 12;
const shorten=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';
export const storyText=story=>(story?.fragments||[]).map(f=>f.answer).join('\n\n');
function cleanStory(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.fragments))return null;
 const fragments=raw.fragments.slice(0,16).filter(f=>f&&typeof f.answer==='string').map(f=>({
  question:shorten(f.question,160),author:shorten(f.author,48),answer:shorten(f.answer,800)
 }));
 if(!fragments.length)return null;
 const story={id:shorten(raw.id,64),starter:shorten(raw.starter,48),setLabel:shorten(raw.setLabel,90),
  genre:shorten(raw.genre,90),heroGender:shorten(raw.heroGender,20),fragments};
 story.text=storyText(story);
 return story;
}
export function normalizeEditions(raw){
 if(!Array.isArray(raw))return [];
 const found=new Set();
 return raw.slice(0,MAX_EDITIONS*3).map(item=>{
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||found.has(item.id))return null;
  const stories=Array.isArray(item.stories)?item.stories.slice(0,8).map(cleanStory).filter(Boolean):[];
  if(!stories.length)return null;
  const edition={id:shorten(item.id,160),savedAt:Number.isFinite(item.savedAt)?Math.max(0,item.savedAt):0,
   playerCount:Number.isInteger(item.playerCount)?Math.max(2,Math.min(8,item.playerCount)):2,favorite:item.favorite===true,stories};
  found.add(edition.id);return edition;
 }).filter(Boolean).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.savedAt-a.savedAt).slice(0,MAX_EDITIONS);
}
export function addFinishedEdition(existing,room,state,savedAt=Date.now()){
 const editions=normalizeEditions(existing);
 if(state?.phase!=='finished'||!Array.isArray(state.stories)||!state.stories.length||!room)return editions;
 // Room revisions are monotonic across consecutive games and stable across reconnects.
 const id=shorten(String(room),100)+':'+(Number.isInteger(state.issue)&&state.issue>0?'issue-'+state.issue:String(Number.isInteger(state.revision)?state.revision:0));
 if(editions.some(item=>item.id===id))return editions;
 const next=normalizeEditions([{id,savedAt,playerCount:state.players?.length||2,stories:state.stories},...editions]);
 return next;
}
export const removeEdition=(editions,id)=>normalizeEditions(editions).filter(item=>item.id!==id);
export function readEditions(storage,key){
 try{const raw=storage.getItem(key);return normalizeEditions(raw?JSON.parse(raw):[])}catch{return []}
}
export function writeEditions(storage,key,editions){
 const list=normalizeEditions(editions);
 // Trim oldest editions on quota exhaustion; never replace a good archive with an empty value.
 for(let n=list.length;n>0;n--){
  try{storage.setItem(key,JSON.stringify(list.slice(0,n)));return true}catch{}
 }
 return false;
}

/** Search never mutates storage. Matching one chapter preserves its entire story for reading. */
export function searchEditions(raw,query=''){
 const editions=normalizeEditions(raw),needle=String(query).trim().toLocaleLowerCase('uk-UA').slice(0,120);
 if(!needle)return editions;
 return editions.map(edition=>{
  const issueMatches=[edition.id,new Date(edition.savedAt).toLocaleDateString('uk-UA')].some(x=>x.toLocaleLowerCase('uk-UA').includes(needle));
  const stories=issueMatches?edition.stories:edition.stories.filter(story=>
   [story.starter,story.setLabel,story.genre,...story.fragments.flatMap(f=>[f.author,f.question,f.answer])]
    .some(x=>String(x||'').toLocaleLowerCase('uk-UA').includes(needle)));
  return stories.length?{...edition,stories}:null;
 }).filter(Boolean);
}
export function toggleEditionFavorite(raw,id){
 const list=normalizeEditions(raw);
 if(!list.some(item=>item.id===id))return list;
 return normalizeEditions(list.map(item=>item.id===id?{...item,favorite:!item.favorite}:item));
}
export const ARCHIVE_BACKUP_VERSION=1;
export const MAX_BACKUP_BYTES=3_000_000;
export function createArchiveBackup(raw,createdAt=Date.now()){
 const editions=normalizeEditions(raw);
 return JSON.stringify({format:'pocketworks-chyepukha-archive',version:ARCHIVE_BACKUP_VERSION,createdAt,editions},null,2);
}
export function parseArchiveBackup(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)
  throw Error('Файл архіву занадто великий (до 3 МБ).');
 let backup;
 try{backup=JSON.parse(text)}catch{throw Error('Файл не містить коректного JSON.')}
 if(!backup||backup.format!=='pocketworks-chyepukha-archive'||backup.version!==ARCHIVE_BACKUP_VERSION||
   !Array.isArray(backup.editions))throw Error('Це не резервна копія архіву «Чепухи».');
 if(backup.editions.length>MAX_EDITIONS*3)throw Error('У резервній копії забагато випусків.');
 if(backup.editions.length&&!normalizeEditions(backup.editions).length)throw Error('У файлі немає коректних рукописів.');
 return normalizeEditions(backup.editions);
}
export function mergeArchiveBackup(existing,imported){
 const current=normalizeEditions(existing);
 const incoming=normalizeEditions(imported);
 // Local changes win on duplicate issue IDs; backup restores missing issues only.
 const known=new Set(current.map(x=>x.id));
 const additions=incoming.filter(x=>!known.has(x.id));
 const editions=normalizeEditions([...current,...additions]);
 return {editions,added:editions.filter(x=>!known.has(x.id)).length};
}
