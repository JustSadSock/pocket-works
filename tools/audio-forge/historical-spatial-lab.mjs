// Historical spatial and searchable source extension. Original Lantern Road PCM remains immutable.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderEnsembleRoom} from './ensemble-room.mjs';
import {openLibrary} from './persistent-library.mjs';
const SR=48000,revision='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const reference={
  "sourceManifestSha256": "e545daee64223ea119d177e46c9aa50a5cd7813c064e281e909d3ca0ea523df1",
  "files": {
    "lantern-road.wav": "126149a6cdafffc72b1bac61102119e2886526334d37b99e62646794150cf587",
    "lantern-road-recorder-sustain.wav": "a3a1aba835e81f55b939ae074c47d81988c84c5270777f36e4c2c2766f7e3186",
    "lantern-road-recorder-staccato.wav": "72ee8bd5aa9a6333ff13d1584fc0aa18b5226ab7bddf775b0746a103ab4a49d8",
    "lantern-road-folk-harp.wav": "9e5d3a22312e4cc10e4e5c4cab8b2734e50a7f609ea55c409be6ebc0453446e9",
    "lantern-road-frame-drum.wav": "d4cd77217e4a8d7492e7d1b00311dae63dfcd5462a7ace6f57c54a01a714a18e",
    "lantern-road-ocarina.wav": "aac87e5f8eaf59aee671c71ae21ecdbfd74201c80f5c87b47d3f9683fb4baa1d"
  }
};
function centerStereo(a,pan){
 if(!(a instanceof Float32Array)||a.length<2||a.length%2||!Number.isFinite(pan)||Math.abs(pan)>1)throw Error("Invalid centered stage source");
 const out=new Float32Array(a.length),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);
 let error=0;
 for(let i=0;i<a.length;i+=2){
  const left=a[i],right=a[i+1],x=left*l+right*r;
  if(!Number.isFinite(x))throw Error("Nonfinite stage source");
  error=Math.max(error,Math.abs(left-x*l),Math.abs(right-x*r));
  out[i]=out[i+1]=x*Math.SQRT1_2;
 }
 if(error>2/32767)throw Error("Stem is not an independently panned mono performance");
 return {samples:out,panReconstructionError:error};
}
function rms(a,n=a.length){
 if(!Number.isInteger(n)||n<=0||n>a.length)throw Error("Invalid RMS interval");
 let e=0;for(let i=0;i<n;i++){if(!Number.isFinite(a[i]))throw Error("Invalid RMS sample");e+=a[i]*a[i];}
 return Math.sqrt(e/n);
}
function compare(audios,activeLength,gap){
 if(!Array.isArray(audios)||audios.length!==3||!Number.isInteger(gap)||gap<0||audios.some(a=>!(a instanceof Float32Array)||a.length%2))throw Error("Invalid room comparison");
 const energy=audios.map(a=>rms(a,activeLength)),target=Math.min(...energy);
 if(!(target>0))throw Error("Silent room comparison");
 const span=Math.max(...audios.map(a=>a.length))+gap,gains=energy.map(e=>target/e),out=new Float32Array(span*2+Math.max(...audios.map(a=>a.length)));
 for(let j=0;j<3;j++)for(let i=0;i<audios[j].length;i++)out[j*span+i]=audios[j][i]*gains[j];
 return {samples:out,gains,energy,span,target};
}
function selfTest(){
 const a=Float32Array.from([.2,.1,-.4,-.2]),p=-.6,r=centerStereo(a,p);
 if(Math.abs(r.panReconstructionError)>1e-7)throw Error("Unpan check");
 const q=compare([Float32Array.from([.2,.2,.2,.2]),Float32Array.from([.1,.1,.1,.1]),Float32Array.from([.4,.4,.4,.4])],4,2);
 if(q.gains.join(",")!=="0.5,1,0.25"||q.span!==6||q.samples.length!==16)throw Error("Matched comparison");
 if(q.samples[4]||q.samples[5]||q.samples[10]||q.samples[11])throw Error("Comparison gap");
 const fails=f=>{try{f();return false}catch{return true}};
 if(!fails(()=>centerStereo(Float32Array.from([.2,.2]),p))||!fails(()=>compare([a,a,new Float32Array(4)],4,2)))throw Error("Rejection test");
 return 5;
}

