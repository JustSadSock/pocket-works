import {UNIT, strength, clamp, xx, yy, W, H, idx, random, neighbors} from './world.mjs';
export const BW=1000,BH=640;
export const FORM=['Линия','Колонна','Плотный строй','Рассыпной строй','Клин','Каре'];
export function createBattle(s){const info=s.battle, armies=[s.armies.find(a=>a.id===info.a),s.armies.find(a=>a.id===info.b)];let b={seed:s.rng,rng:s.rng,armies:armies.map(a=>({id:a.id,f:a.f,count:strength(a)})),units:[],soldiers:[],time:0,winner:null,terrain:[],river:false,settlement:false};
b.terrain=campaignTerrain(s,info.i);b.river=b.terrain.some(t=>t.water);b.settlement=b.terrain.some(t=>t.building);const dx=xx(armies[1].i)-xx(armies[0].i),dy=yy(armies[1].i)-yy(armies[0].i),orientation=dx||dy?Math.atan2(dy,dx):0,rotate=(x,y)=>[clamp(BW/2+(x-BW/2)*Math.cos(orientation)-(y-BH/2)*Math.sin(orientation),35,BW-35),clamp(BH/2+(x-BW/2)*Math.sin(orientation)+(y-BH/2)*Math.cos(orientation),35,BH-35)];
for(let side=0;side<2;side++){let a=armies[side],groups=[];for(let type=0;type<10;type++){for(let n=a.units[type];n>0;n-=60)groups.push([type,Math.min(n,60)])}let columns=Math.min(5,groups.length);for(let k=0;k<groups.length;k++){let [type,n]=groups[k],x=side?760:240,y=BH/2+(k%columns-(columns-1)/2)*105; x+=(side?1:-1)*Math.floor(k/columns)*75;let defending=info.defender===a.id;if(defending)x+=(side?-1:1)*140;[x,y]=rotate(x,y);let best=null;for(let oy=-40;oy<=40;oy+=20)for(let ox=-40;ox<=40;ox+=20){let qx=clamp(x+ox,30,BW-30),qy=clamp(y+oy,30,BH-30),t=tile(b,qx,qy);if(t.water||t.building)continue;let score=(defending?t.h*40:0)-Math.hypot(ox,oy)*.18;if(!best||score>best.score)best={x:qx,y:qy,score};}if(best){x=best.x;y=best.y;}let g={id:b.units.length,side,f:a.f,type,x,y,tx:x,ty:y,angle:orientation+(side?Math.PI:0),form:0,order:defending?'defend':'hold',target:null,alive:n,morale:a.morale,ammo:UNIT[type][5]?18:0};b.units.push(g);for(let j=0;j<n;j++){let p=slot(g,j,n);b.soldiers.push({id:b.soldiers.length,g:g.id,side,type,x:clamp(p.x,1,BW-1),y:clamp(p.y,1,BH-1),angle:g.angle,hp:1,morale:a.morale,fatigue:a.fatigue,experience:0,ammo:g.ammo,cd:random(b),state:'hold',j,n,target:-1})}}}return b}
// The strategic cell is the centre of a 4.2 x 2.7-cell battle window.
// Use the actual drainage graph and road edges, not a fabricated horizontal river.
export function campaignTerrain(s,center){
 const m=s.map,originX=xx(center)+.5,originY=yy(center)+.5,scale=12,tiles=[];
 const seg=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-ax-dx*t,y-ay-dy*t);};
 const cell=(x,y)=>idx(clamp(x,0,W-1),clamp(y,0,H-1));
 const heightAt=(x,y)=>{let ix=Math.floor(x-.5),iy=Math.floor(y-.5),u=x-.5-ix,v=y-.5-iy;return m.height[cell(ix,iy)]*(1-u)*(1-v)+m.height[cell(ix+1,iy)]*u*(1-v)+m.height[cell(ix,iy+1)]*(1-u)*v+m.height[cell(ix+1,iy+1)]*u*v;};
 for(let y=0;y<32;y++)for(let x=0;x<50;x++){
 let wx=originX+(x+.5-25)/scale,wy=originY+(y+.5-16)/scale,i=cell(Math.floor(wx),Math.floor(wy)),cx=xx(i)+.5,cy=yy(i)+.5;
 let water=!m.land[i],road=false,bridge=false,nearRiver=Infinity;
 const r= [i,...neighbors(i)];
 for(const j of r){let jx=xx(j)+.5,jy=yy(j)+.5,d=m.down[j];
 if(m.river[j]&&d>=0){let w=clamp(.065+Math.sqrt(m.flow?.[j]||20)*.006,.08,.22),distance=seg(wx,wy,jx,jy,xx(d)+.5,yy(d)+.5);nearRiver=Math.min(nearRiver,distance);if(distance<w)water=true;}
 if(s.road[j])for(const k of neighbors(j))if(s.road[k]&&seg(wx,wy,jx,jy,xx(k)+.5,yy(k)+.5)<.10)road=true;
 if(s.bridge?.[j]&&Math.hypot(wx-jx,wy-jy)<.26&&nearRiver<.24)bridge=true;
 }
 if(water&&road&&s.bridge?.[i])bridge=true;
 const district=s.district?.[i]||0,city=s.cities.find(c=>c.i===i),localX=wx-cx,localY=wy-cy;
 const urban=[1,5,6,7,8,9].includes(district)||!!city,building=urban&&!water&&!road&&Math.abs(localX)<.34&&Math.abs(localY)<.35&&((Math.floor((localX+.5)*7)+Math.floor((localY+.5)*7))%3===0);
 const fort=(district===8||city?.fort>0)&&Math.max(Math.abs(localX),Math.abs(localY))>.34&&Math.max(Math.abs(localX),Math.abs(localY))<.44&&!road&&!water;
 tiles.push({h:heightAt(wx,wy),forest:m.terrain[i]===2&&!urban&&!road,water:water&&!bridge,bridge,road:road||bridge,field:district===2,building:building||fort,fort:!!fort,worldCell:i});
 }
 return tiles;
}
function slot(g,j,n){let cols=g.width|| (g.form===1?4:g.form===2?8:g.form===3?15:g.form===5?Math.ceil(Math.sqrt(n)):12),space=Math.max(g.type===6||g.type===7?7:3.8,g.form===3?9:g.form===2?4:5);let row=Math.floor(j/cols),col=j%cols,along=-(row-(Math.ceil(n/cols)-1)/2)*space,across=(col-(cols-1)/2)*space;if(g.form===4){row=Math.floor(Math.sqrt(j));along=-row*space;across=(j-row*row-row)*space}if(g.form===5){let p=j/n*Math.PI*2;along=Math.cos(p)*25;across=Math.sin(p)*25}let c=Math.cos(g.angle),s=Math.sin(g.angle);return {x:g.x+along*c-across*s,y:g.y+along*s+across*c}}

