// Research-only admission of ambiguous historical pitch labels; never replaces existing masters.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openLibrary} from './persistent-library.mjs';
const SR=48000,revision='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',pins=[
  {
    "id": "psaltery-bow-58",
    "group": "psaltery-bow",
    "label": "A#3",
    "labelMidi": 58,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_A#3_Main_LongBow_rr2.wav",
    "blob": "7ec6269580faaef937d9ec95670c79f20e88f8f3",
    "size": 2029394
  },
  {
    "id": "psaltery-bow-60",
    "group": "psaltery-bow",
    "label": "C4",
    "labelMidi": 60,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_C4_Main_LongBow_rr1.wav",
    "blob": "a7168b43cf9065fea40a8d8a5062aace13b05254",
    "size": 2226584
  },
  {
    "id": "psaltery-bow-62",
    "group": "psaltery-bow",
    "label": "D4",
    "labelMidi": 62,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/BowedPsaltery_D4_Main_LongBow_rr1.wav",
    "blob": "6a21751009ebad0e745fedc8edf65c5a408699a6",
    "size": 1672514
  },
  {
    "id": "psaltery-pluck-58",
    "group": "psaltery-pluck",
    "label": "A#3",
    "labelMidi": 58,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_A#3_Main_Pluck_rr1.wav",
    "blob": "a2d93226f59e0f0981dafb6f51d9e4d15e55e256",
    "size": 1295120
  },
  {
    "id": "psaltery-pluck-62",
    "group": "psaltery-pluck",
    "label": "D4",
    "labelMidi": 62,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_D4_Main_Pluck_rr1.wav",
    "blob": "e176f85d8fa845d7d5b6d3fe0860960ae6ac36f8",
    "size": 1189394
  },
  {
    "id": "psaltery-pluck-74",
    "group": "psaltery-pluck",
    "label": "D5",
    "labelMidi": 74,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_D5_Main_Pluck_rr1.wav",
    "blob": "61f7fec975a7c49b9ebb0ad2e6ac525c29bdbaff",
    "size": 954200
  },
  {
    "id": "psaltery-spiccato-58",
    "group": "psaltery-spiccato",
    "label": "A#3",
    "labelMidi": 58,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Spiccato/BowedPsaltery_A#3_Main_Spic_rr1.wav",
    "blob": "3e9af6b0318365792e1117cb80d0191dbfeeb2dd",
    "size": 800168
  },
  {
    "id": "psaltery-spiccato-60",
    "group": "psaltery-spiccato",
    "label": "C4",
    "labelMidi": 60,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Spiccato/BowedPsaltery_C4_Main_Spic_rr1.wav",
    "blob": "da3c58b0b1987d888cb53734f89928a2ae100e34",
    "size": 1390166
  },
  {
    "id": "psaltery-spiccato-66",
    "group": "psaltery-spiccato",
    "label": "F#4",
    "labelMidi": 66,
    "path": "Chordophones/Zithers/Psaltery, Bowed and Plucked/Spiccato/BowedPsaltery_F#4_Main_Spic_rr1.wav",
    "blob": "13f6af2a01647303bb54916b03e0bd3144788677",
    "size": 696734
  },
  {
    "id": "organ-4-60",
    "group": "organ-4",
    "label": "C4",
    "labelMidi": 60,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/4'/RenOrgan_4foot_Room_C4_rr1.wav",
    "blob": "d78658a629cb76e41458457a7ef2268e7c3be921",
    "size": 1728062
  },
  {
    "id": "organ-4-62",
    "group": "organ-4",
    "label": "D4",
    "labelMidi": 62,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/4'/RenOrgan_4foot_Room_D4_rr1.wav",
    "blob": "ea6fee5daf477255a6ecc970c01c041d5053537b",
    "size": 1762784
  },
  {
    "id": "organ-4-64",
    "group": "organ-4",
    "label": "E4",
    "labelMidi": 64,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/4'/RenOrgan_4foot_Room_E4_rr1.wav",
    "blob": "81149517c157ea93f31a566faf77aaee23c8b6ef",
    "size": 1722248
  },
  {
    "id": "organ-8-60",
    "group": "organ-8",
    "label": "C4",
    "labelMidi": 60,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/RenOrgan_8foot_Room_C4_rr1.wav",
    "blob": "58a6f80a981f5587ad99d042957a0c0ccabc05d5",
    "size": 1900370
  },
  {
    "id": "organ-8-62",
    "group": "organ-8",
    "label": "D4",
    "labelMidi": 62,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/RenOrgan_8foot_Room_D4_rr1.wav",
    "blob": "f9ee8643b7bfcd1df52f2cb586f0b964368de5d9",
    "size": 1753766
  },
  {
    "id": "organ-8-64",
    "group": "organ-8",
    "label": "E4",
    "labelMidi": 64,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/RenOrgan_8foot_Room_E4_rr1.wav",
    "blob": "5c497bf0a9e878f4beda76a7e7892d891f5e34d0",
    "size": 2144870
  },
  {
    "id": "organ-full-60",
    "group": "organ-full",
    "label": "C4",
    "labelMidi": 60,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/Full/RenOrgan_Full_Room_C4_rr1.wav",
    "blob": "d2aac7cb41fbba8b52916a49db94b9346401ec14",
    "size": 1500236
  },
  {
    "id": "organ-full-62",
    "group": "organ-full",
    "label": "D4",
    "labelMidi": 62,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/Full/RenOrgan_Full_Room_D4_rr1.wav",
    "blob": "e36340168c235a7599ce3a93a3792f0f23a83db8",
    "size": 1437200
  },
  {
    "id": "organ-full-64",
    "group": "organ-full",
    "label": "E4",
    "labelMidi": 64,
    "path": "Aerophones/Edge-blown Aerophones/Renaissance Organ/Full/RenOrgan_Full_Room_E4_rr1.wav",
    "blob": "43ed9e2c9fee6d0d80d3c42972b85bfa4c916f2f",
    "size": 1436792
  }
];
function inspect(pcm,sr=48000){
 if(!(pcm instanceof Float32Array)||pcm.length<sr*.2||pcm.length>sr*15)throw Error("Invalid pitch PCM");
 let peak=0;for(const x of pcm){if(!Number.isFinite(x)||Math.abs(x)>1.1)throw Error("Invalid PCM");peak=Math.max(peak,Math.abs(x));}
 if(peak<.002)throw Error("Silent PCM");const block=Math.round(sr*.005);let onset=-1;
 for(let i=0;i+block<pcm.length;i+=block){let e=0;for(let j=i;j<i+block;j++)e+=pcm[j]**2;if(Math.sqrt(e/block)>peak*.045){onset=i;break}}
 if(onset<0)throw Error("No onset");
 const ds=Math.max(1,Math.round(sr/12000)),rate=sr/ds,n=Math.round(rate*.085),max=Math.ceil(rate/65),min=Math.floor(rate/1800),windows=[];
 function amp(a,f){let re=0,im=0,weight=0;for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1)),x=a[i]*w,theta=2*Math.PI*f*i/rate;re+=x*Math.cos(theta);im+=x*Math.sin(theta);weight+=w;}return 2*Math.hypot(re,im)/weight;}
 for(const sec of [.06,.12,.22,.36,.52,.72,1]){
  const off=onset+Math.round(sec*sr);if(off+(n+max)*ds>=pcm.length)continue;
  const a=new Float64Array(n+max);for(let i=0;i<a.length;i++)for(let k=0;k<ds;k++)a[i]+=pcm[off+i*ds+k]/ds;
  let energy=0;for(let i=0;i<n;i++)energy+=a[i]**2;const rms=Math.sqrt(energy/n);if(rms<Math.max(.001,peak*.015))continue;
  const d=new Float64Array(max+1);d[0]=1;let total=0;
  for(let k=1;k<=max;k++){let v=0;for(let j=0;j<n;j++)v+=(a[j]-a[j+k])**2;total+=v;d[k]=total>1e-14?v*k/total:1;}
  let lag=0;for(let k=min;k<max;k++)if(d[k]<.18&&d[k]<=d[k-1]&&d[k]<d[k+1]){lag=k;break;}
  if(!lag){windows.push({sec,rms,accepted:false,reason:"aperiodic"});continue;}
  const den=d[lag-1]-2*d[lag]+d[lag+1],delta=den>1e-12?Math.max(-.5,Math.min(.5,.5*(d[lag-1]-d[lag+1])/den)):0,f=rate/(lag+delta),midi=69+12*Math.log2(f/440),fund=amp(a,f),half=amp(a,f/2),harmonics=[fund,amp(a,f*2),amp(a,f*3)].filter(Number.isFinite),relative=fund/Math.max(...harmonics,1e-12),sub=half/Math.max(fund,1e-12);
  windows.push({sec,rms,midi,periodicity:d[lag],fundamentalRelative:relative,subharmonicRelative:sub,accepted:relative>=.03&&sub<=.45});
 }
 const good=windows.filter(w=>w.accepted).map(w=>w.midi).sort((a,b)=>a-b);
 if(good.length<3)return {onset,peak,windows,measuredMidi:null,reason:"fewer than three corroborated windows"};
 const median=good[Math.floor(good.length/2)],spread=good.at(-1)-good[0];
 if(spread>.75||good.length/windows.length<.6)return {onset,peak,windows,measuredMidi:null,reason:"inconsistent pitch windows",spread};
 return {onset,peak,windows,measuredMidi:median,spread};
}
function qualify(group,items){
 if(items.length!==3||items.some(x=>x.pin.group!==group||!Number.isFinite(x.pitch?.measuredMidi)))return {group,accepted:false,reason:"missing or ambiguous measured roots"};
 const allowed=group.startsWith("psaltery")?[0,12]:[-12,0,12,24],matches=allowed.filter(offset=>items.every(x=>Math.abs(x.pitch.measuredMidi-x.pin.labelMidi-offset)<=.75));
 if(matches.length!==1)return {group,accepted:false,reason:"no unique consistent octave mapping"};
 return {group,accepted:true,offset:matches[0],roots:items.map(x=>({id:x.pin.id,midi:x.pin.labelMidi+matches[0],measuredMidi:x.pitch.measuredMidi}))};
}
function selfTest(){
 let count=0;const ok=x=>{if(!x)throw Error("Pitch self-test "+count);count++},reject=f=>{try{f();return false}catch{return true}};
 const tone=(midi)=>Float32Array.from({length:60000},(_,i)=>.2*Math.sin(2*Math.PI*440*2**((midi-69)/12)*i/48000));
 const a=inspect(tone(74)),b=inspect(tone(86));ok(Math.abs(a.measuredMidi-74)<.1);ok(Math.abs(b.measuredMidi-86)<.1);ok(reject(()=>inspect(new Float32Array(60000))));
 const group="psaltery-pluck",items=[58,62,74].map((m,i)=>({pin:{group,labelMidi:m,id:"x"+i},pitch:{measuredMidi:m+12.1}}));ok(qualify(group,items).offset===12);ok(!qualify(group,items.map((x,i)=>i===2?{...x,pitch:{measuredMidi:74}}:x)).accepted);ok(!qualify(group,items.slice(1)).accepted);
 const broken=tone(74),other=tone(78);broken.set(other.subarray(30000),30000);ok(inspect(broken).measuredMidi===null);return count;
}

