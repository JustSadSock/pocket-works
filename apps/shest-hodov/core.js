export const MODES = {
  bridge: {name:'Мост', subtitle:'Соедини свои края', rule:'Игрок 1 соединяет левый и правый края, игрок 2 — верхний и нижний. Ставьте по фишке на свободную клетку. Первое непрерывное соединение побеждает.'},
  infection: {name:'Заражение', subtitle:'Переверни большинство', rule:'Поставь фишку так, чтобы зажать чужие фишки между новой и уже своей по прямой. Зажатые меняют цвет. Если нет допустимых ходов — ход пропускается. В конце побеждает большинство.'},
  void: {name:'Пропасть', subtitle:'Не останься без хода', rule:'Передвигай свою фишку на соседнюю клетку по вертикали или горизонтали. Каждая покинутая клетка исчезает навсегда. Проигрывает тот, кто не может сделать ход.'},
  rotate: {name:'Поворот', subtitle:'Вращай поле и двигайся', rule:'За ход поверни любой квадрат 2×2 на 90° в выбранную сторону, затем перемести свою фишку на соседнюю свободную клетку. Игрок 1 стремится к правому краю, игрок 2 — к левому. Поворот двигает обе фишки. После 60 полных ходов без победителя — ничья.'},
  influence: {name:'Влияние', subtitle:'Восемь раундов борьбы', rule:'В каждом из восьми раундов оба игрока тайно распределяют ровно 3 жетона между пятью регионами. Жетоны накапливаются. Регион получает тот, у кого больше жетонов; при равенстве он нейтрален. Побеждает контролирующий больше регионов.'},
  protocol: {name:'Протокол', subtitle:'Предскажи два шага', rule:'Каждый тайно задаёт своему роботу две команды движения. Команды исполняются одновременно. За вход на отмеченную точку даётся 1 очко. При столкновении роботы остаются на месте. После восьми раундов побеждает большее число очков.'}
};
const sizeOf = s => s.kind==='bridge'?7:s.kind==='infection'?8:s.kind==='protocol'?5:s.kind==='rotate'?6:7;
const inBounds=(r,c,n)=>r>=0&&r<n&&c>=0&&c<n;
const ortho=[[1,0],[-1,0],[0,1],[0,-1]];
const adjacent=(id,n,dirs=ortho)=>{const r=Math.floor(id/n),c=id%n;return dirs.map(([dr,dc])=>[r+dr,c+dc]).filter(([a,b])=>inBounds(a,b,n)).map(([a,b])=>a*n+b)};
export const POINTS=[2,6,12,18,22];
export function start(kind){
  if(!MODES[kind]) throw Error('Unknown game');
  const s={kind,turn:0,ply:0,finished:false,winner:null};
  if(kind==='bridge')s.cells=Array(49).fill(-1);
  if(kind==='infection'){
    s.cells=Array(64).fill(-1);
    s.cells[27]=1;s.cells[28]=0;s.cells[35]=0;s.cells[36]=1;
  }
  if(kind==='void'){s.cells=Array(49).fill(-1);s.cells[0]=0;s.cells[48]=1;}
  if(kind==='rotate'){s.cells=Array(36).fill(-1);s.cells[12]=0;s.cells[23]=1;s.stage='rotate';}
  if(kind==='influence'){s.regions=Array.from({length:5},()=>[0,0]);s.round=0;s.planner=0;s.phase='plan';s.pending=[null,null];s.last=null;}
  if(kind==='protocol'){s.positions=[10,14];s.scores=[0,0];s.round=0;s.planner=0;s.phase='plan';s.pending=[null,null];s.last=null;}
  return s;
}
const clone=s=>JSON.parse(JSON.stringify(s));
const finish=(s,winner)=>{s.finished=true;s.winner=winner;};
const other=p=>1-p;
function connected(s,p){
  const n=7,seen=new Set(),queue=[];
  for(let i=0;i<n;i++){const id=p===0?i*n:i;if(s.cells[id]===p){seen.add(id);queue.push(id)}}
  while(queue.length){
    const id=queue.shift(),r=Math.floor(id/n),c=id%n;
    if(p===0&&c===n-1||p===1&&r===n-1)return true;
    for(const next of adjacent(id,n,r%2?[[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]]:[[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]]))if(!seen.has(next)&&s.cells[next]===p){seen.add(next);queue.push(next)}
  }
  return false;
}
function flips(s,id,p){
  const n=8;if(!Number.isInteger(id)||id<0||id>=64||s.cells[id]!==-1)return[];
  const r=Math.floor(id/n),c=id%n,all=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;
    const line=[];let y=r+dr,x=c+dc;
    while(inBounds(y,x,n)&&s.cells[y*n+x]===other(p)){line.push(y*n+x);y+=dr;x+=dc}
    if(line.length&&inBounds(y,x,n)&&s.cells[y*n+x]===p)all.push(...line);
  }
  return all;
}
const infectionMoves=(s,p)=>s.cells.flatMap((v,i)=>v===-1&&flips(s,i,p).length?[i]:[]);
const voidMoves=(s,p)=>adjacent(s.cells.indexOf(p),7).filter(i=>s.cells[i]===-1);
const rotateWins=s=>[s.cells.some((v,i)=>v===0&&i%6===5),s.cells.some((v,i)=>v===1&&i%6===0)];
function commit(s){s.ply++;return{ok:true,state:s};}
function invalid(reason){return{ok:false,reason};}
function playBridge(s,a){
  const id=a.id;if(!Number.isInteger(id)||id<0||id>=49||s.cells[id]!==-1)return invalid('Выберите свободную клетку');
  s.cells[id]=s.turn;
  if(connected(s,s.turn))finish(s,s.turn);else s.turn=other(s.turn);
  return commit(s);
}
function playInfection(s,a){
  const id=a.id,list=flips(s,id,s.turn);if(!list.length)return invalid('Нужен захват хотя бы одной фишки');
  s.cells[id]=s.turn;for(const i of list)s.cells[i]=s.turn;
  const opponent=other(s.turn);
  if(infectionMoves(s,opponent).length)s.turn=opponent;
  else if(!infectionMoves(s,s.turn).length){
    const c0=s.cells.filter(v=>v===0).length,c1=s.cells.filter(v=>v===1).length;
    finish(s,c0===c1?-1:c0>c1?0:1);
  }
  return commit(s);
}
function playVoid(s,a){
  const from=s.cells.indexOf(s.turn),to=a.id;
  if(!voidMoves(s,s.turn).includes(to))return invalid('Доступна только соседняя свободная клетка');
  s.cells[from]=-2;s.cells[to]=s.turn;
  s.turn=other(s.turn);if(!voidMoves(s,s.turn).length)finish(s,other(s.turn));
  return commit(s);
}
function playRotate(s,a){
  if(s.stage==='rotate'){
    const block=a.block,dir=a.dir;
    if(!Number.isInteger(block)||block<0||block>=9||![1,-1].includes(dir))return invalid('Выберите квадрат и сторону поворота');
    const row=Math.floor(block/3)*2,col=block%3*2;
    const ids=[row*6+col,row*6+col+1,(row+1)*6+col+1,(row+1)*6+col];
    const original=ids.map(id=>s.cells[id]);
    // Clockwise means top-left -> top-right, counter-clockwise reverses this.
    for(let k=0;k<4;k++)s.cells[ids[(k+dir+4)%4]]=original[k];
    const w=rotateWins(s);
    if(w[0]||w[1])finish(s,w[0]&&w[1]?-1:w[0]?0:1);else s.stage='move';
    return commit(s);
  }
  if(a.type!=='move')return invalid('Сначала переместите свою фишку');
  const from=s.cells.indexOf(s.turn),to=a.id;
  if(!adjacent(from,6).includes(to)||s.cells[to]!==-1)return invalid('Выберите соседнюю свободную клетку');
  s.cells[from]=-1;s.cells[to]=s.turn;
  const w=rotateWins(s);if(w[0]||w[1])finish(s,w[0]&&w[1]?-1:w[0]?0:1);
  else {s.stage='rotate';s.turn=other(s.turn);if(s.ply>=119)finish(s,-1);}
  return commit(s);
}
function submitInfluence(s,a){
  if(s.phase!=='plan'||a.type!=='submit'||!Array.isArray(a.alloc)||a.alloc.length!==5||a.alloc.some(n=>!Number.isInteger(n)||n<0||n>3)||a.alloc.reduce((x,y)=>x+y,0)!==3)return invalid('Распределите ровно три жетона');
  s.pending[s.planner]=a.alloc.slice();
  if(s.planner===0){s.planner=1;s.phase='pass';}
  else{
    s.last=s.pending.map(x=>x.slice());
    for(let i=0;i<5;i++)for(let p=0;p<2;p++)s.regions[i][p]+=s.pending[p][i];
    s.pending=[null,null];s.round++;s.planner=0;s.phase='reveal';
    if(s.round===8){const score=[0,0];for(const [a,b]of s.regions){if(a>b)score[0]++;if(b>a)score[1]++}finish(s,score[0]===score[1]?-1:score[0]>score[1]?0:1)}
  }
  return commit(s);
}
const DIR={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1],stay:[0,0]};
function advance(id,command){
  const [dr,dc]=DIR[command],r=Math.floor(id/5)+dr,c=id%5+dc;
  return inBounds(r,c,5)?r*5+c:id;
}
function resolveProtocol(s){
  const logs=[];
  for(let step=0;step<2;step++){
    const before=s.positions.slice(),to=before.map((pos,p)=>advance(pos,s.pending[p][step]));
    if(to[0]===to[1]||(to[0]===before[1]&&to[1]===before[0])){logs.push({blocked:true,positions:before.slice()});continue;}
    s.positions=to;for(let p=0;p<2;p++)if(to[p]!==before[p]&&POINTS.includes(to[p]))s.scores[p]++;
    logs.push({blocked:false,positions:to.slice()});
  }
  s.last={plans:s.pending.map(x=>x.slice()),logs};
}
function submitProtocol(s,a){
  if(s.phase!=='plan'||a.type!=='submit'||!Array.isArray(a.commands)||a.commands.length!==2||a.commands.some(x=>!Object.hasOwn(DIR,x)))return invalid('Выберите две команды');
  s.pending[s.planner]=a.commands.slice();
  if(s.planner===0){s.planner=1;s.phase='pass';}
  else{resolveProtocol(s);s.pending=[null,null];s.planner=0;s.round++;s.phase='reveal';if(s.round===8)finish(s,s.scores[0]===s.scores[1]?-1:s.scores[0]>s.scores[1]?0:1);}
  return commit(s);
}
export function apply(state,action){
  if(!state||state.finished)return invalid('Партия завершена');
  if(!action||typeof action!=='object')return invalid('Некорректный ход');
  const s=clone(state);
  switch(s.kind){
    case'bridge':return playBridge(s,action);
    case'infection':return playInfection(s,action);
    case'void':return playVoid(s,action);
    case'rotate':return playRotate(s,action);
    case'influence':
      if(s.phase==='pass'&&action.type==='continue'){s.phase='plan';return commit(s)}
      if(s.phase==='reveal'&&action.type==='continue'){s.phase='plan';return commit(s)}
      return submitInfluence(s,action);
    case'protocol':
      if(s.phase==='pass'&&action.type==='continue'){s.phase='plan';return commit(s)}
      if(s.phase==='reveal'&&action.type==='continue'){s.phase='plan';return commit(s)}
      return submitProtocol(s,action);
    default:return invalid('Неизвестная игра');
  }
}
export function legal(s){
  if(s.finished)return[];
  if(s.kind==='bridge')return s.cells.flatMap((v,i)=>v===-1?[i]:[]);
  if(s.kind==='infection')return infectionMoves(s,s.turn);
  if(s.kind==='void')return voidMoves(s,s.turn);
  if(s.kind==='rotate'&&s.stage==='move')return adjacent(s.cells.indexOf(s.turn),6).filter(i=>s.cells[i]===-1);
  return [];
}
export function ownerOfRegion(s,i){const[a,b]=s.regions[i];return a===b?-1:a>b?0:1}
export function scoreOfRegions(s){return[0,1].map(p=>s.regions.filter((_,i)=>ownerOfRegion(s,i)===p).length)}
export function validateStored(s){
  if(!s||typeof s!=='object'||!MODES[s.kind]||typeof s.finished!=='boolean'||![0,1].includes(s.turn))return false;
  const kind=s.kind;
  if(['bridge','infection','void','rotate'].includes(kind))return Array.isArray(s.cells)&&s.cells.length===sizeOf(s)**2&&s.cells.every(n=>Number.isInteger(n)&&n>=-2&&n<=1);
  if(kind==='influence')return Array.isArray(s.regions)&&s.regions.length===5&&s.regions.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(v=>Number.isInteger(v)&&v>=0&&v<=24))&&Number.isInteger(s.round)&&s.round>=0&&s.round<=8&&['plan','pass','reveal'].includes(s.phase)&&[0,1].includes(s.planner);
  return Array.isArray(s.positions)&&s.positions.length===2&&s.positions.every(v=>Number.isInteger(v)&&v>=0&&v<25)&&Array.isArray(s.scores)&&s.scores.length===2&&s.scores.every(v=>Number.isInteger(v)&&v>=0&&v<=16)&&Number.isInteger(s.round)&&s.round>=0&&s.round<=8&&['plan','pass','reveal'].includes(s.phase)&&[0,1].includes(s.planner);
}
