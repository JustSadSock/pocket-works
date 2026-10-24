import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {validBallotWebp} from '../ballot-webp.js';
import {inspectBallotRaster} from '../ballot-raster.js';
import {paintingChecksum} from '../draft-transfer.js';

function webp({bytes=4000,frame=0x0510,padding=0,format='VP8 ',length=bytes-20,
 width=3000,height=450,show=true}={}){
 const buf=Buffer.alloc(bytes);
 buf.write('RIFF',0);buf.writeUInt32LE(bytes-8,4);buf.write('WEBP',8);
 buf.write(format,12);buf.writeUInt32LE(length,16);
 buf[20]=frame&255;buf[21]=(frame>>8)&255;buf[22]=(frame>>16)&255;
 buf[23]=0x9d;buf[24]=0x01;buf[25]=0x2a;
 buf.writeUInt16LE(width,26);buf.writeUInt16LE(height,28);
 return buf;
}
const encoded=b=>'data:image/webp;base64,'+b.toString('base64');
const clean=webp();
assert(validBallotWebp(encoded(clean)));
assert(inspectBallotRaster(encoded(clean)));
function reject(mutator,msg){
 const b=Buffer.from(clean);mutator(b);
 assert(!validBallotWebp(encoded(b)),msg);
}
reject(b=>b[20]=0,'non-displayed VP8 frames are forbidden');
reject(b=>b[20]=0x11,'inter frames are forbidden');
reject(b=>b[21]=0,'empty VP8 partition forbidden');
reject(b=>b.writeUInt16LE(3001,26),'incorrect width');
reject(b=>b.writeUInt16LE(449,28),'incorrect height');
reject(b=>b.writeUInt32LE(b.length+100,16),'overrun chunk');
reject(b=>b.writeUInt32LE(b.length-22,16),'unexpected extra bytes');
reject(b=>b.write('ANIM',12),'animated WebP unsupported');
reject(b=>b.write('EXIF',12),'embedded metadata unsupported');
reject(b=>b.write('XMP ',12),'hidden text metadata unsupported');
reject(b=>b.write('VP8X',12),'malformed extension unsupported');
reject(b=>b.writeUInt32LE(b.length-1,4),'invalid RIFF size');
reject(b=>b.write('NOPE',8),'invalid format');
const trailing=Buffer.concat([clean,Buffer.from([1])]);
trailing.writeUInt32LE(trailing.length-8,4);
assert(!validBallotWebp(encoded(trailing)),'extra byte is not a valid chunk');
const padded=webp({bytes:4004,length:3981});
padded[4001]=0;
assert(!validBallotWebp(encoded(padded)), 'dangling bytes after padding rejected');
const future=Buffer.concat([clean,Buffer.alloc(80)]);
future.writeUInt32LE(future.length-8,4);
assert(!validBallotWebp(encoded(future)),'trailing arbitrary data rejected');
assert(!validBallotWebp('data:image/svg+xml;base64,'+clean.toString('base64')));
assert(!validBallotWebp(encoded(Buffer.alloc(800))));
const status=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(status,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};runInNewContext(compiled,{exports:api,Date,Math,JSON,Array,Number,Object,Set,Map,Error,console});
const players=[{id:'p',name:'Painter'},{id:'v',name:'Viewer'}];
const room=api.default.createRoom({player:players[0]}).state;
api.default.onJoin({state:room,player:players[1],players});
const send=(id,payload)=>api.default.onMessage({state:room,player:players.find(p=>p.id===id),players,payload});
send('p',{type:'start',rasterBallots:true,rounds:1});
room.phase='drawing';
send('p',{type:'submit',strokes:[]});
room.phase='sealing';
const input=(data,revision)=>{
 const raster=encoded(data);
 const base64=raster.slice(23);
 const checksum=(()=>{let h=2166136261;for(let i=0;i<raster.length;i++){h^=raster.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h.toString(16).padStart(8,'0')})();
 const parts=Math.ceil(base64.length/8000);
 let result;
 for(let i=0;i<parts;i++)result=send('p',{type:'ballot_chunk',round:room.round,
  revision,checksum,sourceChecksum:paintingChecksum([]),index:i,parts,
  data:base64.slice(i*8000,(i+1)*8000)});
 return result;
};
const malicious=Buffer.from(clean);malicious[20]=0;
assert.equal(input(malicious,'rbad').events[0].type,'notice','server rejects non-displayed VP8');
assert.equal(room.ballotSprites.p,undefined);
assert(input(clean,'rgood').events.some(e=>e.type==='ballot_saved'));
assert.equal(room.ballotSprites.p,encoded(clean));
console.log('ZAMAZKA WebP: strict RIFF chunk bounds, VP8 frame flags, image size, no metadata or animation, backend parity OK');
