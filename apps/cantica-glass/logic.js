// CANTICA: deterministic puzzles and reciprocal glass-light simulation.
// Directions are N, E, S, W. Each pane carries leaded light channels.
export const DIRECTIONS = [[-1,0],[0,1],[1,0],[0,-1]];
export const SIZE = 5;
export const LEVELS = [
  {name:'Погасшая часовня',subtitle:'Верни первый луч к реликвии.',epilogue:'Один огонь снова горит под каменным сводом.',exits:[2],
   routes:[[[0,2],[1,2],[1,3],[2,3],[3,3],[3,2],[4,2]]]},
  {name:'Два завета',subtitle:'Один луч должен стать двумя.',epilogue:'Две реликвии отвечают друг другу светом.',exits:[0,4],
   routes:[[[0,2],[1,2],[2,2],[2,1],[3,1],[3,0],[4,0]],[[2,2],[2,3],[3,3],[3,4],[4,4]]]},
  {name:'Три святыни',subtitle:'Раздели свет между тремя алтарями.',epilogue:'Три огня сложились в одну тихую песнь.',exits:[0,2,4],
   routes:[[[0,2],[1,2],[2,2],[3,2],[4,2]],[[2,2],[2,1],[3,1],[3,0],[4,0]],[[1,2],[1,3],[2,3],[2,4],[3,4],[4,4]]]},
  {name:'Расколотый свод',subtitle:'Ищи обход через крайние стекла.',epilogue:'Треснувший свод удержал утренний свет.',exits:[0,4],
   routes:[[[0,2],[0,1],[1,1],[1,0],[2,0],[3,0],[4,0]],[[0,2],[0,3],[1,3],[2,3],[2,4],[3,4],[4,4]]]},
  {name:'Песнь стекла',subtitle:'Три пути расходятся из двух развилок.',epilogue:'Каждый осколок стал голосом хора.',exits:[0,2,4],
   routes:[[[0,2],[0,1],[1,1],[2,1],[3,1],[3,0],[4,0]],[[0,2],[0,3],[1,3],[2,3],[2,4],[3,4],[4,4]],[[1,3],[1,2],[2,2],[3,2],[4,2]]]},
  {name:'Последняя заря',subtitle:'Проведи луч сквозь самые дальние изгибы.',epilogue:'Собор наполнился золотым утром. Книга света завершена.',exits:[4],
   routes:[[[0,2],[1,2],[1,1],[2,1],[2,2],[2,3],[1,3],[1,4],[2,4],[3,4],[4,4]]]}
];
export const cellIndex = (row,col) => row*SIZE+col;
export function rotateMask(mask,turns) {
  let result = mask;
  for (let i=0;i<((turns%4)+4)%4;i++) result = ((result<<1)&15)|(result>>3);
  return result;
}
export function maskOf(tile) { return rotateMask(tile.baseMask,tile.turns); }
export function solvedMasks(levelIndex) {
  const level = LEVELS[levelIndex];
  if (!level) throw new Error('Unknown chapel');
  const masks = Array(SIZE*SIZE).fill(0);
  masks[cellIndex(0,2)] |= 1; // sunlight enters from the rose in the north
  for (const path of level.routes) for (let i=1;i<path.length;i++) {
    const [ar,ac] = path[i-1], [br,bc] = path[i];
    const dir = DIRECTIONS.findIndex(([dr,dc]) => ar+dr===br && ac+dc===bc);
    if (dir<0) throw new Error('Disconnected medieval light route');
    masks[cellIndex(ar,ac)] |= 1<<dir;
    masks[cellIndex(br,bc)] |= 1<<((dir+2)%4);
  }
  for (const col of level.exits) masks[cellIndex(4,col)] |= 4;
  return masks;
}
function random(seed) {
  let value=seed>>>0;
  return () => {
    value += 0x6D2B79F5;
    let t=value;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
export function createBoard(levelIndex,variant=0) {
  const solution=solvedMasks(levelIndex);
  const rand=random(0xC47A27+levelIndex*773+(variant>>>0)*104729);
  const fillers=[3,6,9,12,5,10,7,11,13,14];
  const board=solution.map((mask,index)=>{
    const onRoute=mask!==0;
    const baseMask=onRoute?mask:fillers[Math.floor(rand()*fillers.length)];
    const turns=Math.floor(rand()*4);
    return {baseMask,turns,angle:turns*Math.PI/2,targetAngle:turns*Math.PI/2,onRoute,solvedMask:mask,index};
  });
  // Scrambling must always produce a puzzle, never a completed initial board.
  if (traceLight(board,levelIndex).complete) {
    board[2].turns=(board[2].turns+1)%4;
    board[2].angle=board[2].turns*Math.PI/2;
    board[2].targetAngle=board[2].angle;
  }
  return board;
}
export function restoreTurns(board,turns) {
  if (!Array.isArray(turns)||turns.length!==25||!turns.every(n=>Number.isInteger(n)&&n>=0&&n<=3)) return false;
  turns.forEach((turn,i)=>{board[i].turns=turn;board[i].angle=turn*Math.PI/2;board[i].targetAngle=board[i].angle;});
  return true;
}
export function traceLight(board,levelIndex) {
  const reached=Array(25).fill(false);
  if (!Array.isArray(board)||board.length!==25 || !(maskOf(board[2])&1)) {
    return {reached,lit:LEVELS[levelIndex].exits.map(()=>false),complete:false};
  }
  const pending=[2];reached[2]=true;
  for(let head=0;head<pending.length;head++){
    const index=pending[head],row=Math.floor(index/5),col=index%5,mask=maskOf(board[index]);
    for(let d=0;d<4;d++){
      if (!(mask&(1<<d))) continue;
      const rr=row+DIRECTIONS[d][0],cc=col+DIRECTIONS[d][1];
      if(rr<0||rr>=5||cc<0||cc>=5) continue;
      const next=cellIndex(rr,cc);
      if(!reached[next] && (maskOf(board[next])&(1<<((d+2)%4)))){
        reached[next]=true;pending.push(next);
      }
    }
  }
  const lit=LEVELS[levelIndex].exits.map(col => reached[cellIndex(4,col)] && Boolean(maskOf(board[cellIndex(4,col)])&4));
  return {reached,lit,complete:lit.every(Boolean)};
}
export function neededTurns(board) {
  for(let i=0;i<board.length;i++){
    const tile=board[i];
    if(!tile.onRoute) continue;
    if(maskOf(tile)===tile.solvedMask) continue;
    let delta=0;while(delta<4&&rotateMask(maskOf(tile),delta)!==tile.solvedMask)delta++;
    if(delta<4) return {index:i,clockwise:delta};
  }
  return null;
}
// Verify authored levels in any JS runtime.
export function verifyLevels() {
  for(let i=0;i<LEVELS.length;i++){
    const board=createBoard(i);
    board.forEach(tile=>{if(tile.onRoute)tile.turns=0;});
    if(!traceLight(board,i).complete) throw new Error('Unsolvable chapter '+(i+1));
  }
  return true;
}
