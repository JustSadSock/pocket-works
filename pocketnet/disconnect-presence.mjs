// Only the server can mark a socket as superseded. A client-supplied
// WebSocket close code/reason is not evidence of a successful replacement.
// A superseded connection will be followed by a fresh room_joined presence.
export function shouldAnnounceSocketDeparture(info,stillConnected){
 return Boolean(info?.roomId)&&!stillConnected&&info.serverReplaced!==true;
}