const REACH=[5,5.5,9,13,4,4,7,8,3,4],RADIUS=[1.8,1.8,1.8,1.8,1.7,1.7,3.1,3.4,2.2,1.7];
const mounted=p=>p.type===6||p.type===7;
const ranged=p=>p.ammo>0&&UNIT[p.type][5]>0;
const active=p=>p.hp>0&&!['escaped','captured','wounded'].includes(p.state);
const tile=(b,x,y)=>b.terrain[clamp(Math.floor(y/20),0,31)*50+clamp(Math.floor(x/20),0,49)];
export function customBattle(config={}){
 const seed=Number(config.seed)>>>0||1080, terrain=[];
 const rng={rng:seed};
 for(let y=0;y<32;y++)for(let x=0;x<50;x++){
 const hill=Math.exp(-((x-25)**2+(y-13)**2)/100);
 terrain.push({h:config.landscape==='hills'?hill*.55:.04*Math.sin(x*.2)*Math.cos(y*.2),forest:config.landscape==='forest'&&Math.sin(x*.41)+Math.cos(y*.6)>1,water:config.landscape==='river'&&Math.abs(x-25-Math.sin(y*.3)*3)<1.2&&Math.abs(y-16)>2});
 }
 const b={seed,rng:seed,custom:true,config:JSON.parse(JSON.stringify(config)),armies:[],units:[],soldiers:[],time:0,winner:null,terrain,weather:config.weather||'clear',projectiles:[]};
 for(let side=0;side<2;side++){
 const spec=config.sides?.[side]||{units:[{type:2,n:120},{type:4,n:60},{type:6,n:60}],ai:side===1};
 const groups=[];for(const u of spec.units||[]){let remaining=clamp(Math.floor(Number(u.n)||0),0,1500);for(;remaining>0;remaining-=150)groups.push({...u,n:Math.min(remaining,150)});}
 let count=0;
 for(let k=0;k<groups.length&&count<1500;k++){const u=groups[k],n=Math.min(u.n,1500-count),type=clamp(Math.floor(+u.type||0),0,9),cols=Math.min(5,groups.length),x=(side?800:200)+(side?1:-1)*Math.floor(k/cols)*80+(Number(spec.offsetX)||0),y=320+(k%cols-(cols-1)/2)*105+(Number(spec.offsetY)||0),g={id:b.units.length,side,f:side,type,x:clamp(x,35,965),y:clamp(y,35,605),angle:side?Math.PI:0,form:clamp(+u.form||0,0,5),order:'hold',target:null,alive:n,morale:.85,ai:!!spec.ai,doctrine:'balanced'};g.tx=g.x;g.ty=g.y;b.units.push(g);
 for(let j=0;j<n;j++){const pos=slot(g,j,n);b.soldiers.push({id:b.soldiers.length,g:g.id,side,type,x:pos.x,y:pos.y,angle:g.angle,hp:1,morale:.85,fatigue:0,experience:clamp(+u.exp||0,0,1),ammo:UNIT[type][5]?18:0,cd:random(rng),state:'hold',j,n,target:-1,vx:0,vy:0});}count+=n;
 }b.armies.push({id:side,f:side,count});
 }b.rng=rng.rng;return b;
}
export function command(b,ids,order,x,y,target=null,options={}){
 const gs=b.units.filter(g=>ids.includes(g.id)&&g.alive>0);
 gs.forEach((g,i)=>{let cmd={order,x:clamp(x,12,BW-12),y:clamp(y+(i-(gs.length-1)/2)*55,12,BH-12),target,angle:options.angle};
 if(options.queue){(g.queue??=[]).push(cmd);return}g.queue=[];apply(g,cmd);});
}
function apply(g,c){g.order=c.order;g.target=c.target;g.tx=c.order==='retreat'?(g.side?BW-5:5):['hold','defend','reserve'].includes(c.order)?g.x:c.x;g.ty=['retreat','hold','defend','reserve'].includes(c.order)?g.y:c.y;g.fixedAngle=Number.isFinite(c.angle)?c.angle:null;if(g.fixedAngle!==null)g.angle=g.fixedAngle;}
function gridOf(living,size=16){let cells=new Map();for(const p of living){let k=Math.floor(p.x/size)+Math.floor(p.y/size)*128;let a=cells.get(k);if(!a)cells.set(k,a=[]);a.push(p);}return {visit(x,y,r,fn){let l=Math.floor((x-r)/size),rr=Math.floor((x+r)/size),t=Math.floor((y-r)/size),bb=Math.floor((y+r)/size);for(let iy=t;iy<=bb;iy++)for(let ix=l;ix<=rr;ix++){let a=cells.get(ix+iy*128);if(a)for(const p of a)fn(p);}}};}
function injury(b,p,damage,grid){if(!active(p))return;p.hp=Math.max(0,p.hp-damage);p.morale=Math.max(0,p.morale-damage*.38);p.hit=.22;if(p.hp===0){p.state=random(b)<.36?'wounded':'dead';grid.visit(p.x,p.y,18,q=>{if(q.side===p.side&&active(q)&&Math.hypot(q.x-p.x,q.y-p.y)<18)q.morale-=.08;});}}
function ai(b,g,enemies,allies){if(!enemies.length)return;let target=enemies.reduce((a,q)=>{const score=p=>Math.hypot(p.x-g.x,p.y-g.y)+p.alive*.35+(p.type===4||p.type===5?-28:0);return score(q)<score(a)?q:a;});const missile=UNIT[g.type][5]>0,horse=g.type===6||g.type===7;g.target=target.id;
 const distance=Math.hypot(target.x-g.x,target.y-g.y);
 if(!g.aiRole){const infantry=allies.filter(q=>UNIT[q.type][5]===0&&q.type!==6&&q.type!==7);g.aiRole=infantry.length>=4&&infantry[infantry.length-1]===g?'reserve':'line';}
 if(g.aiRole==='reserve'&&g.doctrine!=='defensive'&&distance>125&&allies.every(q=>q.morale>.45)){g.order='reserve';return;}
 if(!horse&&!missile&&distance>120&&g.order!=='retreat'&&g.doctrine!=='reserve'){
 const h=tile(b,g.x,g.y);let best=null;
 for(const dx of [-40,0,40])for(const dy of [-40,0,40]){let x=clamp(g.x+dx,25,BW-25),y=clamp(g.y+dy,25,BH-25),t=tile(b,x,y);if(!t.water&&t.h>h.h+.07&&(!best||t.h>best.h))best={x,y,h:t.h};}
 if(best){g.order='move';g.tx=best.x;g.ty=best.y;return;}
 if(h.h>.30&&distance<210&&(b.time<25||g.side===1&&enemies.some(q=>q.order==='attack'))){g.order='defend';g.tx=g.x;g.ty=g.y;g.angle=Math.atan2(target.y-g.y,target.x-g.x);return;}
 }
 if(g.morale<.27){apply(g,{order:'retreat',x:g.x,y:g.y,target:null});return;}
 if(g.doctrine==='reserve'&&Math.hypot(target.x-g.x,target.y-g.y)>150){g.order='reserve';return;}
 if(g.doctrine==='defensive'&&Math.hypot(target.x-g.x,target.y-g.y)>90){g.order='defend';return;}
 if(missile){g.order='distance';return;}
 if(horse){g.order='flank';return;}
 const archers=allies.filter(q=>UNIT[q.type][5]>0);const threatened=archers.find(q=>enemies.some(e=>Math.hypot(e.x-q.x,e.y-q.y)<95));
 if(threatened){g.target=enemies.reduce((a,e)=>Math.hypot(e.x-threatened.x,e.y-threatened.y)<Math.hypot(a.x-threatened.x,a.y-threatened.y)?e:a).id;}
 if((g.type===2||g.type===3)&&Math.hypot(target.x-g.x,target.y-g.y)<95&&(target.type===6||target.type===7)){g.order='defend';g.angle=Math.atan2(target.y-g.y,target.x-g.x);g.tx=g.x;g.ty=g.y;return;}
 g.order='attack';
}
export function battleTick(b,dt=.1){
 if(b.winner!==null)return;b.time+=dt;b.projectiles??=[];const living=b.soldiers.filter(active),groups=b.units,men=groups.map(()=>[]);
 for(const p of living)men[p.g].push(p);
 for(const g of groups){const m=men[g.id];g.alive=m.length;g.morale=m.reduce((n,p)=>n+p.morale,0)/(m.length||1);g.cohesion=m.reduce((n,p)=>{const s=slot(g,p.j,p.n);return n+Math.min(1,Math.hypot(p.x-s.x,p.y-s.y)/35)},0)/(m.length||1);g.cohesion=1-g.cohesion;}
 for(const g of groups){if(!g.alive)continue;const foes=groups.filter(q=>q.side!==g.side&&q.alive),allies=groups.filter(q=>q.side===g.side&&q.alive);if(b.routAt==null&&(g.ai??g.f!==0)&&Math.floor(b.time/1.2)!==Math.floor((b.time-dt)/1.2))ai(b,g,foes,allies);
 const target=groups[g.target];if(!target?.alive&&['attack','flank','distance','pursue'].includes(g.order)&&foes.length){g.target=foes.reduce((a,q)=>Math.hypot(a.x-g.x,a.y-g.y)<Math.hypot(q.x-g.x,q.y-g.y)?a:q).id;}const objective=groups[g.target];if(objective?.alive&&['attack','flank','distance','pursue'].includes(g.order)){let dx=objective.x-g.x,dy=objective.y-g.y,d=Math.hypot(dx,dy)||1,stop=g.order==='distance'?UNIT[g.type][5]*.78:8;g.tx=objective.x-dx/d*stop;g.ty=objective.y-dy/d*stop;if(g.order==='flank'&&d>100){const sign=g.id%2?1:-1;g.tx-=dy/d*95*sign;g.ty+=dx/d*95*sign;}}
 let dx=g.tx-g.x,dy=g.ty-g.y,d=Math.hypot(dx,dy);if(d>3&&!['hold','defend','reserve'].includes(g.order)){const t=tile(b,g.x,g.y),speed=UNIT[g.type][3]*18*(t.water?.42:t.building?.35:t.road?1.10:t.forest?.72:1);if(!Number.isFinite(g.fixedAngle))g.angle=Math.atan2(dy,dx);g.x=clamp(g.x+dx/d*Math.min(d,speed*dt),5,BW-5);g.y=clamp(g.y+dy/d*Math.min(d,speed*dt),5,BH-5);}else if(g.queue?.length)apply(g,g.queue.shift());}
 let grid=gridOf(living);
 for(const p of living){if(!active(p))continue;const g=groups[p.g],u=UNIT[p.type],t=tile(b,p.x,p.y),horse=mounted(p),reach=REACH[p.type],range=ranged(p)?u[5]*(b.weather==='rain'?.75:1):0;let target=b.soldiers[p.target],best=Infinity,panic=0;const search=Math.max(23,range);
 if(target&&active(target)&&target.side!==p.side){best=(p.x-target.x)**2+(p.y-target.y)**2;if(best>search*search){target=null;best=Infinity;}}else target=null;
 if(p.target===undefined||p.target===-1&&b.time<=dt*2||(Math.round(b.time/dt)+p.id)%4===0){grid.visit(p.x,p.y,search,q=>{if(q.side===p.side||!active(q))return;let d=(p.x-q.x)**2+(p.y-q.y)**2;if(d<best&&d<=search*search){best=d;target=q;}});p.target=target?.id??-1;}
 grid.visit(p.x,p.y,20,q=>{if(q.side===p.side&&q.state==='flee'&&(p.x-q.x)**2+(p.y-q.y)**2<400)panic++;});
 const d=Math.sqrt(best),pos=slot(g,p.j,p.n);p.cd-=dt;p.hit=Math.max(0,(p.hit||0)-dt);p.morale=clamp(p.morale-dt*(panic*.012+(1-g.cohesion)*.008)+(g.order==='hold'&&d>50?.003*dt:0),0,1);
 if(p.morale<.23||g.order==='retreat')p.state='flee';
 if(p.state==='flee'){if(target&&d<reach&&p.morale<.12&&!horse){p.state='captured';continue;}p.vx=(p.side?1:-1)*u[3]*29;p.vy=0;p.x+=p.vx*dt;if(p.x<0||p.x>BW)p.state='escaped';continue;}
 let dx=pos.x-p.x,dy=pos.y-p.y,dist=Math.hypot(dx,dy),attack=target&&d<=(range||reach+RADIUS[target.type])&&g.order!=='move'&&g.order!=='reserve'&&(!t.forest||d<(range*.6||20));
 if(attack){p.angle=Math.atan2(target.y-p.y,target.x-p.x);p.target=target.id;p.state=range?'shoot':g.order==='defend'&&p.cd>.35?'block':'fight';
 if(p.cd<=0){p.cd=range?(p.type===5?3.5:2.2):.85+random(b)*.5;const flank=Math.cos(p.angle-target.angle)>.55?1.45:1,damage=.27*u[2]/UNIT[target.type][2]*flank*(1-p.fatigue*.4)*(1+(p.experience||0)*.3)*clamp(1+(t.h-tile(b,target.x,target.y).h)*1.5,.6,1.5);
 if(range){const angle=p.angle+(random(b)-.5)*(.15+(b.weather==='rain'?.12:0));const speed=p.type===5?145:100;b.projectiles.push({x:p.x+Math.cos(angle)*4,y:p.y+Math.sin(angle)*4,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:range/speed+.1,damage,source:p.id,side:p.side,type:p.type});p.ammo--;}
 else{const def=groups[target.g],brace=(target.type===2||target.type===3)&&def.order==='defend'&&Math.cos(target.angle-p.angle)<-.5;if(horse&&brace){injury(b,p,.36+Math.hypot(p.vx||0,p.vy||0)*.012,grid);p.vx*=.1;p.vy*=.1;}else if(random(b)<.82){injury(b,target,damage*(horse?1+Math.hypot(p.vx||0,p.vy||0)*.025:1)*(def.order==='defend'?.75:1),grid);}if(horse){p.vx*=.35;p.vy*=.35;}}
 p.fatigue=clamp(p.fatigue+.018,0,1);}
 dx=dy=dist=0;
 }else{if(target&&d<30&&!range&&!['move','hold','defend','reserve'].includes(g.order)){dx=target.x-p.x;dy=target.y-p.y;dist=d;}p.state=dist>2?'move':'hold';if(dist>2)p.angle=Math.atan2(dy,dx);}
 let speed=u[3]*26*(1-p.fatigue*.45)*(t.water?.43:t.building?.35:t.road?1.12:t.forest?.68:1)*(b.weather==='rain'?.87:1),desired=dist>1?Math.min(speed,dist/dt):0,blend=Math.min(1,dt*(horse?1.7:9));p.vx=(p.vx||0)*(1-blend)+(dist?dx/dist*desired:0)*blend;p.vy=(p.vy||0)*(1-blend)+(dist?dy/dist*desired:0)*blend;p.x=clamp(p.x+p.vx*dt,2,BW-2);p.y=clamp(p.y+p.vy*dt,2,BH-2);p.fatigue=clamp(p.fatigue+(desired>.5?.003:-.008)*dt,0,1);
 }
 // Two position-based collision passes. All soldiers, including enemies, have physical radii.
 for(let pass=0;pass<2;pass++){grid=gridOf(living.filter(active));for(const p of living){if(!active(p))continue;grid.visit(p.x,p.y,8,q=>{if(q.id<=p.id||!active(q))return;let dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy),min=RADIUS[p.type]+RADIUS[q.type];if(d>=min)return;if(d<.001){dx=p.id%2?1:-1;dy=0;d=1;}const push=(min-d)*.5;dx/=d;dy/=d;p.x=clamp(p.x-dx*push,1,BW-1);p.y=clamp(p.y-dy*push,1,BH-1);q.x=clamp(q.x+dx*push,1,BW-1);q.y=clamp(q.y+dy*push,1,BH-1);if(p.side!==q.side){if(mounted(p)&&Math.hypot(p.vx,p.vy)>22){injury(b,q,.15,grid);p.vx*=.5;p.vy*=.5;}if(mounted(q)&&Math.hypot(q.vx,q.vy)>22){injury(b,p,.15,grid);q.vx*=.5;q.vy*=.5;}}});}}
 grid=gridOf(living.filter(active));for(const a of b.projectiles){if(a.life<=0)continue;const steps=Math.max(1,Math.ceil(Math.hypot(a.vx,a.vy)*dt/2));for(let i=0;i<steps&&a.life>0;i++){a.x+=a.vx*dt/steps;a.y+=a.vy*dt/steps;let hit=null;grid.visit(a.x,a.y,4,q=>{if(q.id!==a.source&&active(q)&&Math.hypot(q.x-a.x,q.y-a.y)<RADIUS[q.type]&&!hit)hit=q;});if(hit){injury(b,hit,a.damage,grid);a.life=0;}}a.life-=dt;}b.projectiles=b.projectiles.filter(a=>a.life>0);
 const counts=[0,0];for(const p of living)if(active(p)&&p.state!=='flee')counts[p.side]++;if(b.routAt!=null||!counts[0]||!counts[1]){if(b.routAt==null){b.routAt=b.time;b.routWinner=counts[0]>=counts[1]?0:1;}const win=b.routWinner;for(const g of groups)if(g.side===win&&g.alive&&(g.ai??g.f!==0)){g.order='pursue';const fleeing=groups.filter(q=>q.side!==win&&q.alive);if(fleeing.length)g.target=fleeing.reduce((a,q)=>Math.hypot(a.x-g.x,a.y-g.y)<Math.hypot(q.x-g.x,q.y-g.y)?a:q).id;}if(!living.some(p=>active(p)&&p.side!==win)||b.time-b.routAt>=15)b.winner=win;}else if(b.time>=300)b.winner=counts[0]>=counts[1]?0:1;
}
export function result(b){const sides=[0,1].map(side=>{const m=b.soldiers.filter(p=>p.side===side);return {dead:m.filter(p=>p.state==='dead').length,wounded:m.filter(p=>p.state==='wounded').length,captured:m.filter(p=>p.state==='captured').length,escaped:m.filter(p=>p.state==='escaped'||p.state==='flee').length,survived:m.filter(p=>active(p)&&p.state!=='flee').length,lossByType:Array.from({length:10},(_,type)=>m.filter(p=>p.type===type&&(p.hp<=0||p.state==='captured')).length)};});return {winner:b.armies[b.winner].f,lossA:sides[0].lossByType.reduce((a,b)=>a+b,0),lossB:sides[1].lossByType.reduce((a,b)=>a+b,0),sides};}
