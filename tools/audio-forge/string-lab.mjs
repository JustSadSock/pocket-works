// Original instrument auditions and an identical-note General MIDI control.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pluckNote,renderPluckedScore} from './plucked-instruments.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-string-lab');
mkdirSync(path.join(root,'notes'),{recursive:true});
function write(file,samples,channels){
 const b=Buffer.alloc(44+samples.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0;
 for(let i=0;i<samples.length;i++){
  const x=samples[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid string PCM');
  b.writeInt16LE(Math.round(x*32767),44+i*2);peak=Math.max(peak,Math.abs(x));
 }
 writeFileSync(path.join(root,file),b);
 return {file,sha256:createHash('sha256').update(b).digest('hex'),frames:samples.length/channels,channels,peak};
}
const notes=[],library=openLibrary(path.join(root,'library'));
try{
 for(const instrument of ['lute','harp'])for(const midi of [45,57,69])for(const [layer,velocity] of [['soft',.3],['medium',.6],['hard',.9]]){
  const id=instrument+'-'+midi+'-'+layer,seed=1000+midi*10+Math.round(velocity*10);
  const samples=pluckNote({instrument,midi,velocity,duration:1.4,seed}),m=write('notes/'+id+'.wav',samples,1);
  notes.push({...m,instrument,midi,velocity,seed});
  library.insert({id,path:m.file,sha256:m.sha256,title:id,creator:'Pocket Works Sound Forge',license:'original',redistribution:true,provenance:'Original fractional-delay string synthesis; seed '+seed,tags:['instrument','plucked',instrument,layer,'research-only'],approval:'research-only',recipe:{instrument,midi,velocity,seed}},root);
 }
 if(library.list().length!==18||library.list('lute').length!==9)throw Error('String library mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const tempo=92,bars=12,meter=3;
const harmony=[[50,57,65],[48,55,64],[46,53,62],[45,52,61],[50,57,65],[53,60,69],[55,62,70],[45,52,61],[46,53,62],[48,55,64],[45,52,61],[50,57,65]];
const lute=[],harp=[];
for(const [i,c] of harmony.entries()){
 const pattern=i<4?[0,1,2,1,0,1]:i<8?[0,2,1,2,1,2]:[0,1,2,0,2,1];
 for(const [j,k] of pattern.entries())lute.push({midi:c[k],beat:i*3+j*.5,duration:i===11&&j===5?.45:.47,velocity:j===0?.74:.42+(j%3)*.055});
}
const melody=[[69,67,65],[64,65,67],[65,62,65],[64,61,57],[65,69,72],[72,69,65],[70,69,67],[69,64,61],[62,65,69],[67,64,60],[61,64,69],[65,62,62]];
for(const [i,ps] of melody.entries()){
 const rhythm=i<4?[0,1,2]:i<8?[0,.5,1.5]:[0,1.5,2.5];
 for(let j=0;j<ps.length;j++)harp.push({midi:ps[j],beat:i*3+rhythm[j],duration:Math.min(j===2?.43:.85,3-rhythm[j]-.04),velocity:.58+(j===0?.14:0)+(i>=4&&i<8?.07:0)});
}
const tracks=[{instrument:'lute',gain:.65,pan:-.38,notes:lute},{instrument:'harp',gain:.78,pan:.36,notes:harp}];
const score=renderPluckedScore({tempo,bars,meter,tracks,seed:83});
const arrangement=write('river-crossing-physical.wav',score.samples,2);
const manifest={version:2,jobs:[{name:'river-crossing-gm',type:'music',tempo,seed:83,synthGain:.42,tracks:tracks.map(t=>({program:t.instrument==='lute'?24:46,volume:Math.round(t.gain*127),pan:Math.round((t.pan+1)*63.5),humanizeBeats:0,humanizeVelocity:0,notes:t.notes.map(n=>({note:n.midi,beat:n.beat,duration:n.duration,velocity:Math.round(n.velocity*127)}))})),output:'river-crossing-gm.wav',post:{normalizeDb:-4}}]};
writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(path.join(root,'string-metrics.json'),JSON.stringify({approval:'research-only',tempo,bars,meter,notes,arrangement},null,2)+'\n');
