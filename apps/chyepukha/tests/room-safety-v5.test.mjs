import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace('export default module;','return module;'))();
const players=Array.from({length:4},(_,i)=>({id:'author-'+i,name:'Автор '+i,verified:true,accountId:'account-'+i,avatar:'paper'}));
const move=(state,player,payload)=>game.onMessage({state,player,payload});
const view=(state,player,active=players)=>game.viewForPlayer({state,player,players:active});
function begin(){
 let state=game.createRoom({player:players[0],payload:{settings:{questionSet:'characterArc',visibleTailWords:3}}}).state;
 for(let i=1;i<players.length;i++)state=game.onJoin({state,players:players.slice(0,i+1)}).state;
 state=move(state,players[0],{type:'start'}).state;
 return state;
}
function submit(state,p,index){
 const v=view(state,p);
 const packet={type:'submit',requestId:'packet_'+index+'_'+p.id+'_abcd',round:state.round,
  sheetId:v.sheet.id,answer:'У старому місті загадкова качка знову грала на флейті',
  tailIndexes:state.round===state.total-1?[]:[0,2,4],gender:'unspecified'};
 return {packet,...move(state,p,packet)};
}
test('accepted submission has receipt, duplicate packet is strictly idempotent',()=>{
 let s=begin();const r=submit(s,players[0],0);s=r.state;
 assert.equal(s.sheets[0].fragments.length,1);
 assert.equal(view(s,players[0]).lastReceipt.requestId,r.packet.requestId);
 assert.ok(r.events.some(e=>e.type==='receipt'&&e.to===players[0].id));
 const originalRevision=s.revision;
 const duplicate=move(s,players[0],r.packet);
 assert.equal(duplicate.state.revision,originalRevision);
 assert.equal(duplicate.state.sheets[0].fragments.length,1);
 assert.deepEqual(duplicate.events.map(e=>e.type),['receipt']);
 assert.equal(duplicate.events[0].payload.accepted,true);
 const broken=move(s,players[1],{...r.packet,requestId:'<script>'});
 assert.equal(broken.events[0].type,'submission_rejected');
 assert.equal(broken.events[0].payload.requestId,'<script>');
 assert.match(broken.events[0].payload.reason,/ідентифікатор/i);
 assert.equal(broken.state.revision,originalRevision);
});
test('nine completed rounds survive explicit leave, zero live seats and verified rejoin',()=>{
 let s=begin();let counter=0;
 for(let round=0;round<9;round++){
  for(const p of players){const r=submit(s,p,counter++);s=r.state;}
  assert.equal(s.round,round+1);
 }
 const fragmentsBefore=s.sheets.map(sh=>sh.fragments.map(f=>f.answer));
 s=game.onLeave({state:s,players:players.slice(0,3)}).state;
 assert.equal(s.round,9);
 assert.equal(s.phase,'writing');
 assert.equal(s.players.length,4);
 assert.equal(view(s,players[0],players.slice(0,3)).players[3].departed,true);
 assert.deepEqual(s.sheets.map(sh=>sh.fragments.map(f=>f.answer)),fragmentsBefore);
 s=game.onLeave({state:s,players:[]}).state;
 assert.equal(s.phase,'writing');
 assert.equal(s.sheets[0].fragments.length,9);
 assert.throws(()=>game.onJoin({state:structuredClone(s),players:[...players.slice(0,3),{id:'stranger',name:'Stranger'}]}),/match_in_progress/);
 s=game.onJoin({state:s,players}).state;
 assert.equal(s.players.length,4);
 for(const p of players){const r=submit(s,p,counter++);s=r.state;}
 assert.equal(s.phase,'finished');
 assert.equal(s.sheets.length,4);
 assert.ok(s.sheets.every(sh=>sh.fragments.length===10));
});
test('a host can finish the edition early without losing completed chapters',()=>{
 let s=begin();let counter=0;
 for(let round=0;round<9;round++)for(const p of players)s=submit(s,p,counter++).state;
 const unauthorized=move(s,players[1],{type:'finish_early'});
 assert.equal(unauthorized.events[0].type,'notice');
 const done=move(s,players[0],{type:'finish_early'}).state;
 assert.equal(done.phase,'finished');
 assert.equal(done.round,9);
 assert.ok(done.sheets.every(sh=>sh.fragments.length===9));
 assert.equal(view(done,players[1]).stories.length,4);
 s=game.onLeave({state:done,players:[players[0]]}).state;
 assert.equal(s.phase,'finished');
 assert.equal(s.sheets[0].fragments.length,9);
});
