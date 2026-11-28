import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderEnsembleRoom} from './ensemble-room.mjs';
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex');
const energy=(a,c,start=0,end=a.length/2)=>{let e=0;for(let i=start;i<end;i++)e+=a[2*i+c]**2;return e};
function signal(){const a=new Float32Array(4800*2);for(let i=0;i<4800;i++){const x=.3*Math.sin(2*Math.PI*440*i/48000)*Math.sin(Math.PI*i/4800);a[2*i]=a[2*i+1]=x;}return a;}
test('stage placement preserves stereo direction and source grid, with additive wet and direct output',()=>{
 const a=signal(),opts={stems:{strings:a},tailSeconds:1};
 const r=renderEnsembleRoom(opts);
 assert.equal(r.frames,52800);assert.equal(r.sourceFrames,4800);
 assert.ok(energy(r.direct,0)>energy(r.direct,1)*1.5);
 assert.ok(energy(r.wet,0,4800)+energy(r.wet,1,4800)>1e-8);
 assert.ok(r.layout.strings.early.every(t=>t.delayMs>0&&t.gain>0));
 assert.ok(r.mix.every((v,i)=>Number.isFinite(v)&&Math.abs(v)<=.801&&Math.abs(v-r.direct[i]-r.wet[i])<1e-7));
 assert.equal(hash(r.mix),hash(renderEnsembleRoom(opts).mix));
});
test('hall and chamber have distinct late reflections, with bounded tail',()=>{
 const opts={stems:{woodwind:signal()},tailSeconds:2.5};
 const chamber=renderEnsembleRoom(opts),hall=renderEnsembleRoom({...opts,preset:'hall'});
 assert.notEqual(hash(chamber.wet),hash(hall.wet));
 assert.ok(hall.nominalRt60>chamber.nominalRt60);
 const n=hall.frames;
 assert.ok(energy(hall.wet,0,4800,14400)>energy(hall.wet,0,n-9600,n)*100);
 assert.equal(hall.wet.at(-1),0);
});
test('reject invalid stage geometry, samples, and unaligned stems',()=>{
 const a=signal();
 assert.throws(()=>renderEnsembleRoom({stems:{strings:a,brass:new Float32Array(4)}}));
 assert.throws(()=>renderEnsembleRoom({stems:{strings:a},stage:{strings:{x:100,y:4,z:1}}}));
 assert.throws(()=>renderEnsembleRoom({stems:{strings:a},preset:'unknown'}));
 a[0]=NaN;assert.throws(()=>renderEnsembleRoom({stems:{strings:a}}));
});
