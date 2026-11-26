// Matched 2x2 audition: original vs expressive performance, dry vs chamber.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderEnsembleRoom} from './ensemble-room.mjs';
const root=path.resolve(process.argv[2]??'.audio-ensemble-room'),baseline=path.resolve(process.argv[3]??'.audio-orchestra-lab'),expressive=path.resolve(process.argv[4]??'.audio-orchestra-expressive');
mkdirSync(root,{recursive:true});
const sr=48000,ids=['brass','strings','woodwind','plucked','percussion'];
function read(dir,file){
 const b=readFileSync(path.join(dir,file)),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',36,40)!=='data'||v.getUint16(20,true)!==1||v.getUint16(22,true)!==2||v.getUint32(24,true)!==sr||v.getUint16(34,true)!==16||v.getUint32(40,true)!==b.length-44||(b.length-44)%4)throw Error('Invalid ensemble WAV '+file);
 const a=new Float32Array((b.length-44)/2);for(let i=0;i<a.length;i++)a[i]=v.getInt16(44+i*2,true)/32768;return a;
}
const reports=[];
function write(file,a){
 const b=Buffer.alloc(44+a.length*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
 let peak=0,e=0;for(let i=0;i<a.length;i++){const x=a[i];if(!Number.isFinite(x)||Math.abs(x)>=1)throw Error('Invalid output '+file);peak=Math.max(peak,Math.abs(x));e+=x*x;b.writeInt16LE(Math.round(x*32767),44+i*2);}
 writeFileSync(path.join(root,file),b);reports.push({file,frames:a.length/2,peak,rms:Math.sqrt(e/a.length),sha256:createHash('sha256').update(b).digest('hex')});
}
const b=Object.fromEntries(ids.map(id=>[id,read(baseline,'stems/'+id+'.wav')]));
const e=Object.fromEntries(ids.map(id=>[id,read(expressive,'stems/'+id+'.wav')]));
const control=read(baseline,'march-of-the-vale.wav'),performance=read(expressive,'march-of-the-vale.wav');
if(control.length!==performance.length||[...Object.values(b),...Object.values(e)].some(a=>a.length!==control.length))throw Error('Unaligned performance');
const chamber=renderEnsembleRoom({stems:b}),expressiveRoom=renderEnsembleRoom({stems:e}),hall=renderEnsembleRoom({stems:e,preset:'hall',tailSeconds:3.5});
function pad(a,n){const v=new Float32Array(n);v.set(a);return v;}
const dry=pad(control,chamber.mix.length),expressiveDry=pad(performance,chamber.mix.length);
for(const [name,a] of [['control-dry',dry],['control-chamber',chamber.mix],['expressive-dry',expressiveDry],['expressive-chamber',expressiveRoom.mix],['expressive-hall',hall.mix],['chamber-direct',expressiveRoom.direct],['chamber-wet',expressiveRoom.wet]])write(name+'.wav',a);
function ab(name,a,b){
 if(a.length!==b.length)throw Error('A/B alignment');
 const rms=x=>Math.sqrt(x.reduce((e,v)=>e+v*v,0)/x.length),ra=rms(a),rb=rms(b),target=Math.min(ra,rb),gap=Math.round(sr*.7)*2;
 const out=new Float32Array(a.length+b.length+gap);
 for(let i=0;i<a.length;i++){out[i]=a[i]*target/ra;out[a.length+gap+i]=b[i]*target/rb;}
 write(name+'.wav',out);return {file:name+'.wav',secondStarts:a.length/2/sr+.7,gains:[target/ra,target/rb]};
}
const comparisons=[ab('acoustics-AB',dry,chamber.mix),ab('performance-AB',chamber.mix,expressiveRoom.mix)];
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',sourceFrames:chamber.sourceFrames,stage:chamber.layout,nominalRt60:{chamber:chamber.nominalRt60,hall:hall.nominalRt60},comparisons,metrics:reports},null,2)+'\n');
