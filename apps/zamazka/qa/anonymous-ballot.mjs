import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {composeBallotRaster,inspectBallotRaster,ballotRasterPackets,ballotRasterChecksum} from '../ballot-raster.js';
import {createAnonymousBallotPainter} from '../ballot-sprite-view.js';
import {prepareArtworkStorage} from '../../../pocketnet/art-storage.mjs';

// WebP RIFF envelope with a deliberately simple fake VP8 payload. This is a
// transport fixture; pixel decoding is separately checked by the client.
function fakeWebp(bytes=4200){
 const buf=Buffer.alloc(bytes,0);
 buf.write('RIFF',0,'ascii');buf.writeUInt32LE(bytes-8,4);
 buf.write('WEBPVP8 ',8,'ascii');
 buf.writeUInt32LE(bytes-20,16);
 // VP8 keyframe start code and the exact 3000×450 pixel canvas contract.
 buf[23]=0x9d;buf[24]=0x01;buf[25]=0x2a;
 buf.writeUInt16LE(3000,26);buf.writeUInt16LE(450,28);
 return 'data:image/webp;base64,'+buf.toString('base64');
}
const sample=fakeWebp(20200);
assert(inspectBallotRaster(sample));
assert(!inspectBallotRaster(sample.replace('image/webp','image/svg+xml')));
assert(!inspectBallotRaster(sample+'AAAA'));
assert(!inspectBallotRaster(sample.slice(0,100)));
assert(!inspectBallotRaster('data:image/webp;base64,PHN2Zz4='));
const corruptDimensions=Buffer.from(sample.split(',')[1],'base64');
corruptDimensions.writeUInt16LE(65535,26);
assert(!inspectBallotRaster('data:image/webp;base64,'+corruptDimensions.toString('base64')),
 'WebP with huge dimensions cannot be submitted to spectators');
const packets=ballotRasterPackets(sample,1,'rtest-01');
assert(packets.length>1&&packets.every(p=>p.data.length<=8000));
assert.equal(packets.map(p=>p.data).join(''),sample.split(',')[1]);
assert(packets.every(p=>p.checksum===ballotRasterChecksum(sample)));
const selected=[11,14,19,26,33],candidate={art:19,variation:42,strokes:[{c:'#101010',t:'brush',s:4,p:[[20,10]]}]};
const paintCalls=[],drawCalls=[];
let sheet;
const doc={
 body:{appendChild(el){el.isConnected=true}},
 createElement(tag){
  if(tag==='div')return {style:{},setAttribute(){},appendChild(el){el.isConnected=true},remove(){this.isConnected=false}};
  const canvas={style:{},isConnected:false,remove(){this.isConnected=false},toDataURL(){return sample}};
  canvas.getContext=()=>({fillStyle:'',fillRect(){},drawImage(...args){drawCalls.push(args)}});
  if(!sheet)sheet=canvas;
  return canvas;
 }
};
const raster=await composeBallotRaster(selected,candidate,{doc,render:async(canvas,id,variation,strokes,damaged)=>{
 paintCalls.push({id,variation,strokes,damaged,connected:canvas.isConnected});return true
}});
assert.equal(raster,sample);
assert.equal(paintCalls.length,5);
assert.deepEqual(paintCalls.map(c=>c.id),selected);
assert.equal(paintCalls.filter(c=>c.damaged).length,1);
assert.equal(paintCalls.find(c=>c.damaged).id,19);
assert(paintCalls.every(c=>c.connected));
assert.equal(drawCalls.length,5);
assert.deepEqual(drawCalls.map(c=>c[1]),[0,600,1200,1800,2400]);
assert.equal(sheet.width,0,'temporary sprite buffer freed after encoding');
await assert.rejects(()=>composeBallotRaster(selected,candidate,{doc,render:async()=>false}),/ballot_artwork_unavailable/);

// Five original canvases consume one decoded source image; no candidate
// metadata ever reaches the spectator's rendering callback.
let decodeCount=0;
const sprite={naturalWidth:3000,naturalHeight:450};
const draws=[];
const paint=createAnonymousBallotPainter(sample,selected,{
 decode:async()=>{decodeCount++;return sprite},
 load:async id=>({naturalWidth:500,naturalHeight:700,id}),
 fit(canvas,image){canvas.ratio=image.naturalWidth/image.naturalHeight}
});
for(const id of selected){
 const canvas={isConnected:true,getContext(){return {drawImage(...a){draws.push([id,...a])}}}};
 assert.equal(await paint(canvas,id),true);
 assert.equal(canvas.ratio,5/7);
 assert.equal(canvas.width,1200);
}
assert.equal(decodeCount,1,'all five canvases decode one opaque WebP');
assert.deepEqual(draws.map(x=>x[2]),[0,600,1200,1800,2400]);
const rejectDimension=createAnonymousBallotPainter(sample,selected,{
 decode:async()=>({naturalWidth:5000,naturalHeight:450}),load:async()=>({naturalWidth:600,naturalHeight:450}),fit(){}
});
await assert.rejects(()=>rejectDimension({isConnected:true},selected[0]),/invalid_ballot_sprite_dimensions/);

