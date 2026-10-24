// Presentation-only prediction; the board stays authoritative on PocketNet.
import {checkPieceCollision,findRotationPlacement} from './physics-core.js';

export function projectOwnPiece(player,board,players,inputs=[]){
 if(!player?.currentPiece||player.gameOver||!Array.isArray(board)||!board.length||!inputs?.length)return null;
 let piece=player.currentPiece.map(row=>row.slice()),position={...player.position},landed=false;
 const attempt=(shape,target)=>{
  if(!checkPieceCollision(shape,target,board,players,player.id).collides){piece=shape;position=target;return true;}
  return false;
 };
 for(const input of inputs.slice(0,48)){
  if(landed)break;
  if(input.action==='move'&&(input.direction===-1||input.direction===1))
   attempt(piece,{x:position.x+input.direction,y:position.y});
  else if(input.action==='rotate'){
   const result=findRotationPlacement(piece,position,board,players,player.id);
   if(result){piece=result.currentPiece;position=result.position;}
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
