// Bounded, inspectable warm start from actual Grid Q-values to Combat Forge.
import {makePolicy,validPolicy} from './combat-core.mjs';
export function navigationTraits(brain){
 if(brain?.type!=='qlearning'||brain.version!==1||!Array.isArray(brain.q))return null;
 let dangerAvoid=0,dangerSeen=0,motion=0,total=0,learned=0;
 for(const [key,actions] of brain.q.slice(0,100000)){
  if(typeof key!=='string'||!Array.isArray(actions)||actions.length!==5||actions.some(v=>!Number.isFinite(v)))continue;
  if(actions.some(v=>Math.abs(v)>1e-4))learned++;
  const cells=key.split('|')[1];if(!cells||cells.length<4)continue;
  const adjacent=[cells[0],cells[3],cells[1],cells[2]];
  const safe=adjacent.map((tile,i)=>tile==='3'?null:actions[i]).filter(x=>x!==null);
  const danger=adjacent.map((tile,i)=>tile==='3'?actions[i]:null).filter(x=>x!==null);
  if(danger.length&&safe.length){
   const safeBest=Math.max(...safe),dangerBest=Math.max(...danger);
   dangerAvoid+=Math.max(-1,Math.min(1,safeBest-dangerBest));
   dangerSeen++;
  }
  motion+=Math.max(...actions.slice(0,4))-actions[4];total++;
 }
 if(total<20||learned<12)return null; // Merely visited states are not learned expertise.
 return {samples:learned,avoid:dangerSeen?Math.max(0,Math.min(1,.5+dangerAvoid/dangerSeen*.3)):.5,
  locomotion:Math.max(0,Math.min(1,.5+motion/total*.1)),hazardSamples:dangerSeen};
}
export function warmStartCombatFromWorld(gridBrain){
 const t=navigationTraits(gridBrain);if(!t)return null;
 const policy=makePolicy('balanced',17);
 // Reuse only the transferable parts: hazard avoidance and willingness to move.
 policy.weights[1]=Math.max(.15,Math.min(.95,.3+.55*t.avoid)); // orbit / evasion
 policy.weights[2]=Math.max(.2,Math.min(.96,.3+.6*t.locomotion)); // movement strength
 policy.weights[7]=Math.max(.25,Math.min(.96,.35+.5*t.avoid)); // defense preference
 policy.name='world-navigation-transfer';
 return validPolicy(policy)?{policy,traits:t}:null;
}