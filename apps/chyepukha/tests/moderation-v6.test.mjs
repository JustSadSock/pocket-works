import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replaceAll('export const ','const ').replace('export default module;','return module;'))();
const authors=Array.from({length:3},(_,i)=>({id:'author-'+i,name:'Автор '+i,verified:true,accountId:'acct-'+i,avatar:'art-'+i}));
const visitor={id:'visitor-4',name:'Новачок',verified:true,accountId:'acct-visitor',avatar:'blue'};
function gameRoom(n=3){
 let s=game.createRoom({player:authors[0],payload:{settings:{maxPlayers:8}}}).state;
 for(let i=1;i<n;i++)s=game.onJoin({state:s,players:authors.slice(0,i+1)}).state;
 s=game.onMessage({state:s,player:authors[0],payload:{type:'start'}}).state;
 s=game.onPresence({state:s,onlineIds:authors.slice(0,n).map(p=>p.id)}).state;
 return s;
}
const act=(s,p,payload)=>game.onMessage({state:s,player:p,payload});
function write(s,p){
 const v=game.viewForPlayer({state:s,player:p,players:authors});
 assert.ok(v.sheet,'missing sheet for '+p.id);
 return act(s,p,{type:'submit',round:s.round,sheetId:v.sheet.id,requestId:'commit_'+s.round+'_'+p.id+'_abcdef',
  answer:'Мандрівник знайшов старий годинник і втік у сутінки',
  tailIndexes:s.round===s.total-1?[]:[0,2,4],gender:'unspecified'});
}
test('pause blocks submissions but preserves the draft, same round and host authority',()=>{
 let s=gameRoom();
 assert.equal(act(s,authors[1],{type:'pause'}).events[0].type,'notice');
 s=act(s,authors[0],{type:'pause'}).state;
 assert.equal(s.paused,true);
 const unchanged=write(s,authors[0]);
 assert.equal(unchanged.events[0].type,'submission_rejected');
 assert.equal(unchanged.state.sheets[0].fragments.length,0);
 const r=act(s,authors[0],{type:'resume'});s=r.state;
 assert.equal(s.paused,false);
 assert.equal(s.round,0);
 s=write(s,authors[0]).state;
 assert.equal(s.sheets[0].fragments.length,1);
});
test('kick excludes identity; candidate receives no hidden sheet and can fill the fixed slot after nine rounds',()=>{
 let s=gameRoom(),count=0;
 for(let round=0;round<9;round++)for(const p of authors){s=write(s,p).state;count++}
 assert.equal(s.round,9);assert.equal(s.sheets.length,3);
 const original=s.sheets.map(sh=>sh.fragments.map(f=>({by:f.by,answer:f.answer})));
 assert.equal(act(s,authors[1],{type:'kick',targetId:authors[2].id}).events[0].type,'notice');
 const kicked=act(s,authors[0],{type:'kick',targetId:authors[2].id});
 s=kicked.state;
 assert.ok(kicked.events.some(e=>e.type==='player_kicked'&&e.to===authors[2].id));
 assert.equal(s.players[2].vacant,true);
 assert.equal(s.round,9);
 assert.deepEqual(s.sheets.map(sh=>sh.fragments.map(f=>({by:f.by,answer:f.answer}))),original);
 assert.throws(()=>game.onJoin({state:s,players:[...authors,authors[2]]}),/room_kicked/);
 s=game.onJoin({state:s,players:[...authors,visitor]}).state;
 const candidate=game.viewForPlayer({state:s,player:visitor,players:[...authors,visitor]});
 assert.equal(candidate.waitingApproval,true);
 assert.equal('sheet' in candidate,false);
 assert.equal('stories' in candidate,false);
 s=game.onPresence({state:s,onlineIds:[authors[0].id,authors[1].id,visitor.id]}).state;
 s=act(s,authors[0],{type:'assign_seat',seatId:authors[2].id,candidateId:visitor.id}).state;
 assert.equal(s.players[2].id,visitor.id);
 assert.equal(s.players[2].avatar,visitor.avatar);
 assert.equal(s.players[2].accountId,visitor.accountId);
 assert.equal(s.sheets[2].starter,authors[2].id);
 assert.equal(s.round,9);
 s=write(s,authors[0]).state;s=write(s,authors[1]).state;s=write(s,visitor).state;
 assert.equal(s.phase,'finished');
 assert.ok(s.sheets.every(sh=>sh.fragments.length===10));
 const story=game.viewForPlayer({state:s,player:authors[0],players:authors}).stories.find(x=>x.starter===authors[2].name);
 assert.ok(story);
 assert.equal(story.fragments[0].author,authors[2].name);
 assert.equal(story.fragments[9].author,visitor.name);
 assert.ok(story.fragments.every(f=>f.answer.length>0));
});
test('vacant seats can be explicitly skipped with a visible marker, never synthetic narrative',()=>{
 let s=gameRoom();
 s=act(s,authors[0],{type:'kick',targetId:authors[2].id}).state;
 s=act(s,authors[0],{type:'skip_seat',targetId:authors[2].id}).state;
 assert.equal(s.players[2].autoSkip,true);
 assert.ok(s.sheets.some(sh=>sh.fragments.some(f=>f.skipped)));
 s=write(s,authors[0]).state;
 s=write(s,authors[1]).state;
 assert.equal(s.round,1);
 const view=game.viewForPlayer({state:act(s,authors[0],{type:'finish_early'}).state,player:authors[0],players:authors});
 assert.ok(view.stories.some(st=>st.fragments.some(f=>f.skipped&&f.answer.includes('не завершив'))));
 let two=gameRoom(2);
 two=act(two,authors[0],{type:'kick',targetId:authors[1].id}).state;
 const rejected=act(two,authors[0],{type:'skip_seat',targetId:authors[1].id});
 assert.equal(rejected.events[0].type,'notice');
 assert.equal(rejected.state.round,0);
});
test('five minute absence allows only a majority of connected authors to elect a host',()=>{
 let s=gameRoom();
 const earlier=Date.now()-6*60*1000;
 s=game.onPresence({state:s,onlineIds:[authors[1].id,authors[2].id],now:earlier}).state;
 assert.ok(s.hostOfflineSince<=earlier);
 const first=act(s,authors[1],{type:'host_vote',targetId:authors[1].id});s=first.state;
 assert.equal(s.host,authors[0].id);
 assert.equal(s.votes[authors[1].id],authors[1].id);
 const second=act(s,authors[2],{type:'host_vote',targetId:authors[1].id});s=second.state;
 assert.equal(s.host,authors[1].id);
 assert.equal(s.hostOfflineSince,0);
 assert.deepEqual(s.votes,{});
 assert.equal(act(s,authors[0],{type:'pause'}).events[0].type,'notice');
 assert.equal(act(s,authors[1],{type:'pause'}).state.paused,true);
});
