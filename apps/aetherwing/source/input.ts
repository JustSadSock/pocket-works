export type Controls = {
  x:number; y:number; boost:number; brake:number; lookX:number; lookY:number;
  consumeLook:()=>{x:number;y:number}; destroy:()=>void;
};

type Tracked={id:number;side:'left'|'right';sx:number;sy:number;x:number;y:number;t:number;lastTap:number};

export function createControls(surface:HTMLElement):Controls{
  const c:any={x:0,y:0,boost:0,brake:0,lookX:0,lookY:0};
  const pointers=new Map<number,Tracked>();
  const key=new Set<string>();
  let brakeTimer=0;
  let leftTap=0,rightTap=0;
  const down=(e:PointerEvent)=>{
    const side=e.clientX<innerWidth*.5?'left':'right';
    surface.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,{id:e.pointerId,side,sx:e.clientX,sy:e.clientY,x:e.clientX,y:e.clientY,t:performance.now(),lastTap:side==='left'?leftTap:rightTap});
  };
  const move=(e:PointerEvent)=>{
    const p=pointers.get(e.pointerId); if(!p)return;
    if(p.side==='left'){
      const dx=(e.clientX-p.sx)/Math.max(78,innerWidth*.13);
      const dy=(e.clientY-p.sy)/Math.max(68,innerHeight*.23);
      c.x=Math.max(-1,Math.min(1,dx)); c.y=Math.max(-1,Math.min(1,-dy));
    }else{
      c.lookX+=(e.clientX-p.x)*.0042; c.lookY+=(e.clientY-p.y)*.0036;
    }
    p.x=e.clientX;p.y=e.clientY;
  };
  const up=(e:PointerEvent)=>{
    const p=pointers.get(e.pointerId); if(!p)return;
    const now=performance.now(); const moved=Math.hypot(p.x-p.sx,p.y-p.sy); const elapsed=now-p.t;
    if(moved<20&&elapsed<260){
      if(p.side==='left'){
        if(now-leftTap<330)c.boost=1;
        leftTap=now;
      }else{
        if(now-rightTap<330){c.brake=1;brakeTimer=performance.now()+700;}
        rightTap=now;
      }
    }
    pointers.delete(e.pointerId);
    if(p.side==='left'){c.x=0;c.y=0;}
  };
  const cancel=(e:PointerEvent)=>up(e);
  const kd=(e:KeyboardEvent)=>{key.add(e.code); if(e.code==='Space')c.boost=1;if(e.code==='ShiftLeft'||e.code==='ShiftRight')c.brake=1;};
  const ku=(e:KeyboardEvent)=>{key.delete(e.code);if(e.code==='Space')c.boost=0;if(e.code==='ShiftLeft'||e.code==='ShiftRight')c.brake=0;};
  surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',up);surface.addEventListener('pointercancel',cancel);
  addEventListener('keydown',kd);addEventListener('keyup',ku);
  c.consumeLook=()=>{const out={x:c.lookX,y:c.lookY};c.lookX=0;c.lookY=0;return out;};
  c.destroy=()=>{surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerup',up);surface.removeEventListener('pointercancel',cancel);removeEventListener('keydown',kd);removeEventListener('keyup',ku);};
  const tick=()=>{
    if(key.size){c.x=(key.has('KeyD')||key.has('ArrowRight')?1:0)-(key.has('KeyA')||key.has('ArrowLeft')?1:0);c.y=(key.has('KeyW')||key.has('ArrowUp')?1:0)-(key.has('KeyS')||key.has('ArrowDown')?1:0);}
    c.boost=Math.max(0,c.boost-.018);
    if(brakeTimer&&performance.now()>brakeTimer){c.brake=0;brakeTimer=0;}
    requestAnimationFrame(tick);
  }; tick();
  return c as Controls;
}