if(process.argv[2]==='--self-test'){console.log('Historical pitch checks: '+selfTest());process.exit(0);}
const root=path.resolve(process.argv[2]??'.audio-historical-pitch'),previous=path.resolve(process.argv[3]??'.audio-historical-expansion-ii');
mkdirSync(path.join(root,'sources'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),blob=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const save=(name,v)=>writeFileSync(path.join(root,name),JSON.stringify(v,null,2)+'\n');
const license=readFileSync(path.join(previous,'LICENSE'));if(blob(license)!=='0e259d42c996742e9e3cba14c677129b2c1b6311')throw Error('License mismatch');writeFileSync(path.join(root,'LICENSE'),license);
const previousRaw=readFileSync(path.join(previous,'metrics.json')),prior=JSON.parse(previousRaw),index=JSON.parse(readFileSync(path.join(previous,'library/index.json')));
if(sha(previousRaw)!=='793819d910d08b72095a22eb243e38c7b94c199bed0d194a2eef7c2f18d406b9'||index.entries.length!==28||prior.approval!=='research-only')throw Error('Previous catalog reference mismatch');
const items=[],pcms=new Map(),metrics=[];
for(const pin of pins){
 const url='https://raw.githubusercontent.com/sgossner/VCSL/'+revision+'/'+pin.path.split('/').map(encodeURIComponent).join('/');
 const file='sources/'+pin.id+'.wav';
 const b=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216',url],{maxBuffer:16777216});
 if(b.length!==pin.size||blob(b)!==pin.blob||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('Source identity mismatch '+pin.id);
 writeFileSync(path.join(root,file),b);
 const raw=execFileSync('sox',['-R','-v','.8',path.join(root,file),'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});if(!raw.length||raw.length%4)throw Error('Invalid native PCM');
 const pcm=new Float32Array(raw.length/4);for(let i=0;i<pcm.length;i++)pcm[i]=raw.readFloatLE(i*4);pcms.set(pin.id,pcm);
 let pitch;try{pitch=inspect(pcm,SR);}catch(e){pitch={measuredMidi:null,reason:String(e)};}
 items.push({pin,source:{file,url,sha256:sha(b),blob:pin.blob},pitch});save('source-evidence.json',{approval:'research-only',revision,items});
}
const groups=[...new Set(pins.map(p=>p.group))].map(group=>qualify(group,items.filter(x=>x.pin.group===group)));
const accepted=new Map(groups.filter(g=>g.accepted).flatMap(g=>g.roots.map(r=>[r.id,r])));
save('admission.json',{approval:'research-only',groups,items,admitted:accepted.size,rejected:pins.length-accepted.size});
const lib=openLibrary(path.join(root,'library'));let catalog;
try{
 for(const e of index.entries){
  if(e.approval!=='research-only'||e.pin?.revision!==revision||e.path!=='objects/'+e.sha256+'.wav')throw Error('Prior catalog row mismatch');
  const b=readFileSync(path.join(previous,'library',e.path));if(sha(b)!==e.sha256||blob(b)!==e.pin.blob||b.length!==e.pin.bytes)throw Error('Prior catalog object mismatch');
  lib.insert(e,path.join(previous,'library'));
 }
 for(const x of items){
  const r=accepted.get(x.pin.id);if(!r)continue;const p=x.pin,s=x.source;
  lib.insert({id:'vcsl-historical-'+p.id,path:s.file,title:p.group+' MIDI '+r.midi,creator:'VCSL contributors (Versilian Studios Community Library)',license:'CC0-1.0',redistribution:true,provenance:'Pinned VCSL original recording '+p.path,sourceUrl:s.url,rightsEvidence:'https://github.com/sgossner/VCSL/blob/'+revision+'/LICENSE',sha256:s.sha256,tags:['recorded','historical','research-only',p.group],approval:'research-only',pin:{revision,blob:p.blob,bytes:p.size},instrument:p.group.startsWith('organ')?'renaissance-organ':'psaltery',articulation:p.group,expectedMidi:r.midi,measuredMidi:r.measuredMidi,upstreamLabel:p.label},root);
 }
 catalog=lib.list();if(catalog.length!==28+accepted.size||new Set(catalog.map(e=>e.sha256)).size!==catalog.length)throw Error('Catalog inventory');for(const e of catalog)lib.resolve(e.id);save('library/index.json',{approval:'research-only',entries:catalog});
}finally{lib.close();}
function write(name,a){
 let peak=0,e=0;const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition PCM');peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(peak===0)throw Error('Silent audition');writeFileSync(path.join(root,name),b);metrics.push({file:name,sha256:sha(b),frames:a.length,channels:1,peak,rms:Math.sqrt(e/a.length)});
}
// Native-speed diagnostic reels, including rejected candidates explicitly labelled in receipts.
// No pitch shift, no fake sustain, no claim of original historical room reconstruction.
const reels=[];
for(const g of groups){
 const a=new Float32Array(12*SR),clips=[];
 for(const [i,x] of items.filter(x=>x.pin.group===g.group).entries()){
  const pcm=pcms.get(x.pin.id),onset=x.pitch.onset??0,n=Math.min(pcm.length-onset,Math.round(3.5*SR));let peak=0;for(let k=0;k<n;k++)peak=Math.max(peak,Math.abs(pcm[onset+k]));if(n<240||peak<.002)throw Error('Unusable source audition');
  const gain=Math.min(8,.65/peak);for(let k=0;k<n;k++)a[i*4*SR+k]=pcm[onset+k]*gain*Math.min(1,k/96,(n-1-k)/480);
  clips.push({id:x.pin.id,startSeconds:i*4,frames:n,gain,nativeRate:1,admitted:accepted.has(x.pin.id)});
 }
 const name=g.group+'-native-probe.wav';write(name,a);reels.push({group:g.group,file:name,clips,admitted:g.accepted});
}
// Polyphonic original 24-second study uses only admitted groups. Organ sources already carry room sound.
if(accepted.size){
 const a=new Float32Array(24*SR),events=[];
 for(const [j,g] of groups.filter(g=>g.accepted).entries()){
  const roots=g.roots;for(let i=0;i<8;i++){
   const r=roots[[0,1,2,1,0,2,1,0][i]],x=items.find(v=>v.pin.id===r.id),pcm=pcms.get(r.id),onset=x.pitch.onset,n=Math.min(pcm.length-onset,Math.round((g.group.startsWith('organ')?1.8:1.2)*SR)),start=Math.round((i*2.5+j*.27)*SR),gain=Math.min(2,.10/x.pitch.peak);
   for(let k=0;k<n;k++)a[start+k]+=pcm[onset+k]*gain*Math.min(1,k/96,(n-1-k)/960);
   events.push({source:r.id,midi:r.midi,startFrame:start,frames:n,rate:1});
  }
 }
 let peak=0;for(const x of a)peak=Math.max(peak,Math.abs(x));if(peak>.7)for(let i=0;i<a.length;i++)a[i]*=.7/peak;
 write('cloister-study.wav',a);save('score.json',{title:'Cloister Study',events,seconds:24,approval:'research-only'});
}
const organ4=groups.find(g=>g.group==='organ-4'),organ8=groups.find(g=>g.group==='organ-8');
save('metrics.json',{approval:'research-only',revision,previousManifest:sha(previousRaw),groups,admitted:accepted.size,rejected:pins.length-accepted.size,catalogCount:catalog.length,organMeasuredLabelOffsetDifference:organ4.accepted&&organ8.accepted?organ4.offset-organ8.offset:null,reels,metrics,intervalTransitionCoverage:0});
