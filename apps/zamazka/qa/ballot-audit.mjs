import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {compareAuditPixels,auditRevealedBallot} from '../ballot-audit.js';
import {ballotRasterPackets,ballotRasterChecksum} from '../ballot-raster.js';
import {paintingChecksum} from '../draft-transfer.js';
import {prepareArtworkStorage} from '../../../pocketnet/art-storage.mjs';
import {rasterAuditCaption} from '../round-review.js';

const make=v=>{const b=new Uint8ClampedArray(120*90*4);for(let i=0;i<b.length;i+=4){b[i]=b[i+1]=b[i+2]=v;b[i+3]=255}return b};
const normal=make(100),lossy=make(106),wrong=make(160);
assert(!compareAuditPixels(normal,normal).suspect);
assert(!compareAuditPixels(normal,lossy).suspect);
assert(compareAuditPixels(normal,wrong).suspect);
const localized=make(100);
for(let y=0;y<15;y++)for(let x=0;x<15;x++){let i=(y*120+x)*4;localized[i]=localized[i+1]=localized[i+2]=205}
assert(compareAuditPixels(normal,localized).suspect,'detect one tampered region');
assert.match(rasterAuditCaption({matches:2,mismatches:1}),/2 совпадений, 1 расхождений/);

const bytes=Buffer.alloc(22000);
bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WEBPVP8 ',8);
bytes.writeUInt32LE(bytes.length-20,16);bytes[20]=0x10;bytes[21]=0x05;bytes[22]=0;bytes[23]=157;bytes[24]=1;bytes[25]=42;
bytes.writeUInt16LE(3000,26);bytes.writeUInt16LE(450,28);
const sprite='data:image/webp;base64,'+bytes.toString('base64');
const selected=[11,14,19,26,33],assignment={art:19,variation:42,strokes:[]};
const replay=[];
function harness(replace=-1,taint=false){
 let mode='expected',tile=-1;
 const image={naturalWidth:3000,naturalHeight:450};
 const ctx={drawImage(from,...args){mode=from===image?'sprite':'expected';if(mode==='sprite')tile=args[0]/600},
  clearRect(){},getImageData(){if(taint)throw Error('tainted');return {data:mode==='sprite'&&tile===replace?wrong:normal}}};
 const doc={body:{appendChild(){}},createElement(tag){
  if(tag==='div')return {style:{},setAttribute(){},appendChild(){},remove(){}};
  return {style:{},width:0,height:0,getContext(){return ctx}};
 }};
 return {image,doc};
}
for(const [index,expected] of [[-1,'match'],[2,'mismatch']]){
 const h=harness(index),result=await auditRevealedBallot({
  sprite,selected,assignment,doc:h.doc,decode:async()=>h.image,
  render:async(c,id,variation,strokes,damaged)=>{replay.push({id,damaged,variation});return true}
 });
 assert.equal(result.status,expected);
}
assert.equal(replay.length,10,'replay all five canvases for each independent audit');
assert.equal(replay.filter(x=>x.damaged).length,2);
const denied=harness(-1,true);
assert.equal((await auditRevealedBallot({sprite,selected,assignment,doc:denied.doc,
 decode:async()=>denied.image,render:async()=>true})).status,'unavailable',
 'CORS failure must not imply cheating');

let clock=100000;
class Clock extends Date{static now(){return clock}}
const code=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};runInNewContext(compiled,{exports:api,Date:Clock,Math,Array,Number,Set,Map,Object,JSON,Error,console});
const game=api.default,people=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const room=game.createRoom({player:people[0]}).state;
for(const p of people.slice(1))game.onJoin({state:room,player:p,players:people});
const send=(who,payload)=>game.onMessage({state:room,player:people.find(x=>x.id===who),players:people,payload});
send('a',{type:'start',rounds:1,rasterBallots:true});
clock=room.deadline+1;send('a',{type:'pulse'});
for(const p of people)send(p.id,{type:'submit',strokes:[]});
const packets=ballotRasterPackets(sprite,room.round,'raudit',paintingChecksum([]));
for(const p of people)for(const packet of packets)send(p.id,packet);
assert.equal(room.phase,'voting');
const author=room.participants[room.turn].id;
const voters=people.filter(p=>p.id!==author);
const data={type:'ballot_audit',round:room.round,turn:room.turn,targetId:author,
 spriteChecksum:ballotRasterChecksum(sprite),mae:0,patch:0,differing:0};
