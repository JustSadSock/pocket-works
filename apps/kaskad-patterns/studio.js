// User-authored local rules for the cellular-automata workshop.
// Each transition reads only the previous frame; no DOM, eval or external code.
export const STUDIO_PRESETS=Object.freeze({
  life:{name:'Игра жизни',family:'life',states:2,birth:[3],survive:[2,3],neighbors:8,wrap:true},
  highlife:{name:'Высшая жизнь',family:'life',states:2,birth:[3,6],survive:[2,3],neighbors:8,wrap:true},
  brain:{name:'Мозг Брайана',family:'life',states:3,birth:[2],survive:[],neighbors:8,wrap:true},
  crystals:{name:'Рост кристаллов',family:'life',states:2,birth:[1],survive:[0,1,2,3,4,5,6,7,8],neighbors:8,wrap:false},
  cyclic:{name:'Циклические хищники',family:'cyclic',states:4,threshold:2,neighbors:8,wrap:true},
  fire:{name:'Лесной пожар',family:'spread',states:4,spread:.48,duration:.65,regrow:.002,recover:.4,neighbors:8,wrap:true},
  epidemic:{name:'Эпидемия',family:'spread',states:4,spread:.18,duration:.085,regrow:.015,recover:.025,neighbors:8,wrap:true}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const STUDIO_FAMILIES={life:'Рождение и выживание',cyclic:'Циклическая смена',spread:'Распространение'};
const DIR8=[-1,-1,-1,0,-1,1,0,-1,0,1,1,-1,1,0,1,1];
const DIR4=[-1,0,0,-1,0,1,1,0];
function rng(w){let x=w.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;w.seed=x|0;return (x>>>0)/4294967296;}
export function studioParams(key='life'){
  const data=STUDIO_PRESETS[key]||STUDIO_PRESETS.life;
  return JSON.parse(JSON.stringify(data));
}
export function studioStateNames(params) {
  if(params.family==='spread')return ['Пустота','Ресурс','Заражение','След'];
  if(params.family==='cyclic')return Array.from({length:params.states},(_,i)=>'Вид '+(i+1));
  return Array.from({length:params.states},(_,i)=>i===0?'Пусто':i===1?'Жизнь':'Остывание '+(i-1));
}
function spot(w,x,y,v) {if(x>=0&&x<w.n&&y>=0&&y<w.n)w.a[y*w.n+x]=v;}
function stamp(w,x,y,shape) {for(const [dx,dy] of shape)spot(w,x+dx,y+dy,1);}
export function seedStudio(w,key='life') {
  w.a.fill(0);
  w.next=new Uint8Array(w.n*w.n);
  if(key==='fire'||key==='epidemic'){
    const fill=key==='fire'?.72:.83;
    for(let i=0;i<w.a.length;i++)w.a[i]=rng(w)<fill?1:0;
    for(let j=0;j<7;j++){
      const x=5+Math.floor(rng(w)*(w.n-10)),y=5+Math.floor(rng(w)*(w.n-10));
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx*dx+dy*dy<=4&&w.a[(y+dy)*w.n+(x+dx)]===1)spot(w,x+dx,y+dy,2);
    }
  }else if(key==='cyclic'){
    for(let i=0;i<w.a.length;i++)w.a[i]=Math.floor(rng(w)*w.params.states);
  }else if(key==='crystals'){
    const c=w.n>>1;
    for(const [x,y] of [[c,c],[c-19,c+9],[c+18,c-13],[c+22,c+21]])spot(w,x,y,1);
  }else{
    const glider=[[1,0],[2,1],[0,2],[1,2],[2,2]];
    const rp=[[1,0],[2,0],[0,1],[1,1],[1,2]];
    const oscillator=[[0,0],[1,0],[2,0]];
    stamp(w,18,19,glider);stamp(w,50,39,rp);stamp(w,66,65,oscillator);
    stamp(w,20,66,glider);stamp(w,68,18,rp);
    if(key==='highlife')for(let i=0;i<25;i++)spot(w,35+Math.floor(rng(w)*25),49+Math.floor(rng(w)*19),1);
  }
}
function neighbors(w,x,y,rule,lookFor){
  let count=0,n=w.n,a=w.a,d=rule.neighbors===4?DIR4:DIR8;
  for(let k=0;k<d.length;k+=2){
    let xx=x+d[k],yy=y+d[k+1];
    if(rule.wrap){xx=(xx+n)%n;yy=(yy+n)%n;}
    else if(xx<0||yy<0||xx>=n||yy>=n)continue;
    if(a[yy*n+xx]===lookFor)count++;
  }
  return count;
}
export function stepStudio(w,steps=1) {
  const n=w.n,size=n*n,r=w.params;
  for(let iteration=0;iteration<steps;iteration++){
    const a=w.a,b=w.next;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,v=a[i];
      if(r.family==='life'){
        const q=neighbors(w,x,y,r,1);
        if(v===0)b[i]=r.birth.includes(q)?1:0;
        else if(v===1)b[i]=r.survive.includes(q)?1:(r.states>2?2:0);
        else b[i]=v+1<r.states?v+1:0;
      }else if(r.family==='cyclic'){
        const next=(v+1)%r.states;
        b[i]=neighbors(w,x,y,r,next)>=r.threshold?next:v;
      }else{
        if(v===0)b[i]=rng(w)<r.regrow?1:0;
        else if(v===1){
          const infected=neighbors(w,x,y,r,2);
          b[i]=infected&&rng(w)<1-Math.pow(1-r.spread,infected)?2:1;
        }else if(v===2)b[i]=rng(w)<r.duration?3:2;
        else b[i]=rng(w)<r.recover?0:3;
      }
    }
    w.a=b;w.next=a;w.ticks++;
  }
}
function selection(value,limit) {
  let parts;
  if(Array.isArray(value))parts=value;
  else if(typeof value==='string')parts=value.split(/[^0-9]+/).filter(Boolean);
  else parts=[];
  if(parts.length>9)return null;
  const out=[...new Set(parts.map(Number))].sort((a,b)=>a-b);
  if(out.some(n=>!Number.isInteger(n)||n<0||n>limit))return null;
  return out;
}
export function setStudioRule(w,key,value) {
  const r=w.params;
  if(key==='preset'&&STUDIO_PRESETS[value]){w.params=studioParams(value);w.a=w.a.map(v=>v%w.params.states);return true;}
  if(key==='family'&&['life','cyclic','spread'].includes(value)){
    const preset=value==='life'?'life':value==='cyclic'?'cyclic':'fire';
    w.params=studioParams(preset);w.a=w.a.map(v=>v%w.params.states);return true;
  }
  if(key==='birth'||key==='survive'){
    const items=selection(value,r.neighbors===4?4:8);
    if(items===null)return false;
    r[key]=items;return true;
  }
  if(key==='neighbors'&&[4,8].includes(Number(value))){
    r.neighbors=Number(value);if(r.family==='life'){
      r.birth=r.birth.filter(v=>v<=r.neighbors);
      r.survive=r.survive.filter(v=>v<=r.neighbors);
    }return true;
  }
  if(key==='wrap'){r.wrap=value===true||value==='true';return true;}
  if(key==='states'&&r.family!=='spread'){
    const count=clamp(Math.round(Number(value)||2),r.family==='cyclic'?3:2,6);
    r.states=count;for(let i=0;i<w.a.length;i++)w.a[i]%=count;return true;
  }
  if(key==='threshold'&&r.family==='cyclic'){r.threshold=clamp(Math.round(Number(value)||1),1,r.neighbors);return true;}
  if(['spread','regrow','duration','recover'].includes(key)&&r.family==='spread'){
    const v=Number(value);if(!Number.isFinite(v))return false;
    r[key]=clamp(v,key==='spread'||key==='duration'?.001:0,key==='regrow'?.08:1);return true;
  }
  return false;
}
export function paintStudio(w,x,y,value=1,radius=1,symmetry='none') {
  if(w.mode!=='studio')return 0;
  const n=w.n,v=clamp(Math.floor(value),0,w.params.states-1),r=clamp(Math.floor(radius),1,7);
  const centers=[[x,y]];
  if(symmetry==='mirror'||symmetry==='four')centers.push([n-1-x,y]);
  if(symmetry==='four')centers.push([x,n-1-y],[n-1-x,n-1-y]);
  let count=0;
  for(const [cx,cy] of centers)for(let dy=-(r-1);dy<=r-1;dy++)for(let dx=-(r-1);dx<=r-1;dx++){
    if(dx*dx+dy*dy>(r-.2)*(r-.2))continue;
    const xx=cx+dx,yy=cy+dy;
    if(xx<0||yy<0||xx>=n||yy>=n)continue;
    const i=yy*n+xx;if(w.a[i]!==v){w.a[i]=v;count++;}
  }
  return count;
}
export function scatterStudio(w,density=.25) {
  density=clamp(Number(density)||0,.01,.95);
  for(let i=0;i<w.a.length;i++){
    if(w.params.family==='cyclic')w.a[i]=Math.floor(rng(w)*w.params.states);
    else if(w.params.family==='spread')w.a[i]=rng(w)<density?1:0;
    else w.a[i]=rng(w)<density?1:0;
  }
  if(w.params.family==='spread')for(let j=0;j<30;j++){
    const x=Math.floor(rng(w)*w.n),y=Math.floor(rng(w)*w.n);
    if(w.a[y*w.n+x]===1)spot(w,x,y,2);
  }
}
export function mutateStudio(w) {
  const r=w.params;
  if(r.family==='life'){
    const candidate=r.birth.includes(6)?6:4;
    const next=r.birth.includes(candidate)?r.birth.filter(v=>v!==candidate):[...r.birth,candidate].sort((a,b)=>a-b);
    r.birth=next.length?next:[3];
  }else if(r.family==='cyclic')r.threshold=r.threshold<r.neighbors?r.threshold+1:1;
  else r.spread=Math.max(.001,Math.min(1,+(r.spread*.72).toFixed(3)));
  return w;
}
export function studioReport(w){
  const counts=Array.from({length:w.params.states},()=>0);
  for(const state of w.a)counts[state]++;
  let entropy=0;
  for(const count of counts)if(count){const p=count/w.a.length;entropy-=p*Math.log2(p);}
  return {counts,active:counts[1]||0,occupied:w.a.length-counts[0],diversity:counts.filter(Boolean).length,entropy:+entropy.toFixed(2)};
}
