// Blockies Engine Core v1 — immutable rules shared by the browser and PocketNet v6.
// Never edit this version in place: old online rooms pin it through their module version.
export const SHAPES=Object.freeze({
 I:[[1,1,1,1]],O:[[1,1],[1,1]],T:[[0,1,0],[1,1,1]],
 S:[[0,1,1],[1,1,0]],Z:[[1,1,0],[0,1,1]],
 J:[[1,0,0],[1,1,1]],L:[[0,0,1],[1,1,1]]
});
export const KICKS=Object.freeze([[0,0],[-1,0],[1,0],[-2,0],[2,0],[-3,0],[3,0],[0,-1],[-1,-1],[1,-1],[0,-2],[0,-3]]);
export function sevenBag(state,random){
 if(!Array.isArray(state.pieceBag))state.pieceBag=[];
 if(!state.pieceBag.length){
  const bag=Object.keys(SHAPES);
  for(let i=bag.length-1;i>0;i--){
   const j=Math.floor(random()*(i+1));
   [bag[i],bag[j]]=[bag[j],bag[i]];
  }
  state.pieceBag=bag;
 }
 return SHAPES[state.pieceBag.pop()].map(row=>[...row]);
}
export function collision(piece,pos,board,players,selfId,width,height){
 const result={collides:false,withLocked:false,withActive:false};
 if(!piece)return {...result,collides:true,withLocked:true};
 for(let y=0;y<piece.length;y++)for(let x=0;x<piece[y].length;x++){
  if(!piece[y][x])continue;
  const bx=pos.x+x,by=pos.y+y;
  if(bx<0||bx>=width||by>=height){result.collides=true;result.withLocked=true;return result;}
  if(by<0)continue;
  if(board[by]?.[bx]){
   result.collides=true;result.withLocked=true;return result;
  }
  for(const other of players){
   if(other.id===selfId||other.gameOver||!other.currentPiece)continue;
   const ox=bx-other.position.x,oy=by-other.position.y;
   if(oy>=0&&oy<other.currentPiece.length&&ox>=0&&ox<other.currentPiece[oy].length&&other.currentPiece[oy][ox]){
    result.collides=true;result.withActive=true;break;
   }
  }
 }
 return result;
}
export function rotateWithKick(piece,position,test){
 if(!piece)return null;
 const rotated=piece[0].map((_,i)=>piece.map(row=>row[i]).reverse());
 for(const [dx,dy] of KICKS){
  const next={x:position.x+dx,y:position.y+dy};
  if(!test(rotated,next).collides)return {piece:rotated,position:next};
 }
 return null;
}
export function chooseSpawn(piece,anchor,width,test){
 const preferredX=Math.min(width-piece[0].length,Math.max(0,Math.round(anchor-piece[0].length/2)));
 for(let offset=0;offset<width;offset++){
  const choices=offset?[preferredX-offset,preferredX+offset]:[preferredX];
  for(const x of choices){
   if(x<0||x>width-piece[0].length)continue;
   const position={x,y:0};
   if(!test(piece,position).collides)return position;
  }
 }
 return null;
}
export function clearCompletedRows(board,width){
 const rows=[];
 for(let y=board.length-1;y>=0;y--){
  if(board[y].length!==width||board[y].some(cell=>cell===0))continue;
  rows.push({y,owners:[...board[y]]});
  board.splice(y,1);
  board.unshift(Array(width).fill(0));
  y++;
 }
 return rows;
}
export function lineScore(lines,combo,base=100){
 const comboMultiplier=1+.1*combo,multiMultiplier=1+.2*(lines-1);
 const perLineScore=Math.round(base*comboMultiplier*multiMultiplier);
 return {gained:perLineScore*lines,perLineScore,comboMultiplier,multiMultiplier,
  streakBonusPercent:Math.round((comboMultiplier-1)*100),
  multiBonusPercent:Math.round((multiMultiplier-1)*100)};
}
