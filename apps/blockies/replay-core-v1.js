// Blockies replay format v1: compact, bounded, data-only snapshots.
export const REPLAY_KEY='pocket-works:blockies:last-replay-v1';
export const MAX_REPLAY_FRAMES=900;
export const MAX_REPLAY_BYTES=2_000_000;
const clone=value=>JSON.parse(JSON.stringify(value));
const goodCell=c=>Number.isInteger(c)&&c>=0&&c<=4;
const goodMatrix=board=>Array.isArray(board)&&board.length===20&&
  board.every(row=>Array.isArray(row)&&row.length>=10&&row.length<=22&&row.every(goodCell))&&
  board.every(row=>row.length===board[0].length);
const goodPiece=p=>p===null||(Array.isArray(p)&&p.length>0&&p.length<=4&&
  p.every(row=>Array.isArray(row)&&row.length>0&&row.length<=4&&row.every(c=>c===0||c===1)));
export function packReplayFrame({board,players,score},t=0){
 if(!goodMatrix(board)||!Array.isArray(players)||players.length<1||players.length>4)
  throw Error('invalid_replay_frame');
 return {
  t:Math.max(0,Math.floor(t)),
  rows:board.map(row=>row.join('')),
  players:players.map((p,i)=>({
   id:i,color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#ffd971',
   x:Number.isFinite(p.position?.x)?Math.trunc(p.position.x):0,
   y:Number.isFinite(p.position?.y)?Math.trunc(p.position.y):0,
   piece:goodPiece(p.currentPiece)?clone(p.currentPiece):null,
   next:goodPiece(p.nextPiece)?clone(p.nextPiece):null,
   held:goodPiece(p.heldPiece)?clone(p.heldPiece):null,
   over:!!p.gameOver
  })),
  score:{
   score:Math.max(0,Math.floor(score?.score||0)),
   lines:Math.max(0,Math.floor(score?.lines||0)),
   level:Math.max(1,Math.floor(score?.level||1))
  }
 };
}
export function unpackReplayFrame(frame){
 if(!frame||!Array.isArray(frame.rows)||frame.rows.length!==20||
    frame.rows.some(row=>typeof row!=='string'||!/^[0-4]{10,22}$/.test(row))||
    !frame.rows.every(row=>row.length===frame.rows[0].length)||
    !Array.isArray(frame.players)||frame.players.length<1||frame.players.length>4)
   throw Error('invalid_replay_frame');
 return {
  t:frame.t,board:frame.rows.map(row=>Array.from(row,Number)),
  players:frame.players.map(p=>({
   id:p.id,color:p.color,position:{x:p.x,y:p.y},
   currentPiece:p.piece,nextPiece:p.next,heldPiece:p.held,gameOver:p.over
  })),
  score:frame.score
 };
}
export function parseReplay(raw){
 if(typeof raw!=='string'||raw.length>MAX_REPLAY_BYTES)throw Error('replay_too_large');
 const data=JSON.parse(raw);
 if(data?.format!=='blockies-replay-v1'||!Array.isArray(data.frames)||
   !data.frames.length||data.frames.length>MAX_REPLAY_FRAMES)throw Error('invalid_replay');
 let previous=-1;
 for(const frame of data.frames){
  if(!Number.isSafeInteger(frame.t)||frame.t<0||frame.t<previous||
     !frame.score||!Number.isFinite(frame.score.score)||
     frame.players?.some(p=>!/^#[0-9a-f]{6}$/i.test(p.color)||!goodPiece(p.piece)||!goodPiece(p.next)||!goodPiece(p.held)||
       !Number.isInteger(p.x)||!Number.isInteger(p.y)))
      throw Error('invalid_replay_frame');
  unpackReplayFrame(frame);
  previous=frame.t;
 }
 const playerCount=data.frames[0].players.length,boardWidth=data.frames[0].rows[0].length;
 if(data.frames.some(f=>f.players.length!==playerCount||f.rows[0].length!==boardWidth))
  throw Error('replay_dimensions_changed');
 return data;
}
export class ReplayArchive {
 constructor({storage=globalThis.localStorage,maxFrames=MAX_REPLAY_FRAMES}={}){
  this.storage=storage;this.maxFrames=Math.min(MAX_REPLAY_FRAMES,Math.max(10,maxFrames));
  this.active=null;this.lastAt=-Infinity;
 }
 start({seed,mode='solo'}={}){
  this.active={format:'blockies-replay-v1',seed:Number(seed)||0,
   mode,createdAt:new Date().toISOString(),frames:[],truncated:false};
  this.lastAt=-Infinity;
 }
 record(state,at=Date.now(),force=false){
  if(!this.active)return false;
  const t=this.active.frames.length?Math.max(this.active.frames.at(-1).t,Math.floor(at-this.startedAt)):0;
  if(this.active.frames.length&&!force&&at-this.lastAt<700)return false;
  let frame;
  try{frame=packReplayFrame(state,t);}catch{return false;}
  const prior=this.active.frames.at(-1);
  if(prior&&!force&&JSON.stringify({...prior,t:0})===JSON.stringify({...frame,t:0}))
   return false;
  if(!this.active.frames.length)this.startedAt=at;
  frame.t=this.active.frames.length?Math.max(prior.t,Math.floor(at-this.startedAt)):0;
  this.active.frames.push(frame);
  this.lastAt=at;
  if(this.active.frames.length>this.maxFrames){
   this.active.frames.shift();
   this.active.truncated=true;
  }
  return true;
 }
 finish(){
  if(!this.active)return null;
  const result=this.active;this.active=null;
  if(!result.frames.length)return null;
  let json=JSON.stringify(result);
  while(json.length>MAX_REPLAY_BYTES&&result.frames.length>1){
   result.frames.shift();result.truncated=true;json=JSON.stringify(result);
  }
  if(json.length>MAX_REPLAY_BYTES)return null;
  try{this.storage?.setItem(REPLAY_KEY,json);}catch{}
  return result;
 }
 last(){
  try{return parseReplay(this.storage?.getItem(REPLAY_KEY)||'');}catch{return null;}
 }
}
