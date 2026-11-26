// Research-only bowed auditions. The same notes are used in detached/connected pairs.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderBowedPhrase} from './bowed-instruments.mjs';
import {renderPluckedScore} from './plucked-instruments.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-bowed-lab');
mkdirSync(path.join(root,'notes'),{recursive:true});
const sr=48000,metrics=[];
function write(file,samples,channels=1){
 const b=Buffer.alloc(44+samples.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,energy=0;
 for(let i=0;i<samples.length;i++){
  const x=samples[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition PCM');
  b.writeInt16LE(Math.round(x*32767),44+i*2);peak=Math.max(peak,Math.abs(x));energy+=x*x;
 }
 if(!peak)throw Error('Silent audition');
 writeFileSync(path.join(root,file),b);
 const m={file,channels,frames:samples.length/channels,peak,rms:Math.sqrt(energy/samples.length),sha256:createHash('sha256').update(b).digest('hex')};metrics.push(m);return m;
}
const tempo=80,bars=8,meter=4,seconds=bars*meter*60/tempo;
const harmony=[[50,57,65],[46,53,62],[43,50,58],[45,52,61],[50,57,65],[48,55,64],[45,52,61],[50,57,66]];
const violinPitches=[[69,72,74],[77,76,74],[70,74,79],[76,73,69],[77,81,79],[76,74,72],[73,76,81],[78,76,74]];
const celloPitches=[[50,57,53],[46,53,50],[43,50,46],[45,52,49],[50,57,53],[48,55,52],[45,52,49],[50,57,54]];
function melody(pitches,instrument){
 return pitches.flatMap((p,bar)=>{
  const durations=instrument==='violin'?[1,1,2]:[2,1,1];
  let beat=bar*4;
  return p.map((midi,i)=>{
   const start=beat*60/tempo;
   const duration=(durations[i]-(bar===7&&i===2?.16:0))*60/tempo;
   const articulation=bar===0&&i===0?'detached':i===0?'bow-change':'legato';
   const n={midi,start,duration,articulation,pressure:(instrument==='violin'?.68:.57)+(.1*Math.sin(bar*Math.PI/7))+(i===1?.07:0),position:(instrument==='violin'?.15:.21)+(bar>=4&&bar<7?-.035:0)};
   beat+=durations[i];return n;
  });
 });
}
const notes={violin:melody(violinPitches,'violin'),cello:melody(celloPitches,'cello')};
const performances={};
for(const instrument of ['violin','cello']){
 const pair=['detached','connected'].map(mode=>renderBowedPhrase({instrument,notes:notes[instrument].map(n=>({...n,articulation:mode==='detached'?'detached':n.articulation})),seconds,seed:112}));
 const files=pair.map((p,i)=>write(instrument+'-'+['detached','connected'][i]+'.wav',p.samples));
 const target=Math.min(...files.map(m=>m.rms)),gap=Math.round(sr*.7),ab=new Float32Array(pair[0].samples.length+gap+pair[1].samples.length);
 for(let i=0;i<2;i++){const src=pair[i].samples,offset=i?pair[0].samples.length+gap:0,gain=target/files[i].rms;for(let j=0;j<src.length;j++)ab[offset+j]=src[j]*gain;}
 write(instrument+'-AB.wav',ab);performances[instrument]=pair[1].samples;
}
const library=openLibrary(path.join(root,'library'));
try{
 for(const instrument of ['violin','cello'])for(const midi of (instrument==='violin'?[57,69,81]:[45,57,69]))for(const [layer,pressure] of [['soft',.35],['strong',.85]]){
  const id=instrument+'-'+midi+'-'+layer,seed=500+midi;
  const a=renderBowedPhrase({instrument,notes:[{midi,start:0,duration:1.6,pressure}],seconds:1.85,seed});
  const m=write('notes/'+id+'.wav',a.samples);
  library.insert({id,path:m.file,sha256:m.sha256,title:id,creator:'Pocket Works Sound Forge',license:'original',redistribution:true,provenance:'Original spectral/modal bowed synthesis; seed '+seed,tags:['instrument','bowed',instrument,layer,'research-only'],approval:'research-only',recipe:{instrument,midi,pressure,seed}},root);
 }
 if(library.list().length!==12||library.list('cello').length!==6)throw Error('Bowed catalog mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
// Original 24-second chamber study. The middle phrase changes bow contact and harmony.
const accompaniment=harmony.flatMap((ch,i)=>Array.from({length:8},(_,j)=>({midi:ch[[0,1,2,1,0,2,1,2][j]]+(j===5?12:0),beat:i*4+j*.5,duration:.43,velocity:j===0?.62:.38+(i>=4&&i<7?.08:0)})));
const backing=renderPluckedScore({tempo,bars,meter,seed:99,tracks:[{instrument:'harp',pan:.4,gain:.65,notes:accompaniment}]}).samples;
const violin=performances.violin,cello=performances.cello;
for(let i=0;i<violin.length;i++){
 backing[i*2]=backing[i*2]*.72+violin[i]*.52+cello[i]*.38;
 backing[i*2+1]=backing[i*2+1]*.72+violin[i]*.36+cello[i]*.52;
}
write('winter-banner.wav',backing,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',tempo,bars,meter,seconds,notes,metrics,comparisonOrder:['detached','connected'],secondStarts:seconds+.7},null,2)+'\n');
