import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 scoreResidualWindows,selectProblemSegments,packProblemSegments,composeSelectivePatches,mixSelectivePatches
} from '../selective-scnet.js';
const rate=8000,sec=25,length=sec*rate;
function scene(){
 const original=[new Float32Array(length),new Float32Array(length)];
 const vocals=[new Float32Array(length),new Float32Array(length)];
 const artifact=[new Float32Array(length),new Float32Array(length)];
 for(let i=0;i<length;i++){
  const t=i/rate,hot=(t>=4&&t<9)||(t>=15&&t<20);
  const base=.065*Math.sin(i*.033);
  const voice=hot?.16*Math.sin(i*.11):0;
  const buzz=hot?.065*Math.sin(i*.11):0;
  for(let ch=0;ch<2;ch++){
   vocals[ch][i]=voice;
   original[ch][i]=base+voice+(ch?.01:-.01)*Math.sin(i*.071);
   artifact[ch][i]=-buzz;
  }
 }
 return {original,vocals,artifact};
}
test('score vocal-correlated residue, reject clean-room noise',()=>{
 const {original,vocals,artifact}=scene();
 const scores=scoreResidualWindows(original,vocals,artifact,rate);
 assert.equal(scores.length,sec*4);
 assert(scores[22]>.15);
 assert(scores[68]>.15);
 assert(scores[5]<.001);
 const none=selectProblemSegments(original,vocals,[new Float32Array(length),new Float32Array(length)],{rate});
 assert.deepEqual(none,[],'no predicted buzzing correction => no guessed heavy inference');
});
test('automatically select bounded distant hotspots in chronological order',()=>{
 const {original,vocals,artifact}=scene();
 const chosen=selectProblemSegments(original,vocals,artifact,{budgetSeconds:12,rate});
 assert.equal(chosen.length,2,'12 second target selects at most two 5-second windows');
 assert(chosen[0].start<chosen[1].start);
 assert(chosen[0].start/rate<9&&chosen[0].end/rate>4);
 assert(chosen[1].start/rate<20&&chosen[1].end/rate>15);
 const {packed,layout,packedSeconds,selectedSeconds}=packProblemSegments(original,chosen,{rate});
 assert(packedSeconds<15&&packedSeconds>selectedSeconds,'only selected excerpts and contexts are processed');
 assert(packedSeconds<sec);
 assert.equal(packed[0].length,packed[1].length);
 assert(layout[0].sourceEnd<=layout[1].sourceStart,'context clips never overlap');
 for(const item of layout){
  for(let k=0;k<Math.min(100,item.sourceEnd-item.sourceStart);k++)
   assert.equal(packed[0][item.packedOffset+k],original[0][item.sourceStart+k]);
 }
});
test('hybrid crossfades inside selected intervals and is bit-identical elsewhere',()=>{
 const {original,vocals,artifact}=scene();
 const chosen=selectProblemSegments(original,vocals,artifact,{budgetSeconds:12,rate});
 const {packed,layout}=packProblemSegments(original,chosen,{rate});
 const scnetVocals=packed.map(ch=>Float32Array.from(ch,x=>x*.58));
 const patches=composeSelectivePatches(layout,scnetVocals,vocals,{rate});
 assert.equal(patches.length,2);
 const base=original.map((c,i)=>Float32Array.from(c,(x,j)=>x-vocals[i][j]));
 const originalSnapshot=base.map(ch=>ch.slice());
 const hybrid=mixSelectivePatches(base,patches,1);
 assert.strictEqual(hybrid,base);
 let changed=0;
 for(let i=0;i<length;i++){
  const belongs=patches.some(p=>i>=p.start&&i<p.end);
  if(!belongs)assert.equal(hybrid[0][i],originalSnapshot[0][i],'out-of-range remains untouched');
  else if(hybrid[0][i]!==originalSnapshot[0][i])changed++;
 }
 assert(changed>5000);
 for(const p of patches){
  assert.equal(p.delta[0][0],0,'fade-in starts with exact baseline');
  assert.equal(p.delta[0].at(-1),0,'fade-out returns to exact baseline');
 }
 const off=originalSnapshot.map(ch=>ch.slice());
 mixSelectivePatches(off,patches,0);
 assert.deepEqual(off,originalSnapshot);
 assert.throws(()=>mixSelectivePatches(off,patches,2),/сил/);
});
test('malformed and overlapping sections fail before any ONNX work',()=>{
 const {original,vocals}=scene();
 assert.throws(()=>packProblemSegments(original,[{start:-1,end:40}],{rate}),/границ/);
 assert.throws(()=>packProblemSegments(original,[{start:rate,end:3*rate},{start:2*rate,end:4*rate}],{rate}),/пересекаются/);
 const pack=packProblemSegments(original,[{start:rate,end:3*rate}],{rate});
 assert.throws(()=>composeSelectivePatches(pack.layout,[new Float32Array(16),new Float32Array(16)],vocals,{rate}),/совпадает/);
});
test('UI wires optional and never auto-runs the hybrid',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="target-scnet-run"/);
 assert.match(html,/id="target-scnet-enabled"[^>]*disabled/);
 assert.match(app,/selectProblemSegments\(item\.meta\.base,item\.meta\.vocals,item\.meta\.layers\.artifact/);
 assert.match(app,/await separate\(payload\.packed,mobile\?5:10,id,'scnet',1\)/);
 assert.match(app,/mixSelectivePatches\(clean,item\.meta\.hybrid\.patches,item\.meta\.effects\.strength\)/);
});
