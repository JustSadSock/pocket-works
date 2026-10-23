// Durable client-side outbox: persisted before a submit is handed to WebSocket.
// Every retry uses the same requestId; the server acknowledges that ID exactly once.
export const isSafeReceipt=(receipt,pending)=>Boolean(receipt&&pending&&receipt.accepted===true&&receipt.requestId===pending.requestId);
export const canRetry=(pending,view)=>Boolean(pending&&view?.phase==='writing'&&!view.waiting&&
  pending.round===view.round&&pending.sheetId===view.sheet?.id);
export function makeSubmission({round,sheetId,answer,tailIndexes,gender,heroAnchor,requestId,draftStorageKey}){
 return {type:'submit',round,sheetId,answer,tailIndexes:[...tailIndexes],gender,heroAnchor,
  requestId,draftStorageKey};
}
export function outgoingPacket(record){
 const {draftStorageKey,...packet}=record;
 return packet;
}
export function validPending(value){
 return Boolean(value&&value.type==='submit'&&/^[a-zA-Z0-9_-]{12,96}$/.test(value.requestId||'')&&
  Number.isInteger(value.round)&&typeof value.sheetId==='string'&&typeof value.answer==='string'&&
  Array.isArray(value.tailIndexes)&&typeof value.draftStorageKey==='string');
}
