import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace('export default module;','return module;'))();
const authors=Array.from({length:3},(_,i)=>({id:'author-'+i,name:'Автор '+i,verified:true,accountId:'account-'+i,avatar:'paper'}));
const newcomer={id:'author-new',name:'Новий автор',verified:true,accountId:'account-new'};
const msg=(s,p,packet,online=authors.map(x=>x.id),now=1000000)=>game.onMessage({state:s,player:p,payload:packet,connectedIds:online,now});
const playerView=(s,p,online=authors.map(x=>x.id))=>game.viewForPlayer({state:s,player:p,players:authors,onlineIds:online});
function begin(){
 let s=game.createRoom({player:authors[0],payload:{settings:{questionSet:'characterArc'}}}).state;
 for(let i=1;i<authors.length;i++)s=game.onJoin({state:s,players:authors.slice(0,i+1),player:authors[i]}).state;
 return msg(s,authors[0],{type:'start'}).state;
}
function answer(s,p){
 const v=playerView(s,p),tailIndexes=s.round===s.total-1?[]:[0,2,4];
 return msg(s,p,{type:'submit',round:s.round,sheetId:v.sheet.id,answer:'Старий художник знайшов дивний ключ у міському парку',tailIndexes,gender:'unspecified',requestId:'packet_'+p.id+'_'+s.round+'_abcdefgh'});
}
test('host pauses and resumes without deleting draft or accepting submissions during pause',()=>{
 let s=begin();s=msg(s,authors[0],{type:'pause'}).state;
 assert.equal(s.paused,true);assert.equal(s.round,0);
 assert.equal(msg(s,authors[1],{type:'unpause'}).events[0].type,'notice');
 assert.equal(answer(s,authors[1]).events[0].type,'submission_rejected');
 assert.equal(s.sheets[0].fragments.length,0);
 s=msg(s,authors[0],{type:'unpause'}).state;assert.equal(s.paused,false);
 assert.equal(answer(s,authors[1]).state.sheets.some(sh=>sh.fragments.length===1),true);
});
test('kick is host-only, revokes account and preserves the same number of manuscript slots',()=>{
 let s=begin();
 s=answer(s,authors[1]).state;
 const chapters=s.sheets.map(sh=>sh.fragments.length);
 const unauthorized=msg(s,authors[2],{type:'kick',seatId:authors[1].id});
 assert.equal(unauthorized.events[0].type,'notice');
 const kicked=msg(s,authors[0],{type:'kick',seatId:authors[1].id});
 s=kicked.state;
 assert.equal(kicked.events.some(x=>x.type==='player_kicked'&&x.to===authors[1].id),true);
 assert.deepEqual(s.sheets.map(sh=>sh.fragments.length),chapters);
 assert.equal(s.players.length,3);
 assert.equal(playerView(s,authors[0]).players[1].excluded,true);
 assert.throws(()=>game.onJoin({state:s,player:authors[1],players:authors}),/room_kicked/);
 assert.throws(()=>game.onJoin({state:s,player:{...authors[1],id:'new-device'},players:authors}),/room_kicked/);
});
test('one-time seat claim preserves submitted flag, author history and rotation',()=>{
 let s=begin();s=answer(s,authors[1]).state;
 s=msg(s,authors[0],{type:'kick',seatId:authors[1].id}).state;
 const claim=msg(s,authors[0],{type:'open_seat',seatId:authors[1].id},[authors[0].id,authors[2].id]);
 s=claim.state;const code=playerView(s,authors[0]).claim.code;
 assert.match(code,/^[A-Z0-9]{12}$/);assert.equal(playerView(s,authors[2]).claim,null);
 assert.throws(()=>game.onJoin({state:structuredClone(s),player:newcomer,players:[authors[0],authors[2],newcomer],payload:{claimCode:'INVALID'}}),/invalid_replacement_code/);
 const joined=game.onJoin({state:s,player:newcomer,players:[authors[0],authors[2],newcomer],payload:{claimCode:code}});
 s=joined.state;
 assert.equal(s.players.length,3);assert.equal(s.players[1].id,newcomer.id);
 assert.equal(s.submitted[newcomer.id],true);assert.equal(s.submitted[authors[1].id],undefined);
 assert.equal(s.claim,null);
 assert.equal(s.sheets.some(sh=>sh.fragments.some(f=>f.authorName===authors[1].name)),true);
 assert.equal(playerView(s,authors[0]).players[1].name,newcomer.name);
 assert.throws(()=>game.onJoin({state:s,player:authors[1],players:authors}),/room_kicked/);
 const asView=game.viewForPlayer({state:s,player:newcomer,players:[authors[0],authors[2],newcomer],onlineIds:[authors[0].id,newcomer.id]});
 assert.equal(asView.waiting,true);
});
test('only current host can transfer controls, and vote requires 5 minutes offline',()=>{
 let s=begin();
 assert.equal(msg(s,authors[1],{type:'transfer_host',seatId:authors[2].id}).events[0].type,'notice');
 s=msg(s,authors[0],{type:'transfer_host',seatId:authors[2].id}).state;
 assert.equal(s.host,authors[2].id);
 assert.equal(msg(s,authors[0],{type:'pause'}).events[0].type,'notice');
 s=game.onPresence({state:s,player:authors[2],online:false,onlineIds:[authors[0].id,authors[1].id],now:1000000}).state;
 const early=msg(s,authors[0],{type:'vote_host',seatId:authors[1].id},[authors[0].id,authors[1].id],1299999);
 assert.equal(early.events[0].type,'notice');
 s=msg(s,authors[0],{type:'vote_host',seatId:authors[1].id},[authors[0].id,authors[1].id],1300001).state;
 assert.equal(s.host,authors[2].id);
 s=msg(s,authors[1],{type:'vote_host',seatId:authors[1].id},[authors[0].id,authors[1].id],1300002).state;
 assert.equal(s.host,authors[1].id);
 assert.deepEqual(s.hostVotes,{});
});
test('author who comes back before claim is not replaceable',()=>{
 let s=begin();
 s=game.onPresence({state:s,player:authors[1],online:false,onlineIds:[authors[0].id,authors[2].id]}).state;
 s=msg(s,authors[0],{type:'open_seat',seatId:authors[1].id},[authors[0].id,authors[2].id]).state;
 assert.ok(s.claim);
 const denied=msg(s,authors[0],{type:'open_seat',seatId:authors[1].id},authors.map(x=>x.id));
 assert.equal(denied.events[0].type,'notice');
});