assert.equal(send(voters[0].id,data).events[0].type,'notice','no early reports');
for(const voter of voters)send(voter.id,{type:'vote',round:room.round,turn:room.turn,targetId:author,chips:[1,0,0,0,0]});
assert.equal(room.phase,'verdict');
assert.equal(send(voters[0].id,data).events[0].type,'notice');
clock=room.deadline+1;send(author,{type:'pulse'});
assert.equal(room.phase,'reveal');
const score=JSON.stringify(room.scores);
assert.equal(send(author,data).events[0].type,'notice','author cannot self-audit');
assert.equal(send(voters[0].id,{...data,spriteChecksum:'bad'}).events[0].type,'notice');
assert.equal(send(voters[0].id,{...data,mae:999}).events[0].type,'notice');
const accepted=send(voters[0].id,{...data,status:'mismatch'});
assert(accepted.events.some(x=>x.type==='audit_update'));
assert(accepted.events.some(x=>x.type==='audit_saved'&&x.to===voters[0].id),
 'accepted peer report explicitly acknowledges delivery');
assert.equal(room.ballotAudits[author][voters[0].id].status,'match');
const repeated=send(voters[0].id,data).events;
assert.equal(repeated.length,1,'duplicate only needs a tiny ack, not a new broadcast');
assert.equal(repeated[0].type,'audit_saved','lost ack can be replayed safely');
send(voters[1].id,{...data,mae:42,patch:80,differing:50,status:'match'});
assert.equal(room.ballotAudits[author][voters[1].id].status,'mismatch',
 'server ignores spoofed labels and applies its own thresholds');
assert.equal(JSON.stringify(room.scores),score,'audit cannot touch scores');
const storage=prepareArtworkStorage(room,'__zamazka_sqlite_art__','');
assert.equal(storage.updates.length,0,'audit metadata must not rewrite even one artwork blob');
assert(storage.activeKeys.has('ballot:'+author),'retention still tracks raster keys');
assert.equal(storage.stored.ballotSprites[author],'__zamazka_sqlite_art__');
const visible=send(author,{type:'sync'}).events[0].payload;
assert.equal(visible.gallery[visible.turn].rasterAudit.matches,1);
assert.equal(visible.gallery[visible.turn].rasterAudit.mismatches,1);
assert.equal(visible.gallery[visible.turn+1],null,'future authors remain hidden');
assert(!JSON.stringify(accepted.events).includes('ballotSprite'),'tiny audit broadcast');
const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert(client.includes('startRasterAudit(v,g,index)')&&client.includes("type:'ballot_audit'"));
const hub=readFileSync(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
assert(hub.includes("'ballot_audit'"));
assert(hub.includes("acceptedPeerAudit?{artOwner:'',skipAlarm:true}"),
 'reports update room metadata without rewriting any raster blobs');
assert(hub.includes("peerAudit&&!acceptedPeerAudit"),
 'duplicates and malformed reports do not trigger a SQLite persistence write');
assert(client.includes("payload.sentAt=Date.now()"),
 'client keeps an unconfirmed report and backs off retries');
assert(client.includes("event?.type==='audit_saved'"),
 'only server acknowledgment clears the outgoing audit queue');
assert(client.includes("if(document.hidden){auditStarted.delete(key);return}"),
 'suspended background tabs can retry their never-started raster audit');
assert(client.includes("resumeRasterAudits()"),
 'returning to the foreground resumes pending independent comparisons');
console.log('ZAMAZKA post-reveal audit: 5 tiles, tamper detection, readback failures, anti-spoof, idempotence and unchanged scores OK');
