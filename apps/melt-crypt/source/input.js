import { bindPointerGesture } from '../../../shared/mobile-runtime.js';
import { clamp, mapLookDelta } from './core.js';

export class CryptInput {
  constructor(root, canvas, sensitivity = 1) {
    this.root=root;
    this.canvas=canvas;
    this.moveZone=root.querySelector('#move-zone');
    this.lookZone=root.querySelector('#look-zone');
    this.base=root.querySelector('#joystick-base');
    this.knob=root.querySelector('#joystick-knob');
    this.attackButton=root.querySelector('#fire-button');
    this.skillButton=root.querySelector('#use-button');
    this.dodgeButton=root.querySelector('#dash-button');
    this.sensitivity=clamp(Number(sensitivity)||1,0.55,1.8);
    this.keys=new Set();
    this.movePointer=null;
    this.lookPointer=null;
    this.moveOrigin={x:0,y:0};
    this.move={x:0,y:0};
    this.lookLast={x:0,y:0};
    this.lookAccum={x:0,y:0};
    this.attackHeld=false;
    this.actions={attackStart:false,attackRelease:false,skill:false,dodge:false,pause:false};
    this.cleanups=[];
    this.bind();
  }

  bind(){
    this.cleanups.push(bindPointerGesture(this.moveZone,{
      onStart:(e)=>this.startMove(e),onMove:(e)=>this.updateMove(e),onEnd:(e)=>this.endMove(e),onCancel:(e)=>this.endMove(e)
    }));
    this.cleanups.push(bindPointerGesture(this.lookZone,{
      onStart:(e)=>this.startLook(e),onMove:(e)=>this.updateLook(e),onEnd:(e)=>this.endLook(e),onCancel:(e)=>this.endLook(e)
    }));

    this.cleanups.push(bindPointerGesture(this.attackButton,{
      onStart:(e)=>{e.preventDefault();this.attackButton.classList.add('pressed');this.attackHeld=true;this.actions.attackStart=true;},
      onEnd:(e)=>{e.preventDefault();this.attackButton.classList.remove('pressed');if(this.attackHeld)this.actions.attackRelease=true;this.attackHeld=false;},
      onCancel:(e)=>{e.preventDefault();this.attackButton.classList.remove('pressed');if(this.attackHeld)this.actions.attackRelease=true;this.attackHeld=false;}
    }));
    this.cleanups.push(bindPointerGesture(this.skillButton,{
      onStart:(e)=>{e.preventDefault();this.skillButton.classList.add('pressed');this.actions.skill=true;},
      onEnd:(e)=>{e.preventDefault();this.skillButton.classList.remove('pressed');},
      onCancel:(e)=>{e.preventDefault();this.skillButton.classList.remove('pressed');}
    }));
    this.cleanups.push(bindPointerGesture(this.dodgeButton,{
      onStart:(e)=>{e.preventDefault();this.dodgeButton.classList.add('pressed');this.actions.dodge=true;},
      onEnd:(e)=>{e.preventDefault();this.dodgeButton.classList.remove('pressed');},
      onCancel:(e)=>{e.preventDefault();this.dodgeButton.classList.remove('pressed');}
    }));

    this.onKeyDown=(event)=>{
      this.keys.add(event.code);
      if(event.repeat)return;
      if(event.code==='Space'){event.preventDefault();this.actions.dodge=true;}
      if(event.code==='KeyE'||event.code==='KeyF')this.actions.skill=true;
      if(event.code==='Escape')this.actions.pause=true;
    };
    this.onKeyUp=(event)=>this.keys.delete(event.code);
    this.onMouseMove=(event)=>{
      if(document.pointerLockElement!==this.canvas)return;
      this.lookAccum.x+=event.movementX;
      this.lookAccum.y+=event.movementY;
    };
    this.onMouseDown=(event)=>{
      if(event.button!==0||document.pointerLockElement!==this.canvas)return;
      if(!this.attackHeld)this.actions.attackStart=true;
      this.attackHeld=true;
    };
    this.onMouseUp=(event)=>{
      if(event.button!==0)return;
      if(this.attackHeld)this.actions.attackRelease=true;
      this.attackHeld=false;
    };
    this.onCanvasClick=()=>{
      if(matchMedia('(pointer:fine)').matches&&document.pointerLockElement!==this.canvas)this.canvas.requestPointerLock?.();
    };
    window.addEventListener('keydown',this.onKeyDown);
    window.addEventListener('keyup',this.onKeyUp);
    window.addEventListener('mousemove',this.onMouseMove);
    window.addEventListener('mousedown',this.onMouseDown);
    window.addEventListener('mouseup',this.onMouseUp);
    this.canvas.addEventListener('click',this.onCanvasClick);
  }

