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
   playerCount:Number.isInteger(item.playerCount)?Math.max(2,Math.min(8,item.playerCount)):2,stories};
  found.add(edition.id);return edition;
 }).filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt).slice(0,MAX_EDITIONS);
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
