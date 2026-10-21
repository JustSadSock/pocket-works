import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGES} from '../mages.mjs';
import {makeMatch,tick,STEP,validState} from '../core.mjs';

// Mirrored deterministic tactical policy; no hidden aim assist, client lottery
// or offline bot. Evaluate both sides of every fighter pairing over three seeds.
const policy=(self,enemy,side,tickNo)=>{
 const dx=enemy.x-self.x,dy=enemy.y-self.y,d=Math.hypot(dx,dy)||1;
 return {
  x:dx/d*.55-dy/d*.35*side,
  y:dy/d*.55+dx/d*.35*side,
  aim:{x:enemy.x,y:enemy.y},
  attack:true,
  shield:tickNo%177===2,
  dash:tickNo%163===8
 };
};
export function matrix(){
 const scores=Array.from({length:MAGES.length},()=>[]);
 for(let i=0;i<MAGES.length;i++)for(let j=0;j<MAGES.length;j++){
  let sum=0;
  for(let seed=1;seed<=3;seed++){
   const s=makeMatch(seed+10,MAGES[i].id,MAGES[j].id);
   let frame=0;
   while(s.phase==='fight'&&frame++<1550){
    const [a,b]=s.actors;
    tick(s,policy(a,b,1,frame),STEP,policy(b,a,-1,frame));
   }
   assert.ok(validState(s),'invalid simulation '+i+' '+j);
   assert.ok(s.shots.length<=80,'projectile cap');
   assert.ok(s.actors.every(a=>Number.isFinite(a.hp)&&a.hp>=0));
   sum+=s.actors[0].hp-s.actors[1].hp;
  }
  scores[i][j]=Math.round(sum/3);
 }
 return scores;
}
test('6×6 matchup model stays within target average HP advantage; no untouchable class',()=>{
 const table=matrix(),rows=table.map(r=>r.reduce((a,b)=>a+b,0)/r.length);
 console.log('Perekos matchup matrix:',JSON.stringify({classes:MAGES.map(m=>m.id),table,rows}));
 assert.equal(table.length,6);
 for(let i=0;i<rows.length;i++)assert.ok(Math.abs(rows[i])<28,
  MAGES[i].name+' exceeds allowed matchup advantage: '+rows[i].toFixed(1));
 assert.ok(rows.some(v=>v>0)&&rows.some(v=>v<0),'there must be meaningful strengths and weaknesses');
 console.log('Perekos v0.6 matchup mean HP:',JSON.stringify(Object.fromEntries(MAGES.map((m,i)=>[m.name,Number(rows[i].toFixed(1))]))));
});
