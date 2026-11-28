// Trusted offline backend, never evaluates recipe text as code.
import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const backend=fileURLToPath(new URL('./acoustic_authoring.py',import.meta.url));
export function acousticCatalog(entries,root){
  if(!Array.isArray(entries)||entries.length>64)throw Error('Invalid acoustic model catalog');
  const base=realpathSync(root),models=new Map();
  for(const e of entries){
    if(!e||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id??'')||models.has(e.id)||!/^([a-f0-9]{64})$/.test(e.sha256??'')||typeof e.path!=='string'||!/^([a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_-]+\.json$/.test(e.path))throw Error('Invalid acoustic model receipt');
    const file=realpathSync(path.resolve(base,e.path));
    if(!file.startsWith(base+path.sep)||path.dirname(file)===base||!statSync(file).isFile()||statSync(file).size>24*1024*1024||createHash('sha256').update(readFileSync(file)).digest('hex')!==e.sha256)throw Error('Acoustic model checksum or path mismatch');
    models.set(e.id,file);
  }
  return {resolve(id){if(!models.has(id))throw Error('Unknown acoustic model '+id);return models.get(id)},directories:[...models.values()].map(p=>path.dirname(p))};
}
export function acousticExtensions(catalog){
  return {acoustic({layer,n,r}){
    const controls=layer.controls??{};
    if(!controls||typeof controls!=='object'||Array.isArray(controls))throw Error('Invalid acoustic controls');
    const component=layer.component??'mix';
    if(!['mix','tonal','noise'].includes(component))throw Error('Invalid acoustic component');
    const seed=layer.acousticSeed??Math.floor(r()*4294967296);
    if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Invalid acoustic seed');
    const payload=JSON.stringify(controls);
    if(Buffer.byteLength(payload)>65536)throw Error('Acoustic controls too large');
    const pcm=execFileSync('python3',[backend,catalog.resolve(layer.model),String(seed),payload,component,String(n)],{maxBuffer:n*8+4096,timeout:45000,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    if(pcm.length!==n*8)throw Error('Invalid acoustic PCM size');
    return Float64Array.from({length:n},(_,i)=>pcm.readDoubleLE(i*8));
  }};
}
