import { clamp } from './core.js';

const smooth = (t) => {
  const x=clamp(t,0,1);
  return x*x*(3-2*x);
};
const easeOut = (t) => 1-Math.pow(1-clamp(t,0,1),3);
const easeIn = (t) => Math.pow(clamp(t,0,1),3);
const remap=(v,a,b)=>clamp((v-a)/Math.max(0.0001,b-a),0,1);

export const STARTER_WEAPON = Object.freeze({
  seed:0x434c4541,
  core:'cleaver',head:'crescent',handle:'short',secondary:'guard',trait:'afterimage',skill:'parry',
  coreSpec:{id:'cleaver',label:'cleaver',baseDamage:1,cadence:1.45,reach:1.18,arc:0.98,combo:3,magnetism:19},
  headSpec:{id:'crescent',label:'crescent edge',damage:1.02,arc:1.08,stagger:0.92,visual:'crescent'},
  handleSpec:{id:'short',label:'short grip',reach:0.94,recovery:0.78,visualLength:0.82},
  secondarySpec:{id:'guard',label:'side guard',skillBias:'parry'},
  traitSpec:{id:'afterimage',label:'Afterimage',copy:'perfect dodge accelerates attacks',effect:'dodge-haste'},
  skillSpec:{id:'parry',label:'PARRY',cue:'guard ring',cooldown:3.2},
  damage:13.2,cadence:1.45,reach:1.11,arc:1.06,stagger:0.92,recovery:0.56,comboLength:3,magnetism:19,
  movement:'advance',name:'GRAVE CLEAVER',signature:'cleaver/crescent/short/guard/afterimage/parry',starter:true
});

const ATTACK_PACKS={
  cleaver:{light:[0.30,0.34,0.41],heavy:0.72,impact:[0.46,0.43,0.48],heavyImpact:0.61,follow:0.28},
  spear:{light:[0.38,0.42],heavy:0.78,impact:[0.40,0.43],heavyImpact:0.56,follow:0.22},
  maul:{light:[0.62,0.70],heavy:0.94,impact:[0.58,0.62],heavyImpact:0.66,follow:0.34},
  claws:{light:[0.22,0.24,0.22,0.30],heavy:0.52,impact:[0.39,0.42,0.39,0.45],heavyImpact:0.54,follow:0.18},
  glaive:{light:[0.44,0.49,0.56],heavy:0.82,impact:[0.46,0.48,0.52],heavyImpact:0.60,follow:0.30},
  twin:{light:[0.25,0.27,0.29,0.27,0.34],heavy:0.58,impact:[0.38,0.42,0.40,0.43,0.47],heavyImpact:0.55,follow:0.20}
};

export function attackTiming(weapon,heavy=false,combo=0,haste=1){
  const pack=ATTACK_PACKS[weapon?.core]||ATTACK_PACKS.cleaver;
  const raw=heavy?pack.heavy:pack.light[Math.abs(combo)%pack.light.length];
  const baseline={cleaver:1,spear:0.88,maul:0.58,claws:1.62,glaive:0.78,twin:1.35}[weapon?.core]||1;
  const cadenceScale=weapon?.starter?1:clamp(baseline/Math.max(0.2,weapon?.cadence||baseline),0.78,1.22);
  const duration=clamp(raw*cadenceScale*haste,0.19,1.05);
  const impact=heavy?pack.heavyImpact:pack.impact[Math.abs(combo)%pack.impact.length];
  return {duration,impactStart:Math.max(0.18,impact-0.035),impactEnd:Math.min(0.8,impact+0.09),follow:pack.follow};
}

export function sampleWeaponMotion(weapon,{progress=0,combo=0,heavy=false,charge=0,skill=0}={}){
  const core=weapon?.core||'cleaver';
  const side=(combo%2===0)?1:-1;
  const p=clamp(progress,0,1);
  const anticipation=smooth(remap(p,0,heavy?0.34:0.22));
  const strike=easeOut(remap(p,heavy?0.34:0.22,heavy?0.64:0.53));
  const follow=smooth(remap(p,heavy?0.64:0.53,1));
  const hit=clamp(strike-follow*0.86,0,1);
  const settle=1-follow;

  let x=0.36,y=-0.38,z=0.60,rx=-0.12,ry=0.06,rz=-0.06;
  if(core==='cleaver'){
    x+=side*(-0.08*anticipation+0.30*hit-0.15*follow);
    y+=0.11*anticipation-0.18*hit+0.08*follow;
    z+=-0.05*anticipation+0.15*hit-0.06*follow;
    rx+=-0.22*anticipation-0.44*hit+0.32*follow;
    ry+=side*(-0.58*anticipation+1.25*hit-0.48*follow);
    rz+=side*(0.36*anticipation-0.72*hit+0.28*follow);
  }else if(core==='spear'){
    x+=side*0.04*(1-hit);y+=0.03*anticipation;z+=-0.14*anticipation+0.58*hit-0.28*follow;
    rx+=0.08*anticipation-0.18*hit;ry+=side*0.11;rz+=side*0.04;
  }else if(core==='maul'){
    x+=side*(-0.12*anticipation+0.18*hit);y+=0.28*anticipation-0.34*hit+0.10*follow;z+=-0.18*anticipation+0.13*hit;
    rx+=-0.78*anticipation+1.46*hit-0.62*follow;ry+=side*(-0.28*anticipation+0.38*hit);rz+=side*0.18*anticipation;
  }else if(core==='claws'){
    x+=side*(0.13*anticipation-0.22*hit);y+=-0.03+0.08*hit;z+=0.38*hit-0.16*follow;
    rx+=-0.18*hit;ry+=side*(-0.42*anticipation+0.72*hit);rz+=side*(-0.26*hit);
  }else if(core==='glaive'){
    x+=side*(-0.16*anticipation+0.34*hit-0.16*follow);y+=0.08*anticipation-0.11*hit;z+=0.12*hit;
    rx+=-0.36*anticipation-0.28*hit+0.22*follow;ry+=side*(-0.78*anticipation+1.48*hit-0.58*follow);rz+=side*0.35*hit;
  }else{
    x+=side*(-0.05*anticipation+0.22*hit);y+=0.05*Math.sin(p*Math.PI*2);z+=0.28*hit-0.12*follow;
    rx+=-0.18*hit;ry+=side*(-0.38*anticipation+0.92*hit);rz+=side*0.34*hit;
  }

  if(heavy){
    y+=0.12*anticipation-0.08*hit;
    z-=0.10*anticipation;
    rx-=0.20*anticipation;
  }
  if(charge>0){
    const q=smooth(charge);
    y+=0.12*q;z-=0.14*q;rx-=0.30*q;ry-=side*0.24*q;
  }
  if(skill>0){
    const q=Math.sin(clamp(skill,0,1)*Math.PI);
    ry+=side*q*0.42;z-=q*0.13;y+=q*0.04;
  }
  return {x,y,z,rx,ry,rz,impact:hit,settle};
}

