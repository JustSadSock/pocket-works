import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
const allowed=new Set(['original','CC0-1.0','public-domain']);
const idPattern=/^[a-z0-9][a-z0-9-]{0,63}$/;
const relativePattern=/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/;
const str=(x)=>typeof x==='string'&&x.trim().length>0;
export function createCatalog(entries=[],root){
  if(!Array.isArray(entries)||entries.length>512)throw new Error('Invalid sample catalog');
  const map=new Map();
  for(const e of entries){
    if(!e||!idPattern.test(e.id??'')||map.has(e.id)||!allowed.has(e.license)||!str(e.creator)||!str(e.title)||!str(e.provenance)||e.redistribution!==true||!(/^[a-f0-9]{64}$/.test(e.sha256??'')))throw new Error('Missing sample rights or identity metadata');
    if(e.license!=='original'&&(!str(e.sourceUrl)||!/^https:\/\//.test(e.sourceUrl)||!str(e.rightsEvidence)))throw new Error('External sample requires rights evidence and source URL');
    if(!str(e.path)||!relativePattern.test(e.path)||e.path.split('/').some(p=>p==='.'||p==='..')||!/\.(wav|ogg|flac)$/i.test(e.path))throw new Error('Invalid sample path');
    if(!Array.isArray(e.tags)||e.tags.some(t=>!str(t)))throw new Error('Invalid sample tags');
    map.set(e.id,Object.freeze({...e,tags:Object.freeze([...e.tags])}));
  }
  const base=realpathSync(root);
  return {
    search(query=''){
      const terms=String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
      return [...map.values()].filter(e=>terms.every(t=>[e.id,e.title,e.creator,...e.tags].join(' ').toLowerCase().includes(t)));
    },
    resolve(id){
      const e=map.get(id);if(!e)throw new Error('Unknown sample '+id);
      const file=realpathSync(path.resolve(base,e.path));
      if(!file.startsWith(base+path.sep))throw new Error('Sample escapes catalog root');
      const stat=statSync(file);if(!stat.isFile()||stat.size<44||stat.size>64*1024*1024)throw new Error('Invalid sample size');
      const hash=createHash('sha256').update(readFileSync(file)).digest('hex');
      if(hash!==e.sha256)throw new Error('Sample checksum mismatch: '+id);
      return {entry:e,file};
    }
  };
}
export function mixHybrid(procedural,sample,mix){
  if(!(procedural instanceof Float32Array)||!(sample instanceof Float32Array)||!procedural.length||procedural.length%2||sample.length%2||!sample.length||typeof mix!=='number'||!Number.isFinite(mix)||mix<0||mix>1)throw new Error('Invalid hybrid inputs');
  const n=procedural.length,out=new Float32Array(n);
  let ep=0,es=0;
  for(let i=0;i<n;i++){
    const p=procedural[i],s=sample[i]??0;
    if(!Number.isFinite(p)||!Number.isFinite(s))throw new Error('Invalid PCM');
    ep+=p*p;es+=s*s;
  }
  if((mix<1&&ep<1e-12)||(mix>0&&es<1e-12))throw new Error('Silent hybrid layer');
  const ratio=es>0?Math.sqrt(ep/es):0;
  // Match sample RMS to the original synthesis before applying the recipe ratio.
  // At pure sample, a silent procedural layer is also supported.
  const sampleGain=ep>0?ratio:1;
  let peak=0;
  for(let i=0;i<n;i++){
    out[i]=procedural[i]*(1-mix)+(sample[i]??0)*sampleGain*mix;
    peak=Math.max(peak,Math.abs(out[i]));
  }
  if(!Number.isFinite(peak)||peak<1e-8)throw new Error('Silent or invalid hybrid output');
  const gain=Math.min(1,.88/peak);
  for(let i=0;i<n;i++)out[i]*=gain;
  return out;
}
