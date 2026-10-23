// Optional per-recipient projection for games with secrets.
// Legacy game modules without viewForPlayer retain their existing wire format.
export function playerRoomView(mod,state,player,players,onlineIds){
 if(typeof mod?.viewForPlayer!=='function')return state;
 if(!player||!players.some(p=>p.id===player.id))throw Error('invalid_private_view_recipient');
 const view=mod.viewForPlayer({state:structuredClone(state),player:structuredClone(player),players:structuredClone(players),onlineIds:Array.isArray(onlineIds)?[...onlineIds]:undefined});
 if(!view||typeof view!=='object'||Array.isArray(view))throw Error('invalid_private_room_view');
 return view;
}
