// Register original procedural effects in a separate research-only library.
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {expandManifest} from './foundation.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-artistic-lab');
const jobs=expandManifest(JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8')));
const taxonomy={
 'boot-earth':['movement','footstep','earth','soil','infantry'],
 'hoof-earth':['movement','hoof','earth','cavalry'],
 'armor-leather':['equipment','armor','leather','metal','friction'],
 'shield-wood':['impact','shield','wood','metal','combat']
};
const entries=[],metrics=[];
for(const j of jobs){
 const file=path.join(root,j.output),bytes=readFileSync(file),sha256=createHash('sha256').update(bytes).digest('hex');
 const raw=execFileSync('sox',['-R',file,'-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-'],{maxBuffer:32*1024*1024});
 if(!raw.length||raw.length%8)throw Error('Invalid rendered PCM '+j.name);
 let peak=0,energy=0;
 for(let i=0;i<raw.length;i+=4){
  const v=raw.readFloatLE(i);if(!Number.isFinite(v))throw Error('Invalid sample');
  peak=Math.max(peak,Math.abs(v));energy+=v*v;
 }
 if(peak>=.999||energy<=0)throw Error('Silent or clipped audition '+j.name);
 metrics.push({name:j.name,file:j.output,sha256,seconds:raw.length/8/48000,peak,rms:Math.sqrt(energy/(raw.length/4)),kind:j.type});
 if(j.type==='physics')entries.push({id:j.name,path:j.output,sha256,title:j.name.replaceAll('-',' '),creator:'Pocket Works Sound Forge',license:'original',redistribution:true,provenance:'Deterministic original procedural model '+j.model+'; seed '+j.seed+'; strength '+j.strength,tags:[...taxonomy[j.model],'procedural','research-only'],approval:'research-only',recipe:{model:j.model,seed:j.seed,strength:j.strength}});
}
if(entries.length!==24||metrics.length!==30||new Set(entries.map(e=>e.sha256)).size!==24)throw Error('Unexpected audition inventory');
const vault=path.join(root,'library');mkdirSync(vault,{recursive:true});
const lib=openLibrary(vault);
try{
 for(const e of entries)lib.insert(e,root);
 if(lib.list().length!==24||lib.list('earth').length!==12||lib.list('shield wood').length!==6)throw Error('Search index mismatch');
 for(const e of entries)lib.resolve(e.id);
 writeFileSync(path.join(vault,'index.json'),JSON.stringify({approval:'research-only',entries:lib.list()},null,2)+'\n');
}finally{lib.close();}
// Matched RMS A/B comparisons use attenuation only, avoiding loudness bias
// from peak-normalizing a more dynamic performance.
const comparisons=[];
mkdirSync(path.join(root,'comparisons'),{recursive:true});
for(const id of ['moorland','last-standard','iron-horizon']){
 const pair=['control','expressive'].map(mode=>metrics.find(m=>m.name===id+'-'+mode));
 const target=Math.min(...pair.map(m=>m.rms));
 const gains=pair.map(m=>target/m.rms);
 const out='comparisons/'+id+'-AB.wav';
 const pieces=[];
 for(let i=0;i<2;i++){
  const file=path.join(root,'comparisons',id+'-'+i+'.wav');
  execFileSync('sox',['-R',path.join(root,pair[i].file),file,'vol',String(gains[i])]);
  pieces.push(file);
 }
 const silence=path.join(root,'comparisons','gap.wav');
 execFileSync('sox',['-R','-n','-r','48000','-c','2','-b','16',silence,'trim','0','.7']);
 execFileSync('sox',['-R',pieces[0],silence,pieces[1],path.join(root,out)]);
 comparisons.push({file:out,order:['control','expressive'],targetRms:target,gains,secondStarts:pair[0].seconds+.7,sha256:createHash('sha256').update(readFileSync(path.join(root,out))).digest('hex')});
 for(const file of [...pieces,silence])rmSync(file);
}
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',metrics,comparisons},null,2)+'\n');
