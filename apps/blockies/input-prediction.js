// Pure, presentation-only prediction. Server snapshots always own the board.
function collision(piece,pos,board,players,ownerId){
 const width=board[0]?.length||0,height=board.length;
 for(let y=0;y<piece.length;y++)for(let x=0;x<piece[y].length;x++){
  if(!piece[y][x])continue;
  const xx=pos.x+x,yy=pos.y+y;
  if(xx<0||xx>=width||yy>=height)return true;
  if(yy<0)continue;
  if(board[yy]?.[xx])return true;
  for(const player of players){
   if(player.id===ownerId||player.gameOver||!player.currentPiece)continue;
   for(let py=0;py<player.currentPiece.length;py++)
    for(let px=0;px<player.currentPiece[py].length;px++)
     if(player.currentPiece[py][px]&&player.position.x+px===xx&&player.position.y+py===yy)return true;
  }
 }
 return false;
}
export function projectOwnPiece(player,board,players,inputs=[]){
 if(!player?.currentPiece||player.gameOver||!Array.isArray(board)||!board.length||!inputs?.length)return null;
 let piece=player.currentPiece.map(row=>row.slice()),position={...player.position},landed=false;
 const attempt=(shape,target)=>{
  if(!collision(shape,target,board,players,player.id)){piece=shape;position=target;return true;}
  return false;
 };
 for(const input of inputs.slice(0,48)){
  if(landed)break;
  if(input.action==='move'&&(input.direction===-1||input.direction===1))
   attempt(piece,{x:position.x+input.direction,y:position.y});
  else if(input.action==='rotate'){
   const shape=piece[0].map((_,i)=>piece.map(row=>row[i]).reverse());
   for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1]]){
    if(attempt(shape,{x:position.x+dx,y:position.y+dy}))break;
   }
  }else if(input.action==='drop')attempt(piece,{x:position.x,y:position.y+1});
  else if(input.action==='hold')break;
  else if(input.action==='hardDrop'){
   let remaining=board.length;
   while(remaining-- > 0&&attempt(piece,{x:position.x,y:position.y+1})){}
   landed=true;
  }
 }
 return {currentPiece:piece,position,landed};
}
