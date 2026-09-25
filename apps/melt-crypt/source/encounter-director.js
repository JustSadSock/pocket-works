import { makeRng } from './core.js';

export function buildEncounterPlan(room,floor,seed,{firstCombat=false}={}){
  const rng=makeRng((seed^Math.imul(room.id+17,0x45d9f3b)^Math.imul(floor+3,0x9e3779b1))>>>0);
  const seeds=[...(room.monsterSeeds||[])];
  if(firstCombat){
    while(seeds.length<3)seeds.push(Math.floor(rng()*0xffffffff)>>>0);
  }
  const waves=[];
  let cursor=0;
  const targetWaveSize=firstCombat?1:floor<=2?2:Math.min(3,1+Math.floor(floor/2));
  while(cursor<seeds.length){
    const remaining=seeds.length-cursor;
    const size=Math.min(remaining,targetWaveSize+(rng()<0.28?1:0));
    waves.push(seeds.slice(cursor,cursor+size));
    cursor+=size;
  }
  return {
    roomId:room.id,
    waves,
    firstCombat,
    intro:firstCombat?'FIRST CONTACT':'ROOM SEALED',
    reward:firstCombat?'weapon-choice':null
  };
}

export class EncounterDirector {
  constructor(){
    this.state=null;
  }

  begin(plan){
    this.state={
      ...plan,
      waveIndex:-1,
      phase:'intro',
      timer:plan.firstCombat?0.72:0.38,
      finished:false,
      rewarded:false
    };
    return [{type:'cue',kind:'intro',text:plan.intro}];
  }

  cancel(){this.state=null;}

  tick(dt,aliveCount){
    const s=this.state;
    if(!s||s.finished)return[];
    const events=[];
    if(s.phase==='intro'||s.phase==='between'){
      s.timer-=dt;
      if(s.timer<=0){
        s.waveIndex+=1;
        const seeds=s.waves[s.waveIndex]||[];
        if(seeds.length){
          s.phase='combat';
          events.push({type:'spawn',wave:s.waveIndex+1,seeds});
          events.push({type:'cue',kind:'wave',text:s.waveIndex===0?'COME CLOSER.':'MORE FOOTSTEPS.'});
        }else{
          s.phase='done';s.finished=true;
          events.push({type:'clear',reward:s.reward});
        }
      }
    }else if(s.phase==='combat'&&aliveCount===0){
      if(s.waveIndex<s.waves.length-1){
        s.phase='between';
        s.timer=0.62;
        events.push({type:'cue',kind:'between',text:'NOT QUIET YET.'});
      }else{
        s.phase='done';s.finished=true;
        events.push({type:'clear',reward:s.reward});
      }
    }
    return events;
  }
}
