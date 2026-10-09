// CANTICA II: 500 deterministic solvable levels, offline without network content.
export const LEVEL_COUNT=500;
export const DIRECTIONS=[[-1,0],[0,1],[1,0],[0,-1]];
export const boardSize=i=>i<25?4:i<135?5:i<305?6:7;
const BOOKS=['Пробуждение','Каменная заря','Песнь хора','Тайные арки','Пепельный свет','Роза собора','Семь алтарей','Книга теней','Золотые своды','Последний рассвет'];
const NAMES=['Первый луч','Немые своды','Стеклянная молитва','Лепестки розы','Тихий алтарь','Крыло ангела','Свет через камень','Зов колоколов','Тонкая нить','Реликварий','Горящие письмена','Путь паломника','Синий полдень','Рубиновая арка','Вечерняя звезда','Разорванная цепь','Окно мастера','Золотая печать','Северный свет','Восход'];
function seeded(seed){
  let n=seed>>>0;
  return()=>{n=(n+0x6D2B79F5)>>>0;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
const at=(s,r,c)=>r*s+c;
function stepDirection(a,b,s){const dr=Math.floor(b/s)-Math.floor(a/s),dc=b%s-a%s;return DIRECTIONS.findIndex(([rr,cc])=>rr===dr&&cc===dc);}
function destinations(index,size,rand){
  const count=index<50?1:index<190?2:index<360?3:4;
  const cols=Array.from({length:size},(_,i)=>i);
  for(let j=cols.length-1;j>0;j--){const k=Math.floor(rand()*(j+1));[cols[j],cols[k]]=[cols[k],cols[j]];}
  const chosen=[];
  for(const col of cols)if(chosen.length<count&&chosen.every(c=>Math.abs(c-col)>1))chosen.push(col);
  for(const col of cols)if(chosen.length<count&&!chosen.includes(col))chosen.push(col);
  return chosen.sort((a,b)=>a-b);
}
function authoredLevel(index){
  const size=boardSize(index),rand=seeded(0xA319E1+(index+1)*0xD31F);
  const entryCol=Math.floor(size/2)+(size%2===0&&index%2===0?-1:0),start=at(size,0,entryCol);
  const exits=destinations(index,size,rand),parent=new Int16Array(size*size).fill(-1);
  const visited=new Uint8Array(size*size),stack=[start];visited[start]=1;
  // Perfect maze spanning tree: every node has one uniquely defined parent.
  while(stack.length){
    const current=stack[stack.length-1],r=Math.floor(current/size),c=current%size,options=[];
    for(let d=0;d<4;d++){const nr=r+DIRECTIONS[d][0],nc=c+DIRECTIONS[d][1];
      if(nr>=0&&nr<size&&nc>=0&&nc<size&&!visited[at(size,nr,nc)])options.push(at(size,nr,nc));
    }
    if(!options.length){stack.pop();continue;}
    const next=options[Math.floor(rand()*options.length)];visited[next]=1;parent[next]=current;stack.push(next);
  }
  const solution=Array(size*size).fill(0);solution[start]|=1;
  const routes=[];
  for(const col of exits){
    const path=[];let cursor=at(size,size-1,col),guard=0;solution[cursor]|=4;
    while(cursor!==start&&guard++<size*size+1){
      path.push([Math.floor(cursor/size),cursor%size]);const p=parent[cursor];
      if(p<0)throw new Error('Disconnected maze '+index);
      const d=stepDirection(p,cursor,size);if(d<0)throw new Error('Invalid neighbour '+index);
      solution[p]|=1<<d;solution[cursor]|=1<<((d+2)%4);cursor=p;
    }
    path.push([0,entryCol]);routes.push(path.reverse());
  }
  const used=solution.filter(Boolean).length;
  return {index,size,entryCol,exits,routes,solution,
    name:NAMES[(index*7+Math.floor(index/20))%NAMES.length],book:BOOKS[Math.floor(index/50)],bookIndex:Math.floor(index/50),
    subtitle:exits.length===1?'Направь свет к реликварию.':exits.length===2?'Раздели сияние между двумя алтарями.':'Проведи сияние к '+exits.length+' реликвариям.',
    epilogue:exits.length===1?'Один реликварий вспыхнул среди каменных сводов.':exits.length+' реликвария озарены; витраж снова живёт.',
    difficulty:{size,targets:exits.length,routedPieces:used}};
}
export const LEVELS=Array.from({length:LEVEL_COUNT},(_,index)=>authoredLevel(index));
export const getLevel=index=>LEVELS[index];
export const cellIndex=(row,col,size=5)=>row*size+col;
export function rotateMask(mask,turns){let result=mask;for(let j=0;j<((turns%4)+4)%4;j++)result=((result<<1)&15)|(result>>3);return result;}
export const maskOf=tile=>rotateMask(tile.baseMask,tile.turns);
export function createBoard(levelIndex,variant=0){
  const level=LEVELS[levelIndex];if(!level)throw new Error('Unknown window '+levelIndex);
  const rand=seeded(0xB417C0+levelIndex*733+(variant>>>0)*104729);
  const decoys=[3,6,9,12,5,10,7,11,13,14,15];
  const board=level.solution.map((mask,index)=>{
    const onRoute=mask!==0,baseMask=onRoute?mask:decoys[Math.floor(rand()*Math.min(decoys.length,6+Math.floor(levelIndex/90)))];
    const turns=Math.floor(rand()*4);
    return {baseMask,turns,angle:turns*Math.PI/2,targetAngle:turns*Math.PI/2,onRoute,solvedMask:mask,index};
  });
  if(traceLight(board,levelIndex).complete){
    let broken=false;
    for(let i=0;i<board.length&&!broken;i++){
      if(!board[i].onRoute||board[i].baseMask===15)continue;
      const start=board[i].turns;
      for(let offset=1;offset<4;offset++){board[i].turns=(start+offset)%4;
        if(!traceLight(board,levelIndex).complete){broken=true;break;}}
      if(!broken)board[i].turns=start;
    }
    if(!broken)throw new Error('Unbreakable layout '+levelIndex);
    board.forEach(tile=>{tile.angle=tile.targetAngle=tile.turns*Math.PI/2;});
  }
  return board;
}
export function restoreTurns(board,turns){
  if(!Array.isArray(turns)||turns.length!==board.length||!turns.every(n=>Number.isInteger(n)&&n>=0&&n<=3))return false;
  turns.forEach((turn,i)=>{board[i].turns=turn;board[i].angle=turn*Math.PI/2;board[i].targetAngle=board[i].angle;});return true;
}
export function traceLight(board,levelIndex){
  const level=LEVELS[levelIndex],size=level.size,entry=cellIndex(0,level.entryCol,size);
  const reached=Array(size*size).fill(false),distance=Array(size*size).fill(-1);
  if(!Array.isArray(board)||board.length!==size*size||!(maskOf(board[entry])&1))
    return {reached,distance,segments:[],lit:level.exits.map(()=>false),complete:false};
  const queue=[entry],segments=[];reached[entry]=true;distance[entry]=0;
  for(let i=0;i<queue.length;i++){
    const cell=queue[i],r=Math.floor(cell/size),c=cell%size,mask=maskOf(board[cell]);
    for(let d=0;d<4;d++){
      if(!(mask&(1<<d)))continue;
      const nr=r+DIRECTIONS[d][0],nc=c+DIRECTIONS[d][1];
      if(nr<0||nr>=size||nc<0||nc>=size)continue;
      const next=cellIndex(nr,nc,size);
      if(!(maskOf(board[next])&(1<<((d+2)%4))))continue;
      if(!reached[next]){reached[next]=true;distance[next]=distance[cell]+1;queue.push(next);segments.push([cell,next,distance[next]]);}
    }
  }
  const lit=level.exits.map(col=>{const i=cellIndex(size-1,col,size);return reached[i]&&Boolean(maskOf(board[i])&4);});
  return {reached,distance,segments,lit,complete:lit.every(Boolean)};
}
export function neededTurns(board,levelIndex){
  const level=LEVELS[levelIndex];
  for(let index=0;index<board.length;index++){
    const tile=board[index];if(!tile.onRoute||maskOf(tile)===tile.solvedMask)continue;
    for(let delta=1;delta<4;delta++)if(rotateMask(maskOf(tile),delta)===tile.solvedMask)
      return {index,clockwise:delta,row:Math.floor(index/level.size),col:index%level.size};
  }
  return null;
}
export function verifyLevels(){
  for(let i=0;i<LEVEL_COUNT;i++){
    const level=LEVELS[i],board=createBoard(i);
    if(!level.solution.every(n=>n>=0&&n<=15))throw new Error('Invalid glass mask '+i);
    for(const tile of board)if(tile.onRoute){tile.baseMask=tile.solvedMask;tile.turns=0;}
    if(!traceLight(board,i).complete)throw new Error('Broken level '+i);
  }
  return true;
}
