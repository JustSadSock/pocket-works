import { readFile, writeFile, mkdir, readdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function visualCatalog(root) {
  const entries=[];
  for(const slug of (await readdir(path.join(root,'apps'))).filter(s=>slugPattern.test(s))) {
    let config; try { config=JSON.parse(await readFile(path.join(root,'apps',slug,'app.config.json'),'utf8')); } catch(error) { if(error.code==='ENOENT') continue; throw error; }
    const evidence=[];
    try { await access(path.join(root,'covers',slug+'.jpg')); evidence.push({path:`covers/${slug}.jpg`,kind:'legacy-cover', note:'Capture commit/state unknown; recapture before final comparison'}); } catch {}
    let memory=null;
    try { memory=JSON.parse(await readFile(path.join(root,'apps',slug,'visual-memory','memory.json'),'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
    entries.push({slug,name:config.name,version:config.version,updatedAt:config.releaseDateTime,
      direction:`apps/${slug}/visual-direction.json`, evidence, memory,
      coverage:memory?.captures?.length?'recorded':evidence.length?'legacy-cover-only':'missing'});
  }
  return {schemaVersion:1,entries:entries.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),note:'No ratings inferred. Missing/legacy evidence is explicit.'};
}
export async function recordMemory(root, slug, manifest) {
  if(!slugPattern.test(slug)) throw Error('Invalid product slug');
  const app=path.join(root,'apps',slug); await access(path.join(app,'app.config.json'));
  if(!manifest || !/^[0-9a-f]{40}$/.test(manifest.commit||'') || !Array.isArray(manifest.viewport) || !manifest.viewport.every(n=>Number.isFinite(n)&&n>0) || manifest.viewport.length!==2 || !manifest.state || !manifest.engine || !manifest.action) throw Error('Capture requires commit, viewport, state, engine and real action');
  if(!Array.isArray(manifest.files)||!manifest.files.length) throw Error('No evidence files');
  if(manifest.feedback) {
    const f=manifest.feedback;
    if(!['user','reviewer'].includes(f.author)||typeof f.text!=='string'||!f.text.trim()||!f.source) throw Error('Feedback requires author, exact text and source; never infer a user rating');
  }
  const dir=path.join(app,'visual-memory'); await mkdir(dir,{recursive:true});
  const copies=[];
  for(const file of manifest.files) {
    const ext=path.extname(file).toLowerCase(); if(!['.png','.jpg','.jpeg','.webp','.webm','.mp4'].includes(ext)) throw Error('Unsupported evidence format');
    const bytes=await readFile(file); const sha256=createHash('sha256').update(bytes).digest('hex');
    const name=sha256+ext; await copyFile(file,path.join(dir,name)); copies.push({path:name,sha256});
  }
  const memoryFile=path.join(dir,'memory.json'); let memory={schemaVersion:1,product:slug,captures:[],feedback:[]};
  try { memory=JSON.parse(await readFile(memoryFile,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  if(memory.product!==slug || !Array.isArray(memory.captures) || !Array.isArray(memory.feedback)) throw Error('Invalid existing memory');
  const capture={commit:manifest.commit,viewport:manifest.viewport,state:manifest.state,engine:manifest.engine,action:manifest.action,files:copies};
  const id=createHash('sha256').update(JSON.stringify(capture)).digest('hex');
  if(!memory.captures.some(c=>c.id===id)) memory.captures.push({id,recordedAt:new Date().toISOString(),...capture});
  if(manifest.feedback) {
    const f=manifest.feedback;
    if(!['user','reviewer'].includes(f.author)||typeof f.text!=='string'||!f.text.trim()||!f.source) throw Error('Feedback requires author, exact text and source; never infer a user rating');
    if(!memory.feedback.some(old=>old.capture===id && old.text===f.text && old.source===f.source)) memory.feedback.push({...f,capture:id});
  }
  await writeFile(memoryFile,JSON.stringify(memory,null,2)+'\n'); return {capture:id,file:memoryFile};
}
async function main() {
  const [command,slug,file]=process.argv.slice(2); const root=process.cwd();
  if(command==='catalog') {
    const out=slug||'quality-artifacts/visual-memory/catalog.json'; await mkdir(path.dirname(out),{recursive:true});
    const catalog=await visualCatalog(root); await writeFile(out,JSON.stringify(catalog,null,2)+'\n'); console.log(`${catalog.entries.length} products indexed: ${out}`);
  } else if(command==='record') console.log(await recordMemory(root,slug,JSON.parse(await readFile(file,'utf8'))));
  else throw Error('Use catalog [output.json] or record <slug> <capture-manifest.json>');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e=>{console.error(e.message);process.exitCode=1;});
