import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {renderRecipe} from './programmable.mjs';
import {acousticCatalog,acousticExtensions} from './acoustic-authoring.mjs';
import {createCatalog} from './sample-library.mjs';
const root=path.resolve(process.argv[2]),manifest=JSON.parse(readFileSync(path.join(root,'manifest.json')));
const catalog=acousticCatalog(manifest.acousticModels,root),sampleCatalog=createCatalog(manifest.samples,root);
const samples=Object.create(null);
for(const e of manifest.samples){
  const {file}=sampleCatalog.resolve(e.id);
  const pcm=execFileSync('sox',['-R',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','20'],{maxBuffer:4*1024*1024});
  assert(pcm.length&&pcm.length%4===0);
  samples[e.id]=Float32Array.from({length:pcm.length/4},(_,i)=>pcm.readFloatLE(i*4));
}
const recipe=manifest.jobs[0].recipe;
const result=renderRecipe(recipe,{samples,extensions:acousticExtensions(catalog)});
const reconstructed=new Int32Array(result.pcm.length);
for(const stem of Object.values(result.stems)){
  assert(stem.some(v=>v!==0),'silent stem');
  for(let i=0;i<stem.length;i++)reconstructed[i]+=stem[i];
}
assert.deepEqual(reconstructed,result.pcm);
function wav(name,pcm){
  const b=Buffer.alloc(44+2*pcm.length);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(2*pcm.length,40);
  for(let i=0;i<pcm.length;i++)b.writeInt16LE(pcm[i],44+2*i);
  writeFileSync(path.join(root,name),b);return createHash('sha256').update(b).digest('hex');
}
const files={'exact-master.wav':wav('exact-master.wav',result.pcm)};
for(const [id,stem] of Object.entries(result.stems))files[id+'.wav']=wav(id+'.wav',stem);
writeFileSync(path.join(root,'mixed-stems.json'),JSON.stringify({exact:true,metrics:result.metrics,files},null,2)+'\n');
