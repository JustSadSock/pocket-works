// Physical KeyboardEvent.code mappings: independent of Russian/Ukrainian/English layout.
// The single-hero mode intentionally supports both WASD and arrow clusters.
const has=(pressed,...codes)=>codes.some(code=>pressed.has(code));
const axis=(pressed,left,right)=>(has(pressed,...right)?1:0)-(has(pressed,...left)?1:0);
export const gameplayCodes=new Set(['KeyA','KeyD','KeyW','KeyS','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','ShiftLeft','ShiftRight']);
export function isGameplayCode(code){return gameplayCodes.has(code)}
export function isTypingTarget(node){return !!node?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')}
export function readSoloControls(keys,touch=new Set()){
 return {
  x:(has(keys,'KeyD','ArrowRight')||touch.has('right')?1:0)-(has(keys,'KeyA','ArrowLeft')||touch.has('left')?1:0),
  jump:has(keys,'Space','KeyW','ArrowUp')||touch.has('jump'),
  stick:has(keys,'KeyE','KeyS','ArrowDown','ShiftLeft','ShiftRight')||touch.has('stick'),
  up:has(keys,'KeyW','ArrowUp')
 };
}
export function readDuoControls(keys,touch=new Set()){
 return [
  {x:(has(keys,'KeyD')||touch.has('right')?1:0)-(has(keys,'KeyA')||touch.has('left')?1:0),
   jump:has(keys,'KeyW','Space')||touch.has('jump'),
   stick:has(keys,'KeyE','KeyS')||touch.has('stick'),up:has(keys,'KeyW')},
  {x:axis(keys,['ArrowLeft'],['ArrowRight']),jump:has(keys,'ArrowUp'),stick:has(keys,'ArrowDown'),up:has(keys,'ArrowUp')}
 ];
}
