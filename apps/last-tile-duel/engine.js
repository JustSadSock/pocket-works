// Deterministic one-second rules shared by offline training and PocketNet.
export const SIZE = 7;
export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 1;
export const DIRECTIONS = Object.freeze({up:[0,-1],right:[1,0],down:[0,1],left:[-1,0],stay:[0,0]});
const EMPTY = Object.freeze({dir:'stay',kind:'step'});
export function actionOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Object.hasOwn(DIRECTIONS,value.dir) || !['step','jump','push'].includes(value.kind)) return null;
  return {dir:value.dir,kind:value.kind};
}
const xy = n => ({x:n%SIZE,y:Math.floor(n/SIZE)});
function tile(x,y) { return x>=0&&x<SIZE&&y>=0&&y<SIZE ? y*SIZE+x : -1; }
export function board() {
  const result=Array(SIZE*SIZE).fill(3);
  for(const [x,y] of [[0,0],[6,0],[0,6],[6,6],[2,3],[4,3]]) result[tile(x,y)]=0;
  for(const [x,y] of [[1,1],[5,1],[1,5],[5,5],[3,3],[2,1],[4,5]]) result[tile(x,y)]=2;
  return result;
}
export function createGame(){
  return {phase:'battle',tiles:board(),pos:[tile(3,1),tile(3,5)],jump:[0,0],push:[0,0],
    scores:[0,0],round:1,turn:0,pause:0,winner:null,last:'',effects:[]};
}
function destination(position,dir,length=1) {
  if(position<0) return -1;
  const {x,y}=xy(position),[dx,dy]=DIRECTIONS[dir]||DIRECTIONS.stay;
  return tile(x+dx*length,y+dy*length);
}
function near(from,to,dir) { return destination(from,dir)===to && from>=0 && to>=0; }
function usable(g,p) { return p>=0 && g.tiles[p]>0; }
function resetBoard(g) {
  g.phase='battle';g.tiles=board();g.pos=[tile(3,1),tile(3,5)];
  g.jump=[0,0];g.push=[0,0];g.pause=0;g.round+=1;g.last='Новый раунд';g.effects=[];
}
export function advance(g,raw) {
  if(!g || g.phase==='finished')return g;
  g.turn++;
  if(g.phase==='between') {
    g.pause--;
    if(g.pause<=0)resetBoard(g);
    return g;
  }
  const acts=[0,1].map(i=>actionOf(raw?.[i])||EMPTY);
  const initial=g.pos.slice();
  const intents=initial.slice(),pushes=[];
  g.effects=[];
  for(let i=0;i<2;i++){
    g.jump[i]=Math.max(0,g.jump[i]-1);g.push[i]=Math.max(0,g.push[i]-1);
    const a=acts[i];
    if(a.dir==='stay')continue;
    if(a.kind==='push'&&g.push[i]===0){
      g.push[i]=5;pushes.push(i);continue;
    }
    const length=a.kind==='jump'&&g.jump[i]===0?2:1;
    if(length===2){g.jump[i]=4;g.effects.push({type:'jump',who:i});}
    const to=destination(initial[i],a.dir,length);
    if(usable(g,to))intents[i]=to;
  }
  // Two bodies cannot occupy the same cell or pass through each other.
  if(intents[0]===intents[1] ||
    (intents[0]===initial[1]&&intents[1]===initial[0])) {
    intents[0]=initial[0];intents[1]=initial[1];g.effects.push({type:'block',who:-1});
  } else {
    for(let i=0;i<2;i++)
      if(intents[i]===initial[1-i]&&intents[1-i]===initial[1-i])intents[i]=initial[i];
  }
  g.pos=intents;
  const shoves=[null,null];
  for(const i of pushes) {
    const enemy=1-i,dir=acts[i].dir;
    if(near(g.pos[i],g.pos[enemy],dir))shoves[enemy]=destination(g.pos[enemy],dir);
  }
  for(let i=0;i<2;i++)if(shoves[i]!==null) {
    const target=shoves[i];
    if(target===g.pos[1-i])continue;
    g.pos[i]=usable(g,target)?target:-1;
    g.effects.push({type:'push',who:1-i,target:g.pos[i]});
  }
  for(let i=0;i<2;i++) {
    const at=g.pos[i];
    if(at<0)continue;
    g.tiles[at]=Math.max(0,g.tiles[at]-1);
    if(!g.tiles[at]){g.pos[i]=-1;g.effects.push({type:'fall',who:i,target:at});}
    else if(at!==initial[i])g.effects.push({type:'step',who:i,target:at});
  }
  const dead=g.pos.map(p=>p<0);
  if(dead[0]||dead[1]){
    const roundWinner=dead[0]===dead[1]?-1:dead[0]?1:0;
    if(roundWinner>=0)g.scores[roundWinner]++;
    g.last=roundWinner<0?'Оба упали':roundWinner===0?'Синий взял раунд':'Оранжевый взял раунд';
    if(Math.max(...g.scores)>=3){
      g.phase='finished';g.winner=roundWinner;
    } else {g.phase='between';g.pause=2;}
  }
  return g;
}
export function botAction(g,side=1) {
  const here=g.pos[side],enemy=g.pos[1-side];
  if(here<0)return EMPTY;
  const dirs=['up','right','down','left'];
  if(g.push[side]===0)for(const dir of dirs)
    if(near(here,enemy,dir)&&!usable(g,destination(enemy,dir)))return {dir,kind:'push'};
  const candidates=[];
  for(const dir of dirs){
    for(const kind of ['step','jump']){
      if(kind==='jump'&&g.jump[side]>0)continue;
      const at=destination(here,dir,kind==='jump'?2:1);
      if(!usable(g,at)||at===enemy)continue;
      let exits=0;
      for(const d of dirs)if(usable(g,destination(at,d)))exits++;
      const from=xy(at),target=xy(enemy);
      const proximity=Math.abs(from.x-target.x)+Math.abs(from.y-target.y);
      const preference=((at*13+g.turn*7)%11)/33;
      candidates.push({dir,kind,score:g.tiles[at]*3+exits*.65-proximity*.28+preference-(kind==='jump'?.55:0)});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?{dir:candidates[0].dir,kind:candidates[0].kind}:EMPTY;
}
