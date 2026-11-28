import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCatalog} from './sample-library.mjs';
import {openLibrary} from './persistent-library.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value,Object.keys(value??{}).sort());
const RIGHTS_FIELDS=['license','redistribution','creator','provenance','sourceUrl','rightsEvidence','pin'];
function recipeScore(recipe){
 return Object.keys(recipe??{}).length+(Array.isArray(recipe?.reviewedRoots)?4:0)+(Number.isFinite(recipe?.midi)?2:0);
}
function readSource({name,root}){
 root=path.resolve(root);
 const index=JSON.parse(readFileSync(path.join(root,'index.json'),'utf8'));
 if(index.approval!=='research-only'||!Array.isArray(index.entries)||!index.entries.length||index.entries.length>512)throw Error('Invalid source laboratory '+name);
 const catalog=createCatalog(index.entries,root);
 const dbFile=path.join(root,'catalog.sqlite');
 if(!existsSync(dbFile))throw Error('Missing source catalog database '+name);
 const db=new DatabaseSync(dbFile);
 try{
  const integrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if(integrity!=='ok')throw Error('Source SQLite integrity failed '+name);
  const count=db.prepare('SELECT count(*) AS n FROM samples').get().n;
  if(count!==index.entries.length)throw Error('Source SQLite inventory mismatch '+name);
  const select=db.prepare('SELECT sha256,metadata FROM samples WHERE id=?');
  for(const entry of index.entries){
   const row=select.get(entry.id);
   if(!row||row.sha256!==entry.sha256||JSON.parse(row.metadata).sha256!==entry.sha256)throw Error('Source SQLite identity mismatch '+name+'/'+entry.id);
   const resolved=catalog.resolve(entry.id),bytes=readFileSync(resolved.file);
   if(digest(bytes)!==entry.sha256)throw Error('Source object checksum mismatch '+name+'/'+entry.id);
  }
 }finally{db.close();}
 return {name,root,entries:index.entries};
}
export function mergeRecordedLibraries({outputRoot,sources,expectedCount}={}){
 if(!Array.isArray(sources)||sources.length<2||sources.length>8||!outputRoot)throw Error('Invalid merge inputs');
 const inputs=sources.map(readSource),byHash=new Map(),idHashes=new Map();
 for(const source of inputs)for(const entry of source.entries){
  const previousHash=idHashes.get(entry.id);
  if(previousHash&&previousHash!==entry.sha256)throw Error('Sample ID maps to different source bytes: '+entry.id);
  idHashes.set(entry.id,entry.sha256);
  const catalog=createCatalog([entry],source.root),{file}=catalog.resolve(entry.id),bytes=readFileSync(file);
  let current=byHash.get(entry.sha256);
  if(!current){
   current={entry:{...entry,tags:[...entry.tags],recipe:{...(entry.recipe??{})}},root:source.root,labs:new Set(),recipes:new Map(),aliases:new Set()};
   byHash.set(entry.sha256,current);
  }else{
   for(const field of RIGHTS_FIELDS)if(JSON.stringify(current.entry[field])!==JSON.stringify(entry[field]))throw Error('Conflicting rights/provenance for identical source '+entry.sha256+' ('+field+')');
   if(current.entry.id!==entry.id)current.aliases.add(entry.id);
   if(recipeScore(entry.recipe)>recipeScore(current.entry.recipe))current.entry.recipe={...(entry.recipe??{})};
   current.entry.tags=[...new Set([...current.entry.tags,...entry.tags])];
  }
  current.labs.add(source.name);
  const recipe=entry.recipe??{};
  current.recipes.set(JSON.stringify(recipe),recipe);
  if(digest(bytes)!==entry.sha256)throw Error('Source changed during merge '+entry.id);
 }
 if(expectedCount!==undefined&&byHash.size!==expectedCount)throw Error('Merged unique source count mismatch: expected '+expectedCount+', received '+byHash.size);
 const merged=[...byHash.values()].map(({entry,root,labs,recipes,aliases})=>({
  entry:{
   ...entry,
   path:'objects/'+entry.sha256+'.wav',
   tags:[...new Set(entry.tags)].sort(),
   sourceLaboratories:[...labs].sort(),
   sourceRecipes:[...recipes.values()],
   dynamicLabels:[...new Set([...recipes.values()].map(r=>r.dynamicLabel).filter(Boolean))].sort(),
   aliases:[...aliases].sort(),
   approval:'research-only'
  },
  root
 })).sort((a,b)=>a.entry.id.localeCompare(b.entry.id));
 outputRoot=path.resolve(outputRoot);
 rmSync(outputRoot,{recursive:true,force:true});mkdirSync(outputRoot,{recursive:true});
 const library=openLibrary(outputRoot);
 let entries;
 try{
  for(const item of merged)library.insert(item.entry,item.root);
  entries=library.list();
  if(entries.length!==merged.length)throw Error('Merged catalog insertion mismatch');
  for(const entry of entries)library.resolve(entry.id);
  writeFileSync(path.join(outputRoot,'index.json'),JSON.stringify({approval:'research-only',version:1,entries},null,2)+'\n');
 }finally{library.close();}
 const db=new DatabaseSync(path.join(outputRoot,'catalog.sqlite'));
 let sqlite;
 try{
  const integrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  const rows=db.prepare('SELECT count(*) AS n FROM samples').get().n;
  const fts=db.prepare('SELECT count(*) AS n FROM search').get().n;
  const violin=db.prepare("SELECT count(*) AS n FROM search WHERE search MATCH 'violin'").get().n;
  if(integrity!=='ok'||rows!==merged.length||fts!==merged.length||violin===0)throw Error('Merged FTS/SQLite verification failed');
  sqlite={integrity,rows,fts,violin};
 }finally{db.close();}
 const byInstrument={};
 for(const entry of entries){
  const key=entry.recipe?.instrument??'unknown';
  byInstrument[key]=(byInstrument[key]??0)+1;
 }
 const report={
  approval:'research-only',
  sources:inputs.map(s=>({name:s.name,entries:s.entries.length})),
  sourceEntries:inputs.reduce((n,s)=>n+s.entries.length,0),
  uniqueSources:entries.length,
  deduplicated:inputs.reduce((n,s)=>n+s.entries.length,0)-entries.length,
  sourceObjectsVerified:inputs.reduce((n,s)=>n+s.entries.length,0),
  sha256Unique:true,
  rightsConflicts:0,
  sqlite,
  byInstrument,
  byArticulation:entries.reduce((out,e)=>{const k=e.recipe?.articulation??'unknown';out[k]=(out[k]??0)+1;return out;},{})
 };
 writeFileSync(path.join(outputRoot,'merge-report.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [output,...specs]=process.argv.slice(2);
 const sources=specs.map(spec=>{
  const at=spec.indexOf('=');
  if(at<1)throw Error('Source must be name=directory');
  return {name:spec.slice(0,at),root:spec.slice(at+1)};
 });
 const report=mergeRecordedLibraries({outputRoot:output,sources,expectedCount:Number(process.env.SOUNDFORGE_EXPECTED_MERGED_SAMPLES??47)});
 console.log(JSON.stringify(report,null,2));
}
