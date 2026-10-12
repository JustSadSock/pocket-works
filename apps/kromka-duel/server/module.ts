// @ts-nocheck
import type { PocketModule } from '../../../pocket-server/module-contract.js';
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


// PocketNet game module. No mutable imports: version snapshots are self-contained.
export const MIN_PLAYERS=2;
export const RULESET_VERSION=1;
const own=(s,id)=>s.players.findIndex(p=>p.id===id);
const notify=(id,text)=>[{type:'notice',to:id,payload:text}];
const emit=s=>[{type:'state',payload:s}];
function fresh(s){
  s.phase='plan';s.scores=[0,0];s.beat=1;s.fighters=startFighters();
  s.hashes=[null,null];s.reveals=[null,null];s.deadline=Date.now()+PLAN_MS;
  s.last=null;s.winner=null;s.revision++;
}
function toReveal(s){
  s.phase='reveal';s.deadline=Date.now()+REVEAL_MS;s.revision++;
}
function apply(s,forced=null){
  const moves=s.reveals.map(x=>x||neutral());
  const r=resolveExchange(s.fighters,moves);
  let point=forced;
  if(point===null&&r.hit!==null&&r.hit!=='double')point=r.hit;
  if(point!==null)s.scores[point]++;
  s.last={...r,seq:s.beat,point};
  s.fighters=point===null?r.after:startFighters();
  s.hashes=[null,null];s.reveals=[null,null];s.beat++;s.revision++;
  if(Math.max(...s.scores)>=3||s.beat>65){
    s.phase='finished';s.winner=Math.max(...s.scores)>=3?s.scores.indexOf(Math.max(...s.scores)):(
      s.scores[0]===s.scores[1]?-1:s.scores.indexOf(Math.max(...s.scores)));
    s.deadline=0;
  }else{s.phase='plan';s.deadline=Date.now()+PLAN_MS;}
}
function advance(s){
  if(s.phase==='plan'){
    if(s.hashes.every(Boolean)){toReveal(s);return true;}
    if(Date.now()>=s.deadline){
      for(let i=0;i<2;i++)if(!s.hashes[i]){
        s.hashes[i]='auto';s.reveals[i]=neutral();
      }
      toReveal(s);return true;
    }
  }else if(s.phase==='reveal'){
    if(s.reveals.every(Boolean)){apply(s);return true;}
    if(Date.now()>=s.deadline){
      // Failure to reveal after a cryptographic commitment loses one point.
      const absent=s.reveals.map((x,i)=>x?null:i).filter(x=>x!==null);
      for(const i of absent)s.reveals[i]=neutral();
      apply(s,absent.length===1?1-absent[0]:null);return true;
    }
  }
  return false;
}
const module: PocketModule<any>={
  protocolVersion:1,
  createRoom({player}){
    return {state:{phase:'lobby',host:player.id,players:[player],scores:[0,0],beat:0,
      fighters:startFighters(),hashes:[null,null],reveals:[null,null],deadline:0,
      last:null,winner:null,revision:0}};
  },
  onJoin({state,players}){
    if(players.length>2)throw Error('room_full');
    if(state.phase!=='lobby')throw Error('match_in_progress');
    state.players=players;state.revision++;
    return {state,events:emit(state)};
  },
  onLeave({state,player,players}){
    const side=own(state,player.id);
    if((state.phase==='plan'||state.phase==='reveal')&&side>=0){
      state.phase='finished';state.winner=1-side;state.deadline=0;state.scores[1-side]=3;state.revision++;
    }
    if(state.phase==='lobby')state.players=players;
    if(state.host===player.id)state.host=players[0]?.id||'';
    return {state,events:emit(state)};
  },
  async onMessage({state,player,payload}){
    const side=own(state,player.id);
    if(side<0)return {state,events:notify(player.id,'Ты не участник дуэли.')};
    const raw=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
    if(raw.type==='sync')return {state,events:[{type:'state',to:player.id,payload:state}]};
    if(advance(state))return {state,events:emit(state)};
    if(raw.type==='pulse')return {state,events:[]};
    if(raw.type==='start'||raw.type==='again'){
      if(state.host!==player.id||state.players.length!==2||
        !(raw.type==='start'&&state.phase==='lobby'||raw.type==='again'&&state.phase==='finished'))
        return {state,events:notify(player.id,'Начать может хозяин, когда оба дуэлянта в комнате.')};
      fresh(state);return {state,events:emit(state)};
    }
    if(raw.type==='commit'){
      if(state.phase!=='plan'||!state.hashes)return {state,events:[]};
      if(raw.beat!==state.beat||state.hashes[side])return {state,events:[]};
      if(typeof raw.hash!=='string'||!/^[0-9a-f]{64}$/.test(raw.hash))
        return {state,events:notify(player.id,'Недопустимая фиксация.')};
      state.hashes[side]=raw.hash;state.revision++;advance(state);
      return {state,events:emit(state)};
    }
    if(raw.type==='reveal'){
      if(state.phase!=='reveal'||raw.beat!==state.beat||state.reveals[side])
        return {state,events:[]};
      const act=actionOf(raw.action),nonce=raw.nonce;
      if(!act||typeof nonce!=='string'||!/^[0-9a-f-]{30,64}$/i.test(nonce))
        return {state,events:notify(player.id,'Команда повреждена.')};
      const expected=await digest(commitment(state.beat,side,act,nonce));
      if(expected!==state.hashes[side])
        return {state,events:notify(player.id,'Подпись команды не совпадает.')};
      state.reveals[side]=act;state.revision++;advance(state);
      return {state,events:emit(state)};
    }
    return {state,events:notify(player.id,'Сейчас эта команда недоступна.')};
  }
};
export default module;
