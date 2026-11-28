// Historical Instrument Expansion research laboratory.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {prepareTransientNote} from './recorded-transients.mjs';
import {prepareDedicatedRelease} from './recorded-release.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
const SR=48000,revision='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const pins=[
  {
    "id": "wind-72",
    "kind": "wind",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/SopRecorder_Sus_C4_rr1_Main.wav",
    "blob": "4d30c5fe153106f3940c732e2757c6a676589771",
    "size": 1992312,
    "midi": 72,
    "variant": 1
  },
  {
    "id": "staccato-72",
    "kind": "staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Staccato/SopRecorder_Stac_C4_rr1_Main.wav",
    "blob": "c6c25b8d66e9a27a0547b555da07af7c48b7f4d4",
    "size": 98312,
    "midi": 72,
    "variant": 1
  },
  {
    "id": "wind-74",
    "kind": "wind",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/SopRecorder_Sus_D4_rr1_Main.wav",
    "blob": "5c38cb69f47422eaaa18dbfe85c07a7dab9ab52a",
    "size": 2696024,
    "midi": 74,
    "variant": 1
  },
  {
    "id": "staccato-74",
    "kind": "staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Staccato/SopRecorder_Stac_D4_rr1_Main.wav",
    "blob": "0a0e88566f549bce178790843d8c353b44d911d7",
    "size": 80348,
    "midi": 74,
    "variant": 1
  },
  {
    "id": "wind-76",
    "kind": "wind",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/SopRecorder_Sus_E4_rr1_Main.wav",
    "blob": "8e333e5820a8aa675e4353107f012509150f73ca",
    "size": 2616636,
    "midi": 76,
    "variant": 1
  },
  {
    "id": "staccato-76",
    "kind": "staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Staccato/SopRecorder_Stac_E4_rr1_Main.wav",
    "blob": "47ec3c2aa7ab4cc50dfc5a71ae496ff1f05626c1",
    "size": 82664,
    "midi": 76,
    "variant": 1
  },
  {
    "id": "wind-82",
    "kind": "wind",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/SopRecorder_Sus_A#4_rr1_Main.wav",
    "blob": "90a2880b8912882b935d94421aa0f48dd71350e7",
    "size": 2148688,
    "midi": 82,
    "variant": 1
  },
  {
    "id": "staccato-82",
    "kind": "staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Staccato/SopRecorder_Stac_A#4_rr1_Main.wav",
    "blob": "90d5b604e9a4f1e328f58f381bf805fefdb1de12",
    "size": 92616,
    "midi": 82,
    "variant": 1
  },
  {
    "id": "harp-62",
    "kind": "harp",
    "path": "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_D3_v2_RR1.wav",
    "blob": "a8df549257d80a918dda9387aa2d7f53786b0287",
    "size": 1008386,
    "midi": 62,
    "variant": 1
  },
  {
    "id": "harp-68",
    "kind": "harp",
    "path": "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_G#3_v2_RR1.wav",
    "blob": "643f972c49a88612cf992d9acd391b2ac896a6fc",
    "size": 718130,
    "midi": 68,
    "variant": 1
  },
  {
    "id": "harp-70",
    "kind": "harp",
    "path": "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_A#3_v2_RR1.wav",
    "blob": "fedcdbbd780dd9aa1e7b75f54301495b30453573",
    "size": 691094,
    "midi": 70,
    "variant": 1
  },
  {
    "id": "harp-72",
    "kind": "harp",
    "path": "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_C4_v2_RR1.wav",
    "blob": "7118eaa188436970e23b28019b5b6e7fe6a1b5ef",
    "size": 775134,
    "midi": 72,
    "variant": 1
  },
  {
    "id": "harp-74",
    "kind": "harp",
    "path": "Chordophones/Composite Chordophones/Folk Harp/EWHarp_Normal_D4_v2_RR1.wav",
    "blob": "3135cb1ae0a767f1f474e94b01f8898222ab6138",
    "size": 955322,
    "midi": 74,
    "variant": 1
  },
  {
    "id": "drum-open-1",
    "kind": "drum-open",
    "path": "Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v2_rr1_Sum.wav",
    "blob": "d1178f9bc9be4abd7d3e3b02916b232dafc8d470",
    "size": 659856,
    "midi": null,
    "variant": 1
  },
  {
    "id": "drum-open-2",
    "kind": "drum-open",
    "path": "Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v2_rr2_Sum.wav",
    "blob": "9090f319d7f4952ecfcf2916bdbea76b39fd5d3c",
    "size": 607780,
    "midi": null,
    "variant": 2
  },
  {
    "id": "drum-muted-1",
    "kind": "drum-muted",
    "path": "Membranophones/Struck Membranophones/Frame Drum/HDrumL_HitMuted_v2_rr1_Sum.wav",
    "blob": "401c1638c3e7bf730a275575c64cc1e0658a3e17",
    "size": 305388,
    "midi": null,
    "variant": 1
  },
  {
    "id": "drum-muted-2",
    "kind": "drum-muted",
    "path": "Membranophones/Struck Membranophones/Frame Drum/HDrumL_HitMuted_v2_rr2_Sum.wav",
    "blob": "5db6279874d8a968b4aa0aaa2ddbd9b075d05f2b",
    "size": 287200,
    "midi": null,
    "variant": 2
  }
];
const melody=[[74,77,76,74],[72,74,77,79],[81,79,77,76],[74,72,74],[77,81,79,77],[76,74,72,74],[82,81,79,77],[76,74,74],[74,76,77,81],[79,77,76,72],[74,77,81,82],[81,79,77,76],[82,81,77,74],[72,76,79,77],[76,77,76,72],[74,74,74]],harmony=[[62,69,65],[70,65,70],[60,67,72],[62,69,74],[65,72,69],[60,67,64],[70,65,70],[62,69,65],[62,69,77],[60,67,72],[70,65,74],[65,72,69],[70,65,70],[60,67,72],[60,67,64],[62,69,74]];
function finiteTrack(zones,events,frames){
 const samples=new Float32Array(frames),receipts=[],cursors=new Map();
 for(const e of events){
  if(!Number.isInteger(e.frame)||e.frame<0||e.frame>=frames||!(e.velocity>0&&e.velocity<=1))throw Error("Invalid finite event");
  const zs=zones.filter(z=>z.kind===e.kind).sort((a,b)=>Math.abs((a.midi??0)-(e.midi??0))-Math.abs((b.midi??0)-(e.midi??0))||(a.midi??0)-(b.midi??0)||a.variant-b.variant);
  if(!zs.length)throw Error("No finite source");
  const root=zs[0].midi;
  if(root===null?e.midi!==null:!Number.isInteger(e.midi)||Math.abs(root-e.midi)>3)throw Error("Finite pitch coverage");
  const candidates=zs.filter(z=>z.midi===root),key=e.kind+":"+root,index=cursors.get(key)??0,z=candidates[index%candidates.length];cursors.set(key,index+1);
  if(!(z.samples instanceof Float32Array)||z.samples.length<100||!(z.peak>0&&z.rms>0)||!/^[a-f0-9]{64}$/.test(z.sourceSha256))throw Error("Invalid finite source");
  const rate=root===null?1:2**((e.midi-z.measuredMidi)/12),n=Math.floor((z.samples.length-2)/rate)+1;
  if(!Number.isFinite(rate)||n<100||e.frame+n>frames)throw Error("Finite tail exceeds score");
  const gain=e.velocity*Math.min(.24/z.peak,.085/z.rms),fade=Math.min(240,Math.floor(n/4));
  for(let i=0;i<n;i++){const p=i*rate,k=Math.floor(p),f=p-k,x=z.samples[k]*(1-f)+z.samples[k+1]*f;samples[e.frame+i]+=x*gain*Math.min(1,i/96,(n-1-i)/fade);}
  receipts.push({source:z.id,sha256:z.sourceSha256,kind:e.kind,midi:e.midi,variant:z.variant,rate,frame:e.frame,frames:n});
 }
 if(!receipts.length)throw Error("Empty finite track");
 return {samples,receipts};
}
function stereoMix(parts,frames){
 const stems=Object.create(null),mix=new Float32Array(frames*2);
 for(const p of parts){
  if(stems[p.id]||p.samples.length!==frames||!(Math.abs(p.pan)<=1)||!(p.gain>0&&p.gain<=1))throw Error("Invalid historical stem");
  const a=new Float32Array(frames*2),l=Math.sqrt((1-p.pan)/2)*p.gain,r=Math.sqrt((1+p.pan)/2)*p.gain;
  for(let i=0;i<frames;i++){const x=p.samples[i];if(!Number.isFinite(x))throw Error("Nonfinite stem");a[2*i]=x*l;a[2*i+1]=x*r;mix[2*i]+=a[2*i];mix[2*i+1]+=a[2*i+1];}stems[p.id]=a;
 }
 let peak=0;for(const a of [mix,...Object.values(stems)])for(const x of a)peak=Math.max(peak,Math.abs(x));
 if(!(peak>0))throw Error("Silent historical master");
 const gain=Math.min(1,.75/peak);let error=0;const arrays=Object.values(stems);
 for(let i=0;i<mix.length;i++){let sum=0;for(const a of arrays){a[i]*=gain;sum+=a[i];}mix[i]*=gain;error=Math.max(error,Math.abs(sum-mix[i]));}
 if(error>1e-6)throw Error("Historical stem reconstruction mismatch");
 return {mix,stems,gain,error};
}
function selfTest(){
 const check=(v,m)=>{if(!v)throw Error(m)},fails=f=>{try{f();return false}catch{return true}};
 const z={id:"one",kind:"drum-open",midi:null,variant:1,peak:.2,rms:.1,sourceSha256:"a".repeat(64),samples:Float32Array.from({length:480},(_,i)=>.2*Math.sin(i*.1))},b={...z,id:"two",variant:2,sourceSha256:"b".repeat(64)};
 const e=[0,120,600].map(frame=>({frame,kind:"drum-open",midi:null,velocity:.8})),r=finiteTrack([z,b],e,1200);
 check(r.receipts.map(x=>x.source).join(",")==="one,two,one","round robin");check(r.receipts.every(x=>x.rate===1&&x.frames===479),"native rate and tail");
 check(r.samples.some(x=>x!==0),"nonzero");check(fails(()=>finiteTrack([z],[{...e[0],midi:60}],1200)),"pitched drum");check(fails(()=>finiteTrack([z],[{...e[0],frame:1000}],1200)),"truncated tail");
 check(fails(()=>finiteTrack([{...z,kind:"harp",midi:62,measuredMidi:62}],[{...e[0],kind:"harp",midi:66}],1200)),"excess pitch shift");
 const m=stereoMix([{id:"a",samples:r.samples,pan:-.3,gain:.8},{id:"b",samples:r.samples,pan:.3,gain:.8}],1200);
 check(m.error<=1e-6&&m.mix.some(x=>x!==0),"stem reconstruction");check(fails(()=>stereoMix([{id:"a",samples:new Float32Array(1200),pan:0,gain:1}],1200)),"silent");check(fails(()=>stereoMix([{id:"a",samples:r.samples,pan:2,gain:1}],1200)),"pan");
 return 9;
}

