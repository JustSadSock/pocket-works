import {advancePosition} from './engine.js';
const S=[
 ['Все на места','Каждому — своя цветная кнопка',350,400,[[0,540,1180,80]],[],[],[],'plates'],
 ['Через край','Перепрыгните разрыв',685,280,[[0,540,442,80],[554,540,626,80]],[],[],[],'gap'],
 ['Выше головы','Пружины подбросят к искрам',730,260,[[0,540,1180,80]],[[470,420,130,18],[790,409,105,18]],[340,700],[[404,302],[758,290]],'stars'],
 ['До предела','Растяните резинку',345,435,[[0,540,1180,80]],[],[],[],'stretch'],
 ['Не расцепиться','Через островки к искрам',755,220,[[0,540,314,80],[410,540,210,80],[712,540,468,80]],[[350,442,73,18],[653,431,75,18]],[269,567],[[464,330],[760,306]],'islands'],
 ['Последний рывок','Искры, натяжение, выход',674,304,[[0,540,446,80],[561,540,619,80]],[[470,410,112,18],[745,404,105,18]],[335],[[394,304],[660,311]],'finale']
];
export function stageAt(level,n=2){
 const a=S[level],spread=n===2?Math.min(244,a[3]):a[3],rect=x=>({x:x[0],y:x[1],w:x[2],h:x[3]});
 return {index:level,name:a[0],hint:a[1],kind:a[8],theme:level,
 floors:a[4].map(rect),platforms:a[5].map(rect),springs:a[6].map(x=>({x,y:540})),stars:a[7].map(([x,y])=>({x,y})),
 pads:Array.from({length:n},(_,i)=>({x:a[2]+spread*i/(n-1),y:540})),
 stretch:a[8]==='stretch'?spread-24:a[8]==='finale'?spread-40:0,gate:{x:1036,y:0,w:31,h:540},finishX:1102};
}
export function newLocal(level=0){
 const stage=stageAt(level);
 return {level,stage,players:[{id:'local-0',name:'Розовый'},{id:'local-1',name:'Голубой'}].map((p,i)=>({...p,x:92+i*42,y:522,vx:0,vy:0,ground:true,face:1,jumpHeld:false,falls:0})),
 pads:[false,false],stars:stage.stars.map(()=>false),stretch:0,stretched:false,gateOpen:false,clock:0,finished:false,revision:0};
}
export function tickLocal(w,inputs,delta){
 let t=Math.min(.1,Math.max(0,delta));
 while(t>0&&!w.finished){
  const dt=Math.min(1/90,t);t-=dt;w.clock+=dt;w.stage.open=w.gateOpen;
  const players=w.players;
  w.players=players.map((p,i)=>advancePosition(p,inputs[i]||{},dt,w.stage,players));
  for(let i=0;i<w.players.length-1;i++){
   const p=w.players[i],q=w.players[i+1],dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;
   if(d<33){const f=(33-d)*.5;p.x-=dx/d*f;q.x+=dx/d*f;}
  }
  w.pads=w.stage.pads.map(b=>w.players.some(p=>p.ground&&Math.abs(p.x-b.x)<31&&Math.abs(p.y+18-b.y)<12));
  w.stage.stars.forEach((s,i)=>{if(w.players.some(p=>Math.hypot(p.x-s.x,p.y-s.y)<38))w.stars[i]=true;});
  if(w.stage.stretch&&!w.stretched){
   const spread=Math.max(...w.players.map(p=>p.x))-Math.min(...w.players.map(p=>p.x));
   const valid=spread>=w.stage.stretch&&w.players.every(p=>p.ground);
   w.stretch=Math.max(0,Math.min(1,w.stretch+(valid?dt*1.9:-dt*.55)));
   if(w.stretch>=1)w.stretched=true;
  }
  if(w.pads.every(Boolean)&&w.stars.every(Boolean)&&(!w.stage.stretch||w.stretched))w.gateOpen=true;
  if(w.gateOpen&&w.players.every(p=>p.x>w.stage.finishX&&p.y<560)){
   if(w.level===5)w.finished=true;else Object.assign(w,newLocal(w.level+1));
   return true;
  }
 }
 w.revision++;return false;
}
export function verifyLocalLayouts(){
 const failures=[];
 for(let n=2;n<=5;n++)for(let l=0;l<6;l++){const s=stageAt(l,n);
  if(s.pads.length!==n||s.pads.some(p=>!s.floors.some(f=>p.x>f.x+24&&p.x<f.x+f.w-24)))failures.push('Unreachable pad at '+l+'/'+n);
  if(s.pads.some((p,i)=>i&&p.x-s.pads[i-1].x<57))failures.push('Overlapping pads at '+l+'/'+n);
  if(s.pads.at(-1).x+28>s.gate.x)failures.push('Blocked pad at '+l+'/'+n);
 }
 return failures;
}
