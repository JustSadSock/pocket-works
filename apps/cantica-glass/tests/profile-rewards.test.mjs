import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PocketSocial} from '../../../pocket-social/hub.mjs';
import {createBoard,neededTurns,traceLight} from '../logic.js';

const players=[{id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',name:'A'},
 {id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',name:'B'}];
function solve(index){
 const board=createBoard(index,0),turns=[];
 for(let pass=0;pass<100&&!traceLight(board,index).complete;pass++){
  const hint=neededTurns(board,index);assert.ok(hint);
  for(let i=0;i<hint.clockwise;i++){
   board[hint.index].turns=(board[hint.index].turns+1)%4;turns.push([hint.index,1]);
   if(traceLight(board,index).complete)break;
  }
 }
 assert.ok(traceLight(board,index).complete);
 return {level:index,variant:0,turns};
}
test('Pocket Social verifies CANTICA progression, grants genuine locked profile items and is idempotent',async()=>{
 const db=new DatabaseSync(':memory:');
 const sql={exec(query,...args){
  const statement=db.prepare(query),read=/^\s*(SELECT|PRAGMA)/i.test(query);
  if(!read)statement.run(...args);
  return {toArray:()=>read?statement.all(...args):[]};
 }};
 const hub=new PocketSocial({storage:{sql}});
 async function api(player,path,payload){
  const user=players[player];
  const url='https://example.com/pocket-social/'+path;
  const body=payload===undefined?null:JSON.stringify(payload);
  const response=await hub.fetch(new Request(url,{
   method:body?'POST':'GET',
   headers:{'x-pw-account-id':user.id,'x-pw-account-name':user.name,
    'x-pw-account-avatar':'clay',...(body?{'content-type':'application/json',origin:'https://example.com'}:{})},
   ...(body?{body}:{})
  }));
  return {status:response.status,...await response.json()};
 }
 const card={background:'forest',frame:'clean',artwork:'',favoriteGame:'cantica-glass',
  discoverable:true,presenceVisible:true,allowInvites:true};
 const maskot={animal:'cat',hat:'none',clothes:'tunic',face:'none',accessory:'none'};
 await api(0,'me');await api(1,'me');
 assert.equal((await api(0,'profile',{...card,title:'Проводник света'})).status,400);
 assert.equal((await api(0,'profile',{...card,background:'chapel'})).status,400);
 assert.equal((await api(0,'profile',{...card,portraitFrame:'rose-window'})).status,400);
 assert.equal((await api(0,'profile',{...card,maskot:{...maskot,hat:'solar-circlet'}})).status,400);
 assert.equal((await api(0,'profile',{...card,maskot:{...maskot,accessory:'sun-crystal'}})).status,400);
 assert.equal((await api(0,'profile',{...card,maskot:{...maskot,clothes:'illuminator'}})).status,400);
 assert.equal((await api(0,'cantica/complete',{level:0,variant:0,turns:[[999,1]]})).status,400);
 const first=await api(0,'cantica/complete',solve(0));
 assert.equal(first.ok,true);assert.ok(first.awarded.includes('cantica.first-light'));
 assert.equal((await api(0,'cantica/complete',solve(0))).already,true);
 assert.equal((await api(0,'cantica/progress')).completed,1);
 assert.equal((await api(1,'cantica/progress')).completed,0);
 assert.equal((await api(0,'profile',{...card,title:'Проводник света'})).ok,true);
 assert.equal((await api(1,'profile',{...card,title:'Проводник света'})).status,400);
 for(let index=1;index<50;index++)assert.equal((await api(0,'cantica/complete',solve(index))).ok,true);
 const progress=await api(0,'cantica/progress');
 assert.equal(progress.completed,50);
 assert.ok(progress.achievements.some(a=>a.id==='cantica.twenty-five'));
 assert.ok(progress.achievements.some(a=>a.id==='cantica.fifty'));
 assert.equal((await api(0,'profile',{...card,background:'chapel',portraitFrame:'rose-window'})).ok,true);
 assert.equal((await api(1,'profile',{...card,background:'chapel',portraitFrame:'rose-window'})).status,400);
 assert.ok((await api(0,'cantica/complete',solve(305))).awarded.includes('cantica.seven'));
 assert.ok((await api(0,'cantica/complete',solve(360))).awarded.includes('cantica.four-altars'));
 assert.equal((await api(0,'profile',{...card,maskot:{...maskot,hat:'solar-circlet',accessory:'sun-crystal'}})).ok,true);
 assert.equal((await api(1,'profile',{...card,maskot:{...maskot,hat:'solar-circlet'}})).status,400);
 // Simulate previously confirmed unique windows without replaying them 448 more times in this fixture.
 for(let i=50;i<500;i++)if(i!==305&&i!==360)
  sql.exec('INSERT INTO cantica_completions(account_id,level,best_moves,completed_at) VALUES(?,?,?,?)',players[0].id,i,100,Date.now());
 const finale=await api(0,'cantica/complete',solve(499));
 assert.ok(finale.awarded.includes('cantica.complete'));
 assert.equal(finale.completed,500);
 assert.equal((await api(0,'profile',{...card,maskot:{...maskot,clothes:'illuminator'}})).ok,true);
 assert.equal((await api(1,'profile',{...card,maskot:{...maskot,clothes:'illuminator'}})).status,400);
 db.close();
});
