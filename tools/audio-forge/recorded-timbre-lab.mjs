// Pinned sample acquisition. No implicit trust of downloaded bytes or file labels.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {openLibrary} from './persistent-library.mjs';
import {prepareRecordedNote,renderRecordedPhrase} from './recorded-instruments.mjs';
import {renderWindPhrase} from './wind-instruments.mjs';
import {renderBowedPhrase} from './bowed-instruments.mjs';
import {renderPluckedScore} from './plucked-instruments.mjs';
const root=path.resolve(process.argv[2]??'.audio-recorded-timbre'),sr=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});mkdirSync(path.join(root,'auditions'),{recursive:true});
const revision='28092772094b2d9f1148d84cea97f4545b8c687d',base='https://github.com/sgossner/VSCO-2-CE';
const instruments=[
 ['flute',60,'Woodwinds/Flute/susNV/LDFlute_susNV_C3_v1_1.wav','ac3b6e4b90480a5a64798c2c399f16ea95754015'],
 ['flute',69,'Woodwinds/Flute/susNV/LDFlute_susNV_A3_v1_1.wav','b690a4d0006b73699176dd2fab82a9249966e33b'],
 ['flute',72,'Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav','ea9cc7ff40975e8d3917c6e8fa13f67167e142f2'],
 ['flute',81,'Woodwinds/Flute/susNV/LDFlute_susNV_A4_v1_1.wav','3007213aa6264efe0619c7321bf2e8df7966b0a2'],
 ['flute',84,'Woodwinds/Flute/susNV/LDFlute_susNV_C5_v1_1.wav','093129d6a876ce5f004279b2979894d0ed637a8d'],
 ['violin',67,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_G4_f.wav','f9c1a5547a7e062eb34ee6bef09e559d3839f46e'],
 ['violin',69,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A4_f.wav','3155c72c1f9ea1518ddb6c1a20eb5c0a094bd537'],
 ['violin',72,'Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C5_f.wav','93e9a2cf8106acc5e49ba18dab112c947473917f']
];
const fields=[
 {id:'hemlock-stream',filename:'Hemlock_stream.ogg',creator:'Dirtslayer',size:76356,sha1:'547b822b715fd83544fc0f156f719ed54967c761',rev:1065354310,license:'public-domain',provenance:'Stream by a hemlock, Terrace BC, 2006-03-23; uploader own recording',tags:['field-recording','water','stream']},
 {id:'building-wind',filename:'Howling_wind.ogg',creator:'Tvabutzku1234',size:1112243,sha1:'90958205859310a279d03cd0d77e4d467f4805d5',rev:1304325871,license:'CC0-1.0',provenance:'Wind howling in a building, 2011; uploader own recording',tags:['field-recording','wind','interior']},
 {id:'cardboard-thud',filename:'Dull_thud.ogg',creator:'Gregory Weir',size:10454,sha1:'9e53b37ab4b2e3631d8b980945214db10fed6e8a',rev:1214819134,license:'public-domain',provenance:'Hand striking cardboard box; original PDsounds author dedication, archival Commons upload',tags:['foley','impact','cardboard']}
];
const digest=(b,algorithm='sha256')=>createHash(algorithm).update(b).digest('hex');
function download(url){
 return execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216','--user-agent','PocketWorksSoundForge/0.1 (https://github.com/JustSadSock/pocket-works)',url],{maxBuffer:16777216});
}
function decode(file,seconds=12){
 const bytes=execFileSync('sox',['-R','-v','.8',file,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0',String(seconds)],{maxBuffer:4*1024*1024});
 if(!bytes.length||bytes.length%4)throw Error('Invalid decoded source');
 const a=new Float32Array(bytes.length/4);for(let i=0;i<a.length;i++)a[i]=bytes.readFloatLE(i*4);return a;
}
const zones={flute:[],violin:[]},sources=[],metrics=[],library=openLibrary(path.join(root,'library'));
function saveSource(entry,bytes){
 const file='sources/'+entry.id+entry.ext;writeFileSync(path.join(root,file),bytes);
 const record={id:entry.id,path:file,title:entry.title,creator:entry.creator,license:entry.license,redistribution:true,provenance:entry.provenance,sourceUrl:entry.sourceUrl,rightsEvidence:entry.rightsEvidence,sha256:digest(bytes),tags:[...entry.tags,'research-only'],approval:'research-only'};
 library.insert(record,root);sources.push({...record,pin:entry.pin});
 return path.join(root,file);
}
function write(file,a,channels=1){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid audition '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 if(!peak)throw Error('Silent audition '+file);
 writeFileSync(path.join(root,file),b);const m={file,frames:a.length/channels,channels,peak,rms:Math.sqrt(e/a.length),sha256:digest(b)};metrics.push(m);return m;
}
try{
 for(const [instrument,midi,source,blob] of instruments){
  const url='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+revision+'/'+source.split('/').map(encodeURIComponent).join('/');
  const bytes=download(url),gitHash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(gitHash!==blob||bytes.toString('ascii',0,4)!=='RIFF')throw Error('VSCO Git blob mismatch '+source);
  const id='vsco-'+instrument+'-'+midi,file=saveSource({id,ext:'.wav',title:instrument+' sustain MIDI '+midi,creator:'Versilian Studios; Sam Gossner and Simon Dalzell',license:'CC0-1.0',provenance:'VSCO 2 CE original recorded sample '+source,sourceUrl:base+'/blob/'+revision+'/'+source.split('/').map(encodeURIComponent).join('/'),rightsEvidence:base+'/blob/'+revision+'/LICENSE (CC0 1.0 Universal)',tags:['instrument','recorded',instrument,'sustain'],pin:{revision,blob}},bytes);
  const z=prepareRecordedNote(decode(file),midi);zones[instrument].push({...z,id});
 }
 for(const s of fields){
  const md5=digest(Buffer.from(s.filename),'md5'),url='https://upload.wikimedia.org/wikipedia/commons/'+md5[0]+'/'+md5.slice(0,2)+'/'+encodeURIComponent(s.filename),bytes=download(url);
  if(bytes.length!==s.size||digest(bytes,'sha1')!==s.sha1)throw Error('Commons source mismatch '+s.id);
  const file=saveSource({...s,ext:'.ogg',title:s.id,sourceUrl:'https://commons.wikimedia.org/w/index.php?oldid='+s.rev,rightsEvidence:'Reviewed Commons revision '+s.rev+'; '+s.license+' author dedication',pin:{sha1:s.sha1,size:s.size}},bytes);
  const pcm=decode(file,s.id==='cardboard-thud'?1:8),out=new Float32Array(pcm.length);let peak=0;
  for(const x of pcm)peak=Math.max(peak,Math.abs(x));
  if(!Number.isFinite(peak)||peak<1e-5)throw Error('Silent field recording');
  const fade=Math.min(960,Math.floor(pcm.length/4));
  for(let i=0;i<pcm.length;i++)out[i]=pcm[i]*Math.min(1,.8/peak)*Math.min(1,i/fade,(pcm.length-1-i)/fade);
  write('auditions/'+s.id+'.wav',out);
 }
 if(library.list().length!==11||library.list('recorded flute').length!==5)throw Error('Recorded library mismatch');
 for(const e of library.list())library.resolve(e.id);
 writeFileSync(path.join(root,'library/index.json'),JSON.stringify({approval:'research-only',entries:library.list()},null,2)+'\n');
}finally{library.close();}
const tempo=100,bars=8,meter=3,seconds=bars*meter*60/tempo,frames=Math.round(seconds*sr);
const melody=[[69,72,74],[72,71,69],[67,69,72],[71,69,67],[72,74,76],[74,72,69],[67,69,71],[72,69,67]];
const notes=melody.flatMap((row,i)=>row.map((midi,j)=>({midi,start:(i*3+j)*.6,duration:.52,pressure:[.65,.54,.73][j]})));
const sampled={},choices={};
for(const instrument of ['flute','violin']){
 const a=instrument==='flute'?renderWindPhrase({instrument,notes,seconds,seed:29}):renderBowedPhrase({instrument,notes,seconds,seed:29});
 const b=renderRecordedPhrase({zones:zones[instrument],notes,seconds,maxShift:5});
 const am=write('auditions/'+instrument+'-synthetic.wav',a.samples),bm=write('auditions/'+instrument+'-recorded.wav',b.samples);
 const target=Math.min(am.rms,bm.rms),gap=Math.round(sr*.7),ab=new Float32Array(frames*2+gap);
 for(const [i,p] of [a,b].entries()){const gain=target/[am,bm][i].rms;for(let j=0;j<frames;j++)ab[(i?frames+gap:0)+j]=p.samples[j]*gain;}
 write('auditions/'+instrument+'-AB.wav',ab);sampled[instrument]=b.samples;choices[instrument]=b.choices;
}
const chords=[[50,57,65],[46,53,62],[48,55,64],[45,52,61],[50,57,65],[55,62,70],[45,52,61],[50,57,65]];
const harp=renderPluckedScore({tempo,bars,meter,seed:23,tracks:[{instrument:'harp',gain:.65,pan:.3,notes:chords.flatMap((ch,i)=>Array.from({length:6},(_,j)=>({midi:ch[j%3],beat:i*3+j*.5,duration:.43,velocity:j===0?.68:.4})))}]}).samples;
for(let i=0;i<frames;i++){
 const violin=i>=frames/2,lead=sampled[violin?'violin':'flute'][i],l=violin?.7:.48,r=violin?.48:.7;
 harp[i*2]=harp[i*2]*.72+lead*l;harp[i*2+1]=harp[i*2+1]*.72+lead*r;
}
write('auditions/river-meadow.wav',harp,2);
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sources,zones:Object.fromEntries(Object.entries(zones).map(([k,v])=>[k,v.map(({samples,...m})=>m)])),choices,metrics,secondStarts:seconds+.7,comparisonOrder:['synthetic','recorded']},null,2)+'\n');
