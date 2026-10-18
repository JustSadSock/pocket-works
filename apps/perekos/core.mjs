// ПЕРЕКОС — deterministic fixed-step combat rules. No DOM, no random Math.random.
export const W=400,H=620,STEP=1/60,ROUND_SECONDS=25;
export const WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];
export const RUNES=[
{id:'fast',name:'Быстрее ноги',desc:'Двигаюсь на 18% быстрее.',kind:'move'},
{id:'heavy',name:'Толстая куртка',desc:'В начале раунда на 28 здоровья больше.',kind:'guard'},
{id:'rapid',name:'Чаще шары',desc:'Шары вылетают на 22% чаще.',kind:'attack'},
{id:'hard',name:'Шар больнее',desc:'Каждый шар наносит на 4 урона больше.',kind:'attack'},
{id:'double',name:'Два шара',desc:'Каждый выстрел выпускает два шара по сторонам.',kind:'attack'},
{id:'bounce',name:'Отскок от стен',desc:'Шары один раз отскакивают от камня.',kind:'attack'},
{id:'drain',name:'Лечение от удара',desc:'Каждый точный шар лечит меня на 3.',kind:'guard'},
{id:'thorns',name:'Трогать больно',desc:'Враг рядом получает 2 урона раз в секунду.',kind:'guard'},
{id:'long',name:'Дальше летит',desc:'Шары летят на 35% дальше.',kind:'attack'},
{id:'shield',name:'Щит крепче',desc:'Мой щит поглощает на 18 урона больше.',kind:'guard'},
{id:'dash',name:'Рывок дальше',desc:'Рывок длится на 40% дольше.',kind:'move'},
{id:'echo',name:'Копия после рывка',desc:'После рывка остаётся копия, которая стреляет.',kind:'move'}
];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mag=(x,y)=>Math.hypot(x,y)||1;
export function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
export function has(a,k){return a.runes.includes(k)}
export function stats(a){return {max:100+(has(a,'heavy')?28:0),speed:125*(has(a,'fast')?1.18:1),damage:12+(has(a,'hard')?4:0),reload:.56*(has(a,'rapid')?.78:1),shield:34+(has(a,'shield')?18:0)}}
function actor(id,x,y,runes){return {id,x,y,vx:0,vy:0,hp:100,shield:0,face:id===0?0:Math.PI,cast:0,guard:0,dash:0,dashReady:0,shieldReady:0,stun:0,flash:0,runes:[...runes],kills:0,hit:0,aiT:0,aiMove:1,invuln:0}}
function freshActor(a){const o=actor(a.id,a.id===0?64:336,a.id===0?484:134,a.runes);o.hp=stats(o).max;return o}
export function makeMatch(seed=0x718abc){const s={version:1,seed:seed>>>0||1,phase:'fight',round:1,remaining:ROUND_SECONDS,overtime:0,score:[0,0],actors:[actor(0,64,484,['fast','rapid']),actor(1,336,134,['heavy','hard'])],shots:[],echoes:[],fx:[],pick:[],log:[],ticks:0,serial:0,champion:null};s.actors=s.actors.map(freshActor);return s}
export function offers(s){const owned=s.actors[0].runes;const pool=RUNES.filter(r=>!owned.includes(r.id));const out=[];while(out.length<Math.min(3,pool.length)){const i=Math.floor(random(s)*pool.length);out.push(pool.splice(i,1)[0].id)}return out}
export function chooseRune(s,id){if(s.phase!=='draft'||!s.pick.includes(id))return false;const a=s.actors[0];if(a.runes.length===5)a.runes.shift();a.runes.push(id);const bot=s.actors[1];const available=RUNES.filter(r=>!bot.runes.includes(r.id));if(available.length){if(bot.runes.length===5)bot.runes.shift();bot.runes.push(available[Math.floor(random(s)*available.length)].id)}startRound(s);return true}
export function startRound(s){s.phase='fight';s.round=s.score[0]+s.score[1]+1;s.remaining=ROUND_SECONDS;s.overtime=0;s.actors=s.actors.map(freshActor);s.shots=[];s.echoes=[];s.pick=[];s.fx=[];s.ticks=0}
export function retryMatch(s){return makeMatch((s.seed+0x9e3779b9)>>>0)}
export function distWall(x,y,r=0){return WALLS.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h)}
export function canStand(x,y,r=12){return x>=r+13&&x<=W-r-13&&y>=r+16&&y<=H-r-16&&!distWall(x,y,r)}
function move(a,x,y,r=12){const nx=clamp(a.x+x,r+13,W-r-13),ny=clamp(a.y+y,r+16,H-r-16);if(canStand(nx,a.y,r))a.x=nx;if(canStand(a.x,ny,r))a.y=ny}
function fx(s,k,x,y,t=0){if(s.fx.length>60)s.fx.shift();s.fx.push({k,x,y,t,id:++s.serial})}
function harm(s,a,amount,from){if(a.invuln>0||a.hp<=0)return 0;const blocked=Math.min(a.shield,amount);a.shield-=blocked;const d=Math.max(0,amount-blocked);a.hp=Math.max(0,a.hp-d);a.flash=.15;if(d>0&&from!=null)s.actors[from].hit+=d;fx(s,'hit',a.x,a.y);return d}
function spawnShot(s,a,dir,x=a.x,y=a.y,copy=false){const st=stats(a),v=252;const angle=dir+(copy?0:0);s.shots.push({x,y,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,owner:a.id,damage:copy?6:st.damage,life:(has(a,'long')?1.6:1.15),bounces:has(a,'bounce')?1:0,r:copy?4:5});fx(s,'shoot',x,y)}
function attack(s,a,target){if(a.cast>0||a.stun>0)return false;a.face=Math.atan2(target.y-a.y,target.x-a.x);a.cast=stats(a).reload;const count=has(a,'double')?2:1;for(let i=0;i<count;i++)spawnShot(s,a,a.face+(count===2?(i?0.12:-0.12):0));return true}
function guard(s,a){if(a.shieldReady>0||a.stun>0)return false;a.shield=Math.min(80,a.shield+stats(a).shield);a.shieldReady=5;fx(s,'shield',a.x,a.y);return true}
function dash(s,a,dir){if(a.dashReady>0||a.stun>0)return false;const m=mag(dir.x,dir.y);a.vx=dir.x/m*370;a.vy=dir.y/m*370;a.dash=has(a,'dash')?.24:.17;a.dashReady=2.5;a.invuln=.13;fx(s,'dash',a.x,a.y);if(has(a,'echo'))s.echoes.push({owner:a.id,x:a.x,y:a.y,life:2.4,cast:.25});return true}
function botInput(s,dt){const b=s.actors[1],p=s.actors[0];const dx=p.x-b.x,dy=p.y-b.y,d=mag(dx,dy);b.aiT-=dt;if(b.aiT<=0){b.aiT=.5+random(s)*.55;b.aiMove=random(s)<.5?-1:1}const sideX=-dy/d*b.aiMove,sideY=dx/d*b.aiMove;let toward=d>200?1:d<110?-1:0;let x=dx/d*toward+sideX*.8,y=dy/d*toward+sideY*.8;
for(const shot of s.shots){if(shot.owner===1)continue;const rx=b.x-shot.x,ry=b.y-shot.y;const t=clamp((rx*shot.vx+ry*shot.vy)/(shot.vx**2+shot.vy**2),0,.4);if(Math.hypot(rx-shot.vx*t,ry-shot.vy*t)<27){x=-shot.vy/252*1.7;y=shot.vx/252*1.7;if(b.dashReady<=0&&t<.2&&random(s)<.025)dash(s,b,{x,y});if(b.shieldReady<=0&&b.hp<65)guard(s,b);break}}
if(d<260&&random(s)<.035)attack(s,b,p);
if(b.shieldReady<=0&&b.hp<55&&random(s)<.009)guard(s,b);
return {x,y,attack:false,shield:false,dash:false,aim:{x:p.x,y:p.y}}}
export function tick(s,input={},dt=STEP){if(s.phase!=='fight')return s;dt=STEP;s.ticks++;s.remaining=Math.max(0,s.remaining-dt);
const control=[input,botInput(s,dt)];
for(let i=0;i<2;i++){const a=s.actors[i],c=control[i],other=s.actors[1-i];a.cast=Math.max(0,a.cast-dt);a.shieldReady=Math.max(0,a.shieldReady-dt);a.dashReady=Math.max(0,a.dashReady-dt);a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.invuln=Math.max(0,a.invuln-dt);
if(a.dash>0){move(a,a.vx*dt,a.vy*dt);a.dash=Math.max(0,a.dash-dt)}
else{let x=Number(c.x)||0,y=Number(c.y)||0,m=mag(x,y);if(m>1){x/=m;y/=m}move(a,x*stats(a).speed*dt,y*stats(a).speed*dt)}
if(c.aim&&Number.isFinite(c.aim.x)&&Number.isFinite(c.aim.y))a.face=Math.atan2(c.aim.y-a.y,c.aim.x-a.x);
if(c.dash)dash(s,a,{x:Number(c.x)||Math.cos(a.face),y:Number(c.y)||Math.sin(a.face)});
if(c.shield)guard(s,a);
if(c.attack)attack(s,a,c.aim||other);
if(has(a,'thorns')&&s.ticks%60===0&&Math.hypot(other.x-a.x,other.y-a.y)<64)harm(s,other,2,i)}
for(let j=s.shots.length-1;j>=0;j--){const q=s.shots[j],a=s.actors[1-q.owner];const nx=q.x+q.vx*dt,ny=q.y+q.vy*dt;q.life-=dt;
if(Math.hypot(nx-a.x,ny-a.y)<17){const dealt=harm(s,a,q.damage,q.owner);if(dealt&&has(s.actors[q.owner],'drain')){const owner=s.actors[q.owner];owner.hp=Math.min(stats(owner).max,owner.hp+3);fx(s,'heal',owner.x,owner.y)}s.shots.splice(j,1);continue}
const wall=distWall(nx,ny,5),edge=nx<19||nx>W-19||ny<21||ny>H-21;
if(wall||edge){if(q.bounces>0){q.bounces--;const wallX=distWall(nx,q.y,5)||nx<19||nx>W-19;if(wallX)q.vx*=-1;else q.vy*=-1;q.x+=q.vx*dt;q.y+=q.vy*dt;fx(s,'spark',q.x,q.y)}else{s.shots.splice(j,1);fx(s,'spark',q.x,q.y)}continue}
if(q.life<=0){s.shots.splice(j,1);continue}q.x=nx;q.y=ny}
for(let j=s.echoes.length-1;j>=0;j--){const e=s.echoes[j];e.life-=dt;e.cast-=dt;const source=s.actors[e.owner];if(e.cast<=0){e.cast=.76;const target=s.actors[1-e.owner];spawnShot(s,source,Math.atan2(target.y-e.y,target.x-e.x),e.x,e.y,true)}if(e.life<=0)s.echoes.splice(j,1)}
s.fx.forEach(f=>f.t+=dt);s.fx=s.fx.filter(f=>f.t<.38);
if(s.actors.some(a=>a.hp<=0)||s.remaining<=0){const [a,b]=s.actors;let winner;
if(a.hp<=0&&b.hp<=0)winner=a.hit>=b.hit?0:1;
else if(a.hp<=0)winner=1;else if(b.hp<=0)winner=0;
else if(Math.abs(a.hp/stats(a).max-b.hp/stats(b).max)>.001)winner=a.hp/stats(a).max>b.hp/stats(b).max?0:1;
else if(s.overtime<1){s.overtime=1;s.remaining=8;fx(s,'overtime',200,310);return s}
else winner=a.hit>=b.hit?0:1;
s.score[winner]++;s.lastWinner=winner;
if(s.score[winner]>=4){s.phase='result';s.champion=winner}
else{s.phase='draft';s.pick=offers(s)}
}
return s}
export function validState(s){return !!s&&s.version===1&&['fight','draft','result'].includes(s.phase)&&Array.isArray(s.actors)&&s.actors.length===2&&s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)&&Array.isArray(a.runes)&&a.runes.length<=5)&&Array.isArray(s.score)&&s.score.every(n=>Number.isInteger(n)&&n>=0&&n<=4)}
