// Historical expansion II, separate research-only artifact. No existing master is rewritten.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {prepareTransientNote} from './recorded-transients.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
import {openLibrary} from './persistent-library.mjs';
const SR=48000,revision='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',pins=[
  {
    "id": "alto-staccato-66",
    "kind": "alto-staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_F#3_rr1_Main.wav",
    "blob": "d7cb31098466054d330ecc896a7d3e030ac6e1b0",
    "size": 76612,
    "midi": 66,
    "variant": 1
  },
  {
    "id": "alto-staccato-70",
    "kind": "alto-staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_A#3_rr1_Main.wav",
    "blob": "6d8a7188345fd465933cbe1ab564807939321ca0",
    "size": 80520,
    "midi": 70,
    "variant": 1
  },
  {
    "id": "alto-staccato-72",
    "kind": "alto-staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_C4_rr1_Main.wav",
    "blob": "db96e84032789b062e96c08a7e616885beacce72",
    "size": 82104,
    "midi": 72,
    "variant": 1
  },
  {
    "id": "alto-staccato-74",
    "kind": "alto-staccato",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Staccato/AltRecorder_Stac_D4_rr1_Main.wav",
    "blob": "1a2b8eb3117631eb30ea7abca8b19cbcf3e8c37f",
    "size": 79108,
    "midi": 74,
    "variant": 1
  },
  {
    "id": "alto-sustain-70",
    "kind": "alto-sustain",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_A#3_rr1_Main.wav",
    "blob": "3acd941e392d3e6a7891c695176e672dc6725c6b",
    "size": 3003932,
    "midi": 70,
    "variant": 1
  },
  {
    "id": "alto-sustain-72",
    "kind": "alto-sustain",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_C4_rr1_Main.wav",
    "blob": "78fe319e7b12f99fd83647332f48ce4adc09ddbe",
    "size": 1574224,
    "midi": 72,
    "variant": 1
  },
  {
    "id": "alto-sustain-74",
    "kind": "alto-sustain",
    "path": "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/AltRecorder_Sus_D4_rr1_Main.wav",
    "blob": "fb5d8f274a2363b77164ad1129c629d61a36c1fb",
    "size": 1756616,
    "midi": 74,
    "variant": 1
  },
  {
    "id": "tamb-hit-1",
    "kind": "tamb-hit-soft",
    "path": "Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v1_rr1_Mid.wav",
    "blob": "11c538acc0aee9abfd5087d6ff4866753f388b29",
    "size": 338496,
    "midi": null,
    "variant": 1
  },
  {
    "id": "tamb-hit-2",
    "kind": "tamb-hit-strong",
    "path": "Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav",
    "blob": "aad955871ad59069036194cf73591a6930a91621",
    "size": 293256,
    "midi": null,
    "variant": 1
  },
  {
    "id": "tamb-shake-1",
    "kind": "tamb-shake",
    "path": "Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Shake_rr1_Mid.wav",
    "blob": "9ded39c0bc5bcfb2580a3fe77f2db043478b4d26",
    "size": 258948,
    "midi": null,
    "variant": 1
  },
  {
    "id": "tamb-shake-2",
    "kind": "tamb-shake",
    "path": "Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Shake_rr2_Mid.wav",
    "blob": "caa348100a957f734491c89d80fe8ad95192c97b",
    "size": 237792,
    "midi": null,
    "variant": 2
  }
];
const score={"alto":[{"midi":70,"start":0,"duration":0.5,"pressure":0.5734947145996093,"articulation":"sustain"},{"midi":72,"start":0.6,"duration":0.5,"pressure":0.5734947145996093,"articulation":"sustain"},{"midi":74,"start":1.2,"duration":0.5,"pressure":0.5734947145996093,"articulation":"sustain"},{"midi":72,"start":1.7999999999999998,"duration":0.78,"pressure":0.5734947145996093,"articulation":"sustain"},{"midi":69,"start":3,"duration":0.5,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":70,"start":3.6,"duration":0.5,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":72,"start":4.2,"duration":0.5,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":70,"start":4.8,"duration":0.78,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":67,"start":6,"duration":0.5,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":69,"start":6.6,"duration":0.5,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":70,"start":7.2,"duration":0.5,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":72,"start":7.8,"duration":0.78,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":74,"start":9,"duration":0.5,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":72,"start":9.6,"duration":0.5,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":70,"start":10.2,"duration":0.78,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":74,"start":24,"duration":0.5,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":70,"start":25.2,"duration":0.5,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":69,"start":25.8,"duration":0.78,"pressure":0.6928036012524224,"articulation":"sustain"},{"midi":67,"start":27,"duration":0.5,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":72,"start":28.2,"duration":0.5,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":74,"start":28.8,"duration":0.78,"pressure":0.6595770572215698,"articulation":"sustain"},{"midi":77,"start":30,"duration":0.5,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":72,"start":31.2,"duration":0.5,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":70,"start":31.8,"duration":0.78,"pressure":0.6188830178257162,"articulation":"sustain"},{"midi":72,"start":33,"duration":0.5,"pressure":0.5734947145996094,"articulation":"sustain"},{"midi":70,"start":34.2,"duration":0.78,"pressure":0.5734947145996094,"articulation":"sustain"}],"short":[{"kind":"alto-staccato","midi":70,"frame":576000,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":74,"frame":604800,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":77,"frame":633600,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":74,"frame":662400,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":72,"frame":720000,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":70,"frame":748800,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":69,"frame":777600,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":67,"frame":806400,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":69,"frame":864000,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":72,"frame":892800,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":74,"frame":921600,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":72,"frame":950400,"velocity":0.7284600750472859},{"kind":"alto-staccato","midi":70,"frame":1008000,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":70,"frame":1036800,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":70,"frame":1065600,"velocity":0.7162983158520316},{"kind":"alto-staccato","midi":72,"frame":1180800,"velocity":0.6928036012524224},{"kind":"alto-staccato","midi":70,"frame":1324800,"velocity":0.6595770572215698},{"kind":"alto-staccato","midi":74,"frame":1468800,"velocity":0.6188830178257162},{"kind":"alto-staccato","midi":70,"frame":1612800,"velocity":0.5734947145996094}],"harp":[{"kind":"harp","midi":62,"frame":0,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":21600,"velocity":0.48},{"kind":"harp","midi":70,"frame":43200,"velocity":0.48},{"kind":"harp","midi":65,"frame":64800,"velocity":0.48},{"kind":"harp","midi":62,"frame":86400,"velocity":0.48},{"kind":"harp","midi":70,"frame":108000,"velocity":0.48},{"kind":"harp","midi":60,"frame":144000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":165600,"velocity":0.48},{"kind":"harp","midi":69,"frame":187200,"velocity":0.48},{"kind":"harp","midi":65,"frame":208800,"velocity":0.48},{"kind":"harp","midi":60,"frame":230400,"velocity":0.48},{"kind":"harp","midi":69,"frame":252000,"velocity":0.48},{"kind":"harp","midi":70,"frame":288000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":309600,"velocity":0.48},{"kind":"harp","midi":70,"frame":331200,"velocity":0.48},{"kind":"harp","midi":65,"frame":352800,"velocity":0.48},{"kind":"harp","midi":70,"frame":374400,"velocity":0.48},{"kind":"harp","midi":70,"frame":396000,"velocity":0.48},{"kind":"harp","midi":62,"frame":432000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":453600,"velocity":0.48},{"kind":"harp","midi":70,"frame":475200,"velocity":0.48},{"kind":"harp","midi":65,"frame":496800,"velocity":0.48},{"kind":"harp","midi":62,"frame":518400,"velocity":0.48},{"kind":"harp","midi":70,"frame":540000,"velocity":0.48},{"kind":"harp","midi":62,"frame":576000,"velocity":0.6599999999999999},{"kind":"harp","midi":69,"frame":597600,"velocity":0.48},{"kind":"harp","midi":74,"frame":619200,"velocity":0.48},{"kind":"harp","midi":69,"frame":640800,"velocity":0.48},{"kind":"harp","midi":62,"frame":662400,"velocity":0.48},{"kind":"harp","midi":74,"frame":684000,"velocity":0.48},{"kind":"harp","midi":60,"frame":720000,"velocity":0.6599999999999999},{"kind":"harp","midi":67,"frame":741600,"velocity":0.48},{"kind":"harp","midi":72,"frame":763200,"velocity":0.48},{"kind":"harp","midi":67,"frame":784800,"velocity":0.48},{"kind":"harp","midi":60,"frame":806400,"velocity":0.48},{"kind":"harp","midi":72,"frame":828000,"velocity":0.48},{"kind":"harp","midi":62,"frame":864000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":885600,"velocity":0.48},{"kind":"harp","midi":69,"frame":907200,"velocity":0.48},{"kind":"harp","midi":65,"frame":928800,"velocity":0.48},{"kind":"harp","midi":62,"frame":950400,"velocity":0.48},{"kind":"harp","midi":69,"frame":972000,"velocity":0.48},{"kind":"harp","midi":62,"frame":1008000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":1029600,"velocity":0.48},{"kind":"harp","midi":70,"frame":1051200,"velocity":0.48},{"kind":"harp","midi":65,"frame":1072800,"velocity":0.48},{"kind":"harp","midi":62,"frame":1094400,"velocity":0.48},{"kind":"harp","midi":70,"frame":1116000,"velocity":0.48},{"kind":"harp","midi":62,"frame":1152000,"velocity":0.6599999999999999},{"kind":"harp","midi":69,"frame":1173600,"velocity":0.48},{"kind":"harp","midi":74,"frame":1195200,"velocity":0.48},{"kind":"harp","midi":69,"frame":1216800,"velocity":0.48},{"kind":"harp","midi":62,"frame":1238400,"velocity":0.48},{"kind":"harp","midi":74,"frame":1260000,"velocity":0.48},{"kind":"harp","midi":60,"frame":1296000,"velocity":0.6599999999999999},{"kind":"harp","midi":67,"frame":1317600,"velocity":0.48},{"kind":"harp","midi":72,"frame":1339200,"velocity":0.48},{"kind":"harp","midi":67,"frame":1360800,"velocity":0.48},{"kind":"harp","midi":60,"frame":1382400,"velocity":0.48},{"kind":"harp","midi":72,"frame":1404000,"velocity":0.48},{"kind":"harp","midi":62,"frame":1440000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":1461600,"velocity":0.48},{"kind":"harp","midi":74,"frame":1483200,"velocity":0.48},{"kind":"harp","midi":65,"frame":1504800,"velocity":0.48},{"kind":"harp","midi":62,"frame":1526400,"velocity":0.48},{"kind":"harp","midi":74,"frame":1548000,"velocity":0.48},{"kind":"harp","midi":62,"frame":1584000,"velocity":0.6599999999999999},{"kind":"harp","midi":65,"frame":1605600,"velocity":0.48},{"kind":"harp","midi":70,"frame":1627200,"velocity":0.48},{"kind":"harp","midi":65,"frame":1648800,"velocity":0.48},{"kind":"harp","midi":62,"frame":1670400,"velocity":0.48},{"kind":"harp","midi":70,"frame":1692000,"velocity":0.48}],"tamb":[{"kind":"tamb-hit-soft","midi":null,"frame":288000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":345600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":388800,"velocity":0.38},{"kind":"tamb-hit-soft","midi":null,"frame":432000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":489600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":532800,"velocity":0.38},{"kind":"tamb-hit-soft","midi":null,"frame":576000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":633600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":676800,"velocity":0.38},{"kind":"tamb-hit-soft","midi":null,"frame":720000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":777600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":820800,"velocity":0.38},{"kind":"tamb-hit-strong","midi":null,"frame":864000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":921600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":964800,"velocity":0.38},{"kind":"tamb-hit-strong","midi":null,"frame":1008000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":1065600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":1108800,"velocity":0.38},{"kind":"tamb-hit-strong","midi":null,"frame":1152000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":1209600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":1252800,"velocity":0.38},{"kind":"tamb-hit-strong","midi":null,"frame":1296000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":1353600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":1396800,"velocity":0.38},{"kind":"tamb-hit-strong","midi":null,"frame":1440000,"velocity":0.58},{"kind":"tamb-shake","midi":null,"frame":1497600,"velocity":0.5},{"kind":"tamb-shake","midi":null,"frame":1540800,"velocity":0.38}],"soprano":[{"midi":74,"start":12.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"},{"midi":76,"start":15.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"},{"midi":82,"start":18.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"},{"midi":74,"start":24.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"},{"midi":76,"start":27.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"},{"midi":82,"start":30.3,"duration":0.85,"pressure":0.48,"articulation":"sustain"}]};
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

