import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';import {pathToFileURL} from 'node:url';
const [appPath,forgePath,bankPath,analysisPath,outPath]=process.argv.slice(2).map(p=>path.resolve(p));
const mod=(root,file)=>import(pathToFileURL(path.join(root,file)));
const {readAnalysis,forgeManifest}=await mod(appPath,'advanced.mjs');
const {quantize}=await mod(appPath,'core.mjs');
const {cleanNotes}=await mod(appPath,'cleanup.mjs');
const {findSustainLoop}=await mod(forgePath,'tools/audio-forge/recorded-sustain.mjs');
const {renderRecordedEnsemble}=await mod(forgePath,'tools/audio-forge/recorded-ensemble.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(path.join(bankPath,'metrics.json')),bank=JSON.parse(source);
if(bank.zones.length!==39)throw Error('Unexpected recorded bank inventory');
const zones=[];
for(const z of bank.zones){
 if(!/^[0-9a-f]{64}$/.test(z.sourceSha256))throw Error('Invalid source hash');
 const f=path.join(bankPath,'library','objects',z.sourceSha256+'.wav');
 if(sha(readFileSync(f))!==z.sourceSha256)throw Error('Bank object hash mismatch');
 const raw=execFileSync('sox',['-R','-v','.8',f,'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'],{maxBuffer:4*1024*1024});
 if(raw.length%4||!Number.isInteger(z.offsetFrames)||z.offsetFrames<0||z.offsetFrames>=raw.length/4)throw Error('Invalid bank sample');
 const samples=new Float32Array(raw.length/4);for(let i=0;i<samples.length;i++)samples[i]=raw.readFloatLE(i*4);
 const v={...z,samples:samples.slice(z.offsetFrames)};
 try{v.loop=findSustainLoop(v);zones.push(v)}catch(e){if(!/No qualified sustain loop|Invalid sustain source/.test(String(e)))throw e}
}
const dedup=[...new Map(zones.map(z=>[z.id,z])).values()];
const analysis=JSON.parse(readFileSync(analysisPath,'utf8'));for(const stem of analysis.stems)stem.notes=cleanNotes(stem.notes);
const {tracks:lanes}=readAnalysis(analysis),score=JSON.stringify(forgeManifest(lanes,120,quantize),null,2),job=JSON.parse(score).jobs[0];
const candidates=[['cello-section','arco-vib','strings'],['violin','arco-vib','strings'],['clarinet','sustain','woodwind'],['flute','non-vibrato','woodwind'],['horn','sustain','brass'],['trumpet','sustain','brass']].map(([instrument,articulation,group])=>({instrument,articulation,group,roots:dedup.filter(z=>z.instrument===instrument&&z.articulation===articulation).map(z=>z.expectedMidi)})).filter(x=>x.roots.length);
const covered=(c,n)=>n.duration*60/job.tempo>=.15&&n.duration*60/job.tempo<=30&&c.roots.some(p=>Math.abs(p-n.note)<=5);
const omitted=[],tracks=[];let requested=0,rendered=0,seconds=0;
for(const [i,t] of job.tracks.entries()){
 requested+=t.notes.length;
 const ranked=[...candidates].sort((a,b)=>t.notes.filter(n=>covered(b,n)).length-t.notes.filter(n=>covered(a,n)).length);
 const c=ranked[0],notes=[];
 for(const [index,n] of t.notes.entries()){
  if(!c||!covered(c,n)){omitted.push({track:i,index,pitch:n.note,beat:n.beat,reason:'no qualified pitch or duration'});continue}
  const start=n.beat*60/job.tempo,duration=n.duration*60/job.tempo;seconds=Math.max(seconds,start+duration);
  notes.push({midi:n.note,start,duration,articulation:c.articulation,pressure:.55,sustain:true,morph:false});rendered++;
 }
 if(notes.length)tracks.push({id:'lane-'+i,instrument:c.instrument,group:c.group,pan:0,gain:.25,notes});
}
if(!rendered)throw Error('No admissible recorded notes');
const r=renderRecordedEnsemble({zones:dedup,tracks,seconds:seconds+.2,mode:'discrete',includeTrackStems:true});
const wav=Buffer.alloc(44+r.mix.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(192000,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
let peak=0,sum=0;for(let i=0;i<r.mix.length;i++){const x=r.mix[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid render PCM');wav.writeInt16LE(Math.round(x*32767),44+i*2);peak=Math.max(peak,Math.abs(x));sum+=x*x}
if(peak<.001)throw Error('Silent recorded render');
mkdirSync(outPath,{recursive:true});
writeFileSync(path.join(outPath,'recorded-score.wav'),wav);writeFileSync(path.join(outPath,'cleaned-forge.json'),score);
writeFileSync(path.join(outPath,'notograph.json'),JSON.stringify(analysis,null,2));
const receipt={schema:'notograph-recorded-audition-v1',approval:'research-only',file:'recorded-score.wav',scoreSha256:sha(score),wavSha256:sha(wav),bankManifestSha256:sha(source),forgeRevision:'8dec420c7df00f87764ca88e28402a947083cd57',rendered,requested,omitted,instruments:[...new Set(tracks.map(t=>t.instrument))],seconds:r.frames/48000,peak,rms:Math.sqrt(sum/r.mix.length),choices:r.choices};
writeFileSync(path.join(outPath,'recorded-audition.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({requested,rendered,omitted,instruments:receipt.instruments,seconds:receipt.seconds,peak,rms:receipt.rms},null,2));
