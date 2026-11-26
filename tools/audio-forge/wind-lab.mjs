// Research audition: identical phrase, detached versus continuous wind articulation.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderWindPhrase} from './wind-instruments.mjs';
import {renderPluckedScore} from './plucked-instruments.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-wind-lab');
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
const tempo=90,bars=8,meter=3,seconds=bars*meter*60/tempo;
const phrases=[[62,65,67,69,67],[65,64,62,57,60],[65,69,72,70,67],[65,64,61,64,62]];
const rhythm=[.75,.75,1.5,1,1.5];
const notes=phrases.flatMap((p,k)=>{
 let beat=k*6;
 return p.map((midi,i)=>{const n={midi,start:beat*60/tempo,duration:rhythm[i]*60/tempo,pressure:[.58,.65,.81,.72,.57][i],connected:i!==0};beat+=rhythm[i];return n;});
});
const performances={};
for(const instrument of ['flute','reed']){
 const pair=['detached','connected'].map(mode=>renderWindPhrase({instrument,notes:notes.map(n=>({...n,connected:mode==='connected'&&n.connected})),seconds,seed:83}));
 const files=pair.map((p,i)=>write(instrument+'-'+['detached','connected'][i]+'.wav',p.samples));
 const target=Math.min(...files.map(m=>m.rms)),gap=Math.round(sr*.7),ab=new Float32Array(pair[0].samples.length+gap+pair[1].samples.length);
 for(let i=0;i<2;i++){const src=pair[i].samples,offset=i?pair[0].samples.length+gap:0,gain=target/files[i].rms;for(let j=0;j<src.length;j++)ab[offset+j]=src[j]*gain;}
 write(instrument+'-AB.wav',ab);performances[instrument]=pair[1].samples;
}
const library=openLibrary(path.join(root,'library'));
try{
 for(const instrument of ['flute','reed'])for(const midi of [57,69,81])for(const [layer,pressure] of [['soft',.35],['strong',.85]]){
  const id=instrument+'-'+midi+'-'+layer,seed=100+midi;
  const a=renderWindPhrase({instrument,notes:[{midi,start:0,duration:1.25,pressure}],seconds:1.45,seed});
  const m=write('notes/'+id+'.wav',a.samples);
  library.insert({id,path:m.file,sha256:m.sha256,title:id,creator:'Pocket Works Sound Forge',license:'original',redistribution:true,provenance:'Original continuous-phase harmonic wind model; seed '+seed,tags:['instrument','wind',instrument,layer,'research-only'],approval:'research-only',recipe:{instrument,midi,pressure,seed}},root);
 }
 if(library.list().length!==12||library.list('reed').length!==6)throw Error('Wind catalog mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
// A short original ensemble study uses the connected flute and original plucked backing.
const chords=[[50,57,65],[46,53,62],[48,55,64],[45,52,61],[50,57,65],[55,62,70],[45,52,61],[50,57,65]];
const accompaniment=chords.flatMap((ch,i)=>Array.from({length:6},(_,j)=>({midi:ch[[0,1,2,1,0,2][j]],beat:i*3+j*.5,duration:.43,velocity:j===0?.62:.4})));
const backing=renderPluckedScore({tempo,bars,meter,seed:99,tracks:[{instrument:'lute',pan:-.3,gain:.7,notes:accompaniment}]}).samples;
const flute=performances.flute,reed=performances.reed;
for(let i=0;i<flute.length;i++){
 const middle=i>=flute.length*.5&&i<flute.length*.75;
 const lead=middle?reed[i]*.42:flute[i]*.54;
 backing[i*2]=backing[i*2]*.7+lead*.66;backing[i*2+1]=backing[i*2+1]*.7+lead*.86;
}
write('hill-path.wav',backing,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',tempo,bars,meter,seconds,notes,metrics,comparisonOrder:['detached','connected'],secondStarts:seconds+.7},null,2)+'\n');
