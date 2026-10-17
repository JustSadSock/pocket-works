// ОСИ: Склад — deterministic puzzle rules, generator and shortest-path solver.
// Original axis split preserved: player 1 owns Y, player 2 owns X.
export const DIRECTIONS=['up','down','left','right'];
export const CAMPAIGN_NAMES=['Синхронный старт','Связанные оси','Переплетение','Зеркальные шаги','Перекрёстные тропы','Разгрузка','Тесный проход','Ложный поворот','Сортировка','Смена маршрута','Двойной замок','Последняя партия'];
export function axisOf(dir){return dir==='up'||dir==='down'?'y':dir==='left'||dir==='right'?'x':null}
export function step(level,positions,dir){
 const axis=axisOf(dir);if(!axis)return {positions,moved:false,blocked:[false,false]};
 const dx=dir==='left'?-1:dir==='right'?1:0,dy=dir==='up'?-1:dir==='down'?1:0;
 const next=positions.map(p=>({...p}));const blocked=[];
 for(let i=0;i<2;i++){const nx=next[i].x+dx,ny=next[i].y+dy;
  const hit=nx<0||ny<0||nx>=level.width||ny>=level.height||level.map[ny][nx]==='#';
  blocked.push(hit);if(!hit){next[i].x=nx;next[i].y=ny}
 }
 return {positions:next,moved:blocked.some(x=>!x),blocked};
}
export function solved(level,p){return p[0].x===level.goals[0].x&&p[0].y===level.goals[0].y&&p[1].x===level.goals[1].x&&p[1].y===level.goals[1].y}
export function solve(level,from=level.starts){
 const encode=p=>(p[0].y*level.width+p[0].x)*(level.width*level.height)+(p[1].y*level.width+p[1].x);
 const start=from.map(p=>({...p}));if(solved(level,start))return {steps:0,path:[],explored:1};
 const queue=[start],parents=new Map([[encode(start),null]]),moves=new Map();let head=0;
 while(head<queue.length&&head<35000){
  const state=queue[head++];
  for(const direction of DIRECTIONS){
   const change=step(level,state,direction);if(!change.moved)continue;
   const key=encode(change.positions);if(parents.has(key))continue;
   const previous=encode(state);parents.set(key,previous);moves.set(key,direction);
   if(solved(level,change.positions)){
    const path=[];let cursor=key;while(parents.get(cursor)!==null){path.push(moves.get(cursor));cursor=parents.get(cursor)}
    path.reverse();return {steps:path.length,path,explored:head};
   }
   queue.push(change.positions);
  }
 }
 return null;
}
export function limits(optimal){return {easy:optimal+Math.max(6,Math.ceil(optimal*.7)),medium:optimal+Math.max(3,Math.ceil(optimal*.35)),hard:optimal+1}}
function rng(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
const rand=(r,max)=>Math.floor(r()*max);
function generateOnce(seed,tier,attempt){
 const r=rng((seed+Math.imul(attempt+1,0x9e3779b1))>>>0);
 const width=Math.min(10,7+Math.floor(tier/4)),height=Math.min(9,7+Math.floor(tier/7));
 const cells=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'#':' '));
 const density=.065+Math.min(.13,tier*.009);
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(r()<density)cells[y][x]='#';
 const free=[];for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(cells[y][x]===' ')free.push({x,y});
 if(free.length<6)return null;
 const a=free[rand(r,free.length)],b=free.filter(p=>p.x!==a.x||p.y!==a.y);
 const start=[{...a},{...b[rand(r,b.length)]}],level={width,height,map:cells.map(row=>row.join('')),starts:start,goals:[],seed};
 let state=start.map(p=>({...p})),last='';
 for(let i=0;i<17+Math.min(16,tier*2);i++){
  const possible=DIRECTIONS.map(dir=>({dir,result:step(level,state,dir)})).filter(x=>x.result.moved&&x.dir!==({up:'down',down:'up',left:'right',right:'left'}[last]));
  if(!possible.length)break;const chosen=possible[rand(r,possible.length)];state=chosen.result.positions;last=chosen.dir;
 }
 if(state[0].x===state[1].x&&state[0].y===state[1].y)return null;
 level.goals=state;const answer=solve(level);
 if(!answer||answer.steps<Math.min(5,3+Math.floor(tier/2))||answer.steps>55)return null;
 level.optimal=answer.steps;level.moveLimits=limits(answer.steps);
 return level;
}
export function generate(seed,tier=0){
 for(let attempt=0;attempt<100;attempt++){const level=generateOnce(seed,tier,attempt);if(level)return level}
 const level={width:7,height:7,map:['#######','#     #','#  #  #','#     #','#  #  #','#     #','#######'],
 starts:[{x:1,y:5},{x:5,y:5}],goals:[{x:1,y:1},{x:5,y:1}],seed};
 const result=solve(level);level.optimal=result?.steps||4;level.moveLimits=limits(level.optimal);return level;
}
export function campaign(index){const i=Math.max(0,Math.min(CAMPAIGN_NAMES.length-1,index|0));return {...generate(41717+i*7919,i),name:CAMPAIGN_NAMES[i],index:i}}
export function endless(index){const i=Math.max(1,index|0);return {...generate(912371+i*17389,Math.min(15,i+2)),name:'Смена '+String(i).padStart(2,'0'),index:i}}
