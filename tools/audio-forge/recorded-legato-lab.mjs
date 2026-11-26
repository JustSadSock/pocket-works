// Same-run articulation bank plus twelve pinned cello-section and clarinet takes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {createRecordedInstrumentBank} from './recorded-articulations.mjs';
import {renderRecordedLegato} from './recorded-legato.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-legato'),base=path.resolve(process.argv[3]??'.audio-recorded-articulations'),sr=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});
const revision='28092772094b2d9f1148d84cea97f4545b8c687d',repo='https://github.com/sgossner/VSCO-2-CE',sha=b=>createHash('sha256').update(b).digest('hex');
const originals=JSON.parse(readFileSync(path.join(base,'metrics.json'),'utf8')),index=JSON.parse(readFileSync(path.join(base,'library/index.json'),'utf8'));
const extra=[
 ['cello-section',50,.35,'Strings/Cello Section/susvib/susvib_D2_v1_1.wav','8076f809d4f6a8057f3835e12d22751a25e39252'],
 ['cello-section',50,.85,'Strings/Cello Section/susvib/susvib_D2_v3_1.wav','fdb46242bb68876ad275b9b8ed10c4b8508b9292'],
 ['cello-section',53,.35,'Strings/Cello Section/susvib/susvib_F2_v1_1.wav','78f52c49ddc8a357657d92b05cd89f15beb6c717'],
 ['cello-section',53,.85,'Strings/Cello Section/susvib/susvib_F2_v3_1.wav','a384e84a342ab9be12ca55b92c845a3c351b75bf'],
 ['cello-section',57,.35,'Strings/Cello Section/susvib/susvib_A2_v1_1.wav','76df6b474aff133b2ac9d96bf2466cb6fd865c72'],
 ['cello-section',57,.85,'Strings/Cello Section/susvib/susvib_A2_v3_1.wav','ad696c6ad3cbacb37b6d9cf4f26da4a54521e7ce'],
 ['clarinet',62,.35,'Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v1_rr1_sum.wav','8f3f973a0d69c3c721f1eb8b27f208c80bd17ceb'],
 ['clarinet',62,.85,'Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v3_rr1_sum.wav','aa7a1f5f31cef8d36552072d9f275b7940c879c0'],
 ['clarinet',65,.35,'Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v1_rr1_sum.wav','31ac755ac1dff319c409505d26706d9851bb7e92'],
 ['clarinet',65,.85,'Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v3_rr1_sum.wav','fc79b6d0f5b3420f4e24b0392484b43a864a6d50'],
 ['clarinet',70,.35,'Woodwinds/Clarinet/susLong/DCClar_susLong_A#3_v1_rr1_sum.wav','f8db827226f661779d8965737fa0850d8275be9a'],
 ['clarinet',70,.85,'Woodwinds/Clarinet/susLong/DCClar_susLong_A#3_v3_rr1_sum.wav','08f1508a646a60a8795861688932e38955cc8ba0']
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
  const articulation=instrument==='cello-section'?'arco-vib':'sustain',id='vsco-'+instrument+'-'+midi+'-'+(velocity<.5?'v1':'v3'),file='sources/'+id+'.wav';
  writeFileSync(path.join(root,file),bytes);
  const record={id,path:file,title:instrument+' '+articulation+' reviewed root '+midi,creator:'Versilian Studios; Sam Gossner and Simon Dalzell',license:'CC0-1.0',redistribution:true,provenance:'VSCO 2 CE recorded sample '+source,sourceUrl:repo+'/blob/'+revision+'/'+relative,rightsEvidence:repo+'/blob/'+revision+'/LICENSE (CC0 1.0 Universal)',sha256:sha(bytes),tags:['instrument','recorded',instrument,articulation,'research-only'],approval:'research-only',pin:{revision,blob}};
  // The upstream octave convention is not uniform across instruments. Admit only
  // the reviewed pitch class in either of the two documented octave conventions.
  add(record,root,{instrument,articulation,velocity,variant:1,dynamicLabel:velocity<.5?'v1':'v3'},[midi-12,midi]);
 }
 if(zones.length!==27||library.list().length!==27)throw Error('Recorded expansion inventory mismatch');
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
const performances={};
for(const [instrument,articulation] of [['flute','non-vibrato'],['violin','arco-vib'],['cello-section','arco-vib'],['clarinet','sustain']]){
 const candidates=zones.filter(z=>z.instrument===instrument&&z.articulation===articulation);
 const roots=[...new Set(candidates.map(z=>z.expectedMidi))].sort((a,b)=>a-b);
 if(roots.length<3)throw Error('Insufficient roots '+instrument);
 // For newly acquired dynamic layers the two takes must agree on each octave.
 if(instrument==='cello-section'||instrument==='clarinet'){
  if(roots.length!==3||roots.some(m=>new Set(candidates.filter(z=>z.expectedMidi===m).map(z=>z.velocity)).size!==2))throw Error('Layer register mismatch '+instrument);
 }
 const [lo,mid,hi]=instrument==='flute'?[69,72,81]:roots.slice(0,3);
 const notes=[lo,mid,hi,mid,lo,mid,hi,lo].map((midi,i)=>({midi,start:i*.75,duration:i===7?.65:.75,pressure:i<4?.45:.8,articulation,connected:i>0&&i!==4}));
 // The fourth note must release before the next independently articulated note.
 notes[3].duration=.65;
 const seconds=6,pair=[];
 for(const mode of ['detached','connected']){
  bank.reset();const r=renderRecordedLegato({bank,instrument,notes:notes.map(n=>({...n,connected:mode==='connected'&&n.connected})),seconds});
  const id=instrument+'-'+mode;choices[id]=r.choices;
  if(mode==='connected'&&(r.choices.filter(c=>c.connected).length!==6||r.choices.some(c=>c.connected&&c.boundaryStep>.15)))throw Error('Missing or discontinuous legato transitions');
  pair.push({...r,metric:write(id+'.wav',r.samples)});
 }
 const target=Math.min(...pair.map(p=>p.metric.rms)),gap=Math.round(sr*.7),ab=new Float32Array(pair[0].samples.length*2+gap);
 for(const [i,p] of pair.entries()){const gain=target/p.metric.rms;for(let j=0;j<p.samples.length;j++)ab[(i?p.samples.length+gap:0)+j]=p.samples[j]*gain;}
 write(instrument+'-legato-AB.wav',ab);performances[instrument]=pair[1].samples;
}
// A short ensemble preview with staggered entrances, measured source roots and
// fixed stereo seating. It is a listening study, not a new fully composed score.
const frames=sr*9,mix=new Float32Array(frames*2);
for(const [instrument,start,pan,gain] of [['cello-section',0,-.2,.36],['clarinet',sr*.75,.35,.28],['violin',sr*1.5,-.45,.24],['flute',sr*2.25,.45,.22]]){
 const a=performances[instrument],l=Math.sqrt((1-pan)/2)*gain,r=Math.sqrt((1+pan)/2)*gain;
 for(let i=0;i<a.length&&start+i<frames;i++){mix[(start+i)*2]+=a[i]*l;mix[(start+i)*2+1]+=a[i]*r;}
}
write('recorded-quartet-study.wav',mix,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(readFileSync(path.join(base,'metrics.json'))),coverage:bank.coverage(),zones:zones.map(({samples,...z})=>z),choices,metrics,comparisonOrder:['detached','connected'],secondStarts:6.7,transitionSeconds:.055,sustainOffsetSeconds:.16},null,2)+'\n');