// Exercise the authoritative room logic and exact chunked upload protocol.
let now=120_000;
class Clock extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};runInNewContext(js,{exports:api,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const mod=api.default,people=[{id:'a',name:'A'},{id:'b',name:'B'}];
const state=mod.createRoom({player:people[0]}).state;
mod.onJoin({state,player:people[1],players:people});
const send=(id,payload)=>mod.onMessage({state,player:people.find(p=>p.id===id),players:people,payload});
send('a',{type:'start',rounds:1,rasterBallots:true});
assert.equal(state.rasterBallots,true);
now=state.deadline+1;send('a',{type:'pulse'});
assert.equal(state.phase,'drawing');
send('a',{type:'submit',strokes:[]});
send('b',{type:'submit',strokes:[]});
assert.equal(state.phase,'sealing','v39 with anonymous rasters does not leak candidate early');
assert.equal(send('a',{type:'ballot_chunk',...packets[1]}).events[0].type,'notice','out of order upload rejected');
for(const packet of packets){
 const reply=send('a',packet);
 if(packet.index===packets.length-1)assert(reply.events.some(e=>e.type==='ballot_saved'));
}
assert.equal(state.phase,'sealing','first author alone cannot open the gallery');
assert.equal(state.ballotSprites.a,sample);
const meta=prepareArtworkStorage(state,'__zamazka_sqlite_art__','a');
assert.equal(meta.stored.ballotSprites.a,'__zamazka_sqlite_art__');
assert(meta.updates.some(([key])=>key==='ballot:a'));
assert.equal(meta.activeKeys.has('ballot:a'),true);
for(const packet of packets)send('b',packet);
assert.equal(state.phase,'voting');
const snapshot=send('a',{type:'sync'}).events[0].payload;
assert.equal(snapshot.candidate,null,'correct artwork never sent with a raster ballot');
assert.equal(snapshot.ballotSprite,sample,'all five images are carried by one opaque raster');
assert.equal(snapshot.spriteFallback,false);
assert.equal(send('b',{type:'sync'}).events[0].payload.ballotSprite,sample);
assert.equal(send('b',{type:'ballot_chunk',...packets[0]}).events.length,0,'late upload ignored');
const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(code,/rasterBallots:true/,'new online rooms request escrowed raster ballots');
assert.match(code,/composeBallotRaster\(selected,mine,\{render:renderArtwork\}\)/);
assert.match(code,/createAnonymousBallotPainter\(v\.ballotSprite,v\.selected\)/);
assert.match(code,/view\.phase==='sealing'/,'client renders preparation room');
assert(code.includes('fallbackWarning=v.rasterBallots&&v.spriteFallback'),
 'clients must visibly disclose when raster anti-cheat falls back to legacy voting');
const hub=readFileSync(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
assert(hub.includes("kind==='ballot'")&&hub.includes("kind==='ballot-assembly'"),'durable SQL hydration supports both raster stages');
assert(hub.includes("'ballot_chunk'"),'transport permits bitmap chunks');
// Fail-open only after a clearly visible, finite preparation deadline.
const retry=mod.createRoom({player:people[0]}).state;
mod.onJoin({state:retry,player:people[1],players:people});
const attempt=(id,payload)=>mod.onMessage({state:retry,player:people.find(p=>p.id===id),players:people,payload});
attempt('a',{type:'start',rasterBallots:true,rounds:1});
now=retry.deadline+1;attempt('a',{type:'pulse'});
attempt('a',{type:'submit',strokes:[]});
attempt('b',{type:'submit',strokes:[]});
assert.equal(retry.phase,'sealing');
now=retry.deadline+1;attempt('a',{type:'pulse'});
assert.equal(retry.phase,'voting');
assert.equal(retry.spriteFallback,true);
assert(attempt('b',{type:'sync'}).events[0].payload.candidate,'a failed image encoder cannot permanently strand the match');

// Large room: all eight authors send independent rasters; no person's
// actual assignment or unfinished vector artwork leaks in the ballot view.
{
 let clock=1_000_000;
 class Clock8 extends Date{static now(){return clock}}
 const ex={};runInNewContext(js,{exports:ex,Date:Clock8,Math,Array,Number,Object,Error,JSON,Set,Map,console});
 const game8=ex.default;
 const people8=Array.from({length:8},(_,n)=>({id:'seat-'+n,name:'Painter '+n}));
 const room=game8.createRoom({player:people8[0]}).state;
 for(const p of people8.slice(1))game8.onJoin({state:room,player:p,players:people8});
 const send8=(p,msg)=>game8.onMessage({state:room,player:p,players:people8,payload:msg});
 send8(people8[0],{type:'start',rounds:1,rasterBallots:true});
 clock=room.deadline+1;send8(people8[0],{type:'pulse'});
 for(const p of people8)send8(p,{type:'submit',strokes:[]});
 assert.equal(room.phase,'sealing');
 for(const p of people8.slice(0,-1))for(const chunk of packets)send8(p,chunk);
 assert.equal(room.phase,'sealing');
 for(const chunk of packets)send8(people8.at(-1),chunk);
 assert.equal(room.phase,'voting');
 for(const p of people8){
  const visible=send8(p,{type:'sync'}).events[0].payload;
  assert.equal(visible.candidate,null);
  assert.equal(visible.ballotSprite,sample);
  assert.equal(visible.ballotReady.length,8);
  assert.equal(visible.gallery,null);
  assert.equal(visible.spriteFallback,false);
 }
 const owner=people8[0];
 for(const p of people8.slice(1)){
  send8(p,{type:'vote',chips:[1,0,0,0,0],round:room.round,turn:room.turn,targetId:owner.id});
 }
 assert.equal(room.phase,'verdict','eight-seat anonymous vote completes normally');
 assert(Array.isArray(room.assignments[owner.id].strokes),'server preserves authentic vector work for scoring');
}
console.log('ZAMAZKA raster ballot: WebP contract, five-surface sprite, private escrow, chunk replay, atomic activation and timeout recovery OK');
