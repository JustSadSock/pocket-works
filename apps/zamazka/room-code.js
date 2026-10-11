// Room invitations use the first eight hex digits of a PocketNet UUID.
// Full UUID invitations remain supported for backwards compatibility.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT=/^[0-9a-f]{8}$/i;
export function inviteCode(roomId){
 const id=String(roomId||'');
 return UUID.test(id)?id.slice(0,8).toUpperCase():id;
}
export function parseRoomInput(value,baseUrl){
 let raw=String(value||'').trim();
 if(raw.includes('?')){
   try{raw=new URL(raw,baseUrl).searchParams.get('room')||''}catch{return ''}
 }
 raw=raw.trim();
 if(UUID.test(raw))return raw.toLowerCase();
 const compact=raw.replace(/[\s-]/g,'').toUpperCase();
 return SHORT.test(compact)?compact:'';
}
