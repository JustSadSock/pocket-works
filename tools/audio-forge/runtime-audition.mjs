// Deterministic original audition assets, no third-party recordings or instruments.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {renderPhysics} from './foundation.mjs';
import {makeSeamlessLoop,stemGainAtIntensity} from '../../shared/capabilities/continuous-audio.js';
const dir=path.resolve(process.argv[2]??'.audio-runtime-audition');
mkdirSync(dir,{recursive:true});
const sr=48000,frames=sr*16,TAU=2*Math.PI;
const buffer=(channels,length,sampleRate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,getChannelData:c=>data[c]}};
const context={createBuffer:buffer},report={sampleRate:sr,bpm:120,bars:8,beatsPerBar:4,frames,assets:[]};
function wav(name,data){
 const length=data.length/2,b=Buffer.alloc(44+data.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(data.length*2,40);
 let peak=0,energy=0;
 for(let i=0;i<data.length;i++){
  const v=data[i];if(!Number.isFinite(v)||Math.abs(v)>1)throw Error('Invalid audition PCM '+name);
  peak=Math.max(peak,Math.abs(v));energy+=v*v;b.writeInt16LE(Math.round(v*32767),44+i*2);
 }
 writeFileSync(path.join(dir,name+'.wav'),b);
 const seam=Math.max(Math.abs(data[0]-data[data.length-2]),Math.abs(data[1]-data[data.length-1]));
 report.assets.push({name,frames:length,peak,rms:Math.sqrt(energy/data.length),seam,sha256:createHash('sha256').update(b).digest('hex')});
}
const rain=renderPhysics({model:'rain',seed:406,strength:.6,duration:8.25});
const raw=buffer(2,rain.samples.length/2,sr);
for(let i=0;i<raw.length;i++)for(let c=0;c<2;c++)raw.getChannelData(c)[i]=rain.samples[2*i+c];
const loop=makeSeamlessLoop(context,raw,{crossfadeSeconds:.25}),rainPCM=new Float32Array(loop.length*2);
for(let i=0;i<loop.length;i++)for(let c=0;c<2;c++)rainPCM[2*i+c]=loop.getChannelData(c)[i];
wav('rain-loop',rainPCM);
// Original D-minor progression. Notes and tails wrap around the same 8-bar grid.
const tracks=[{id:'harmony',base:1,gain:.85},{id:'melody',threshold:.15,width:.45,base:.15,gain:.8},{id:'pulse',threshold:.45,width:.45,base:0,gain:.7}];
const pcm=tracks.map(()=>new Float32Array(frames*2));
const chords=[[50,57,62,65],[46,53,58,62],[48,55,60,64],[45,52,57,60],[50,57,62,65],[53,60,65,69],[48,55,60,64],[45,52,57,61]];
function note(track,midi,start,duration,amp,pan,kind){
 const freq=440*2**((midi-69)/12),startFrame=Math.round(start*sr),len=Math.round(duration*sr);
 for(let i=0;i<len;i++){
  const t=i/sr,phase=TAU*freq*t;
  const env=kind==='pad'?Math.min(1,t/.22,(duration-t)/.32)**2:Math.min(1,t/.012,(duration-t)/.08)*Math.exp(-t*(kind==='pluck'?3:6));
  const value=kind==='pad'?(.76*Math.sin(phase)+.16*Math.sin(2*phase+.4)+.08*Math.sin(3*phase)):kind==='pluck'?(.75*Math.sin(phase)+.18*Math.sin(2.003*phase)+.07*Math.sin(3.01*phase)):Math.sin(phase+1.3*Math.exp(-t*18)*Math.sin(phase*2));
  const idx=((startFrame+i)%frames)*2,v=amp*env*value;
  pcm[track][idx]+=v*Math.sqrt((1-pan)/2);pcm[track][idx+1]+=v*Math.sqrt((1+pan)/2);
 }
}
for(let bar=0;bar<8;bar++){
 const chord=chords[bar],t=bar*2;
 chord.forEach((m,i)=>note(0,m,t,2.35,.045,(i-1.5)*.24,'pad'));
 for(let beat=0;beat<4;beat++){
  note(1,chord[(beat+1)%4]+12,t+beat*.5,.62,.10,beat%2?.25:-.25,'pluck');
  note(2,chord[0]-12,t+beat*.5,.42,beat%2?.08:.13,0,'pulse');
  note(2,chord[1],t+beat*.5+.25,.23,.035,.18,'pluck');
 }
}
tracks.forEach((s,i)=>wav('music-'+s.id,pcm[i]));
const mix=new Float32Array(frames*2*3);
for(let i=0;i<frames*3;i++){
 const time=i/sr,level=time<12?0:time<16?(time-12)/4:time<32?1:time<36?1-(time-32)/4:0;
 for(let t=0;t<tracks.length;t++){
  const gain=.7*stemGainAtIntensity(tracks[t],level);
  for(let c=0;c<2;c++)mix[i*2+c]+=gain*pcm[t][(i%frames)*2+c];
 }
}
wav('music-adaptive-preview',mix);
writeFileSync(path.join(dir,'runtime-audition.json'),JSON.stringify({...report,tracks,preview:'0-12s calm; 12-16 rise; 16-32 full; 32-36 fall; 36-48 calm. Offline gain-law audition, not a live browser capture.'},null,2)+'\n');
