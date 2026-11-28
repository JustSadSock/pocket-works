// Same-run original recordings plus individually pinned new CC0 takes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank,renderArticulatedPhrase} from './recorded-articulations.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-articulations'),base=path.resolve(process.argv[3]??'.audio-recorded-timbre'),sr=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});
const revision='28092772094b2d9f1148d84cea97f4545b8c687d',repo='https://github.com/sgossner/VSCO-2-CE';
const sha=b=>createHash('sha256').update(b).digest('hex');
const originals=JSON.parse(readFileSync(path.join(base,'metrics.json'),'utf8'));
const extra=[
 ['violin',67,'arco-vib',.35,1,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_G4_p.wav','7324564c663bf239802020287c217b27c76b8142'],
 ['violin',69,'arco-vib',.35,1,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A4_p.wav','e8667671328e1cfcd769a7624c26fac133ad7b0f'],
 ['violin',72,'arco-vib',.35,1,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C5_p.wav','71f0671d77cf8b79ce1a18ba20d9661e24f086fc'],
 ['flute',69,'vibrato',.6,1,'Woodwinds/Flute/susvib/LDFlute_susvib_A3_v1_1.wav','1e8972d4e28dbf8b48e348b93c7862f29b0edfab'],
 ['flute',72,'vibrato',.6,1,'Woodwinds/Flute/susvib/LDFlute_susvib_C4_v1_1.wav','7be22f8b86e5dc405a10f51dd71d44712d23c9aa'],
 ['flute',72,'vibrato',.6,2,'Woodwinds/Flute/susvib/LDFlute_susvib_C4_v1_2.wav','18bfcccf848cfb4d8d10a005174408ef66fb1cae'],
 ['flute',81,'vibrato',.6,1,'Woodwinds/Flute/susvib/LDFlute_susvib_A4_v1_1.wav','1202232193c565a79618a1696913714e9fe1ad20']
];
const zones=[],metrics=[],choices={},library=openLibrary(path.join(root,'library'));
function prepare(record,dir,meta){
 const file=path.join(dir,record.path),bytes=readFileSync(file);
 if(sha(bytes)!==record.sha256)throw Error('Source checksum mismatch');
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(raw.length%4)throw Error('Invalid decoded PCM');
 const pcm=new Float32Array(raw.length/4);for(let i=0;i<pcm.length;i++)pcm[i]=raw.readFloatLE(i*4);
 const z=prepareRecordedNote(pcm,meta.midi);
 zones.push({...z,id:record.id,instrument:meta.instrument,articulation:meta.articulation,velocity:meta.velocity,variant:meta.variant,sourceSha256:record.sha256});
 library.insert({...record,recipe:meta,tags:[...new Set([...record.tags,meta.articulation,meta.instrument,'research-only'])]},dir);
}
try{
 for(const [instrument,list] of Object.entries(originals.zones)){
  for(const z of list){
   const record=originals.sources.find(s=>s.id===z.id);
   if(!record||!/^sources\/vsco-(flute|violin)-[0-9]+\.wav$/.test(record.path))throw Error('Invalid original recording identity');
   prepare(record,base,{instrument,midi:z.expectedMidi,articulation:instrument==='flute'?'non-vibrato':'arco-vib',velocity:instrument==='flute'?.6:.85,variant:1,dynamicLabel:instrument==='flute'?'single-recorded-layer':'forte'});
  }
 }
 for(const [instrument,midi,articulation,velocity,variant,source,blob] of extra){
  const relative=source.split('/').map(encodeURIComponent).join('/');
  const bytes=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216','--user-agent','PocketWorksSoundForge/0.1 (https://github.com/JustSadSock/pocket-works)','https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+revision+'/'+relative],{maxBuffer:16777216});
  if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==blob||bytes.toString('ascii',0,4)!=='RIFF')throw Error('New source differs from pinned blob '+source);
  const id='vsco-'+instrument+'-'+midi+'-'+(instrument==='violin'?'p':'vib')+'-'+variant,file='sources/'+id+'.wav';
  writeFileSync(path.join(root,file),bytes);
  const record={id,path:file,title:instrument+' '+articulation+' MIDI '+midi+' take '+variant,creator:'Versilian Studios; Sam Gossner and Simon Dalzell',license:'CC0-1.0',redistribution:true,provenance:'VSCO 2 CE recorded sample '+source,sourceUrl:repo+'/blob/'+revision+'/'+relative,rightsEvidence:repo+'/blob/'+revision+'/LICENSE (CC0 1.0 Universal)',sha256:sha(bytes),tags:['instrument','recorded',instrument,articulation,'research-only'],approval:'research-only',pin:{revision,blob}};
  prepare(record,root,{instrument,midi,articulation,velocity,variant,dynamicLabel:instrument==='violin'?'piano':'single-recorded-layer'});
 }
 if(zones.length!==15||library.list().length!==15)throw Error('Recorded bank inventory mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const bank=createRecordedInstrumentBank(zones);
function write(file,a){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:a.length,peak,rms:Math.sqrt(e/a.length),sha256:sha(b)};metrics.push(m);return m;
}
function render(name,instrument,notes,seconds,options={}){
 bank.reset();
 const r=renderArticulatedPhrase({bank,instrument,notes,seconds,...options});
 choices[name]=r.choices;return {samples:r.samples,metric:write(name+'.wav',r.samples)};
}
function compare(name,a,b){
 if(a.samples.length!==b.samples.length)throw Error('Comparison grid mismatch');
 const target=Math.min(a.metric.rms,b.metric.rms),gap=Math.round(sr*.7),ab=new Float32Array(a.samples.length*2+gap);
 for(const [i,p] of [a,b].entries()){const gain=target/p.metric.rms;for(let j=0;j<p.samples.length;j++)ab[(i?a.samples.length+gap:0)+j]=p.samples[j]*gain;}
 write(name+'-AB.wav',ab);
}
const violinNotes=[67,69,72,69,67,69,72,69].map((midi,i)=>({midi,start:i*.75,duration:.58,pressure:i%4<2?.35:.85,articulation:'arco-vib'}));
const v0=render('violin-fixed-forte','violin',violinNotes,6,{lockedVelocity:.85}),v1=render('violin-layered','violin',violinNotes,6);
if(new Set(choices['violin-layered'].map(c=>c.velocity)).size!==2||choices['violin-fixed-forte'].some(c=>c.velocity!==.85))throw Error('Actual dynamic layers not exercised');
compare('violin-dynamics',v0,v1);
const fluteNotes=Array.from({length:8},(_,i)=>({midi:72,start:i*.5,duration:.38,pressure:.6,articulation:'vibrato'}));
const f0=render('flute-fixed-take','flute',fluteNotes,4,{roundRobin:false}),f1=render('flute-round-robin','flute',fluteNotes,4);
if(choices['flute-round-robin'].map(c=>c.variant).join(',')!=='1,2,1,2,1,2,1,2'||new Set(choices['flute-round-robin'].map(c=>c.sourceSha256)).size!==2)throw Error('Real round-robin takes not exercised');
compare('flute-round-robin',f0,f1);
const melody=[69,72,74,72,76,81,76,72].map((midi,i)=>({midi,start:i*.75,duration:.58,pressure:.6,articulation:'vibrato'}));
const a0=render('flute-non-vibrato','flute',melody.map(n=>({...n,articulation:'non-vibrato'})),6,{roundRobin:false}),a1=render('flute-vibrato','flute',melody,6,{roundRobin:false});
compare('flute-articulation',a0,a1);
const alternating=melody.map((n,i)=>({...n,articulation:i<4?'non-vibrato':'vibrato'}));
render('flute-articulation-study','flute',alternating,6);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(readFileSync(path.join(base,'metrics.json'))),coverage:bank.coverage(),zones:zones.map(({samples,...z})=>z),choices,metrics,comparisons:[{file:'violin-dynamics-AB.wav',secondStarts:6.7,order:['fixed-forte','layered']},{file:'flute-round-robin-AB.wav',secondStarts:4.7,order:['fixed-take','round-robin']},{file:'flute-articulation-AB.wav',secondStarts:6.7,order:['non-vibrato','vibrato']}]},null,2)+'\n');
