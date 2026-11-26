// Independent research pack: original brass, percussion and chamber orchestra.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderBrassPhrase} from './brass-instruments.mjs';
import {strikePercussion} from './percussion-instruments.mjs';
import {renderBowedPhrase} from './bowed-instruments.mjs';
import {renderWindPhrase} from './wind-instruments.mjs';
import {renderPluckedScore} from './plucked-instruments.mjs';
import {openLibrary} from './persistent-library.mjs';
const root=path.resolve(process.argv[2]??'.audio-orchestra-lab'),sr=48000,metrics=[];
mkdirSync(path.join(root,'notes'),{recursive:true});mkdirSync(path.join(root,'stems'),{recursive:true});
function write(file,samples,channels=1){
 const b=Buffer.alloc(44+samples.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,energy=0;for(let i=0;i<samples.length;i++){const x=samples[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid PCM '+file);b.writeInt16LE(Math.round(x*32767),44+i*2);peak=Math.max(peak,Math.abs(x));energy+=x*x;}
 if(peak<1e-8)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,channels,frames:samples.length/channels,peak,rms:Math.sqrt(energy/samples.length),sha256:createHash('sha256').update(b).digest('hex')};metrics.push(m);return m;
}
const library=openLibrary(path.join(root,'library'));
function sample(id,a,tags,recipe){
 const m=write('notes/'+id+'.wav',a.samples);
 library.insert({id,path:m.file,sha256:m.sha256,title:id,creator:'Pocket Works Sound Forge',license:'original',redistribution:true,provenance:'Original deterministic spectral/modal synthesis',tags:[...tags,'research-only'],approval:'research-only',recipe},root);
}
try{
 for(const instrument of ['horn','trumpet'])for(const midi of [57,69,76])for(const pressure of [.35,.85]){
  const seed=700+midi,recipe={instrument,midi,pressure,seed};
  sample(instrument+'-'+midi+'-'+(pressure<.5?'soft':'strong'),renderBrassPhrase({instrument,notes:[{midi,start:0,duration:1.5,pressure}],seconds:1.8,seed}),['instrument','brass',instrument],recipe);
 }
 for(const instrument of ['timpani','warDrum','snare','cymbal'])for(const velocity of [.35,.85])for(const variant of [1,2]){
  const midi=43,seed=900+variant,recipe={instrument,midi,velocity,seed};
  const id=instrument.toLowerCase()+'-'+(velocity<.5?'soft':'strong')+'-'+variant;
  sample(id,strikePercussion(recipe),['instrument','percussion',instrument.toLowerCase()],recipe);
 }
 if(library.list().length!==28)throw Error('Orchestral library mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const tempo=112,bars=16,meter=4,seconds=bars*meter*60/tempo,frames=Math.round(seconds*sr),beat=60/tempo;
const chords=[[50,57,65],[46,53,62],[43,50,58],[45,52,61],[50,57,65],[48,55,64],[46,53,62],[45,52,61],[43,50,58],[46,53,62],[50,57,65],[45,52,61],[50,57,65],[46,53,62],[45,52,61],[50,57,66]];
const hornPitches=[[62,65,69],[65,69,70],[67,65,62],[64,61,57],[62,65,69],[67,64,60],[65,62,58],[61,64,69],[67,70,74],[70,69,65],[65,69,74],[69,64,61],[62,65,69],[70,69,65],[64,61,69],[66,64,62]];
const trumpetPitches=[[69,74,77],[77,74,70],[74,70,67],[73,76,69],[74,77,81],[79,76,72],[77,74,70],[73,76,81],[74,79,82],[82,81,77],[77,81,86-12],[81,76,73],[74,77,81],[82,81,77],[76,73,81],[78,76,74]];
function phrase(pitches,kind){
 return pitches.flatMap((row,i)=>{
  let t=i*4;
  return row.map((midi,j)=>{
   const duration=[1,1,2][j],start=t*beat;t+=duration;
   const tail=i===15&&j===2?.20:0,pressure=(i<4?.45:i<8?.68:i<12?.82:.64)+(j===1?.045:0);
   const articulation=j===0?'accent':'slur';
   if(kind==='brass')return {midi,start,duration:(duration-tail)*beat,pressure,articulation};
   return {midi,start,duration:(duration-tail)*beat,pressure,articulation:i===0&&j===0?'detached':j===0?'bow-change':'legato'};
  });
 });
}
const hornNotes=phrase(hornPitches,'brass'),trumpetNotes=phrase(trumpetPitches,'brass');
for(const [instrument,notes] of [['horn',hornNotes],['trumpet',trumpetNotes]]){
 const a=renderBrassPhrase({instrument,notes:notes.map(n=>({...n,articulation:'tongued'})),seconds,seed:72}),b=renderBrassPhrase({instrument,notes,seconds,seed:72});
 const am=write(instrument+'-tongued.wav',a.samples),bm=write(instrument+'-slurred.wav',b.samples);
 const target=Math.min(am.rms,bm.rms),gap=Math.round(sr*.7),ab=new Float32Array(frames*2+gap);
 for(const [i,p] of [a,b].entries()){const gain=target/[am,bm][i].rms;for(let j=0;j<frames;j++)ab[(i?frames+gap:0)+j]=p.samples[j]*gain;}
 write(instrument+'-AB.wav',ab);
}
function add(out,src,at,pan,gain){
 const l=Math.sqrt((1-pan)/2)*gain,r=Math.sqrt((1+pan)/2)*gain;
 for(let i=0;i<src.length&&at+i<frames;i++){out[(at+i)*2]+=src[i]*l;out[(at+i)*2+1]+=src[i]*r;}
}
const stems=Object.fromEntries(['brass','strings','woodwind','plucked','percussion'].map(id=>[id,new Float32Array(frames*2)]));
add(stems.brass,renderBrassPhrase({instrument:'horn',notes:hornNotes,seconds,seed:72}).samples,0,-.22,.42);
const trumpet=renderBrassPhrase({instrument:'trumpet',notes:trumpetNotes,seconds,seed:73}).samples;
for(let i=0;i<frames;i++){const bar=i/frames*bars;trumpet[i]*=bar<4?0:bar<8?.46:bar<12?1:.68;}
add(stems.brass,trumpet,0,.28,.30);
const vn=phrase(trumpetPitches,'bowed'),cn=phrase(chords.map(c=>[c[0],c[1],c[0]]),'bowed');
add(stems.strings,renderBowedPhrase({instrument:'violin',notes:vn,seconds,seed:112}).samples,0,-.48,.30);
add(stems.strings,renderBowedPhrase({instrument:'cello',notes:cn,seconds,seed:113}).samples,0,.35,.22);
const fn=hornNotes.map((n,i)=>({midi:n.midi+12,start:n.start,duration:n.duration,pressure:n.pressure*.65,connected:i%3!==0}));
add(stems.woodwind,renderWindPhrase({instrument:'flute',notes:fn,seconds,seed:83}).samples,0,.48,.22);
const harpNotes=chords.flatMap((c,i)=>Array.from({length:8},(_,j)=>({midi:c[j%3]+(j%4===3?12:0),beat:i*4+j*.5,duration:.43,velocity:j===0?.75:.42})));
stems.plucked.set(renderPluckedScore({tempo,bars,meter,seed:19,tracks:[{instrument:'harp',notes:harpNotes,gain:.56,pan:.35}]}).samples);
for(let i=0;i<bars;i++){
 for(const [instrument,t,v,pan,gain] of [['timpani',0,.75,-.12,.32],['warDrum',2,.65,.08,.26],...(i>=4?[['snare',1,.55,.25,.16],['snare',3,.65,.25,.16]]:[]),...(i===8||i===15?[['cymbal',0,.85,.42,.17]]:[])]){
  const midi=instrument==='timpani'?chords[i][0]-12:43;
  add(stems.percussion,strikePercussion({instrument,midi,velocity:v,seed:300+i*16+Math.round(t*2)}).samples,Math.round((i*4+t)*beat*sr),pan,gain);
 }
}
const mix=new Float32Array(frames*2);
for(const a of Object.values(stems))for(let i=0;i<a.length;i++)mix[i]+=a[i];
let peak=0;for(const v of mix)peak=Math.max(peak,Math.abs(v));
const master=Math.min(1,.75/peak);
// Same global gain and edge fade across all stems preserves their additive relation.
for(let i=0;i<frames;i++){const gain=master*Math.min(1,i/240,(frames-1-i)/2400);for(let c=0;c<2;c++){const k=i*2+c;mix[k]*=gain;for(const a of Object.values(stems))a[k]*=gain;}}
for(const [id,a] of Object.entries(stems))write('stems/'+id+'.wav',a,2);
write('march-of-the-vale.wav',mix,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',tempo,bars,meter,seconds:frames/sr,master,comparisonOrder:['tongued','slurred'],secondStarts:frames/sr+.7,metrics},null,2)+'\n');
