import {blockiesAwardById} from '../shared/capabilities/blockies-achievements.js';

// Authoritative team milestones from PocketNet's game-engine snapshots.
// No counters or claimed achievements from an untrusted browser are accepted.
export function assessBlockiesAwards(previous,next,stats,makeId=()=>crypto.randomUUID()){
  if(!next||!next.started||!next.engine||!Array.isArray(next.players))return {stats:stats||null,awards:[]};
  const fresh=!stats||stats.round!==next.round;
  const data=fresh?{round:next.round,matchId:makeId(),seen:[]}:{...stats,seen:[...(stats.seen||[])]};
  const prev=previous?.started&&previous.round===next.round?previous.engine?.sharedStats:null;
  const now=next.engine.sharedStats||{};
  const lines=Number.isFinite(now.lines)?now.lines:0;
  const score=Number.isFinite(now.score)?now.score:0;
  const before=prev&&Number.isFinite(prev.lines)?prev.lines:0;
  const gained=Math.max(0,lines-before);
  const lastClear=now.lastClearDetail;
  const singleClear=lastClear&&Number.isInteger(lastClear.linesCleared)&&lastClear.linesCleared>0&&lastClear.linesCleared<=gained?lastClear.linesCleared:0;
  const combo=Number.isFinite(now.comboChain)?now.comboChain:0;
  const members=next.players.filter(p=>!p.left);
  const candidates=[];
  if(lines>=1)candidates.push('first-line');
  if(singleClear>=2)candidates.push('double');
  if(singleClear>0&&combo>=3)candidates.push('combo-three');
  if(lines>=10)candidates.push('ten-lines');
  if(singleClear>=4)candidates.push('four-lines');
  if(members.length>=2&&lines>=20)candidates.push('coop-twenty');
  if(lines>=40)candidates.push('forty-lines');
  if(score>=5000)candidates.push('five-thousand');
  if(lines>=100)candidates.push('hundred-lines');
  const awards=[];
  for(const suffix of candidates){
    const id='blockies.'+suffix;
    if(!blockiesAwardById.has(id)||data.seen.includes(id))continue;
    data.seen.push(id);
    for(const p of members)awards.push({playerId:p.id,achievementId:id,matchId:data.matchId});
  }
  return {stats:data,awards};
}