function drum(pcm){
 if(pcm.length<SR*.2||pcm.length>SR*12)throw Error('Invalid drum length');
 let peak=0;for(const x of pcm){if(!Number.isFinite(x)||Math.abs(x)>1)throw Error('Invalid drum PCM');peak=Math.max(peak,Math.abs(x));}
 if(peak<.002)throw Error('Silent drum');
 let start=-1;for(let i=0;i+240<pcm.length;i+=240){let e=0;for(let j=i;j<i+240;j++)e+=pcm[j]**2;if(Math.sqrt(e/240)>peak*.045){start=Math.max(0,i-120);break;}}
 if(start<0)throw Error('Missing drum onset');
 const samples=pcm.slice(start),n=Math.min(samples.length,Math.round(SR*.18));let e=0;for(let i=0;i<n;i++)e+=samples[i]**2;
 const rms=Math.sqrt(e/n);if(rms<.001)throw Error('Silent drum onset');return {samples,peak,rms,offsetFrames:start};
}


const root=path.resolve(process.argv[2]??'.audio-historical-expansion-ii'),base=path.resolve(process.argv[3]??'.audio-historical-expansion'),spatial=path.resolve(process.argv[4]??'.audio-historical-spatial');
const sha=b=>createHash('sha256').update(b).digest('hex'),blob=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
mkdirSync(path.join(root,'sources'),{recursive:true});
const admissions=[],rejections=[],zones=[],metrics=[];
const save=(name,v)=>writeFileSync(path.join(root,name),JSON.stringify(v,null,2)+'\n');
const progress=()=>save('admission.json',{approval:'research-only',revision,admissions,rejections});
function decode(file){
 const raw=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid decoded source');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);return a;
}
const license=readFileSync(path.join(base,'LICENSE'));
if(blob(license)!=='0e259d42c996742e9e3cba14c677129b2c1b6311')throw Error('License mismatch');
writeFileSync(path.join(root,'LICENSE'),license);
for(const p of pins){
 try{
  const url='https://raw.githubusercontent.com/sgossner/VCSL/'+revision+'/'+p.path.split('/').map(encodeURIComponent).join('/');
  const b=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216',url],{maxBuffer:16777216});
  if(b.length!==p.size||blob(b)!==p.blob||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('Pinned source mismatch');
  const file='sources/'+p.id+'.wav';writeFileSync(path.join(root,file),b);
  const pcm=decode(path.join(root,file)),v=p.kind==='alto-sustain'?prepareRecordedNote(pcm,p.midi):p.midi===null?drum(pcm):prepareTransientNote(pcm,p.midi);
  const z={...v,id:p.id,kind:p.kind,midi:p.midi,variant:p.variant,velocity:.65,sourceSha256:sha(b),...(p.kind==='alto-sustain'?{instrument:'alto-recorder',articulation:'sustain'}:{})};
  zones.push(z);const {samples,...receipt}=z;admissions.push({pin:p,source:{file,url,sha256:sha(b),blob:p.blob},receipt,frames:samples.length});progress();
 }catch(e){rejections.push({pin:p,message:String(e)});progress();}
}
if(zones.length!==pins.length)throw Error('Historical II admission failed '+zones.length+'/'+pins.length);
const priorBytes=readFileSync(path.join(base,'metrics.json')),prior=JSON.parse(priorBytes),oldIndex=JSON.parse(readFileSync(path.join(spatial,'library/index.json')));
if(sha(priorBytes)!=='e545daee64223ea119d177e46c9aa50a5cd7813c064e281e909d3ca0ea523df1'||prior.admissions.length!==17||oldIndex.entries.length!==17)throw Error('Historical I reference mismatch');
const known=new Map(prior.admissions.map(a=>[a.source.sha256,a]));
const lib=openLibrary(path.join(root,'library'));
let catalog;
try{
 for(const e of oldIndex.entries){
  const a=known.get(e.sha256);if(!a||e.pin?.blob!==a.pin.blob||e.pin?.revision!==revision||e.approval!=='research-only'||e.path!=='objects/'+e.sha256+'.wav')throw Error('Old catalog identity mismatch');
  const b=readFileSync(path.join(spatial,'library',e.path));if(sha(b)!==e.sha256||blob(b)!==a.pin.blob)throw Error('Old catalog object mismatch');
  lib.insert(e,path.join(spatial,'library'));
 }
 for(const a of admissions){
  const {pin:p,source:s,receipt:r}=a,instrument=p.midi===null?'tambourine':'alto-recorder',articulation=p.kind.replace(/^(alto|tamb)-/,'');
  lib.insert({id:'vcsl-historical-'+p.id,path:s.file,title:instrument+' '+articulation+(p.midi===null?' take '+p.variant:' MIDI '+p.midi),creator:'VCSL contributors (Versilian Studios Community Library)',license:'CC0-1.0',redistribution:true,provenance:'Pinned VCSL original recording '+p.path,sourceUrl:s.url,rightsEvidence:'https://github.com/sgossner/VCSL/blob/'+revision+'/LICENSE',sha256:s.sha256,tags:['recorded','historical','research-only',instrument,articulation],approval:'research-only',pin:{revision,blob:p.blob,bytes:p.size},instrument,articulation,expectedMidi:p.midi,measuredMidi:r.measuredMidi??null,variant:p.variant},root);
 }
 catalog=lib.list();if(catalog.length!==28||new Set(catalog.map(e=>e.sha256)).size!==28||lib.list('alto recorder').length!==7||lib.list('tambourine').length!==4)throw Error('Historical II catalog inventory');
 for(const e of catalog)lib.resolve(e.id);
 save('library/index.json',{approval:'research-only',entries:catalog});
}finally{lib.close();}
for(const a of prior.admissions){
 const p=a.pin;if(!['harp','wind'].includes(p.kind))continue;
 const file=path.join(base,a.source.file),b=readFileSync(file);if(sha(b)!==a.source.sha256||blob(b)!==p.blob)throw Error('Historical accompaniment mismatch');
 const v=p.kind==='wind'?prepareRecordedNote(decode(file),p.midi):prepareTransientNote(decode(file),p.midi);
 zones.push({...v,id:p.id,kind:p.kind,midi:p.midi,variant:p.variant,velocity:.65,sourceSha256:a.source.sha256,...(p.kind==='wind'?{instrument:'recorder',articulation:'sustain'}:{})});
}
const seconds=44,frames=seconds*SR;
const alto=renderRecordedPerformance({zones:zones.filter(z=>z.kind==='alto-sustain'),instrument:'alto-recorder',notes:score.alto,seconds});
const soprano=renderRecordedPerformance({zones:zones.filter(z=>z.kind==='wind'),instrument:'recorder',notes:score.soprano,seconds});
const short=finiteTrack(zones,score.short,frames),harp=finiteTrack(zones,score.harp,frames),tamb=finiteTrack(zones,score.tamb,frames);
const choices={alto:alto.choices,soprano:soprano.choices,short:short.receipts,harp:harp.receipts,tamb:tamb.receipts};
const used=new Set([...alto.choices.flatMap(x=>x.sourceIds),...short.receipts.map(x=>x.source),...tamb.receipts.map(x=>x.source)]);
// Exact-root probes separately demonstrate each admitted source, even if the score does not use it.
const probeEvents=pins.filter(p=>p.kind!=='alto-sustain').map((p,i)=>({kind:p.kind,midi:p.midi,frame:i*3*SR,velocity:.65}));
const probe=finiteTrack(zones,probeEvents,30*SR);
const sustainProbe=renderRecordedPerformance({zones:zones.filter(z=>z.kind==='alto-sustain'),instrument:'alto-recorder',notes:pins.filter(p=>p.kind==='alto-sustain').map((p,i)=>({midi:p.midi,start:i*2,duration:1,pressure:.65,articulation:'sustain'})),seconds:7});
const probed=new Set([...probe.receipts.map(x=>x.source),...sustainProbe.choices.flatMap(x=>x.sourceIds)]);
if(pins.some(p=>!probed.has(p.id)))throw Error('Historical II source probe coverage');
const mixed=stereoMix([{id:'alto-sustain',samples:alto.samples,pan:-.25,gain:.68},{id:'alto-staccato',samples:short.samples,pan:-.25,gain:.62},{id:'soprano',samples:soprano.samples,pan:.3,gain:.35},{id:'harp',samples:harp.samples,pan:.23,gain:.72},{id:'tambourine',samples:tamb.samples,pan:.05,gain:.43}],frames);
function write(name,a,channels=2){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid historical II PCM');peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!(peak>0))throw Error('Silent historical II PCM');writeFileSync(path.join(root,name),b);metrics.push({file:name,sha256:sha(b),frames:a.length/channels,channels,peak,rms:Math.sqrt(e/a.length)});
}
write('market-at-dusk.wav',mixed.mix);for(const [id,a] of Object.entries(mixed.stems))write('market-at-dusk-'+id+'.wav',a);
write('source-probe-finite.wav',probe.samples,1);write('source-probe-sustain.wav',sustainProbe.samples,1);
if(metrics.length!==8||mixed.error>1e-6)throw Error('Historical II output inventory');
save('metrics.json',{approval:'research-only',title:'Market at Dusk',revision,sourceManifestSha256:sha(priorBytes),admissions,rejections,sourceCount:catalog.length,newSourceCount:pins.length,usedInScore:pins.filter(p=>used.has(p.id)).map(p=>p.id),probed:[...probed],probeReceipts:{finite:probe.receipts,sustain:sustainProbe.choices},score,choices,metrics,reconstructionError:mixed.error,intervalTransitionCoverage:0});
