import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(text.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const user=i=>({id:'author-'+i,name:'Автор '+i});
const see=(s,p,ps)=>game.viewForPlayer({state:s,player:p,players:ps});
const run=(s,p,payload)=>game.onMessage({state:s,player:p,payload});
function fixture(n,rounds=4){
 const ps=Array.from({length:n},(_,i)=>user(i));
 const questions=Array.from({length:rounds},(_,i)=>'Питання '+i);
 let s=game.createRoom({player:ps[0],payload:{settings:{maxPlayers:n,questionSet:'custom',customQuestions:questions,visibleTailWords:2}}}).state;
 for(let i=2;i<=n;i++)s=game.onJoin({state:s,players:ps.slice(0,i)}).state;
 s=run(s,ps[0],{type:'start'}).state;
 return {ps,s};
}
function submit(s,p,ps,text,other={}){
 const v=see(s,p,ps);
 return run(s,p,{type:'submit',round:v.round,sheetId:v.sheet.id,answer:text,tailIndexes:s.round===s.total-1?[]:[0,1],gender:'unspecified',...other});
}
test('2–8 authors complete four or sixteen rounds with rotated manuscripts and arbitrary submission order',()=>{
 for(let n=2;n<=8;n++){
  const rounds=n===8?16:4;
  const {ps,s:initial}=fixture(n,rounds);
  let s=initial;
  const saved=new Map();
  for(let round=0;round<rounds;round++){
   const order=ps.map((p,i)=>({p,sort:(i*37+round*17+n*11)%101})).sort((a,b)=>a.sort-b.sort).map(x=>x.p);
   assert.equal(new Set(order.map(p=>p.id)).size,n);
   for(const p of order){
    const v=see(s,p,ps);
    assert.equal(v.round,round);
    assert.equal(v.sheet.id,'sheet-'+((ps.indexOf(p)-round%n+n)%n));
    assert.equal('stories' in v,false);
    const secret='PRIVATE_'+n+'_'+round+'_'+p.id;
    const packet=submit(s,p,ps,'Перший Другий рукопис '+secret+' продовжувався таємно');
    assert.equal(packet.events[0].type,'state');
    s=packet.state;
    saved.set(n+'/'+round+'/'+p.id,secret);
    if(s.phase==='writing')for(const other of ps){
     const visible=see(s,other,ps);
     assert.equal(JSON.stringify(visible).includes(secret),false);
     assert.equal('stories' in visible,false);
    }
   }
   assert.equal(s.round,round+1);
  }
  assert.equal(s.phase,'finished');
  for(let j=0;j<n;j++){
   assert.equal(s.sheets[j].fragments.length,rounds);
   for(let round=0;round<rounds;round++){
    const p=ps[(j+round)%n];
    const f=s.sheets[j].fragments[round];
    assert.equal(f.by,p.id);
    assert.ok(f.answer.includes(saved.get(n+'/'+round+'/'+p.id)));
   }
  }
  assert.deepEqual(see(s,ps[0],ps).stories.map(x=>x.fragments.length),Array(n).fill(rounds));
 }
});
test('private answer text and all server-only fields are hidden until finale',()=>{
 const {ps,s:begin}=fixture(3);
 let s=submit(begin,ps[0],ps,'Перший Другий речення SECRET_NOT_SELECTED продовжує історію').state;
 for(const p of ps){
  const v=see(s,p,ps),json=JSON.stringify(v);
  assert.equal(json.includes('SECRET_NOT_SELECTED'),false);
  assert.equal('sheets' in v,false);
  assert.equal('stories' in v,false);
  assert.equal('submitted' in v,false);
 }
 assert.equal(see(s,ps[0],ps).waiting,true);
 s=submit(s,ps[1],ps,'Зовсім новий сюжет росте у місті').state;
 s=submit(s,ps[2],ps,'Інша таємниця хвилює цілу громаду').state;
 const v=see(s,ps[1],ps);
 assert.equal(v.sheet.tail,'Перший Другий');
 assert.equal(JSON.stringify(v).includes('SECRET_NOT_SELECTED'),false);
});
test('invalid and malicious packets never advance the round or corrupt manuscripts',()=>{
 const {ps,s}=fixture(2),p=ps[0],v=see(s,p,ps);
 const payload={type:'submit',round:0,sheetId:v.sheet.id,answer:'Перший Другий третій четвертий пятий',tailIndexes:[0,1],gender:'unspecified'};
 for(const patch of [{round:1},{sheetId:'sheet-5'},{answer:'два слова'},{tailIndexes:[0]},{tailIndexes:[0,0]},{tailIndexes:[0,99]},{tailIndexes:[0,1.5]},{gender:'unknown'},{answer:'а'.repeat(801)},{answer:'а'.repeat(1601)}]){
  const result=run(structuredClone(s),p,{...payload,...patch});
  assert.equal(result.events[0].type,'notice','forged packet should be rejected');
  assert.deepEqual(result.state,s,'forged packet modified persistent state');
 }
 const once=run(structuredClone(s),p,payload);
 assert.equal(once.events[0].type,'state');
 assert.equal(run(once.state,p,payload).events[0].type,'notice');
});
test('room capacity, host permission and early leave keeps the running issue',()=>{
 const host=user(0),guest=user(1),other=user(2);
 let s=game.createRoom({player:host,payload:{settings:{maxPlayers:2}}}).state;
 s=game.onJoin({state:s,players:[host,guest]}).state;
 assert.throws(()=>game.onJoin({state:structuredClone(s),players:[host,guest,other]}),/room_full/);
 assert.equal(run(s,guest,{type:'settings',settings:{maxPlayers:8}}).events[0].type,'notice');
 assert.equal(run(s,guest,{type:'start'}).events[0].type,'notice');
 s=run(s,host,{type:'start'}).state;
 assert.throws(()=>game.onJoin({state:structuredClone(s),players:[host,guest,other]}),/match_in_progress/);
 s=game.onLeave({state:s,players:[guest]}).state;
 assert.equal(s.phase,'writing');
 assert.equal(s.host,host.id);
 assert.equal(s.sheets.length,2);
 assert.equal(s.players.length,2);
 assert.equal(run(s,guest,{type:'start'}).events[0].type,'notice');
});
test('zero and twelve transmitted words follow actual configured limits',()=>{
 for(const limit of [0,12]){
  const ps=[user(0),user(1)],questions=['Один','Два'];
  let s=game.createRoom({player:ps[0],payload:{settings:{maxPlayers:2,questionSet:'custom',customQuestions:questions,visibleTailWords:limit}}}).state;
  s=game.onJoin({state:s,players:ps}).state;
  s=run(s,ps[0],{type:'start'}).state;
  const sh=see(s,ps[0],ps).sheet;
  const packet=run(s,ps[0],{type:'submit',sheetId:sh.id,round:0,answer:Array.from({length:14},(_,i)=>'слово'+i).join(' '),tailIndexes:Array.from({length:limit},(_,i)=>i),gender:'female'});
  assert.equal(packet.events[0].type,'state');
  assert.equal(packet.state.sheets[0].fragments[0].tail.split(' ').filter(Boolean).length,limit);
 }
});
