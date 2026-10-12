export const WIDTH=1180,HEIGHT=620,RADIUS=18;
export function advancePosition(player,input,dt,stage,players=[]){
 const q={...player};const dir=Math.max(-1,Math.min(1,Number(input.dir)||0));
 q.coyote=q.ground?.105:Math.max(0,(q.coyote||0)-dt);
 if(input.jump&&!q.jumpHeld&&(q.ground||q.coyote>0)){q.vy=-515;q.y-=2;q.ground=false;q.coyote=0;}
 q.jumpHeld=!!input.jump;
 if(dir)q.face=dir>0?1:-1;
 const rate=dir?(q.ground?1800:1200):(q.ground?2050:390);
 q.vx+=Math.max(-rate*dt,Math.min(rate*dt,dir*255-q.vx));q.vy=Math.min(760,q.vy+1050*dt);
 const i=players.findIndex(p=>p.id===q.id);
 for(const adj of [players[i-1],players[i+1]])if(adj){
  const dx=adj.x-q.x,dy=adj.y-q.y,d=Math.hypot(dx,dy)||1;if(d>170){
   const f=Math.min(1150,(d-170)*6.2)*dt;q.vx+=dx/d*f;q.vy+=dy/d*f;
  }
 }
 q.vx=Math.max(-335,Math.min(335,q.vx));q.vy=Math.max(-850,Math.min(760,q.vy));
 const solids=[...stage.floors,...stage.platforms,...(stage.open?[]:[stage.gate])];
 const hit=s=>q.x+18>s.x&&q.x-18<s.x+s.w&&q.y+18>s.y&&q.y-18<s.y+s.h;
 const ox=q.x,oy=q.y;q.x+=q.vx*dt;
 for(const s of solids)if(hit(s)){if(ox+18<=s.x+4&&q.vx>0){q.x=s.x-18;q.vx=0;}else if(ox-18>=s.x+s.w-4&&q.vx<0){q.x=s.x+s.w+18;q.vx=0;}}
 q.x=Math.max(18,Math.min(1162,q.x));q.y+=q.vy*dt;q.ground=false;
 for(const s of solids)if(hit(s)){if(oy+18<=s.y+6&&q.vy>=0){q.y=s.y-18;q.vy=0;q.ground=true;}
 else if(oy-18>=s.y+s.h-6&&q.vy<0){q.y=s.y+s.h+18;q.vy=0;}
 else if(s.y===0&&s.h>=540){q.x=q.x<s.x+s.w/2?s.x-18:s.x+s.w+18;q.vx=0;}
 else if(q.y<s.y+s.h/2){q.y=s.y-18;q.vy=0;q.ground=true;}
 else{q.y=s.y+s.h+18;q.vy=0;}}
 q.y=Math.max(18,q.y);
 if(q.ground&&stage.springs.some(s=>Math.abs(q.x-s.x)<33&&Math.abs(q.y+18-s.y)<12)){q.vy=-752;q.y-=3;q.ground=false;}
 if(q.y>690){q.x=92+Math.max(0,i)*42;q.y=522;q.vx=0;q.vy=0;q.ground=true;}
 return q;
}
export function predict(player,input,seconds,stage,others=[]){
 let p={...player},rest=Math.min(.16,Math.max(0,seconds));
 while(rest>0){const dt=Math.min(rest,1/90);rest-=dt;p=advancePosition(p,input,dt,stage,others.map(o=>o.id===p.id?p:o));}
 return p;
}
