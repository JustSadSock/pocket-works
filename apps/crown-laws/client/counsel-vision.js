// The advisor is a reader of two PURE, fixed counterfactual engine resolutions.
// It never sees or guesses hidden opponent cards, mutates a match, or chooses a move.
export const VISION_PHASES=Object.freeze([
 ["start","Сейчас"],["laws","Указы"],["priest","Жрец"],
 ["champion","Претенденты"],["guard","Страж"],["beast","Зверь"],
 ["thief","Вор"],["throne","Трон"],["settled","Итог"]
]);

export function createCounselVision(state, playerId, cardId, forecastTurn) {
 const current=forecastTurn(state);
 const proposed=cardId ? forecastTurn(state,playerId,cardId) : null;
 const stateKey=JSON.stringify({turn:state.turn,hand:state.players?.[playerId]?.hand,slots:state.slots});
 return {
   turn:state.turn, stateKey, cardId:cardId||null,
   side:proposed?"proposed":"current",step:0,
   current, proposed, assumedNoOpponentLaw:true
 };
}

export function selectedVisionResult(vision) {
 return vision?.side==="proposed"&&vision.proposed?vision.proposed:vision?.current;
}
export function selectedVisionFrame(vision) {
 const result=selectedVisionResult(vision);
 return result?.frames?.[Math.max(0,Math.min((vision.step||0),result.frames.length-1))]||null;
}
export function alternateVisionFrame(vision) {
 const other=vision?.side==="current"?vision?.proposed:vision?.current;
 const idx=vision?.step||0;
 return other?.frames?.[Math.max(0,Math.min(idx,other.frames.length-1))]||null;
}
export function visionDifference(vision) {
 if (!vision?.proposed) return {moved:0,crowns:0,shields:0,status:0,law:0};
 const a=vision.current.state,b=vision.proposed.state;
 let moved=0,status=0,shields=0;
 for(const id of Object.keys(a.pieces)) {
  const x=a.pieces[id],y=b.pieces[id];
  if(!y)continue;
  if(x.x!==y.x||x.y!==y.y)moved++;
  if(Boolean(x.shield)!==Boolean(y.shield))shields++;
  if(x.stun!==y.stun||x.carryingSeal!==y.carryingSeal||x.sabotage!==y.sabotage)status++;
 }
 let crowns=0;
 for(const id of ["p1","p2"])crowns+=Math.abs(a.players[id].activeCrowns-b.players[id].activeCrowns);
 let law=0;
 for(const id of Object.keys(a.slots))if(a.slots[id].activeCardId!==b.slots[id].activeCardId)law++;
 return {moved,crowns,shields,status,law};
}

export function visionPaths(frame) {
 if(!frame) return [];
 return (frame.moves||[]).filter(m=>m.from&&m.to).map((m,index)=>{
   const coords=[m.from,m.to].flatMap(p=>[Number(p.x),Number(p.y)]);
   if(coords.some(n=>!Number.isFinite(n)))return null;
   return {id:m.pieceId||"unknown",index,from:m.from,to:m.to,
    path:`M ${m.from.x*100+50} ${m.from.y*100+50} L ${m.to.x*100+50} ${m.to.y*100+50}`,
    style:m.style||"move"
   };
 }).filter(Boolean);
}

export function visionGhosts(frame,alternative) {
 if(!frame||!alternative)return [];
 return Object.values(alternative.state.pieces).filter(p=>{
  const shown=frame.state.pieces[p.id];
  return shown&&(shown.x!==p.x||shown.y!==p.y);
 }).map(p=>({id:p.id,kind:p.kind,owner:p.owner,x:p.x,y:p.y}));
}
