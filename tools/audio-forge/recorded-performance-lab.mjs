// Independent unified performance lab: same-run 27-zone bank plus eight articulation takes.
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank} from './recorded-articulations.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
import {findSustainLoop} from './recorded-sustain.mjs';
import {prepareTransientNote} from './recorded-transients.mjs';
import {prepareModulatedNote} from './recorded-modulated.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-performance'),base=path.resolve(process.argv[3]??'.audio-recorded-legato'),sr=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});
const revision='28092772094b2d9f1148d84cea97f4545b8c687d',repo='https://github.com/sgossner/VSCO-2-CE',sha=b=>createHash('sha256').update(b).digest('hex');
const originals=JSON.parse(readFileSync(path.join(base,'metrics.json'),'utf8')),index=JSON.parse(readFileSync(path.join(base,'library/index.json'),'utf8'));
const extra=[
 ['violin',69,.35,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_A3_v1_rr1.wav','b05e9f2e63db6447bd91165f4777244b719db259'],
 ['violin',69,.85,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_A3_v2_rr1.wav','b790de6a30af1a6b735a400a6bb2789e46058ca8'],
 ['violin',72,.35,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_C4_v1_rr1.wav','eb9aa85e53c57bdff184d9d7825a7a04ee1e8ac1'],
 ['violin',72,.85,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_C4_v2_rr1.wav','5dd7adb8a15a05794a0f9b94933e388a6aae0183'],
 ['violin',69,.85,'pizzicato',1,'Strings/Solo Violin/Pizz/LLVln_Pizz_A4_f_RR1.wav','0068a6bd084708b278b10b1e6880cf97ffd59245'],
 ['violin',69,.85,'pizzicato',2,'Strings/Solo Violin/Pizz/LLVln_Pizz_A4_f_RR2.wav','61c9f743fce95fdf5e820b8d3508dfb0a72dc726'],
 ['violin',72,.85,'pizzicato',1,'Strings/Solo Violin/Pizz/LLVln_Pizz_C5_f_RR1.wav','6b098e94523e710182b7ffdc9b61a6831b8bf956'],
 ['violin',72,.85,'pizzicato',2,'Strings/Solo Violin/Pizz/LLVln_Pizz_C5_f_RR2.wav','6d0e35664cac7fe32cef9ea7c35dee95f6089ab5']
,
 ['violin',76,.35,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_E4_v1_rr1.wav','aae3b51f5c62478f5d68c1d93a99252118e19fcc'],
 ['violin',76,.85,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_E4_v2_rr1.wav','ae6d11a641c974641950744334b6b1a5626ac411'],
 ['violin',81,.35,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_A4_v1_rr1.wav','d92aca7f77f5288c47954fa15d1a58fc1dafbf17'],
 ['violin',81,.85,'tremolo',1,'Strings/Solo Violin/Trem/LLVln_trem_A4_v2_rr1.wav','dfb62d47ec80c9733ed938ac79cc9c5166371b53'],
 ['violin',67,.85,'pizzicato',1,'Strings/Solo Violin/Pizz/LLVln_Pizz_G4_f_RR1.wav','b88cb207441bd8dd97220f849351a377d0df55ab'],
 ['violin',67,.85,'pizzicato',2,'Strings/Solo Violin/Pizz/LLVln_Pizz_G4_f_RR2.wav','827b57fde631ce963509d12c1e9eea04fa6b1497'],
 ['violin',76,.85,'pizzicato',1,'Strings/Solo Violin/Pizz/LLVln_Pizz_E5_f_RR1.wav','78fa76ba4c64ca8c9d93e201e3b3d53657118b6d'],
 ['violin',76,.85,'pizzicato',2,'Strings/Solo Violin/Pizz/LLVln_Pizz_E5_f_RR2.wav','54f85086b5d772b993ae3b763b835aaab46e4402']
];
const zones=[],metrics=[],choices={},library=openLibrary(path.join(root,'library'));
function decode(file){
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid decoded PCM');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);return a;
}
function prepare(record,dir,meta,candidates){
 const file=path.join(dir,record.path),bytes=readFileSync(file);
 if(sha(bytes)!==record.sha256)throw Error('Source checksum mismatch');
 const pcm=decode(file),matches=[];
 for(const expected of candidates){
  try{matches.push((meta.articulation==='pizzicato'?prepareTransientNote:meta.articulation==='tremolo'?prepareModulatedNote:prepareRecordedNote)(pcm,expected));}
  catch(e){if(candidates.length===1||!String(e).includes('disagrees with reviewed zone'))throw e;}
 }
 if(matches.length!==1)throw Error('Ambiguous or unsupported measured register '+record.id);
 const z=matches[0],recipe={...meta,midi:z.expectedMidi,reviewedRoots:candidates};
 return {zone:{...z,...meta,id:record.id,sourceSha256:record.sha256},record:{...record,recipe,tags:[...new Set([...record.tags,meta.articulation,meta.instrument,'research-only'])]},dir};
}
function admit(p){zones.push(p.zone);library.insert(p.record,p.dir);
}
try{
 for(const z of originals.zones){
  if(!/^[0-9a-f]{64}$/.test(z.sourceSha256))throw Error('Invalid original source hash');
  const entry=index.entries.find(e=>e.id===z.id);
  if(!entry||entry.sha256!==z.sourceSha256)throw Error('Original bank identity mismatch');
  admit(prepare({...entry,path:'library/objects/'+z.sourceSha256+'.wav'},base,{instrument:z.instrument,articulation:z.articulation,velocity:z.velocity,variant:z.variant},[z.expectedMidi]));
 }
 mkdirSync(path.join(root,'candidates'),{recursive:true});
 const rejected=[],accepted=[];
 function acquire([instrument,midi,velocity,articulation,variant,source,blob]){
  const relative=source.split('/').map(encodeURIComponent).join('/'),bytes=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216','--user-agent','PocketWorksSoundForge/0.1 (https://github.com/JustSadSock/pocket-works)','https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+revision+'/'+relative],{maxBuffer:16777216});
  if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==blob||bytes.toString('ascii',0,4)!=='RIFF')throw Error('Pinned source mismatch '+source);
  const id='vsco-'+instrument+'-'+articulation+'-'+midi+'-'+(velocity<.5?'soft':'strong')+'-'+variant,file='candidates/'+id+'.wav';
  writeFileSync(path.join(root,file),bytes);
  const record={id,path:file,title:instrument+' '+articulation+' reviewed root '+midi,creator:'Versilian Studios; Sam Gossner and Simon Dalzell',license:'CC0-1.0',redistribution:true,provenance:'VSCO 2 CE recorded sample '+source,sourceUrl:repo+'/blob/'+revision+'/'+relative,rightsEvidence:repo+'/blob/'+revision+'/LICENSE (CC0 1.0 Universal)',sha256:sha(bytes),tags:['instrument','recorded',instrument,articulation,'research-only'],approval:'research-only',pin:{revision,blob}};
  // The upstream octave convention is not uniform across instruments. Admit only
  // the reviewed pitch class in either of the two documented octave conventions.
  return prepare(record,root,{instrument,articulation,velocity,variant,dynamicLabel:velocity<.5?'v1':'v2-or-forte'},[midi]);
 }
 for(const articulation of ['tremolo','pizzicato']){
  const roots=[...new Set(extra.filter(x=>x[3]===articulation).map(x=>x[1]))];
  let count=0;
  for(const midi of roots){
   if(count===2)break;
   const pair=extra.filter(x=>x[3]===articulation&&x[1]===midi),prepared=[];
   for(const entry of pair){
    try{prepared.push(acquire(entry));}
    catch(e){
     if(!/disagrees with reviewed zone|Insufficient stable tremolo pitch windows|Unable to measure transient pitch|Silent transient|No transient attack/.test(String(e)))throw e;
     rejected.push({source:entry[5],blob:entry[6],expectedMidi:midi,error:String(e)});
    }
   }
   if(prepared.length!==2)continue;
   for(const p of prepared){
    const bytes=readFileSync(path.join(root,p.record.path));
    p.record.path='sources/'+p.record.id+'.wav';writeFileSync(path.join(root,p.record.path),bytes);
    admit(p);accepted.push(p.record.id);
   }
   count++;
  }
  writeFileSync(path.join(root,'articulation-admission.json'),JSON.stringify({accepted,rejected,sfz:{tremolo:'490f1bee2146468b66456889a664a0081d2350b8',pizzicato:'b1830d900cfe50aabc2a31d5fd0c821831c1002a'}},null,2)+'\n');
  if(count!==2)throw Error('Insufficient admitted articulation pairs '+articulation);
 }
 rmSync(path.join(root,'candidates'),{recursive:true,force:true});
 if(zones.length!==35||library.list().length!==35)throw Error('Recorded expansion inventory mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const bank=createRecordedInstrumentBank(zones);
function write(file,a,channels=1){
 mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:a.length/channels,channels,peak,rms:Math.sqrt(e/a.length),sha256:sha(b)};metrics.push(m);return m;
}
const loopResults=[];
for(const z of zones.filter(z=>z.instrument==='violin'&&z.articulation==='arco-vib')){
 try{z.loop=findSustainLoop(z);loopResults.push({id:z.id,qualified:true,...z.loop});}
 catch(e){if(!String(e).includes('No qualified sustain loop'))throw e;loopResults.push({id:z.id,qualified:false,reason:String(e)});}
}
const curve=[{at:0,value:.35},{at:.5,value:.85},{at:1,value:.35}];
const notes=[69,72,69].map((midi,i)=>({midi,start:i*3,duration:3,articulation:'arco-vib',curve,morph:true,sustain:true,connected:i>0}));
function render(name,notes,seconds,mode='morph',instrument='violin'){
 const r=renderRecordedPerformance({zones,instrument,notes,seconds,mode});
 choices[name]=r.choices;return {samples:r.samples,metric:write(name+'.wav',r.samples)};
}
function ab(name,a,b){
 if(a.samples.length!==b.samples.length)throw Error('Comparison grid mismatch');
 const target=Math.min(a.metric.rms,b.metric.rms),gap=Math.round(sr*.7),out=new Float32Array(a.samples.length*2+gap);
 for(const [i,p] of [a,b].entries()){const gain=target/p.metric.rms;for(let j=0;j<p.samples.length;j++)out[(i?a.samples.length+gap:0)+j]=p.samples[j]*gain;}
 write(name+'-AB.wav',out);
}
const a=render('unified-discrete',notes,9.2,'discrete'),b=render('unified-morph',notes,9.2);
if(choices['unified-morph'].some(c=>c.layers.length!==2||c.wraps.some(w=>w<1)||c.connected&&c.boundaryStep>.15))throw Error('Unified performance coverage failed');
ab('unified-dynamics',a,b);
const d=render('unified-detached',notes.map(n=>({...n,connected:false})),9.2);
ab('unified-legato',d,b);
const tremRoots=[...new Set(zones.filter(z=>z.articulation==='tremolo').map(z=>z.expectedMidi))].sort((a,b)=>a-b);
const pizzRoots=[...new Set(zones.filter(z=>z.articulation==='pizzicato').map(z=>z.expectedMidi))].sort((a,b)=>a-b);
if(tremRoots.length!==2||pizzRoots.length!==2)throw Error('Articulation register coverage mismatch');
for(const root of tremRoots)if(new Set(zones.filter(z=>z.articulation==='tremolo'&&z.expectedMidi===root).map(z=>z.velocity)).size!==2)throw Error('Tremolo layer mismatch');
for(const root of pizzRoots)if(new Set(zones.filter(z=>z.articulation==='pizzicato'&&z.expectedMidi===root).map(z=>z.variant)).size!==2)throw Error('Pizzicato take mismatch');
const trem=tremRoots.flatMap(midi=>[midi,midi]).map((midi,i)=>({midi,start:i*1.2,duration:1.05,articulation:'tremolo',curve,morph:true}));
render('violin-tremolo',trem,4.8);
const pizz=pizzRoots.flatMap(midi=>[midi,midi,midi,midi]).map((midi,i)=>({midi,start:i*.5,duration:.30,articulation:'pizzicato',pressure:.75}));
render('violin-pizzicato',pizz,4);
if(choices['violin-pizzicato'].map(c=>c.variants[0]).join(',')!=='1,2,1,2,1,2,1,2')throw Error('Pizzicato round robin missing');
const study=[...notes,...trem.map(n=>({...n,start:n.start+9.3})),...pizz.map(n=>({...n,start:n.start+14.3}))];
render('violin-articulation-suite',study,18.5);

// Expression study uses the verified non-vibrato flute recordings so the
// synthetic pitch contour is not layered over a source already tagged vibrato.
const fluteExpressionNotes=[69,72,72,69,81,72,69,72].map((midi,i)=>({
 midi,start:i*.65,duration:.50,pressure:.62,articulation:'non-vibrato'
}));
const fluteVibrato={vibrato:{depthCents:16,rateHz:5.1,delaySeconds:.10,fadeInSeconds:.14,releaseSeconds:.10}};
const fluteOrnamented={...fluteVibrato,attackBend:{cents:-16,durationSeconds:.065}};
const dryExpression=render('expression/flute-expression-dry',fluteExpressionNotes,5.3,'morph','flute');
const vibratoExpression=render('expression/flute-expression-vibrato',fluteExpressionNotes.map(n=>({...n,expression:fluteVibrato})),5.3,'morph','flute');
const ornamentedExpression=render('expression/flute-expression-ornamented',fluteExpressionNotes.map(n=>({...n,expression:fluteOrnamented})),5.3,'morph','flute');
if(dryExpression.samples.every((x,i)=>x===vibratoExpression.samples[i])||
 vibratoExpression.samples.every((x,i)=>x===ornamentedExpression.samples[i])||
 choices['expression/flute-expression-ornamented'].some(x=>x.expression?.maxDeviationCents!==32))
 throw Error('Recorded expression was not exercised');
const expressionGap=Math.round(sr*.7),expressionTarget=Math.min(dryExpression.metric.rms,ornamentedExpression.metric.rms);
const expressionAB=new Float32Array(dryExpression.samples.length*2+expressionGap);
for(const [i,p] of [dryExpression,ornamentedExpression].entries()){
 const gain=expressionTarget/p.metric.rms;
 for(let j=0;j<p.samples.length;j++)expressionAB[(i?dryExpression.samples.length+expressionGap:0)+j]=p.samples[j]*gain;
}
write('expression/flute-expression-AB.wav',expressionAB);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(readFileSync(path.join(base,'metrics.json'))),coverage:bank.coverage(),zones:zones.map(({samples,...z})=>z),loopResults,choices,metrics,comparisons:[{file:'unified-dynamics-AB.wav',secondStarts:9.9,order:['discrete','morph']},{file:'unified-legato-AB.wav',secondStarts:9.9,order:['detached','connected']},{file:'expression/flute-expression-AB.wav',secondStarts:6.0,order:['dry','vibrato-plus-attack-bend'],levelMatched:true}]},null,2)+'\n');
