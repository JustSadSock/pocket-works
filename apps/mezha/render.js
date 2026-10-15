/* Hand-authored procedural 16-bit pixel field. Pixel-grid geometry, no stock sprites. */
import {W,H,WORLD_SCALE,SITE_DEFS,clamp,PALETTES,distance} from './engine.js';
const NATIVE_W=960,NATIVE_H=620;
const cv=document.createElement('canvas');cv.width=NATIVE_W;cv.height=NATIVE_H;
const stage=document.createElement('canvas');
const pen=cv.getContext('2d');pen.imageSmoothingEnabled=false;
const TAU=Math.PI*2;
const grass=['#718b58','#778e5d','#6e8556','#819466','#657f53'];
const seedRand=n=>{let t=n|0;return()=>{t=(Math.imul(t,1664525)+1013904223)|0;return(t>>>0)/4294967296}};
const rand=seedRand(3045);
const pix=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
function poly(c,points,color){
 const min=Math.floor(Math.min(...points.map(p=>p[1]))),max=Math.ceil(Math.max(...points.map(p=>p[1])));
 for(let y=min;y<max;y++){const cuts=[];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];
   if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))cuts.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  cuts.sort((a,b)=>a-b);for(let i=0;i+1<cuts.length;i+=2){const x=Math.ceil(cuts[i]),end=Math.ceil(cuts[i+1]);if(end>x)pix(c,x,y,end-x,1,color)}
 }
}
function circle(c,x,y,r,color){for(let j=-Math.ceil(r);j<=r;j++){const w=Math.floor(Math.sqrt(Math.max(0,r*r-j*j)));pix(c,x-w,y+j,2*w+1,1,color)}}
function ring(c,x,y,r,color){const outer=Math.ceil(r),inner=r-2;for(let j=-outer;j<=outer;j++){
 const a=Math.floor(Math.sqrt(Math.max(0,r*r-j*j))),b=Math.floor(Math.sqrt(Math.max(0,inner*inner-j*j)));
 if(Math.abs(j)>inner)pix(c,x-a,y+j,2*a+1,1,color);else{pix(c,x-a,y+j,Math.max(1,a-b),1,color);pix(c,x+b+1,y+j,Math.max(1,a-b),1,color)}
}}
function riverX(y){return 480+Math.sin(y/82)*15+Math.sin(y/29)*5}
function path(c,pts,width,color){for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(d*1.35));
 for(let k=0;k<=steps;k++){const t=k/steps;pix(c,a[0]+(b[0]-a[0])*t-width/2,a[1]+(b[1]-a[1])*t-width/2,width,width,color)}
}}
function tree(c,x,y,z=1,shade=0){
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(1,1);
 pix(c,-4,1,8,12,'#594f36');pix(c,-3,2,5,6,'#8b7151');
 circle(c,4,0,13,'#344d3b');circle(c,-6,-5,14,'#3a5e43');circle(c,4,-12,13,'#496c4b');
 pix(c,-13,-11,12,8,'#547650');pix(c,-4,-19,13,7,'#628258');pix(c,5,-8,9,5,'#66875c');
 pix(c,-11,-11,3,3,'#80976a');pix(c,1,-19,3,3,'#94a576');pix(c,10,-5,3,3,'#849c6d');
 c.restore();
}
function pine(c,x,y){
 pix(c,x-2,y+1,5,10,'#594932');
 poly(c,[[x-13,y],[x,y-35],[x+12,y]],'#365943');
 poly(c,[[x-12,y-10],[x,y-41],[x+10,y-10]],'#46714f');
 poly(c,[[x-8,y-24],[x,y-47],[x+9,y-24]],'#62825a');
 pix(c,x-5,y-30,5,3,'#77956a');
}
function makeGround(){
 pix(pen,0,0,W,H,'#748c5c');
 for(let y=0;y<NATIVE_H;y+=11)for(let x=0;x<NATIVE_W;x+=11){const jitter=rand();pix(pen,x+(rand()-.5)*6,y+(rand()-.5)*5,10+rand()*9,8+rand()*8,grass[Math.floor(jitter*grass.length)])}
 for(let i=0;i<9500;i++){
   const x=rand()*NATIVE_W,y=rand()*NATIVE_H,v=rand();
   pix(pen,x,y,1+Math.floor(rand()*3),1,v>.7?'#9cae75':v>.28?'#617e52':'#8c9c6a');
 }
 // Cart tracks and river banks. World paths are real terrain, not overlays.
 path(pen,[[110,310],[214,284],[355,304],[478,309],[602,304],[744,294],[850,310]],21,'#627553');
 path(pen,[[110,310],[214,284],[355,304],[478,309],[602,304],[744,294],[850,310]],14,'#bbab79');
 path(pen,[[110,310],[214,284],[355,304],[478,309],[602,304],[744,294],[850,310]],4,'#d0bd8b');
 for(const point of SITE_DEFS){const site={...point,x:point.x/WORLD_SCALE,y:point.y/WORLD_SCALE};
  path(pen,[[site.x,site.y],[site.x+(480-site.x)*.18,site.y+(310-site.y)*.7],[480,310]],9,'#ac9c72');
  path(pen,[[site.x,site.y],[site.x+(480-site.x)*.18,site.y+(310-site.y)*.7],[480,310]],3,'#c0af81');
 }
 const left=[],right=[];
 for(let y=-12;y<=NATIVE_H+12;y+=5){let x=riverX(y);left.push([x-24,y]);right.push([x+24,y])}
 poly(pen,[...left,...right.reverse()],'#536e6c');
 const inside=left.map(([x,y])=>[x+5,y]).concat(right.reverse().map(([x,y])=>[x-5,y]).reverse());
 poly(pen,inside,'#58878a');
 for(let y=1;y<NATIVE_H;y+=13){const x=riverX(y);pix(pen,x-16+rand()*8,y,10+rand()*16,2,'#80a9a1');pix(pen,x-7+rand()*7,y+5,7,2,'#64989b')}
 for(let y=15;y<NATIVE_H;y+=27){const x=riverX(y);pix(pen,x-31,y,4,7,'#8da07b');pix(pen,x+26,y,5,9,'#93a57c')}
 // Two ford crossings; central bridge is capturable, southern crossing flanks.
 for(const y of [308,515]){
  pix(pen,riverX(y)-32,y-13,64,29,'#514c40');pix(pen,riverX(y)-34,y-16,68,7,'#a49b80');
  for(let i=-28;i<29;i+=11)for(let j=-6;j<14;j+=9){
   pix(pen,riverX(y)+i+(j===3?3:0),y+j,9,7,(i+j)%3===0?'#beb293':'#968b70');
  }
  pix(pen,riverX(y)-36,y-17,5,35,'#676050');pix(pen,riverX(y)+30,y-17,5,35,'#676050');
 }
 // Forest groves strategically screen lanes.
 const groves=[[118,100,92,68],[312,82,75,68],[215,505,98,62],[344,416,65,75],[620,70,86,65],[770,98,76,65],[666,466,64,95],[844,498,75,63],[104,490,75,55],[630,230,35,34],[361,236,35,34]];
 for(const [cx,cy,rx,ry] of groves){
  for(let i=0;i<25;i++){
   const a=rand()*TAU,d=Math.sqrt(rand());
   const x=cx+Math.cos(a)*rx*d,y=cy+Math.sin(a)*ry*d;
   if(x<30||x>NATIVE_W-30||y<36||y>NATIVE_H-40||Math.abs(x-riverX(y))<50||SITE_DEFS.some(z=>Math.hypot(x-z.x/WORLD_SCALE,y-z.y/WORLD_SCALE)<52))continue;
   if(rand()>.7)pine(pen,x,y);else tree(pen,x,y,.72+rand()*.42);
  }
 }
 for(let i=0;i<200;i++){
  const x=rand()*NATIVE_W,y=rand()*NATIVE_H;
  if(Math.abs(x-riverX(y))<40||SITE_DEFS.some(z=>Math.hypot(x-z.x/WORLD_SCALE,y-z.y/WORLD_SCALE)<31))continue;
  if(rand()<.35){pix(pen,x,y,6,3,'#a9a07b');pix(pen,x+2,y-2,4,2,'#d0c5a0')}
  else{pix(pen,x,y,2,6,'#52764a');pix(pen,x+3,y-2,2,6,'#91a45d')}
 }
 // Farm furrows; each settlement has individual grounds.
 for(const point of SITE_DEFS.filter(z=>z.type==='farm')){const z={...point,x:point.x/WORLD_SCALE,y:point.y/WORLD_SCALE};
  pix(pen,z.x-48,z.y+26,96,34,'#a28b5e');
  for(let y=z.y+30;y<z.y+56;y+=7){pix(pen,z.x-44,y,87,2,'#c9b47a');for(let x=z.x-42;x<z.x+43;x+=11)pix(pen,x,y-3,3,5,'#d1bf6a')}
 }
}
makeGround();
function shadow(c,x,y,w=36,h=12){for(let j=-Math.ceil(h);j<=h;j++){const dx=Math.floor(w*Math.sqrt(Math.max(0,1-j*j/(h*h))));pix(c,x-dx,y+j,dx*2+1,1,'#243a3566')}}
function flag(c,x,y,color,wave=0){
 pix(c,x-1,y-27,3,31,'#44392d');pix(c,x-2,y-29,5,4,'#dfcf9b');
 const vx=Math.round(Math.sin(wave)*2);
 poly(c,[[x+2,y-27],[x+19+vx,y-23],[x+17+vx,y-16],[x+2,y-18]],color);
 pix(c,x+4,y-24,8,2,'#e9dbc9');
}
function keep(c,x,y,side,health,t){
 shadow(c,x,y+35,56,19);
 // Stone-wall envelope, turret shade, shaded base.
 pix(c,x-49,y-8,98,43,'#544d47');pix(c,x-44,y-17,88,44,'#9e9781');pix(c,x-39,y-11,78,34,'#b3aa90');
 for(let i=-43;i<44;i+=14){pix(c,x+i,y-23,9,8,'#ccc2a1');pix(c,x+i,y-5,8,2,'#7c796b')}
 // Castle towers: shadow then faceted roofs.
 for(const dx of [-39,39]){
  pix(c,x+dx-14,y-28,28,47,'#686355');pix(c,x+dx-11,y-31,22,46,'#a9a089');
  poly(c,[[x+dx-19,y-30],[x+dx,y-51],[x+dx+20,y-30]],side===0?'#8c563c':'#4e7582');
  pix(c,x+dx-5,y-22,10,12,'#525955');pix(c,x+dx-4,y-20,8,9,'#313b3d');
  for(let b=-10;b<=10;b+=10)pix(c,x+dx+b-3,y-36,5,6,'#d7c9a7');
 }
 // Main hall and gate
 pix(c,x-27,y-41,54,56,'#bbb49b');pix(c,x-21,y-35,43,48,'#ddd0ad');
 poly(c,[[x-35,y-39],[x,y-72],[x+34,y-39]],side===0?'#915940':'#446d7f');
 pix(c,x-25,y-44,52,4,'#4d453c');pix(c,x-7,y-13,14,30,'#524a3a');pix(c,x-5,y-8,10,24,'#302e2a');
 for(const xx of [-18,15]){pix(c,x+xx-4,y-29,8,11,'#636f69');pix(c,x+xx-3,y-28,6,9,'#3f5556')}
 flag(c,x+2,y-65,side===0?'#e7b16f':'#7fb0bf',t*3);
 if(health<240){pix(c,x+16,y-24,17,4,'#56504b');pix(c,x-35,y+4,7,8,'#746854')}
 // health bar only when damaged
 if(health<479){pix(c,x-44,y-81,88,6,'#312c27');pix(c,x-43,y-80,86*health/480,4,side===0?'#e6bb79':'#80c2cb')}
}
function buildings(c,z,t){
 const x=Math.round(z.x),y=Math.round(z.y),owner=z.owner,paint=owner===0?'#c18d5e':owner===1?'#648d9b':'#988f79';
 shadow(c,x,y+14,35,13);
 if(z.type==='bridge'){
  pix(c,x-21,y-19,42,9,'#b9b094');pix(c,x-15,y-24,7,13,'#766d56');pix(c,x+9,y-24,7,13,'#766d56');
  pix(c,x-13,y-33,26,8,'#cfbe9e');pix(c,x-8,y-37,16,4,'#746c5b');
 }else if(z.type==='mine'){
  pix(c,x-27,y-10,58,28,'#797064');pix(c,x-18,y-15,40,25,'#a3997d');
  poly(c,[[x-30,y-13],[x,y-36],[x+34,y-13]],'#716555');
  pix(c,x-9,y-7,21,22,'#363634');pix(c,x-3,y-2,10,15,'#262929');
  pix(c,x-34,y+12,15,8,'#ccc09a');pix(c,x+26,y+6,12,10,'#a29a85');
 }else if(z.type==='wood'){
  pix(c,x-22,y-13,44,32,'#72604a');pix(c,x-18,y-10,36,23,'#9d7955');
  poly(c,[[x-26,y-12],[x,y-34],[x+26,y-12]],paint);
  for(let i=0;i<4;i++)pix(c,x-39+i*11,y+16,9,6,'#805e3f');
  pix(c,x+26,y+10,22,5,'#be9164');pix(c,x+26,y+16,22,5,'#7a553b');
 }else{
  pix(c,x-25,y-12,51,33,'#9b845e');pix(c,x-21,y-11,42,26,'#d6bc86');
  poly(c,[[x-30,y-12],[x,y-39],[x+30,y-12]],paint);
  for(let i=-22;i<26;i+=9)pix(c,x+i,y-13-Math.round((29-Math.abs(i))*.64),7,3,'#f0d3a2');
  pix(c,x-5,y,12,20,'#65513e');pix(c,x+12,y-4,7,9,'#807b62');
  pix(c,x-38,y+18,16,7,'#9d7954');pix(c,x-35,y+13,11,5,'#e1c081');
 }
 if(owner>=0)flag(c,x+17,y-18,owner===0?'#e9bd77':'#84becf',t*2+x);
 if(z.raided>0){
  // Scattered burning supplies identify an actual economic raid.
  pix(c,x-31,y+18,7,5,'#80523b');
  pix(c,x-29,y+13,4,6,'#e9a858');
  pix(c,x-28,y+8,3,5,'#f6d38a');
  pix(c,x-21,y+6,4,4,'#5b6054');
 }
 if(z.fort>0){
  const bx=x+43,by=y-3;
  pix(c,bx-13,by-17,26,36,'#77725e');pix(c,bx-10,by-18,20,33,'#c8bba0');
  for(let i=-10;i<=10;i+=10)pix(c,bx+i-3,by-25,7,9,'#e4d4ad');
  pix(c,bx-5,by-9,10,11,'#48504a');
  if(z.fort>1)poly(c,[[bx-17,by-23],[bx,by-40],[bx+16,by-23]],paint);
 }
 // contested settlement progress at ground level
 if(z.capture>1){pix(c,x-24,y+31,48,6,'#453e35');pix(c,x-23,y+32,z.capture*.46,4,z.attacker===0?'#ebbb6b':'#80bec9')}
}
function miniPerson(c,x,y,side,kind,phase,hit=false){
 const sx=Math.round(x),sy=Math.round(y);
 const blue=side===0?'#bd8152':'#5e8596',light=side===0?'#e6bd75':'#8dc1c8';
 const stride=Math.sin(phase)>0?1:-1;
 pix(c,sx-3,sy+8,10,3,'#31473d');
 pix(c,sx-3+stride,sy+3,3,6,'#3b3b37');pix(c,sx+3-stride,sy+3,3,6,'#343b3c');
 pix(c,sx-4,sy-6,11,12,hit?'#f5dbad':blue);
 pix(c,sx-4,sy+2,11,3,'#393c38');pix(c,sx-2,sy-8,8,5,'#ebcfa3');
 pix(c,sx-2,sy-12,8,4,kind==='knight'?'#8d918d':'#5a5b47');
 if(kind==='knight'){
  pix(c,sx-5,sy-12,14,3,'#d6d5b5');pix(c,sx-6,sy-3,5,9,'#b0a892');pix(c,sx+8,sy-6,2,15,'#8f8c7c');pix(c,sx+6,sy-7,6,2,'#dfd1ab');
 }else if(kind==='bow'){
  pix(c,sx-6,sy-14,11,3,'#5d7047');pix(c,sx+6,sy-11,2,17,'#b59a6e');
  pix(c,sx+7,sy-10,3,3,'#d9c99a');pix(c,sx+7,sy+3,3,3,'#d9c99a');
 }else{pix(c,sx+8,sy-14,2,23,'#b9a17a');pix(c,sx+7,sy-15,4,5,'#d7d7ba')}
 pix(c,sx-3,sy-5,3,3,light);
}
function squad(c,u,t,selected){
 const n=Math.max(1,Math.ceil((u.hp/u.maxHp)*6));
 const swing=u.walk*1.8+t*.12;
 const profile=u.side===0?1:-1;
 if(selected)ring(c,u.x,u.y,28,'#ffe5a3')
 for(let i=0;i<n;i++){
  const col=i%3,row=Math.floor(i/3),dx=(col-1)*12*profile,dy=(row-.5)*12;
  miniPerson(c,u.x+dx,u.y+dy,u.side,u.type,swing+i*2.3,u.hit>0);
 }
 const captain=iCaptain(u.captain);
 if(u.id===captain.leadId){ /* leader is drawn as a command pennant below */ }
 // Small command pennant identifies squads without obscuring miniature soldiers.
 pix(c,u.x-2,u.y-25,2,14,'#4a4639');
 poly(c,[[u.x,u.y-24],[u.x+10*profile,u.y-21],[u.x,u.y-16]],u.side===0?'#f4cc80':'#9bd1db');
 if(u.hp<u.maxHp*.8){pix(c,u.x-15,u.y+22,30,4,'#413e32');pix(c,u.x-15,u.y+22,30*u.hp/u.maxHp,3,u.side===0?'#e7ad69':'#7dbac6')}
}
function iCaptain(id){return{leadId:id===0?1:id===1?3:id===2?5:7}}
function aimArrow(c,from,to,color,time,dashed=true){
 const d=Math.hypot(to.x-from.x,to.y-from.y);if(d<2)return;
 const vx=(to.x-from.x)/d,vy=(to.y-from.y)/d;
 for(let n=0;n<d-12;n+=11)path(c,[[from.x+vx*n,from.y+vy*n],[from.x+vx*Math.min(n+5,d-12),from.y+vy*Math.min(n+5,d-12)]],2,color);
 poly(c,[[to.x,to.y],[to.x-vx*11-vy*5,to.y-vy*11+vx*5],[to.x-vx*11+vy*5,to.y-vy*11-vx*5]],color);
}
export function renderBattle(out,s,view,ui,t){
 // A single native pixel grid for ground, buildings, soldiers and combat.
 const vw=Math.max(1,Math.round(view.w/WORLD_SCALE)),vh=Math.max(1,Math.round(view.h/WORLD_SCALE));
 if(stage.width!==vw)stage.width=vw;
 if(stage.height!==vh)stage.height=vh;
 const ctx=stage.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#314c48';ctx.fillRect(0,0,vw,vh);
 const sites=s.sites.map(z=>({...z,x:z.x/WORLD_SCALE,y:z.y/WORLD_SCALE}));
 const troops=s.squads.map(u=>({...u,x:u.x/WORLD_SCALE,y:u.y/WORLD_SCALE}));
 const ordersAll=s.orders.map(o=>({...o,x:o.x/WORLD_SCALE,y:o.y/WORLD_SCALE}));
 const events=s.events.map(e=>({...e,x:e.x/WORLD_SCALE,y:e.y/WORLD_SCALE}));
 ctx.save();ctx.translate(-Math.round(view.x/WORLD_SCALE),-Math.round(view.y/WORLD_SCALE));
 ctx.drawImage(cv,0,0);
 for(const z of sites){
  // Site catchment is only shown for active order or selected site, not blanket rings.
  if(ui.site===z.id){circle(ctx,z.x,z.y,50,'#e2d5a331');ring(ctx,z.x,z.y,50,'#eddfb2')}
  buildings(ctx,z,t);
 }
 keep(ctx,110,310,0,s.players[0].base,t);keep(ctx,850,310,1,s.players[1].base,t);
 const orders=ordersAll.filter(o=>o.side===0);
 for(const o of orders){
  const groups=troops.filter(u=>u.captain===o.id),cx=groups.length?groups.reduce((n,u)=>n+u.x,0)/groups.length:110,cy=groups.length?groups.reduce((n,u)=>n+u.y,0)/groups.length:310;
  aimArrow(ctx,{x:cx,y:cy},{x:o.x,y:o.y},o.id===ui.captain?'#f7d792':'#dbc892',t);
  const hover=Math.sin(t*2+o.id)*2;
  flag(ctx,o.x,o.y+hover,o.mode==='raid'?'#d87f66':o.mode==='defend'?'#7ebca0':'#f1c87f',t*3);

 }
 // Enemy standards become legible only when a friendly patrol can see
 // the destination. This makes enemy manoeuvres readable, not omniscient.
 for(const o of ordersAll.filter(o=>o.side===1)){
  if(!(o.changed>0))continue;
  const spot={x:o.x,y:o.y};
  const sighted=troops.some(u=>u.side===0&&u.hp>0&&distance(u,spot)<130);
  if(!sighted)continue;
  const shade=o.mode==='raid'?'#bf8a80':o.mode==='defend'?'#86bba7':'#8bbfc5';
  flag(ctx,o.x+3,o.y,shade,t*3+o.id);
  pix(ctx,o.x-12,o.y+6,26,3,'#25373b');
  pix(ctx,o.x-10,o.y+7,22,1,'#9ec8cb');
 }
 const leader=troops.find(u=>u.side===0&&u.captain===ui.captain)?.id;
 for(const u of [...troops].sort((a,b)=>a.y-b.y))squad(ctx,u,t,u.id===leader);
 for(const e of events){
  const v=1-e.age/.75;
  if(e.type==='impact'){
   pix(ctx,e.x-3,e.y-18-(1-v)*9,6,7,e.side===0?'#ffe6a6':'#b6e4eb');
   pix(ctx,e.x-8,e.y-12-(1-v)*8,3,3,'#f6d3a1');
  }else if(e.type==='capture'){ring(ctx,e.x,e.y,54+(1-v)*26,e.side===0?'#f3dc94':'#a5d7e2')}
  else if(e.type==='fall'){pix(ctx,e.x-8,e.y,14,4,'#a76353')}
 }
 ctx.restore();
 out.imageSmoothingEnabled=false;
 out.fillStyle='#263d3a';out.fillRect(0,0,out.canvas.width,out.canvas.height);
 out.drawImage(stage,0,0,out.canvas.width,out.canvas.height);
}
export function renderMinimap(canvas,s,view){
 const c=canvas.getContext('2d');canvas.width=168;canvas.height=108;c.imageSmoothingEnabled=false;
 c.drawImage(cv,0,0,168,108);
 c.fillStyle='#1d302a73';c.fillRect(0,0,168,108);
 for(const z of s.sites){
  c.fillStyle=z.owner<0?'#e0ceb0':PALETTES[z.owner];c.fillRect(z.x/W*168-2,z.y/H*108-2,5,5);
 }
 for(const u of s.squads){c.fillStyle=PALETTES[u.side];c.fillRect(u.x/W*168-1,u.y/H*108-1,2,2)}
 c.strokeStyle='#f9eac5';c.lineWidth=1;c.strokeRect(view.x/W*168,view.y/H*108,view.w/W*168,view.h/H*108);
}
export function nearestSite(s,x,y,max=58*WORLD_SCALE){let best=null,b=max;for(const site of s.sites){const d=Math.hypot(site.x-x,site.y-y);if(d<b){best=site;b=d}}return best}

export function renderUnitPortrait(canvas,type,side=0){
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 c.clearRect(0,0,canvas.width,canvas.height);
 const x=Math.round(canvas.width/2)-2,y=Math.round(canvas.height*.57);
 miniPerson(c,x,y,side,type,1.1,false);
}
