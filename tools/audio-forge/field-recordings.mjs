// Pinned, individually reviewed public-domain field recordings. No API keys.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-forge-field');
mkdirSync(root,{recursive:true});
const sources=[
 {id:'nikko-explosion',title:'Single festival explosion',creator:'Fg2',filename:'Explosion-LS100155.ogg',url:'https://upload.wikimedia.org/wikipedia/commons/b/b9/Explosion-LS100155.ogg',sha1:'2c40ed1798241921c70a11a7671c9e745557e95a',size:31909,revision:1237586287,provenance:'Author recording at Toshogu Spring Festival, Nikko, 2009-05-18',tags:['field-recording','explosion','impact']},
 {id:'nikko-explosions',title:'Festival explosions',creator:'Fg2',filename:'Explosions-LS100152.ogg',url:'https://upload.wikimedia.org/wikipedia/commons/e/e9/Explosions-LS100152.ogg',sha1:'e9cad91aa199bf54d4e2eb2c77cc58b484413e99',size:125437,revision:1151334253,provenance:'Author recording at Toshogu Spring Festival, Nikko, 2009-05-18',tags:['field-recording','explosion','impact']},
 {id:'stockholm-rain',title:'Rain and thunder',creator:'Caesar',filename:'Rain_and_thunder.ogg',url:'https://upload.wikimedia.org/wikipedia/commons/4/42/Rain_and_thunder.ogg',sha1:'5cee3290a09118a6d2fcdcbaa17f451f9ec09499',size:226945,revision:1129569613,provenance:'Author recording in Sundbyberg, Stockholm, 2006-08-27',tags:['field-recording','rain','thunder','weather']}
];
const lib=openLibrary(root);
try{
 for(const s of sources){
  const data=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','30','--retry','1','--max-filesize','1048576','--user-agent','PocketWorksSoundForge/0.1 (https://github.com/JustSadSock/pocket-works)',s.url],{maxBuffer:1048576});
  if(data.length!==s.size||createHash('sha1').update(data).digest('hex')!==s.sha1)throw new Error('Source bytes differ from reviewed Commons record: '+s.id);
  const file=s.id+'.ogg';writeFileSync(path.join(root,file),data);
  lib.insert({id:s.id,path:file,title:s.title,creator:s.creator,license:'public-domain',redistribution:true,provenance:s.provenance,sourceUrl:'https://commons.wikimedia.org/w/index.php?oldid='+s.revision,rightsEvidence:'PD-self: worldwide public-domain dedication by author, unconditional use fallback; reviewed Commons revision '+s.revision,sha256:createHash('sha256').update(data).digest('hex'),tags:s.tags},root);
 }
 const jobs=[];
 for(const [sampleId,model,ratios] of [['nikko-explosion','explosion',[0,.25,.75,1]],['stockholm-rain','rain',[0,.5,1]]]){
  for(const sampleMix of ratios){const name=sampleId+'-'+Math.round(sampleMix*100);jobs.push({name,type:'hybrid',model,seed:123,strength:.65,sampleId,sampleMix,compensateRms:true,output:'generated/'+name+'.wav'});}
 }
 // Preserve the untrimmed comparisons and audition a manually measured cue.
 for(const sampleMix of [.25,.75,1]){
  const name='nikko-explosion-aligned-'+Math.round(sampleMix*100);
  jobs.push({name,type:'hybrid',model:'explosion',seed:123,strength:.65,sampleId:'nikko-explosion',sampleMix,sampleStart:.59,compensateRms:true,output:'generated/'+name+'.wav'});
 }
 writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:2,samples:lib.list(),jobs},null,2)+'\n');
}finally{lib.close()}
