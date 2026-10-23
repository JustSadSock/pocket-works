// Pure packet-ordering and authorization helpers for the room view.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ROOM=/^[0-9a-f]{8}$/i;
export function validRoom(value){return typeof value==='string'&&(ROOM.test(value)||UUID.test(value));}
export function roleOf(snapshot,id){return snapshot?.roles?.indexOf(id)??-1;}
export function acceptOnlineSnapshot(previous,next) {
  if(!next||!['lobby','play','won'].includes(next.phase)||!Array.isArray(next.players))return false;
  if(!previous)return true;
  if(next.round<previous.round)return false;
  if(next.round===previous.round&&next.revision<previous.revision)return false;
  if(next.round===previous.round&&next.revision===previous.revision&&
    Number(next.robot?.t||0)<Number(previous.robot?.t||0)-.001)return false;
  return true;
}

// Continuous snapshots deliberately omit immutable track geometry.
// Reattach ONLY the same round's previously verified level, otherwise demand
// a full authoritative sync; never blend a prior round's course into a new one.
export function hydrateOnlineSnapshot(previous,next){
 if(!next?.robot||next.robot.level)return next;
 if(!previous||next.round!==previous.round||!previous.robot?.level)return null;
 return {...next,robot:{...next.robot,level:previous.robot.level}};
}
