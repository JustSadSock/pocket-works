// Layout-independent keyboard controls for first-person gameplay.
// KeyboardEvent.code identifies the physical key even with Ukrainian/Russian layouts.
const ACTION_BY_CODE=Object.freeze({
 KeyW:'forward',KeyS:'backward',KeyA:'strafeLeft',KeyD:'strafeRight',
 ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'turnLeft',ArrowRight:'turnRight',
 ShiftLeft:'sprint',ShiftRight:'sprint',
 KeyE:'interact',KeyR:'reload',KeyF:'torch',KeyI:'inventory',Tab:'inventory',
 Space:'fire',Escape:'pause',
 Digit1:'upgrade1',Digit2:'upgrade2',Digit3:'upgrade3',
 Numpad1:'upgrade1',Numpad2:'upgrade2',Numpad3:'upgrade3'
});
const CODE_BY_KEY=Object.freeze({
 w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',
 arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight',
 shift:'ShiftLeft',e:'KeyE',r:'KeyR',f:'KeyF',i:'KeyI',
 tab:'Tab',' ':'Space',spacebar:'Space',escape:'Escape',esc:'Escape',
 '1':'Digit1','2':'Digit2','3':'Digit3'
});
export function physicalKey(event){
 const code=event?.code;
 if(code&&Object.hasOwn(ACTION_BY_CODE,code))return code;
 return CODE_BY_KEY[String(event?.key??'').toLowerCase()]||null
}
export function isTextEditingTarget(target){
 const tag=String(target?.tagName||'').toLowerCase();
 return tag==='input'||tag==='textarea'||tag==='select'||Boolean(target?.isContentEditable)
}
const anyHeld=(held,keys)=>keys.some(key=>held.has(key));
export class GameKeyboard{
 constructor(){this.held=new Set()}
 down(event){
  const code=physicalKey(event);
  if(!code)return null;
  const first=!this.held.has(code);
  this.held.add(code);
  return{code,action:ACTION_BY_CODE[code],first}
 }
 up(event){const code=physicalKey(event);if(code)this.held.delete(code);return code}
 clear(){this.held.clear()}
 get intent(){
  return{
   forward:Number(anyHeld(this.held,['KeyW','ArrowUp']))-Number(anyHeld(this.held,['KeyS','ArrowDown'])),
   strafe:Number(this.held.has('KeyD'))-Number(this.held.has('KeyA')),
   turn:Number(this.held.has('ArrowRight'))-Number(this.held.has('ArrowLeft')),
   sprint:anyHeld(this.held,['ShiftLeft','ShiftRight'])
  }
 }
}
