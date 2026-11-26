// Produce sample-grid-aligned state loops plus a sequential listening proof.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {stemGainAtIntensity} from '../../shared/capabilities/continuous-audio.js';
const root=path.resolve(process.argv[2]??'.audio-score-states');
const graph=JSON.parse(readFileSync(path.join(root,'score-graph.json'),'utf8'));
const sr=48000,clips=new Map(),metrics=[];
mkdirSync(path.join(root,'states'),{recursive:true});
mkdirSync(path.join(root,'bridges'),{recursive:true});
mkdirSync(path.join(root,'stingers'),{recursive:true});
mkdirSync(path.join(root,'adaptive'),{recursive:true});
function write(name,pcm){
 const b=Buffer.alloc(44+pcm.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,sum=0;
 for(let i=0;i<pcm.length;i++){
  const x=pcm[i];if(!Number.isFinite(x)||Math.abs(x)>1)throw Error('Invalid score PCM');
  const v=Math.round(x*32767);b.writeInt16LE(v,44+i*2);peak=Math.max(peak,Math.abs(v/32767));sum+=(v/32767)**2;
 }
 writeFileSync(path.join(root,name),b);
 metrics.push({file:name,frames:pcm.length/2,peak,rms:Math.sqrt(sum/pcm.length),sha256:createHash('sha256').update(b).digest('hex')});
}
for(const [id,s] of [...Object.entries(graph.states),...Object.entries(graph.bridges??{}),...Object.entries(graph.stingers??{}),...Object.values(graph.adaptive??{}).flatMap(parts=>Object.values(parts).map(p=>[p.id,p]))]){
 const frames=Math.round(sr*s.duration);
 const raw=execFileSync('sox',['-R',path.join(root,'generated',(s.id??id)+'.wav'),'-t','raw','-e','floating-point','-b','32','-L','-c','2','-r',String(sr),'-','pad','0',frames+'s','trim','0',frames+'s'],{maxBuffer:32*1024*1024});
 if(raw.length!==frames*8)throw Error('Wrong musical sample grid for '+id);
 const pcm=new Float32Array(frames*2);
 for(let i=0;i<frames;i++){
  const fade=Math.min(1,i/960,(frames-1-i)/1440);
  for(let c=0;c<2;c++)pcm[i*2+c]=raw.readFloatLE((i*2+c)*4)*fade;
 }
 clips.set(id,pcm);s.frames=frames;s.sampleRate=sr;
 write(s.file,pcm);
}
// This is an offline storyboard, not a capture of interactive transitions.
const order=['peace','tension','battle','aftermath','peace'],overlap=Math.round(sr*.3);
let preview=clips.get(order[0]).slice(),timeline=[{state:order[0],start:0}];
for(const [index,id] of order.entries()){
 if(index===0)continue;
 const next=index===order.length-1?clips.get(id).slice(0,Math.round(sr*60/graph.states.peace.tempo*3*3)*2):clips.get(id);
 const base=preview.length/2-overlap;
 const joined=new Float32Array(preview.length+next.length-overlap*2);joined.set(preview);
 for(let i=0;i<next.length/2;i++){
  const w=Math.min(1,i/(overlap-1));
  for(let c=0;c<2;c++){
   const k=(base+i)*2+c;
   joined[k]=(1-w)*(joined[k]??0)+w*next[i*2+c];
  }
 }
 preview=joined;timeline.push({state:id,start:base/sr});
}
write('state-journey.wav',preview);
const bridgeTimeline=[{state:'peace',start:0}];
let withBridges=clips.get('peace').slice();
function append(next,overlapFrames){
 const base=withBridges.length/2-overlapFrames;
 const joined=new Float32Array(withBridges.length+next.length-overlapFrames*2);
 joined.set(withBridges);
 for(let i=0;i<next.length/2;i++){
  const w=overlapFrames?Math.min(1,i/Math.max(1,overlapFrames-1)):1;
  for(let c=0;c<2;c++){const k=(base+i)*2+c;joined[k]=(1-w)*joined[k]+w*next[i*2+c];}
 }
 withBridges=joined;return base/sr;
}
for(let i=1;i<order.length;i++){
 const id=order[i],key=order[i-1]+':'+id,bridge=clips.get(key);
 if(!bridge)throw Error('Missing authored bridge '+key);
 bridgeTimeline.push({bridge:key,start:append(bridge,overlap)});
 const target=i===order.length-1?clips.get(id).slice(0,Math.round(sr*60/graph.states.peace.tempo*3*3)*2):clips.get(id);
 bridgeTimeline.push({state:id,start:append(target,0)});
}
for(let i=0;i<2400;i++){const k=withBridges.length/2-1-i;for(let c=0;c<2;c++)withBridges[k*2+c]*=i/2399;}
write('bridge-journey.wav',withBridges);
const adaptiveTimeline=[];
const intensityRanges={peace:[.1,.65],tension:[.25,.85],battle:[.55,1],aftermath:[.7,.1]};
function adaptiveClip(id,short=false){
 const parts=graph.adaptive[id],base=clips.get(parts.base.id),detail=clips.get(parts.detail.id);
 const frames=short?Math.round(sr*60/graph.states.peace.tempo*9):base.length/2;
 const result=new Float32Array(frames*2),[lo,hi]=intensityRanges[id];
 for(let i=0;i<frames;i++){
  const p=i/Math.max(1,frames-1),level=lo+(hi-lo)*Math.min(1,Math.max(0,(p-.2)/.6));
  const gain=stemGainAtIntensity(parts.detail,level);
  for(let c=0;c<2;c++)result[i*2+c]=base[i*2+c]+detail[i*2+c]*gain;
 }
 return result;
}
withBridges=adaptiveClip('peace');adaptiveTimeline.push({state:'peace',start:0,intensity:intensityRanges.peace});
for(let i=1;i<order.length;i++){
 const id=order[i],key=order[i-1]+':'+id;
 adaptiveTimeline.push({bridge:key,start:append(clips.get(key),overlap)});
 adaptiveTimeline.push({state:id,start:append(adaptiveClip(id,i===order.length-1),0),intensity:intensityRanges[id]});
}
for(let i=0;i<2400;i++){const k=withBridges.length/2-1-i;for(let c=0;c<2;c++)withBridges[k*2+c]*=i/2399;}
write('adaptive-journey.wav',withBridges);
writeFileSync(path.join(root,'score-graph.json'),JSON.stringify(graph,null,2)+'\n');
writeFileSync(path.join(root,'score-metrics.json'),JSON.stringify({metrics,timeline,bridgeTimeline,adaptiveTimeline,preview:'Offline sequence; three-tenths-second overlap, not runtime capture'},null,2)+'\n');
