// TRAFFICITY: deterministic shared rules. Port of JustSadSock/traffic.
export const TURN_LIMIT=30;
export const COLS=5, ROWS=7, WIDTH=800, HEIGHT=1080;
export const SITES=['Рынок','Кофейня','Сквер','Вокзал','Пекарня','Мастерская','Театр','Причал'];
export const index=(r,c)=>r*COLS+c;
export const makeRandom=(seed)=>{let x=(seed>>>0)||0x9e3779b9;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
const range=(n)=>Array.from({length:n},(_,i)=>i);
const neighbors=(r,c)=>[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([y,x])=>y>=0&&x>=0&&y<ROWS&&x<COLS);
export function createMap(seed){
 const rnd=makeRandom(seed),nodes=[];
 const sx=(WIDTH-140)/(COLS-1),sy=(HEIGHT-156)/(ROWS-1);
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
  nodes.push({id:index(r,c),x:70+c*sx+(rnd()-.5)*27,y:78+r*sy+(rnd()-.5)*24});
 const edges=[],keys=new Set();
 const put=(a,b)=>{const key=Math.min(a,b)+':'+Math.max(a,b);if(keys.has(key))return;keys.add(key);edges.push([a,b]);};
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  if(c<COLS-1)put(index(r,c),index(r,c+1));
  if(r<ROWS-1)put(index(r,c),index(r+1,c));
 }
 for(let r=0;r<ROWS-1;r++)for(let c=0;c<COLS-1;c++)
  if(rnd()<.32)put(index(r,c+(rnd()<.5?0:1)),index(r+1,c+(rnd()<.5?0:1)));
 // No special diagonal crosses: remove edges that are not adjacent in both dimensions.
 const clean=edges.filter(([a,b])=>{const dr=Math.abs(Math.floor(a/COLS)-Math.floor(b/COLS)),dc=Math.abs(a%COLS-b%COLS);return dr+dc===1||(dr===1&&dc===1);});
 const diagonals=new Set();
 const result=clean.filter(([a,b])=>{
  const ra=Math.floor(a/COLS),rb=Math.floor(b/COLS),ca=a%COLS,cb=b%COLS;
  if(Math.abs(ra-rb)!==1||Math.abs(ca-cb)!==1)return true;
  const key=Math.min(ra,rb)+':'+Math.min(ca,cb);
  if(diagonals.has(key))return false;diagonals.add(key);return true;
 });
 const graph=range(nodes.length).map(()=>[]);
 for(const [a,b] of result){graph[a].push(b);graph[b].push(a);}
 const pool=range(nodes.length).filter(i=>i%COLS!==0&&i%COLS!==COLS-1&&Math.floor(i/COLS)!==0&&Math.floor(i/COLS)!==ROWS-1);
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const spots=pool.slice(0,8).map((node,i)=>({node,name:SITES[i]}));
 return {seed,width:WIDTH,height:HEIGHT,nodes,edges:result,graph,spots};
}
export function shortestPath(map,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||!map?.graph?.[from]||!map?.graph?.[to])return [];
 const prev=Array(map.nodes.length).fill(-1),queue=[from];prev[from]=from;
 for(let i=0;i<queue.length&&prev[to]<0;i++)for(const next of map.graph[queue[i]])if(prev[next]<0){prev[next]=queue[i];queue.push(next);}
 if(prev[to]<0)return [];
 const path=[to];while(path[0]!==from)path.unshift(prev[path[0]]);
 return path;
}
function chooseGoal(g,from,avoid){
 const rnd=makeRandom((g.seed^(g.goalCounter++*2654435761))>>>0);
 const eligible=g.map.spots.filter(p=>p.node!==avoid&&shortestPath(g.map,from,p.node).length>=4);
 const candidates=eligible.length?eligible:g.map.spots.filter(p=>p.node!==from);
 return candidates[Math.floor(rnd()*candidates.length)].node;
}
export function createGame(seed=123456789){
 const s=(Number(seed)>>>0)||123456789,map=createMap(s);
 const g={seed:s,map,goalCounter:1,turn:0,limit:TURN_LIMIT,phase:'playing',
   scores:[0,0],deliveries:[0,0],last:[],vehicles:[]};
 for(let side=0;side<2;side++)for(let unit=0;unit<2;unit++){
  const at=[index(0,0),index(ROWS-1,COLS-1),index(0,COLS-1),index(ROWS-1,0)][side*2+unit];
  g.vehicles.push({id:side*2+unit,side,unit:unit+1,at,goal:chooseGoal(g,at,-1),route:[],steps:0,waiting:0,stop:null,delivered:0});
 }
 return g;
}
export function routeVehicle(g,side,id,path){
 if(g?.phase!=='playing')return false;
 const v=g.vehicles?.[id];
 if(!v||v.side!==side||!Array.isArray(path)||path.length>34)return false;
 let previous=v.at;const route=[];
 for(const n of path){
  if(!Number.isInteger(n)||!g.map.graph[previous]?.includes(n))return false;
  route.push(n);previous=n;
 }
 v.route=route;
 if(v.stop&&!route.includes(v.stop.node)&&v.stop.node!==v.at)v.stop=null;
 return true;
}
export function stopVehicle(g,side,id,node,amount){
 if(g?.phase!=='playing')return false;
 const v=g.vehicles?.[id];
 if(!v||v.side!==side)return false;
 if(node===null){v.stop=null;return true;}
 if(!Number.isInteger(node)||!Number.isInteger(amount)||amount<1||amount>5)return false;
 if(node!==v.at&&!v.route.includes(node))return false;
 v.stop={node,amount};return true;
}
export function autoRoute(g,side,id){
 const v=g?.vehicles?.[id];
 return !!v&&v.side===side&&routeVehicle(g,side,id,shortestPath(g.map,v.at,v.goal).slice(1));
}
export function botPlan(g){
 if(g.phase!=='playing')return;
 for(const v of g.vehicles.filter(v=>v.side===1))
  if(!v.route.length)autoRoute(g,1,v.id);
}
export function advanceGame(g){
 if(g?.phase!=='playing')return false;
 const events=[];
 for(const v of g.vehicles){
  if(v.waiting>0){v.waiting--;continue;}
  if(v.stop&&v.stop.node===v.at){
   v.waiting=v.stop.amount-1;v.stop=null;continue;
  }
  const next=v.route.shift();
  if(next===undefined)continue;
  if(!g.map.graph[v.at]?.includes(next)){v.route=[];continue;}
  v.at=next;v.steps++;
  if(v.at===v.goal){
   const points=Math.max(10,40-2*v.steps);
   g.scores[v.side]+=points;g.deliveries[v.side]++;
   events.push({side:v.side,unit:v.unit,points});
   v.delivered++;v.steps=0;v.waiting=0;v.stop=null;v.route=[];
   v.goal=chooseGoal(g,v.at,v.goal);
  }
 }
 g.turn++;g.last=events.slice(-4);
 if(g.turn>=g.limit)g.phase='finished';
 return true;
}
export function winner(g){return g.scores[0]===g.scores[1]?-1:g.scores[0]>g.scores[1]?0:1;}
