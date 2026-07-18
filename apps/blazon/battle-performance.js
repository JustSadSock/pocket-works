const nativeRequestAnimationFrame=window.requestAnimationFrame.bind(window);

let averageBattleCost=0;
let lastBattleDispatch=0;
let battleFrameInterval=0;

function scheduleBattleFrame(callback){
  return nativeRequestAnimationFrame(now=>{
    if(document.hidden){
      scheduleBattleFrame(callback);
      return;
    }
    if(battleFrameInterval&&now-lastBattleDispatch<battleFrameInterval-.75){
      scheduleBattleFrame(callback);
      return;
    }
    lastBattleDispatch=now;
    const started=performance.now();
    callback(now);
    const cost=performance.now()-started;
    averageBattleCost=averageBattleCost?averageBattleCost*.88+cost*.12:cost;
    if(averageBattleCost>13.5)battleFrameInterval=1000/30;
    else if(averageBattleCost<8.25)battleFrameInterval=0;
  });
}

window.requestAnimationFrame=function requestAnimationFrame(callback){
  return callback?.name==='frame'?scheduleBattleFrame(callback):nativeRequestAnimationFrame(callback);
};

function findAccessor(node,property){
  let prototype=node;
  while(prototype){
    const descriptor=Object.getOwnPropertyDescriptor(prototype,property);
    if(descriptor?.get&&descriptor?.set)return descriptor;
    prototype=Object.getPrototypeOf(prototype);
  }
  return null;
}

function throttleProperty(node,property,interval){
  if(!node)return;
  const descriptor=findAccessor(node,property);
  if(!descriptor)return;
  let lastValue=descriptor.get.call(node);
  let lastWrite=-Infinity;
  try{
    Object.defineProperty(node,property,{
      configurable:true,
      get(){return descriptor.get.call(this);},
      set(value){
        const next=String(value);
        if(next===lastValue)return;
        const now=performance.now();
        if(now-lastWrite<interval)return;
        descriptor.set.call(this,value);
        lastValue=next;
        lastWrite=now;
      }
    });
  }catch{}
}

function installHudBudget(){
  throttleProperty(document.getElementById('battleClock'),'textContent',180);
  throttleProperty(document.getElementById('playerFormation'),'innerHTML',140);
  throttleProperty(document.getElementById('enemyFormation'),'innerHTML',140);
}

installHudBudget();
document.documentElement.dataset.blazonBattleScheduler='adaptive';
