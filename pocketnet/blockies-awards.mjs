// Deterministic grants from the server-persisted v3 engine, never from browser stats.
// A transition may unlock several goals; the coordinator deduplicates per account.
const metric=(p,key)=>Number.isInteger(p?.[key])&&p[key]>=0?p[key]:null;
export function assessBlockiesAwards(previous,next,matchId) {
  if(!next?.started || !Array.isArray(next?.players) || !Array.isArray(next?.engine?.players))return [];
  if(!Number.isInteger(next.round)||next.round<1||!matchId)return [];
  const engine=next.engine,earlier=previous?.round===next.round?previous.engine:null;
  const members=next.players.map((p,i)=>({
    id:p.id,left:!!p.left,
    pieces:metric(engine.players[i],'piecesLocked'),
    hardDrops:metric(engine.players[i],'hardDrops'),
    lines:metric(engine.players[i],'linesClearedByMe'),
    oldLines:metric(earlier?.players?.[i],'linesClearedByMe')??0
  }));
  if(members.some(p=>p.pieces===null||p.hardDrops===null||p.lines===null))return [];
  const active=members.filter(p=>!p.left),noLeavers=active.length===members.length;
  const totalLines=metric(engine.sharedStats,'lines')??0,awards=[],unique=new Set();
  const add=(p,short)=>{
    if(!p||p.left)return;
    const id='blockies.'+short,key=p.id+':'+id;
    if(unique.has(key))return;
    unique.add(key);awards.push({playerId:p.id,achievementId:id,matchId});
  };
  for(const p of active){
    if(p.pieces>=1)add(p,'first-lock');
    if(p.lines>=1)add(p,'first-line');
    if(p.hardDrops>=10&&p.pieces>=10)add(p,'ten-locks');
    if(p.lines-p.oldLines>=2)add(p,'double');
  }
  if(noLeavers&&active.length>=2){
    const duo=active.filter(p=>p.pieces>=3);
    if(duo.length>=2&&totalLines>=3)duo.forEach(p=>add(p,'duo'));
    const steady=active.filter(p=>p.pieces>=8);
    if(steady.length>=2&&totalLines>=20)steady.forEach(p=>add(p,'steadfast'));
    const masters=active.filter(p=>p.pieces>=10);
    if(masters.length>=2&&totalLines>=40)masters.forEach(p=>add(p,'master'));
  }
  if(noLeavers&&active.length===4&&totalLines>=6&&active.every(p=>p.pieces>=2))
    active.forEach(p=>add(p,'quartet'));
  return awards;
}
