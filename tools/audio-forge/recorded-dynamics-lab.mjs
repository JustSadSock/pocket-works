// Same-run 27-zone bank plus twelve pinned horn and trumpet takes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank} from './recorded-articulations.mjs';
import {renderRecordedLegato} from './recorded-legato.mjs';
import {renderDynamicPhrase} from './recorded-dynamics.mjs';
import {renderEnsembleRoom} from './ensemble-room.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-dynamics'),base=path.resolve(process.argv[3]??'.audio-recorded-legato'),sr=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});
const revision='28092772094b2d9f1148d84cea97f4545b8c687d',repo='https://github.com/sgossner/VSCO-2-CE',sha=b=>createHash('sha256').update(b).digest('hex');
const originals=JSON.parse(readFileSync(path.join(base,'metrics.json'),'utf8')),index=JSON.parse(readFileSync(path.join(base,'library/index.json'),'utf8'));
const extra=[
 ['horn',50,.35,'Brass/F Horn/sus/MOHorn_sus_D2_v1_1.wav','e63cadc76d2b3e56ee26ad558e52fd633cc8c4b1'],
 ['horn',50,.85,'Brass/F Horn/sus/MOHorn_sus_D2_v3_1.wav','aec5cfdb8e2532338f69f6726c77c1d8e5044f0d'],
 ['horn',53,.35,'Brass/F Horn/sus/MOHorn_sus_F2_v1_1.wav','90c68f7833a7aa2325dea7159aad8af4c9b13a76'],
 ['horn',53,.85,'Brass/F Horn/sus/MOHorn_sus_F2_v3_1.wav','af9345753c5b31083a3e344dd7bbf6c978de59c3'],
 ['horn',57,.35,'Brass/F Horn/sus/MOHorn_sus_A2_v1_1.wav','d358aadfb3bb1e0f28ab742d96f5418dc750057b'],
 ['horn',57,.85,'Brass/F Horn/sus/MOHorn_sus_A2_v3_1.wav','d4088d29905d60944c524d443f66c55035301e47'],
 ['trumpet',74,.35,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_D4_v1_rr1.wav','5270a6927aa41b90f804df59b9888449aa01a2bb'],
 ['trumpet',74,.85,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_D4_v3_rr1.wav','815560ece9f2e8d0ad6a33ba24a014345ea59814'],
 ['trumpet',77,.35,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_F4_v1_rr1.wav','c14125cf6f506ed3a5d495fee4130381d050b109'],
 ['trumpet',77,.85,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_F4_v3_rr1.wav','cb508c5bf2e3c21dc3441194499fc6d0e7344f4b'],
 ['trumpet',81,.35,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_A4_v1_rr1.wav','544285c24f712f098254f0f4677cb96e9c272081'],
 ['trumpet',81,.85,'Brass/Trumpet/sus/Sum_SHTrumpet_sus_A4_v3_rr1.wav','bbdc0773c636c611b953ed1383f8cf1eb6b53b38']
];
const zones=[],metrics=[],choices={},library=openLibrary(path.join(root,'library'));
function decode(file){
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid decoded PCM');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);return a;
}
function add(record,dir,meta,candidates){
 const file=path.join(dir,record.path),bytes=readFileSync(file);
 if(sha(bytes)!==record.sha256)throw Error('Source checksum mismatch');
 const pcm=decode(file),matches=[];
 for(const expected of candidates){
  try{matches.push(prepareRecordedNote(pcm,expected));}
  catch(e){if(!String(e).includes('disagrees with reviewed zone'))throw e;}
 }
 if(matches.length!==1)throw Error('Ambiguous or unsupported measured register '+record.id);
 const z=matches[0],recipe={...meta,midi:z.expectedMidi,reviewedRoots:candidates};
 zones.push({...z,...meta,id:record.id,sourceSha256:record.sha256});
 library.insert({...record,recipe,tags:[...new Set([...record.tags,meta.articulation,meta.instrument,'research-only'])]},dir);
}
try{
 for(const z of originals.zones){
  if(!/^[0-9a-f]{64}$/.test(z.sourceSha256))throw Error('Invalid original source hash');
  const entry=index.entries.find(e=>e.id===z.id);
  if(!entry||entry.sha256!==z.sourceSha256)throw Error('Original bank identity mismatch');
  add({...entry,path:'library/objects/'+z.sourceSha256+'.wav'},base,{instrument:z.instrument,articulation:z.articulation,velocity:z.velocity,variant:z.variant},[z.expectedMidi]);
 }
 for(const [instrument,midi,velocity,source,blob] of extra){
  const relative=source.split('/').map(encodeURIComponent).join('/'),bytes=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216','--user-agent','PocketWorksSoundForge/0.1 (https://github.com/JustSadSock/pocket-works)','https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+revision+'/'+relative],{maxBuffer:16777216});
  if(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==blob||bytes.toString('ascii',0,4)!=='RIFF')throw Error('Pinned source mismatch '+source);
  const articulation='sustain',id='vsco-'+instrument+'-'+midi+'-'+(velocity<.5?'v1':'v3'),file='sources/'+id+'.wav';
  writeFileSync(path.join(root,file),bytes);
  const record={id,path:file,title:instrument+' '+articulation+' reviewed root '+midi,creator:'Versilian Studios; Sam Gossner and Simon Dalzell',license:'CC0-1.0',redistribution:true,provenance:'VSCO 2 CE recorded sample '+source,sourceUrl:repo+'/blob/'+revision+'/'+relative,rightsEvidence:repo+'/blob/'+revision+'/LICENSE (CC0 1.0 Universal)',sha256:sha(bytes),tags:['instrument','recorded',instrument,articulation,'research-only'],approval:'research-only',pin:{revision,blob}};
  // The upstream octave convention is not uniform across instruments. Admit only
  // the reviewed pitch class in either of the two documented octave conventions.
  add(record,root,{instrument,articulation,velocity,variant:1,dynamicLabel:velocity<.5?'v1':'v3'},[midi-12,midi]);
 }
 if(zones.length!==39||library.list().length!==39)throw Error('Recorded expansion inventory mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const bank=createRecordedInstrumentBank(zones);
function write(file,a,channels=1){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:a.length/channels,channels,peak,rms:Math.sqrt(e/a.length),sha256:sha(b)};metrics.push(m);return m;
}
const instruments=[['violin','arco-vib'],['cello-section','arco-vib'],['clarinet','sustain'],['horn','sustain'],['trumpet','sustain']];
const curve=[{at:0,value:.35},{at:.2,value:.43},{at:.58,value:.85},{at:1,value:.35}];
const comparisons=[];
function compare(name,a,b,channels=1){
 const target=Math.min(a.metric.rms,b.metric.rms),gap=Math.round(sr*.7)*channels,ab=new Float32Array(a.samples.length+b.samples.length+gap);
 for(const [i,p] of [a,b].entries()){const gain=target/p.metric.rms;for(let j=0;j<p.samples.length;j++)ab[(i?a.samples.length+gap:0)+j]=p.samples[j]*gain;}
 const file=name+'-AB.wav';write(file,ab,channels);comparisons.push({file,secondStarts:a.samples.length/channels/sr+.7,order:['fixed-high','morph']});
}
function rootsFor(instrument,articulation){
 const selected=zones.filter(z=>z.instrument===instrument&&z.articulation===articulation),roots=[...new Set(selected.map(z=>z.expectedMidi))].sort((a,b)=>a-b);
 if(roots.length!==3||roots.some(m=>new Set(selected.filter(z=>z.expectedMidi===m).map(z=>z.velocity)).size!==2))throw Error('Paired layer coverage mismatch '+instrument);
 return roots;
}
function render(name,instrument,articulation,notes,seconds,mode){
 const r=renderDynamicPhrase({zones,instrument,articulation,notes,seconds,mode});
 choices[name]=r.choices;return {samples:r.samples,metric:write(name+'.wav',r.samples)};
}
for(const [instrument,articulation] of instruments){
 const roots=rootsFor(instrument,articulation),notes=roots.map((midi,i)=>({midi,start:i*1.5,duration:1.35,curve}));
 const a=render(instrument+'-fixed',''+instrument,articulation,notes,4.5,'fixed-high'),b=render(instrument+'-morph',instrument,articulation,notes,4.5,'morph');
 compare(instrument+'-dynamics',a,b);
}
// Original D-minor chamber-orchestra study, 8 bars, 100 BPM, 4/4.
// Different harmonic functions, not the same tune copied to all instruments.
const tempo=100,bars=8,meter=4,beat=60/tempo,seconds=bars*meter*beat,frames=Math.round(seconds*sr);
const parts={
 'cello-section':{pitches:[[50,57],[46,53],[55,50],[45,52],[50,57],[53,48],[46,53],[50,50]],pan:-.24,gain:.38,group:'strings',reference:50},
 violin:{pitches:[[69,72],[70,69],[67,70],[69,73],[74,72],[69,72],[70,67],[69,66]],pan:-.52,gain:.31,group:'strings',reference:67},
 clarinet:{pitches:[[65,62],[65,70],[67,62],[64,61],[65,69],[65,60],[62,65],[62,66]],pan:.23,gain:.26,group:'woodwind',reference:62},
 horn:{pitches:[[50,53],[50,53],[55,58],[52,57],[50,57],[53,57],[53,58],[50,54]],pan:-.10,gain:.30,group:'brass',reference:50},
 trumpet:{pitches:[[74,77],[77,74],[79,77],[76,73],[74,81],[77,81],[77,82],[78,74]],pan:.31,gain:.20,group:'brass',reference:74}
};
const fluteNotes=[[81,77],[77,74],[79,77],[76,73],[81,84],[81,77],[77,79],[78,74]].flatMap((row,i)=>row.map((midi,j)=>({midi,start:(i*4+j*2)*beat,duration:1.08,pressure:.48+.12*Math.sin(Math.PI*i/7),articulation:'non-vibrato',connected:false})));
bank.reset();const flute=renderRecordedLegato({bank,instrument:'flute',notes:fluteNotes,seconds}).samples;
function orchestra(mode){
 const stems=Object.fromEntries(['strings','woodwind','brass'].map(k=>[k,new Float32Array(frames*2)]));
 function add(group,mono,pan,gain){const l=Math.sqrt((1-pan)/2)*gain,r=Math.sqrt((1+pan)/2)*gain;for(let i=0;i<frames;i++){stems[group][i*2]+=mono[i]*l;stems[group][i*2+1]+=mono[i]*r;}}
 add('woodwind',flute,.49,.18);
 for(const [instrument,articulation] of instruments){
  const p=parts[instrument],shift=rootsFor(instrument,articulation)[0]-p.reference;
  if(instrument==='horn'||instrument==='trumpet'){if(![-12,0].includes(shift))throw Error('Unexpected brass register');}
  else if(shift!==0)throw Error('Unexpected existing instrument register');
  const notes=p.pitches.flatMap((row,i)=>row.map((midi,j)=>{
   const crest=Math.min(.9,.55+.26*Math.sin(Math.PI*i/7)+(j===0?.07:0)),entry=.35+.07*Math.sin(Math.PI*i/7);
   return {midi:midi+shift,start:(i*4+j*2)*beat,duration:j===1?1.03:1.12,curve:[{at:0,value:entry},{at:.48,value:crest},{at:1,value:.35}]};
  }));
  const r=renderDynamicPhrase({zones,instrument,articulation,notes,seconds,mode});
  choices['ensemble-'+mode+'-'+instrument]=r.choices;add(p.group,r.samples,p.pan,p.gain);
 }
 const mix=new Float32Array(frames*2);for(const a of Object.values(stems))for(let i=0;i<mix.length;i++)mix[i]+=a[i];
 return {mix,stems};
}
const control=orchestra('fixed-high'),expressive=orchestra('morph');
const a={samples:control.mix,metric:write('dawn-procession-fixed.wav',control.mix,2)},b={samples:expressive.mix,metric:write('dawn-procession-morph.wav',expressive.mix,2)};
compare('dawn-procession',a,b,2);
const room=renderEnsembleRoom({stems:expressive.stems,preset:'chamber'});
write('dawn-procession-chamber.wav',room.mix,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(readFileSync(path.join(base,'metrics.json'))),coverage:bank.coverage(),zones:zones.map(({samples,...z})=>z),choices,metrics,comparisons,tempo,bars,meter,room:{layout:room.layout,nominalRt60:room.nominalRt60}},null,2)+'\n');
