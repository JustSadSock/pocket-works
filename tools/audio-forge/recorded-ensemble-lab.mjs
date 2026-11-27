// Same-run verified recorded bank; no additional external source dependencies.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {findSustainLoop} from './recorded-sustain.mjs';
import {renderRecordedEnsemble} from './recorded-ensemble.mjs';
import {renderEnsembleRoom} from './ensemble-room.mjs';
import reference from './evening-standard-reference.json' with {type:'json'};
const root=path.resolve(process.argv[2]??'.audio-recorded-ensemble'),base=path.resolve(process.argv[3]??'.audio-recorded-dynamics'),sr=48000;
mkdirSync(root,{recursive:true});
const source=readFileSync(path.join(base,'metrics.json')),manifest=JSON.parse(source),sha=b=>createHash('sha256').update(b).digest('hex');
if(manifest.zones.length!==39)throw Error('Unexpected source inventory');
const zones=manifest.zones.map(z=>{
 if(!/^[0-9a-f]{64}$/.test(z.sourceSha256))throw Error('Invalid source identity');
 const file=path.join(base,'library/objects',z.sourceSha256+'.wav');
 if(sha(readFileSync(file))!==z.sourceSha256)throw Error('Source hash mismatch');
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(!raw.length||raw.length%4||!Number.isInteger(z.offsetFrames)||z.offsetFrames<0||z.offsetFrames>=raw.length/4)throw Error('Invalid decoded source');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);
 const v={...z,samples:a.slice(z.offsetFrames)};
 try{v.loop=findSustainLoop(v)}catch(e){if(!/No qualified sustain loop|Invalid sustain source/.test(String(e)))throw e;v.loopError=String(e);}
 return v;
});
const capability=zones.map(({samples,...z})=>z);
// Select only complete paired roots for a morphed sustain. A finite-only
// sample remains in the source catalog but cannot silently fill a looped zone.
const parts=[
 {id:'bass',instrument:'cello-section',articulation:'arco-vib',group:'strings',pan:.24,gain:.34,pitches:[[50],[46],[55],[45],[50],[55],[45],[50]]},
 {id:'melody',instrument:'violin',articulation:'arco-vib',group:'strings',pan:-.46,gain:.31,pitches:[[69,72],[74,72],[70,69],[69,73],[77,76],[74,72],[73,69],[66,69]]},
 {id:'counterline',instrument:'clarinet',articulation:'sustain',group:'woodwind',pan:.2,gain:.24,pitches:[[65,62],[65,70],[67,65],[64,61],[65,69],[70,67],[64,61],[62,66]]},
 {id:'highline',instrument:'flute',articulation:'non-vibrato',group:'woodwind',pan:.52,gain:.17,pitches:[[81,77],[77,74],[79,77],[76,73],[81,84],[82,79],[81,76],[78,74]]},
 {id:'harmony',instrument:'horn',articulation:'sustain',group:'brass',pan:-.12,gain:.23,pitches:[[53],[53],[50],[52],[57],[58],[57],[54]]},
 {id:'signal',instrument:'trumpet',articulation:'sustain',group:'brass',pan:.34,gain:.16,pitches:[[],[77,74],[],[76,73],[74,81],[77,79],[76,73],[78,74]]}
];
const usable=[];
const seconds=24,tracks=parts.map(p=>{
 const list=zones.filter(z=>z.instrument===p.instrument&&z.articulation===p.articulation&&z.loop);
 const roots=[...new Set(list.map(z=>z.expectedMidi))].filter(midi=>new Set(list.filter(z=>z.expectedMidi===midi).map(z=>z.velocity)).size>=(p.instrument==='flute'?1:2));
 if(roots.length<2)throw Error('Insufficient qualified ensemble roots '+p.instrument);
 usable.push(...list.filter(z=>roots.includes(z.expectedMidi)));
 const notes=[];
 for(const [bar,row] of p.pitches.entries())for(const [j,midi] of row.entries()){
  const start=bar*3+j*3/row.length,duration=3/row.length;
  if(Math.min(...roots.map(x=>Math.abs(x-midi)))>5)throw Error('Ensemble score outside qualified coverage '+p.instrument+' '+midi);
  const prev=notes.at(-1),connected=!!prev&&Math.round((prev.start+prev.duration)*sr)===Math.round(start*sr)&&bar!==4;
  const crest=Math.min(.9,.60+.23*Math.sin(Math.PI*bar/7)+(j===0?.04:0));
  notes.push({midi,start,duration,articulation:p.articulation,connected,sustain:true,morph:p.instrument!=='flute',curve:[{at:0,value:.38},{at:.55,value:crest},{at:1,value:.4}]});
 }
 return {id:p.id,instrument:p.instrument,group:p.group,pan:p.pan,gain:p.gain,notes};
});
const dedup=[...new Map(usable.map(z=>[z.id,z])).values()];
const control=renderRecordedEnsemble({zones:dedup,tracks,seconds,mode:'discrete'}),morph=renderRecordedEnsemble({zones:dedup,tracks,seconds,includeTrackStems:true});
const choices=Object.values(morph.choices).flat();
if(choices.filter(c=>c.connected).length<20||choices.filter(c=>c.wraps.some(w=>w>0)).length<20||choices.some(c=>c.connected&&c.boundaryStep>.15))throw Error('Unified ensemble coverage failed');
const metrics=[];
function write(file,a,collection=metrics){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:a.length/2,channels:2,peak,rms:Math.sqrt(e/a.length),sha256:sha(b)};collection.push(m);return m;
}
const a=write('evening-standard-discrete.wav',control.mix),b=write('evening-standard-morph.wav',morph.mix);
for(const [id,x] of Object.entries(morph.stems))write('evening-standard-'+id+'.wav',x);
const target=Math.min(a.rms,b.rms),gap=Math.round(sr*.7)*2,ab=new Float32Array(control.mix.length+morph.mix.length+gap);
for(const [i,p] of [control,morph].entries()){const gain=target/[a,b][i].rms;for(let j=0;j<p.mix.length;j++)ab[(i?control.mix.length+gap:0)+j]=p.mix[j]*gain;}
write('evening-standard-AB.wav',ab);