if(process.argv[2]==='--self-test'){console.log('Historical spatial checks: '+selfTest());process.exit(0);}
const base=path.resolve(process.argv[2]??'.audio-historical-expansion'),root=path.resolve(process.argv[3]??'.audio-historical-spatial');
mkdirSync(root,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const sourceManifest=readFileSync(path.join(base,'metrics.json')),manifest=JSON.parse(sourceManifest);
if(sha(sourceManifest)!==reference.sourceManifestSha256||manifest.approval!=='research-only'||manifest.revision!==revision||manifest.admissions.length!==17||manifest.rejections.length!==0)throw Error('Historical reference manifest mismatch');
const license=readFileSync(path.join(base,'LICENSE'));
if(blob(license)!=='0e259d42c996742e9e3cba14c677129b2c1b6311'||sha(license)!==manifest.license.sha256)throw Error('Historical license mismatch');
copyFileSync(path.join(base,'LICENSE'),path.join(root,'LICENSE'));
const sourcePaths=new Set(),sourceHashes=new Set(),lib=openLibrary(path.join(root,'library'));
let catalog;
try{
 for(const a of manifest.admissions){
  const {pin,source,receipt}=a;
  if(!/^[a-z0-9-]+$/.test(pin.id)||source.file!=='sources/'+pin.id+'.wav'||source.upstreamPath!==pin.path||source.blob!==pin.blob||sourcePaths.has(source.file)||sourceHashes.has(source.sha256))throw Error('Invalid historical source identity');
  const bytes=readFileSync(path.join(base,source.file));
  if(bytes.length!==pin.size||blob(bytes)!==pin.blob||sha(bytes)!==source.sha256)throw Error('Historical source corruption '+pin.id);
  if(pin.midi!==null&&(!Number.isFinite(receipt.measuredMidi)||Math.abs(receipt.measuredMidi-pin.midi)>.75))throw Error('Historical pitch admission mismatch');
  sourcePaths.add(source.file);sourceHashes.add(source.sha256);
  const instrument=pin.kind==='harp'?'folk-harp':pin.kind.startsWith('drum-')?'frame-drum':'recorder';
  const articulation=pin.kind==='wind'?'sustain':pin.kind==='harp'?'pluck':pin.kind==='staccato'?'staccato':pin.kind.slice(5);
  const entry={id:'vcsl-historical-'+pin.id,path:source.file,title:instrument+' '+articulation+(pin.midi===null?' take '+pin.variant:' MIDI '+pin.midi),creator:'VCSL contributors (Versilian Studios Community Library)',license:'CC0-1.0',redistribution:true,provenance:'Pinned VCSL original recording '+pin.path,sourceUrl:source.url,rightsEvidence:'https://github.com/sgossner/VCSL/blob/'+revision+'/LICENSE',sha256:source.sha256,tags:['recorded','historical','research-only',instrument,articulation],approval:'research-only',pin:{revision,blob:pin.blob,bytes:pin.size},instrument,articulation,expectedMidi:pin.midi,measuredMidi:receipt.measuredMidi??null,variant:pin.variant};
  lib.insert(entry,base);
 }
 if(lib.list().length!==17||lib.list('recorded recorder').length!==8||lib.list('folk harp').length!==5||lib.list('frame drum').length!==4)throw Error('Historical search inventory mismatch');
 catalog=lib.list();for(const e of catalog)lib.resolve(e.id);
 writeFileSync(path.join(root,'library','index.json'),JSON.stringify({approval:'research-only',entries:catalog},null,2)+'\n');
}finally{lib.close();}
function readWave(name){
 const b=readFileSync(path.join(base,name)),hash=sha(b),declared=manifest.metrics.find(x=>x.file===name);
 if(!reference.files[name]||hash!==reference.files[name]||declared?.sha256!==hash||b.length!==44+55*SR*4||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,16)!=='WAVEfmt '||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==2||b.readUInt32LE(24)!==SR||b.readUInt16LE(34)!==16||b.readUInt32LE(40)!==b.length-44)throw Error('Historical PCM reference mismatch '+name);
 const a=new Float32Array((b.length-44)/2);
 for(let i=0;i<a.length;i++){const x=b.readInt16LE(44+2*i);if(Math.abs(x)>=32767)throw Error('Clipped source stem');a[i]=x/32767;}
 return a;
}
if(manifest.metrics.length!==6)throw Error('Unexpected golden inventory');
const dry=readWave('lantern-road.wav'),parts=[
 ['recorder-sustain',-.30,'recorder'],['recorder-staccato',-.30,'recorder'],
 ['folk-harp',.36,'folk-harp'],['frame-drum',.12,'frame-drum'],['ocarina',.24,'ocarina']
];
const original=parts.map(([id])=>readWave('lantern-road-'+id+'.wav'));
let pcmError=0;
for(let i=0;i<dry.length;i++){let sum=0;for(const a of original)sum+=a[i];pcmError=Math.max(pcmError,Math.abs(sum-dry[i]));}
if(pcmError>3/32767)throw Error('Historical original stem reconstruction mismatch');
const stems=Object.create(null),centering=[];
for(const [i,[id,pan,player]] of parts.entries()){
 const c=centerStereo(original[i],pan);
 centering.push({id,player,originalPan:pan,error:c.panReconstructionError});
 if(!stems[player])stems[player]=c.samples;
 else for(let j=0;j<c.samples.length;j++)stems[player][j]+=c.samples[j];
}
const stage={
 recorder:{x:-1.8,y:5.4,z:1.5,gain:1,width:0},
 'folk-harp':{x:2.0,y:4.9,z:1.1,gain:1,width:0},
 'frame-drum':{x:.7,y:7.1,z:1.1,gain:1,width:0},
 ocarina:{x:1.5,y:6.5,z:1.45,gain:1,width:0}
};
const chamber=renderEnsembleRoom({stems,stage,preset:'chamber',tailSeconds:3}),hall=renderEnsembleRoom({stems,stage,preset:'hall',tailSeconds:3});
const roomReceipts=[];
for(const r of [chamber,hall]){
 if(r.frames!==58*SR||!(r.wetRms>0)||Object.keys(r.layout).length!==4)throw Error('Invalid historical room');
 let error=0;for(let i=0;i<r.mix.length;i++)error=Math.max(error,Math.abs(r.mix[i]-r.direct[i]-r.wet[i]));
 if(error>1e-6)throw Error('Historical room decomposition mismatch');
 roomReceipts.push({preset:r.preset,frames:r.frames,nominalRt60:r.nominalRt60,wetRms:r.wetRms,layout:r.layout,reconstructionError:error});
}
const comp=compare([dry,chamber.mix,hall.mix],48*SR*2,Math.round(.7*SR)*2),metrics=[];
function write(name,a){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid historical room WAV');peak=Math.max(peak,Math.abs(x));b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!(peak>0))throw Error('Silent historical room WAV');writeFileSync(path.join(root,name),b);metrics.push({file:name,sha256:sha(b),frames:a.length/2,channels:2,peak,rms:rms(a)});
}
write('lantern-road-chamber.wav',chamber.mix);
write('lantern-road-hall.wav',hall.mix);
write('lantern-road-chamber-direct.wav',chamber.direct);
write('lantern-road-chamber-wet.wav',chamber.wet);
write('lantern-road-room-ABC.wav',comp.samples);
const active=48*SR*2,matched=[0,1,2].map(i=>rms(comp.samples.subarray(i*comp.span,i*comp.span+active)));
if(Math.max(...matched)-Math.min(...matched)>1e-7||metrics.length!==5)throw Error('Historical room comparison mismatch');
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceManifestSha256:sha(sourceManifest),reference,sourceCount:catalog.length,sourceObjectCount:sourceHashes.size,originalPcmError:pcmError,centering,rooms:roomReceipts,comparison:{order:['dry','chamber','hall'],startSeconds:[0,comp.span/(2*SR),comp.span/SR],activeSeconds:48,gains:comp.gains,matchedRms:matched},metrics,intervalTransitionCoverage:0},null,2)+'\n');