  startMove(event){
    if(this.movePointer!==null)return;
    event.preventDefault();
    this.movePointer=event.pointerId;
    this.moveOrigin.x=event.clientX;this.moveOrigin.y=event.clientY;
    this.base.classList.add('active');
    this.base.style.transform='translate3d('+event.clientX+'px,'+event.clientY+'px,0)';
    this.updateMove(event);
  }
  updateMove(event){
    if(event.pointerId!==this.movePointer)return;
    event.preventDefault();
    const dx=event.clientX-this.moveOrigin.x,dy=event.clientY-this.moveOrigin.y;
    const radius=56,length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
    const px=dx*scale,py=dy*scale,nx=px/radius,ny=py/radius,magnitude=Math.hypot(nx,ny);
    const dead=0.11,filtered=magnitude<dead?0:(magnitude-dead)/(1-dead),ratio=magnitude>0?filtered/magnitude:0;
    this.move.x=nx*ratio;this.move.y=-ny*ratio;
    this.knob.style.transform='translate3d('+px+'px,'+py+'px,0)';
  }
  endMove(event){
    if(event.pointerId!==this.movePointer)return;
    event.preventDefault();this.movePointer=null;this.move.x=0;this.move.y=0;
    this.knob.style.transform='translate3d(0,0,0)';this.base.classList.remove('active');
  }
  startLook(event){
    if(this.lookPointer!==null)return;
    event.preventDefault();this.lookPointer=event.pointerId;this.lookLast.x=event.clientX;this.lookLast.y=event.clientY;
  }
  updateLook(event){
    if(event.pointerId!==this.lookPointer)return;
    event.preventDefault();
    this.lookAccum.x+=event.clientX-this.lookLast.x;this.lookAccum.y+=event.clientY-this.lookLast.y;
    this.lookLast.x=event.clientX;this.lookLast.y=event.clientY;
  }
  endLook(event){if(event.pointerId!==this.lookPointer)return;event.preventDefault();this.lookPointer=null;}

  getMove(){
    let x=this.move.x,y=this.move.y;
    if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x-=1;
    if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x+=1;
    if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))y+=1;
    if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))y-=1;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    return{x,y,magnitude:Math.min(1,Math.hypot(x,y))};
  }

  consumeLook(){
    const fine=matchMedia('(pointer:fine)').matches;
    const multiplier=fine?0.0022:0.0032;
    const result=mapLookDelta(this.lookAccum.x,this.lookAccum.y,multiplier,this.sensitivity);
    this.lookAccum.x=0;this.lookAccum.y=0;
    return result;
  }

  consumeActions(){
    const result={...this.actions,attackHeld:this.attackHeld};
    this.actions.attackStart=false;this.actions.attackRelease=false;this.actions.skill=false;this.actions.dodge=false;this.actions.pause=false;
    return result;
  }

  setSensitivity(value){this.sensitivity=clamp(Number(value)||1,0.55,1.8);}

  reset(){
    this.keys.clear();this.move.x=0;this.move.y=0;this.lookAccum.x=0;this.lookAccum.y=0;this.attackHeld=false;
    this.actions={attackStart:false,attackRelease:false,skill:false,dodge:false,pause:false};
    this.base.classList.remove('active');this.knob.style.transform='translate3d(0,0,0)';
    this.attackButton.classList.remove('pressed');this.skillButton.classList.remove('pressed');this.dodgeButton.classList.remove('pressed');
  }

  dispose(){
    this.cleanups.forEach((cleanup)=>cleanup?.());
    window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);
    window.removeEventListener('mousemove',this.onMouseMove);window.removeEventListener('mousedown',this.onMouseDown);window.removeEventListener('mouseup',this.onMouseUp);
    this.canvas.removeEventListener('click',this.onCanvasClick);
  }
}