// Golden-master admission: the original six Evening Standard WAV files are
// immutable. New spatial and stem renders may extend the package, never
// silently replace the approved original composition or its mastering.
if(reference.sourceManifestSha256!==sha(source))throw Error('Evening Standard source manifest changed');
if(Object.keys(reference.files).length!==metrics.length)throw Error('Evening Standard reference inventory mismatch');
for(const m of metrics){
 const expected=reference.files[m.file];
 if(!expected||m.sha256!==expected.sha256||m.frames!==expected.frames||m.channels!==expected.channels)
  throw Error('Original Evening Standard audio changed: '+m.file);
}

// Keep the original six audition files and their mastering unchanged.
// Expanded outputs use the same performances, not a new score or source bank.
mkdirSync(path.join(root,'expanded'),{recursive:true});
const expandedMetrics=[],expanded=(file,a)=>write('expanded/'+file,a,expandedMetrics);
const individual=Object.values(morph.trackStems);
let reconstructionError=0;
for(let i=0;i<morph.mix.length;i++){
 let sum=0;for(const a of individual)sum+=a[i];
 reconstructionError=Math.max(reconstructionError,Math.abs(sum-morph.mix[i]));
}
if(reconstructionError>1e-6)throw Error('Individual stem reconstruction failed');
for(const [id,x] of Object.entries(morph.trackStems))expanded('evening-standard-track-'+id+'.wav',x);

const instrumentStage={
 bass:{x:-3.6,y:8.2,z:1.2,gain:1,width:.68},
 melody:{x:-2.2,y:5.5,z:1.3,gain:1,width:.68},
 counterline:{x:-.6,y:8.1,z:1.5,gain:1,width:.42},
 highline:{x:2.5,y:7.0,z:1.6,gain:1,width:.46},
 harmony:{x:-2.0,y:11.8,z:1.6,gain:1,width:.64},
 signal:{x:2.0,y:12.4,z:1.6,gain:1,width:.58}
};
const chamber=renderEnsembleRoom({stems:morph.trackStems,stage:instrumentStage,preset:'chamber',tailSeconds:3});
const hall=renderEnsembleRoom({stems:morph.trackStems,stage:instrumentStage,preset:'hall',tailSeconds:3});
for(const r of [chamber,hall]){
 if(r.frames!==morph.frames+sr*3||r.wetRms<=0)throw Error('Invalid recorded room');
 let error=0;for(let i=0;i<r.mix.length;i++)error=Math.max(error,Math.abs(r.mix[i]-r.direct[i]-r.wet[i]));
 if(error>1e-6)throw Error('Recorded room reconstruction failed');
 expanded('evening-standard-'+r.preset+'.wav',r.mix);
}
expanded('evening-standard-chamber-direct.wav',chamber.direct);
expanded('evening-standard-chamber-wet.wav',chamber.wet);
// Match RMS over the original musical interval, not over the reverb tail.
// Only attenuation is used, so the comparison cannot introduce clipping.
const variants=[morph.mix,chamber.mix,hall.mix],activeLength=morph.mix.length;
const rms=variants.map(a=>{let e=0;for(let i=0;i<activeLength;i++)e+=a[i]*a[i];return Math.sqrt(e/activeLength);});
if(rms.some(x=>!Number.isFinite(x)||x<=0))throw Error('Invalid room audition RMS');
const gains=rms.map(x=>Math.min(...rms)/x),span=chamber.mix.length+gap;
const roomAB=new Float32Array(span*2+chamber.mix.length);
for(const [i,a] of variants.entries())for(let j=0;j<a.length;j++)roomAB[i*span+j]=a[j]*gains[i];
expanded('evening-standard-room-ABC.wav',roomAB);
const roomComparison={order:['dry','chamber','hall'],startSeconds:[0,span/2/sr,span/sr],rms,gains,tailSeconds:3,
 rooms:[chamber,hall].map(r=>({preset:r.preset,nominalRt60:r.nominalRt60,wetRms:r.wetRms,master:r.master,layout:r.layout}))};

writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(source),capability,usable:dedup.map(z=>z.id),tracks,choices:{control:control.choices,morph:morph.choices},master:{control:control.master,morph:morph.master},metrics,expandedMetrics,reconstructionError,roomComparison,secondStarts:24.7},null,2)+'\n');
