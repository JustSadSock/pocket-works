// КРОМКА · deterministic geometric duel; browser and PocketNet snapshot share this source.
export const W=360,H=400,CX=180,CY=200,R=169;
export const PLAN_MS=5600,REVEAL_MS=3200;
export const neutral=()=>({mx:0,my:0,blade:0});
export const round2=n=>Math.round(n*100)/100;
export function actionOf(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const keys=['mx','my','blade'];
  if(!keys.every(k=>typeof input[k]==='number'&&Number.isFinite(input[k])&&input[k]>=-1&&input[k]<=1))return null;
  let {mx,my,blade}=input;const len=Math.hypot(mx,my);
  if(len>1){mx/=len;my/=len;}
  mx=round2(mx);my=round2(my);
  const roundedLength=Math.hypot(mx,my);
  if(roundedLength>1){mx=Math.trunc(mx/roundedLength*100)/100;my=Math.trunc(my/roundedLength*100)/100;}
  return {mx,my,blade:round2(blade)};
}
export const signed=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function startFighters(){
  return [{x:180,y:293,a:-Math.PI/2+.77,spin:0},
          {x:180,y:107,a:Math.PI/2+.77,spin:0}];
}
export function bladeOf(f){
  return {ax:f.x+Math.cos(f.a)*19,ay:f.y+Math.sin(f.a)*19,
          bx:f.x+Math.cos(f.a)*91,by:f.y+Math.sin(f.a)*91};
}
function ptSeg(px,py,ax,ay,bx,by){
  const vx=bx-ax,vy=by-ay;
  const t=clamp(((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy||1),0,1);
  return Math.hypot(px-(ax+vx*t),py-(ay+vy*t));
}
function cross(a,b,c,d){return (b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);}
function segments(p,q){
  const a={x:p.ax,y:p.ay},b={x:p.bx,y:p.by},c={x:q.ax,y:q.ay},d={x:q.bx,y:q.by};
  const ab=cross(a,b,c,d),ba=cross(c,d,a,b);
  const intersects=ab!==0&&ba!==0&&Math.sign(cross(a,b,a,c))!==Math.sign(cross(a,b,a,d))&&
    Math.sign(cross(c,d,c,a))!==Math.sign(cross(c,d,c,b));
  return intersects||Math.min(ptSeg(a.x,a.y,c.x,c.y,d.x,d.y),ptSeg(b.x,b.y,c.x,c.y,d.x,d.y),
    ptSeg(c.x,c.y,a.x,a.y,b.x,b.y),ptSeg(d.x,d.y,a.x,a.y,b.x,b.y))<6;
}
function safe(f){
  const dx=f.x-CX,dy=f.y-CY,rad=Math.hypot(dx,dy);
  if(rad>R-16){f.x=CX+dx/rad*(R-16);f.y=CY+dy/rad*(R-16);}
}
const clone=f=>({x:round2(f.x),y:round2(f.y),a:round2(f.a),spin:round2(f.spin)});
export function resolveExchange(fighters,actions){
  const before=fighters.map(clone);
  const f=fighters.map(x=>({...x}));
  const move=actions.map(a=>({x:a.mx*29,y:a.my*29}));
  const target=f.map((v,i)=>clamp(actions[i].blade*1.32+v.spin*.16,-1.43,1.43));
  const frames=[f.map(clone)];let hit=null,contact=null,locked=false,frozen=[null,null];
  for(let step=1;step<=18;step++){
    const t=step/18;
    for(let i=0;i<2;i++){
      f[i].x=before[i].x+move[i].x*t;
      f[i].y=before[i].y+move[i].y*t;
      f[i].a=frozen[i]??before[i].a+target[i]*t;
      safe(f[i]);
    }
    const dd=Math.hypot(f[0].x-f[1].x,f[0].y-f[1].y);
    if(dd<36){
      const ux=(f[0].x-f[1].x)/(dd||1),uy=(f[0].y-f[1].y)/(dd||1);
      const push=(36-dd)/2;
      f[0].x+=ux*push;f[0].y+=uy*push;
      f[1].x-=ux*push;f[1].y-=uy*push;
      safe(f[0]);safe(f[1]);
    }
    const a=bladeOf(f[0]),b=bladeOf(f[1]);
    if(!locked&&segments(a,b)){
      locked=true;contact={type:'bind',x:round2((a.bx+b.bx)/2),y:round2((a.by+b.by)/2)};
      // A bind arrests the weapons for this beat but keeps footwork meaningful.
      for(let i=0;i<2;i++){frozen[i]=f[i].a;target[i]=0;f[i].spin=0;}
    }
    if(!locked){
      const strikes=[0,1].map(i=>{
        const bl=i?b:a,o=f[1-i];
        const active=Math.abs(target[i])>.13||Math.hypot(move[i].x,move[i].y)>9;
        return active&&ptSeg(o.x,o.y,bl.ax,bl.ay,bl.bx,bl.by)<17;
      });
      if(strikes[0]||strikes[1]){
        hit=strikes[0]&&strikes[1]?'double':strikes[0]?0:1;
        contact={type:'strike',x:round2((f[0].x+f[1].x)/2),y:round2((f[0].y+f[1].y)/2)};
      }
    }
    frames.push(f.map(clone));
    if(hit!==null)break;
  }
  const last=frames.at(-1);
  for(let i=0;i<2;i++){
    last[i].spin=locked?0:clamp(target[i]*.33,-.3,.3);
  }
  return {before,after:last,frames,hit,contact};
}
export const commitment=(tick,side,action,nonce)=>
  [tick,side,action.mx,action.my,action.blade,nonce].join(':');
export async function digest(value){
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,'0')).join('');
}
export function botChoice(fighters,beat){
  const me=fighters[1],op=fighters[0];
  const dx=op.x-me.x,dy=op.y-me.y,dist=Math.hypot(dx,dy);
  const unit=dist?{x:dx/dist,y:dy/dist}:{x:0,y:1};
  const approach=dist>100?.9:dist<65?-.7:.1;
  const flank=(beat%4<2?1:-1)*.55;
  return actionOf({mx:clamp(unit.x*approach-unit.y*flank,-1,1),
    my:clamp(unit.y*approach+unit.x*flank,-1,1),
    blade:beat%3===0?-.95:beat%3===1?.82:-.16})||neutral();
}