if(process.argv[2]==='--self-test'){console.log('Historical checks: '+selfTest());process.exit(0);}
const root=path.resolve(process.argv[2]??'.audio-historical-expansion'),dedicated=path.resolve(process.argv[3]??'.audio-dedicated-release');
mkdirSync(path.join(root,'sources'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const blobHash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const admissions=[],rejections=[],zones=[],releaseBank=[],metrics=[];
const save=(name,v)=>writeFileSync(path.join(root,name),JSON.stringify(v,null,2)+'\n');
const progress=()=>save('admission.json',{approval:'research-only',revision,admissions,rejections});
function acquire(relative,blob,target,size){
 const url='https://raw.githubusercontent.com/sgossner/VCSL/'+revision+'/'+relative.split('/').map(encodeURIComponent).join('/');
 const b=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216',url],{maxBuffer:16777216});
 if((size!==undefined&&b.length!==size)||blobHash(b)!==blob)throw Error('Pinned object mismatch '+relative);
 if(target.endsWith('.wav')&&(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'))throw Error('Non-WAV source');
 writeFileSync(path.join(root,target),b);return {file:target,blob,sha256:sha(b),bytes:b.length,upstreamPath:relative,url};
}
function decode(file){
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid PCM');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);return a;
}
function drum(pcm){
 if(pcm.length<SR*.2||pcm.length>SR*12)throw Error('Invalid drum length');
 let peak=0;for(const x of pcm){if(!Number.isFinite(x)||Math.abs(x)>1)throw Error('Invalid drum PCM');peak=Math.max(peak,Math.abs(x));}
 if(peak<.002)throw Error('Silent drum');
 let start=-1;for(let i=0;i+240<pcm.length;i+=240){let e=0;for(let j=i;j<i+240;j++)e+=pcm[j]**2;if(Math.sqrt(e/240)>peak*.045){start=Math.max(0,i-120);break;}}
 if(start<0)throw Error('Missing drum onset');
 const samples=pcm.slice(start),n=Math.min(samples.length,Math.round(SR*.18));let e=0;for(let i=0;i<n;i++)e+=samples[i]**2;
 const rms=Math.sqrt(e/n);if(rms<.001)throw Error('Silent drum onset');return {samples,peak,rms,offsetFrames:start};
}
const license=acquire('LICENSE','0e259d42c996742e9e3cba14c677129b2c1b6311','LICENSE');
for(const p of pins){
 try{
  const source=acquire(p.path,p.blob,'sources/'+p.id+'.wav',p.size),pcm=decode(path.join(root,source.file));
  const v=p.kind==='wind'?prepareRecordedNote(pcm,p.midi):p.midi===null?drum(pcm):prepareTransientNote(pcm,p.midi);
  const z={...v,id:p.id,kind:p.kind,midi:p.midi,variant:p.variant,velocity:.65,sourceSha256:source.sha256,...(p.kind==='wind'?{instrument:'recorder',articulation:'sustain'}:{})};
  zones.push(z);const {samples,...receipt}=z;admissions.push({pin:p,source,receipt,frames:samples.length});progress();
 }catch(e){rejections.push({pin:p,message:String(e)});progress();}
}
if(zones.length!==pins.length)throw Error('Historical source admission failed '+zones.length+'/'+pins.length);
const priorBytes=readFileSync(path.join(dedicated,'metrics.json')),prior=JSON.parse(priorBytes);
if(prior.revision!==revision||prior.approval!=='research-only'||prior.license?.sha256!==license.sha256||prior.pairs?.length!==4)throw Error('Unqualified same-run ocarina bank');
const ocarina=[];
for(const p of prior.pairs){
 function checked(entry){
  if(!/^sources\/ocarina-[A-Z][0-9]-(body|release)\.wav$/.test(entry.path))throw Error('Invalid ocarina path');
  const file=path.join(dedicated,entry.path),b=readFileSync(file);
  if(sha(b)!==entry.sha256||blobHash(b)!==entry.blob)throw Error('Ocarina hash mismatch');return decode(file);
 }
 const z={...prepareRecordedNote(checked(p.body),p.midi),id:'vcsl-ocarina-'+p.upstreamLabel.toLowerCase(),instrument:'ocarina',articulation:'sustain',velocity:.65,variant:1,sourceSha256:p.body.sha256};
 const r=prepareDedicatedRelease(checked(p.tail),z,{id:z.id+'-release',expectedMidi:p.midi,instrument:z.instrument,articulation:z.articulation,bodySha256:p.body.sha256,sha256:p.tail.sha256});
 ocarina.push(z);releaseBank.push(r);
}
const seconds=55,frames=seconds*SR,windNotes=[],ocNotes=[],harpEvents=[],drumEvents=[],staccatoEvents=[];
const ev=(kind,midi,t,velocity)=>({kind,midi,frame:Math.round(t*SR),velocity});
for(let i=0;i<16;i++){
 const t=i*3,m=melody[i],ch=harmony[i],crest=.55+.22*Math.sin(Math.PI*(i+.5)/16);
 for(let j=0;j<6;j++)harpEvents.push(ev('harp',ch[[0,1,2,1,0,2][j]],t+j*.45,.56+(j===0?.22:0)));
 if(i>=2&&i<15){drumEvents.push(ev('drum-open',null,t,.66+(i>=8?.12:0)),ev('drum-muted',null,t+1.5,.54));if(i>=8&&i<12)drumEvents.push(ev('drum-muted',null,t+2.25,.42));}
 for(let j=0;j<m.length;j++){
  const at=t+j*.6;
  if((i>=4&&i<8)||(i>=12&&j===1))staccatoEvents.push(ev('staccato',m[j],at,crest));
  else if(i!==0)windNotes.push({midi:m[j],start:at,duration:j===m.length-1?.76:.50,pressure:crest,articulation:'sustain'});
 }
 if(i>=4&&i!==7&&i!==15)ocNotes.push({midi:[81,76,74,84][i%4],start:t+.35,duration:.72,pressure:.55,articulation:'sustain',release:'recorded'});
}
const winds=renderRecordedPerformance({zones:zones.filter(z=>z.kind==='wind'),instrument:'recorder',notes:windNotes,seconds});
const oc=renderRecordedPerformance({zones:ocarina,instrument:'ocarina',notes:ocNotes,seconds,releaseBank});
const harp=finiteTrack(zones,harpEvents,frames),drums=finiteTrack(zones,drumEvents,frames),short=finiteTrack(zones,staccatoEvents,frames);
if(oc.choices.length!==ocNotes.length||oc.choices.some(c=>c.release?.kind!=='dedicated-release-asset'))throw Error('Historical ocarina release coverage failed');
const mixed=stereoMix([
 {id:'recorder-sustain',samples:winds.samples,pan:-.30,gain:.68},
 {id:'recorder-staccato',samples:short.samples,pan:-.30,gain:.60},
 {id:'folk-harp',samples:harp.samples,pan:.36,gain:.72},
 {id:'frame-drum',samples:drums.samples,pan:.12,gain:.52},
 {id:'ocarina',samples:oc.samples,pan:.24,gain:.43}
],frames);
function write(file,a){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid historical WAV');peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(peak<=0)throw Error('Silent historical WAV '+file);writeFileSync(path.join(root,file),b);metrics.push({file,sha256:sha(b),frames:a.length/2,channels:2,peak,rms:Math.sqrt(e/a.length)});
}
write('lantern-road.wav',mixed.mix);for(const [id,a] of Object.entries(mixed.stems))write('lantern-road-'+id+'.wav',a);
if(metrics.length!==6||mixed.error>1e-6)throw Error('Historical audition inventory');
save('metrics.json',{approval:'research-only',title:'Lantern Road',seconds,musicalSeconds:48,license:{spdx:'CC0-1.0',...license},revision,admissions,rejections,ocarinaManifestSha256:sha(priorBytes),intervalTransitionCoverage:0,metrics,masterGain:mixed.gain,reconstructionError:mixed.error,score:{windNotes,ocNotes,harpEvents,drumEvents,staccatoEvents},choices:{wind:winds.choices,ocarina:oc.choices,harp:harp.receipts,drums:drums.receipts,staccato:short.receipts}});
