// Native lab: decode entire original SHA-256 verified WAVs, never trimmed tails.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {prepareRecordedRelease} from './recorded-release.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
import {renderRecordedEnsemble} from './recorded-ensemble.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-release'),base=path.resolve(process.argv[3]??'.audio-recorded-performance'),SR=48000;
mkdirSync(root,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),manifest=readFileSync(path.join(base,'metrics.json')),input=JSON.parse(manifest),index=JSON.parse(readFileSync(path.join(base,'library/index.json'),'utf8'));
const specs=[
 {instrument:'violin',articulation:'arco-vib',group:'strings',midi:[69,72,69,67],pan:-.45,pressure:.74,offset:.15,melody:[[69,72],[70,69],[72,69],[67,72],[70,67],[69,72],[69,73],[69,74]]},
 {instrument:'flute',articulation:'non-vibrato',group:'woodwind',midi:[72,69,72,81],pan:.42,pressure:.63,offset:.55,melody:[[77,76],[74,77],[77,81],[76,74],[74,79],[77,76],[76,73],[77,74]]},
 {instrument:'cello-section',articulation:'arco-vib',group:'strings',midi:[50,53,57,50],pan:.21,pressure:.66,offset:0,melody:[[50,57],[53,50],[53,57],[48,52],[55,50],[57,53],[57,52],[50,50]]},
 {instrument:'clarinet',articulation:'sustain',group:'woodwind',midi:[62,65,70,62],pan:-.19,pressure:.68,offset:.35,melody:[[65,69],[70,65],[65,67],[64,67],[62,70],[65,62],[64,69],[65,62]]}
];
const zones=[],releaseBank=[],sources=[],metrics=[],choices={};
for(const z of input.zones){
 if(!specs.some(s=>s.instrument===z.instrument&&s.articulation===z.articulation))continue;
 const entry=index.entries.find(e=>e.id===z.id);
 if(!entry||entry.sha256!==z.sourceSha256)throw Error('Release source identity mismatch');
 const f=path.join(base,'library/objects',z.sourceSha256+'.wav'),b=readFileSync(f);
 if(sha(b)!==z.sourceSha256)throw Error('Release source checksum mismatch');
 const raw=execFileSync('sox',['-R','-v','.8',f,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-'],{maxBuffer:12*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid full release decode');
 const pcm=new Float32Array(raw.length/4);for(let i=0;i<pcm.length;i++)pcm[i]=raw.readFloatLE(i*4);
 const body=prepareRecordedNote(pcm.slice(0,12*SR),z.expectedMidi),zone={...z,...body};
 const release=prepareRecordedRelease(pcm,zone);
 zones.push(zone);releaseBank.push(release);
 const {samples,...receipt}=release;sources.push(receipt);
}
if(sources.length!==23)throw Error('Release source inventory mismatch: '+sources.length);
function write(file,samples,channels=1){
 const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
 let peak=0,energy=0;for(let i=0;i<samples.length;i++){const x=samples[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid release audition '+file);peak=Math.max(peak,Math.abs(x));energy+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(peak<1e-7)throw Error('Silent release audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:samples.length/channels,channels,peak,rms:Math.sqrt(energy/samples.length),sha256:sha(b)};metrics.push(m);return m;
}
function compare(name,a,b,channels=1){
 if(a.length!==b.length||a.every((x,i)=>x===b[i]))throw Error('Release comparison was not exercised '+name);
 const am=write(name+'-control.wav',a,channels),bm=write(name+'-recorded.wav',b,channels),gap=33600*channels,target=Math.min(am.rms,bm.rms),out=new Float32Array(a.length+b.length+gap);
 for(const [i,s] of [a,b].entries()){const g=target/[am,bm][i].rms;for(let j=0;j<s.length;j++)out[(i?a.length+gap:0)+j]=s[j]*g;}
 write(name+'-AB.wav',out,channels);
}
const tracks=[];
for(const s of specs){
 const notes=s.midi.map((midi,i)=>({midi,start:i*2.5,duration:.8,articulation:s.articulation,pressure:s.pressure,morph:s.instrument!=='flute',release:'recorded'}));
 const dry=notes.map(({release,...n})=>n),opts={zones,instrument:s.instrument,seconds:10};
 const a=renderRecordedPerformance({...opts,notes:dry}),b=renderRecordedPerformance({...opts,notes,releaseBank});
 if(b.choices.some(c=>!c.release||c.release.boundaryStep>.15))throw Error('Release branch not exercised');
 choices[s.instrument]=b.choices;
 compare(s.instrument,a.samples,b.samples);
 // Original D-minor chamber study, 8 bars at 2.8 s per bar, staggered entries.
 const part=s.melody.flatMap((pair,i)=>{
  const start=i*2.8+s.offset,pressure=s.pressure*[.83,.90,.95,1,.91,.96,1,.78][i];
  return pair.map((midi,j)=>({midi,start:start+j*.72,duration:j?.76:.72,articulation:s.articulation,pressure:j?pressure*.92:pressure,morph:s.instrument!=='flute',connected:j===1,...(j===1?{release:'recorded'}:{})}));
 });
 tracks.push({id:s.instrument,instrument:s.instrument,group:s.group,pan:s.pan,gain:.39,notes:part});
}
const seconds=23;
const dry=renderRecordedEnsemble({zones,tracks:tracks.map(t=>({...t,notes:t.notes.map(({release,...n})=>n)})),seconds});
const wet=renderRecordedEnsemble({zones,tracks,seconds,releaseBank,includeTrackStems:true});
compare('afterglow-quartet',dry.mix,wet.mix,2);
for(const [id,a] of Object.entries(wet.trackStems))write('afterglow-'+id+'.wav',a,2);
const receipts=Object.values(wet.choices).flat().filter(c=>c.release);
if(metrics.length!==19||receipts.length!==32||receipts.some(c=>c.release.boundaryStep>.15))throw Error('Release ensemble coverage mismatch');
let reconstructionError=0;
const stems=Object.values(wet.trackStems);
for(let i=0;i<wet.mix.length;i++)reconstructionError=Math.max(reconstructionError,Math.abs(wet.mix[i]-stems.reduce((sum,a)=>sum+a[i],0)));
if(reconstructionError>1e-6)throw Error('Release ensemble stems do not reconstruct the master');
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(manifest),kind:'extracted-recorded-ending',intervalTransitionCoverage:0,sourceReceipts:sources,choices,ensembleChoices:wet.choices,reconstructionError,metrics,comparisons:specs.map(s=>({file:s.instrument+'-AB.wav',secondStarts:10.7,order:['legacy-envelope','recorded-ending']})).concat({file:'afterglow-quartet-AB.wav',secondStarts:23.7,order:['legacy-envelope','recorded-ending']})},null,2)+'\n');
