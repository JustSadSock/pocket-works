// Independent server replay: neither reported completion nor localStorage can mint a reward.
import {createBoard,LEVELS,traceLight} from '../apps/cantica-glass/logic.js';
export const MAX_CANTICA_STEPS=512;
export function verifyCanticaProof(raw){
 if(!raw||!Number.isInteger(raw.level)||raw.level<0||raw.level>=LEVELS.length||
   !Number.isInteger(raw.variant)||raw.variant<0||raw.variant>99999||
   !Array.isArray(raw.turns)||raw.turns.length<1||raw.turns.length>MAX_CANTICA_STEPS)
   return null;
 const board=createBoard(raw.level,raw.variant);
 let steps=0;
 for(const move of raw.turns){
   if(!Array.isArray(move)||move.length!==2)return null;
   const [index,delta]=move;
   if(!Number.isInteger(index)||index<0||index>=board.length||(delta!==1&&delta!==-1))return null;
   if(traceLight(board,raw.level).complete)return null; // No moves beyond victory.
   board[index].turns=(board[index].turns+4+delta)%4;
   steps++;
 }
 if(!traceLight(board,raw.level).complete)return null;
 const level=LEVELS[raw.level];
 return {level:raw.level,size:level.size,exits:level.exits.length,moves:steps,variant:raw.variant};
}
export function canticaEligible(record,count){
 const ids=[];
 if(count>=1)ids.push('cantica.first-light');
 if(record.moves<=12)ids.push('cantica.precision');
 if(count>=10)ids.push('cantica.ten');
 if(count>=25)ids.push('cantica.twenty-five');
 if(count>=50)ids.push('cantica.fifty');
 if(count>=100)ids.push('cantica.hundred');
 if(record.size===7)ids.push('cantica.seven');
 if(record.exits===4)ids.push('cantica.four-altars');
 if(count>=500)ids.push('cantica.complete');
 return ids;
}
