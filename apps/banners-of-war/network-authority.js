// Compare only authority visible to this commander. A global lobby revision can
// change when the opposing side allocates groups; that is not a new local intent.
function key(v){
 if(!v?.allied)return null;
 const a=v.allied;
 return JSON.stringify([v.id,v.phase,v.round,v.checksum,v.side,v.nextSeq,a.seat,a.role,
  [...a.scope].sort((x,y)=>x-y),a.members.map(m=>[m.seat,m.role,m.self,m.ai,m.ready,m.accepted,[...m.groups].sort()]).sort((x,y)=>x[0]-y[0]),
  v.accepted?.[v.side],v.ready?.[v.side]]);
}
export function sameAuthorityIntent(before,after){
 const a=key(before);return a!==null&&a===key(after);
}
export const authorityActions=new Set(['allocate','transfer','handoff','delegate']);