export function enemyMotionPackage(enemy,time){
  const g=enemy.genome;
  const locomotion=g.locomotion;
  const stagger=clamp((enemy.staggerTime||0)/0.8,0,1);
  const attack=enemy.animAttack||{kind:null,progress:0};
  const p=clamp(attack.progress||0,0,1);
  const anticipation=smooth(remap(p,0,0.48));
  const strike=easeOut(remap(p,0.48,0.72));
  const recover=smooth(remap(p,0.72,1));
  const impact=clamp(strike-recover*0.9,0,1);
  const speed=g.speed||2;
  const gait=time*speed*(locomotion==='fast-biped'?2.9:locomotion==='crawler'?3.7:locomotion==='heavy-biped'?1.6:2.2)+g.phase;
  let bob=0,lean=0,leg=0,bodyPitch=0;
  if(locomotion==='heavy-biped'){bob=Math.abs(Math.sin(gait))*0.035;lean=Math.sin(gait*0.5)*0.025;leg=Math.sin(gait)*0.42;}
  else if(locomotion==='fast-biped'){bob=Math.sin(gait*2)*0.045;lean=Math.sin(gait)*0.05;leg=Math.sin(gait)*0.62;}
  else if(locomotion==='crawler'){bob=Math.sin(gait*2.2)*0.025;lean=Math.sin(gait)*0.06;leg=Math.sin(gait)*0.76;bodyPitch=0.03;}
  else if(locomotion==='hopper'){bob=Math.max(0,Math.sin(gait))*0.11;bodyPitch=-Math.sin(gait)*0.06;leg=Math.sin(gait)*0.52;}
  else {bob=Math.sin(gait)*0.10;lean=Math.sin(gait*0.7)*0.04;leg=Math.sin(gait)*0.16;}

  let armPrimary=0,armSecondary=0,attackPitch=0,lunge=0;
  const kind=attack.kind;
  if(kind==='heavy-sweep'||kind==='slam'){
    armPrimary=-1.0*anticipation+1.75*impact-0.55*recover;attackPitch=-0.12*anticipation+0.28*impact;lunge=0.22*impact;
  }else if(kind==='thrust'||kind==='hook-pull'){
    armPrimary=-0.28*anticipation+0.62*impact;lunge=0.40*impact;attackPitch=-0.06*impact;
  }else if(kind==='flurry'||kind==='cleave'){
    armPrimary=-0.55*anticipation+1.05*impact-0.36*recover;armSecondary=0.32*impact;lunge=0.18*impact;
  }else if(kind==='shield-bash'){
    armPrimary=-0.20*anticipation+0.52*impact;lunge=0.24*impact;
  }else if(kind==='bolt'||kind==='arc-pulse'){
    armPrimary=-0.38*anticipation+0.16*impact;bodyPitch=-0.08*anticipation;
  }else if(kind==='horn-charge'||kind==='leg-dash'){
    bodyPitch=-0.26*anticipation+0.18*impact;lunge=0.62*impact;
  }
  return {bob,lean,leg,bodyPitch,armPrimary,armSecondary,attackPitch,lunge,stagger,impact};
}

export function deathMotion(kind='normal',progress=0){
  const p=clamp(progress,0,1);
  const q=easeOut(p);
  if(kind==='slam')return {y:-0.58*q,rx:-1.32*q,rz:0,scaleY:1-0.38*q};
  if(kind==='launch')return {y:0.52*Math.sin(p*Math.PI)-0.35*q,rx:-0.48*q,rz:1.34*q,scaleY:1};
  if(kind==='spin')return {y:-0.24*q,rx:-0.22*q,rz:2.1*q,scaleY:1};
  if(kind==='execution')return {y:-0.5*q,rx:-1.18*q,rz:0.22*q,scaleY:1-0.24*q};
  return {y:-0.32*q,rx:-0.78*q,rz:0.68*q,scaleY:1-0.12*q};
}
