// 1970s apartment wiring: a kitchen hot plate trips the ceramic panel.
// Deliberately simple fixed-state household task. No random softlocks or timers.
export const POWER_STAGE=Object.freeze({NORMAL:'normal',TRIPPED:'tripped',SAFE:'safe',RESTORED:'restored'});
export const FUSE_LOCATION=Object.freeze({x:14.18,z:16.8});
const finite=n=>Number.isFinite(n)?n:0;
export function readPower(data){
 const restored=data?.stage===POWER_STAGE.RESTORED;
 const tripped=data?.stage===POWER_STAGE.TRIPPED||data?.stage===POWER_STAGE.SAFE;
 return {
  stage:restored?POWER_STAGE.RESTORED:tripped?(data?.unplugged?POWER_STAGE.SAFE:POWER_STAGE.TRIPPED):POWER_STAGE.NORMAL,
  unplugged:Boolean(data?.unplugged),
  trippedAt:Math.max(0,finite(data?.trippedAt))
 };
}
export function powerOn(p){return p.stage===POWER_STAGE.NORMAL||p.stage===POWER_STAGE.RESTORED}
export function powerHint(p){
 switch(p.stage){
 case POWER_STAGE.TRIPPED:return 'На кухне перегрузка. Отключи старую электроплитку.';
 case POWER_STAGE.SAFE:return 'Плитка выключена. Вернись к щитку в прихожей.';
 case POWER_STAGE.RESTORED:return 'Свет восстановлен.';
 default:return '';
 }
}
export function tripPower(p,elapsed,found=0){
 if(p.stage!==POWER_STAGE.NORMAL||!(elapsed>=25&&found>0||elapsed>=65))return false;
 p.stage=POWER_STAGE.TRIPPED;p.trippedAt=elapsed;return true
}
export function unplugPlate(p){
 if(p.stage===POWER_STAGE.RESTORED)return{ok:false,reason:'restored'};
 if(p.stage===POWER_STAGE.NORMAL)return{ok:false,reason:'no-outage'};
 if(p.unplugged)return{ok:false,reason:'already'};
 p.unplugged=true;p.stage=POWER_STAGE.SAFE;return{ok:true,stage:p.stage}
}
export function resetBreaker(p){
 if(p.stage===POWER_STAGE.NORMAL||p.stage===POWER_STAGE.RESTORED)return{ok:false,reason:'already-on'};
 if(!p.unplugged)return{ok:false,reason:'overload'};
 p.stage=POWER_STAGE.RESTORED;return{ok:true,stage:p.stage}
}
export function distanceToPower(pos,x,z){return Math.hypot(pos.x-x,pos.z-z)}
