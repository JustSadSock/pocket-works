export type Controls = {
  x:number; y:number; boost:number; brake:number; lookX:number; lookY:number;
  brakeEvents:number; lastGesture:string;
  consumeLook:()=>{x:number;y:number}; destroy:()=>void;
};

type Tracked={id:number;side:'left'|'right';sx:number;sy:number;x:number;y:number;t:number};

export function createControls(surface:HTMLElement):Controls{
  const c:any={x:0,y:0,boost:0,brake:0,lookX:0,lookY:0,brakeEvents:0,lastGesture:''};
  const pointers=new Map<number,Tracked>();
  const key=new Set<string>();
  let brakeTimer=0;
  let leftTap=0,rightTap=0;
  let lastPointerEventAt=0;

  const engageBoost=(now:number)=>{c.boost=1;c.lastGesture='boost';leftTap=now;};
  const engageBrake=(now:number,duration=1350)=>{c.brake=1;c.brakeEvents+=1;c.lastGesture='brake';brakeTimer=Math.max(brakeTimer,now+duration);rightTap=now;};

  const begin=(id:number,x:number,y:number)=>{
    const now=performance.now();
    const side=x<innerWidth*.5?'left':'right';
    // Trigger the second half of a double tap on pointer-down, not pointer-up.
    // This makes the gesture immediate on low-FPS mobile frames.
    if(side==='left'&&now-leftTap<350)c.boost=1;
    if(side==='right'&&now-rightTap<350)engageBrake(now,1450);
    pointers.set(id,{id,side,sx:x,sy:y,x,y,t:now});
  };
  const moveTracked=(id:number,x:number,y:number)=>{
    const p=pointers.get(id); if(!p)return;
    if(p.side==='left'){
      const dx=(x-p.sx)/Math.max(78,innerWidth*.13);
      const dy=(y-p.sy)/Math.max(68,innerHeight*.23);
      c.x=Math.max(-1,Math.min(1,dx)); c.y=Math.max(-1,Math.min(1,-dy));
    }else{
      c.lookX+=(x-p.x)*.0042; c.lookY+=(y-p.y)*.0036;
    }
    p.x=x;p.y=y;
  };
  const finish=(id:number)=>{
    const p=pointers.get(id); if(!p)return;
    const now=performance.now(); const moved=Math.hypot(p.x-p.sx,p.y-p.sy); const elapsed=now-p.t;
    if(moved<20&&elapsed<280){
      if(p.side==='left'){
        if(now-leftTap<350)engageBoost(now); else leftTap=now;
      }else{
        // A quick right tap is intentionally useful by itself: a short air-brake
        // pulse. A second tap inside the gesture window extends it. Camera look
        // remains a drag, so the two actions do not fight for the same motion.
        const doubleTap=now-rightTap<350;
        engageBrake(now,doubleTap?1450:760);
      }
    }
    pointers.delete(id);
    if(p.side==='left'&&![...pointers.values()].some(q=>q.side==='left')){c.x=0;c.y=0;}
  };

  const down=(e:PointerEvent)=>{lastPointerEventAt=performance.now();surface.setPointerCapture?.(e.pointerId);begin(e.pointerId,e.clientX,e.clientY);};
  const move=(e:PointerEvent)=>{lastPointerEventAt=performance.now();moveTracked(e.pointerId,e.clientX,e.clientY);};
  const up=(e:PointerEvent)=>{lastPointerEventAt=performance.now();finish(e.pointerId);};
  const cancel=(e:PointerEvent)=>{lastPointerEventAt=performance.now();finish(e.pointerId);};

  // Pointer Events are primary on current iOS; Touch Events are kept as a
  // compatibility path for embedded/automation WebKit builds.
  const touchFallbackAllowed=()=>performance.now()-lastPointerEventAt>80;
  const touchStart=(e:TouchEvent)=>{if(!touchFallbackAllowed())return;e.preventDefault();for(const t of Array.from(e.changedTouches))begin(10000+t.identifier,t.clientX,t.clientY);};
  const touchMove=(e:TouchEvent)=>{if(!touchFallbackAllowed())return;e.preventDefault();for(const t of Array.from(e.changedTouches))moveTracked(10000+t.identifier,t.clientX,t.clientY);};
  const touchEnd=(e:TouchEvent)=>{if(!touchFallbackAllowed())return;e.preventDefault();for(const t of Array.from(e.changedTouches))finish(10000+t.identifier);};

  const kd=(e:KeyboardEvent)=>{key.add(e.code); if(e.code==='Space')c.boost=1;if(e.code==='ShiftLeft'||e.code==='ShiftRight'){c.brake=1;c.lastGesture='brake-key';}};
  const ku=(e:KeyboardEvent)=>{key.delete(e.code);if(e.code==='Space')c.boost=0;if(e.code==='ShiftLeft'||e.code==='ShiftRight')c.brake=0;};

  surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',up);surface.addEventListener('pointercancel',cancel);
  surface.addEventListener('touchstart',touchStart,{passive:false});surface.addEventListener('touchmove',touchMove,{passive:false});surface.addEventListener('touchend',touchEnd,{passive:false});surface.addEventListener('touchcancel',touchEnd,{passive:false});
  addEventListener('keydown',kd);addEventListener('keyup',ku);

  c.consumeLook=()=>{const out={x:c.lookX,y:c.lookY};c.lookX=0;c.lookY=0;return out;};
  c.destroy=()=>{
    surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerup',up);surface.removeEventListener('pointercancel',cancel);
    surface.removeEventListener('touchstart',touchStart);surface.removeEventListener('touchmove',touchMove);surface.removeEventListener('touchend',touchEnd);surface.removeEventListener('touchcancel',touchEnd);
    removeEventListener('keydown',kd);removeEventListener('keyup',ku);
  };
  const tick=()=>{
    if(key.size){c.x=(key.has('KeyD')||key.has('ArrowRight')?1:0)-(key.has('KeyA')||key.has('ArrowLeft')?1:0);c.y=(key.has('KeyW')||key.has('ArrowUp')?1:0)-(key.has('KeyS')||key.has('ArrowDown')?1:0);}
    c.boost=Math.max(0,c.boost-.018);
    if(brakeTimer&&performance.now()>brakeTimer){c.brake=0;brakeTimer=0;}
    requestAnimationFrame(tick);
  }; tick();
  return c as Controls;
}
