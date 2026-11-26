// Same-run recorded sources, unchanged originals, extended sustain audition.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote,renderRecordedPhrase} from './recorded-instruments.mjs';
import {findSustainLoop,renderSustainedNote} from './recorded-sustain.mjs';
const source=path.resolve(process.argv[2]??'.audio-recorded-timbre'),root=path.resolve(process.argv[3]??'.audio-recorded-sustain'),sr=48000;
mkdirSync(root,{recursive:true});
const manifest=JSON.parse(readFileSync(path.join(source,'metrics.json'),'utf8')),zones={flute:[],violin:[]},metrics=[],loops=[];
function write(file,a){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,e=0;
 for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);
 const m={file,frames:a.length,peak,rms:Math.sqrt(e/a.length),sha256:createHash('sha256').update(b).digest('hex')};metrics.push(m);return m;
}
const curve=[{at:0,value:.3},{at:.5,value:.9},{at:1,value:.3}];
for(const [instrument,entries] of Object.entries(manifest.zones)){
 for(const entry of entries){
  const s=manifest.sources.find(x=>x.id===entry.id);
  if(!s||!/^sources\/vsco-(flute|violin)-[0-9]+\.wav$/.test(s.path))throw Error('Invalid source identity');
  const file=path.join(source,s.path),bytes=readFileSync(file);
  if(createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Recorded source changed');
  const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
  if(raw.length%4)throw Error('Invalid decoded PCM');
  const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);
  const z={...prepareRecordedNote(a,entry.expectedMidi),id:entry.id};
  z.loop=findSustainLoop(z);zones[instrument].push(z);
  const r=renderSustainedNote({zone:z,midi:z.expectedMidi,seconds:16,curve,loop:z.loop});
  if(r.wraps<4||r.maxWrapStep>.15)throw Error('Sustain seam or extension failed '+entry.id);
  write(entry.id+'-sustain.wav',r.samples);
  loops.push({id:z.id,sourceSha256:s.sha256,...z.loop,wraps:r.wraps,maxWrapStep:r.maxWrapStep,maxStep:r.maxStep});
 }
}
if(loops.length!==8)throw Error('Wrong sustain inventory');
const notes=[69,72,74,67].map((midi,i)=>({midi,start:i*4,duration:3.85,pressure:.7}));
for(const instrument of ['flute','violin']){
 const finite=renderRecordedPhrase({zones:zones[instrument],notes,seconds:16}),extended=renderRecordedPhrase({zones:zones[instrument],notes:notes.map(n=>({...n,sustain:true,curve})),seconds:16});
 const a=write(instrument+'-finite.wav',finite.samples),b=write(instrument+'-extended.wav',extended.samples),target=Math.min(a.rms,b.rms);
 const gap=Math.round(sr*.7),ab=new Float32Array(finite.samples.length*2+gap);
 for(const [i,p] of [finite,extended].entries()){const gain=target/[a,b][i].rms;for(let j=0;j<p.samples.length;j++)ab[(i?finite.samples.length+gap:0)+j]=p.samples[j]*gain;}
 write(instrument+'-sustain-AB.wav',ab);
}
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:createHash('sha256').update(readFileSync(path.join(source,'metrics.json'))).digest('hex'),loops,metrics,curve,comparisonOrder:['finite','extended-with-dynamics'],secondStarts:16.7},null,2)+'\n');
