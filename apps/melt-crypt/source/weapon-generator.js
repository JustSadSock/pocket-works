import { choice, clamp, makeRng } from './core.js';

export const WEAPON_CORES=[
  {id:'cleaver',label:'cleaver',baseDamage:1.0,cadence:1.0,reach:1.1,arc:0.9,combo:3,magnetism:16},
  {id:'spear',label:'spear',baseDamage:0.92,cadence:0.88,reach:1.65,arc:0.38,combo:2,magnetism:9},
  {id:'maul',label:'maul',baseDamage:1.42,cadence:0.58,reach:1.15,arc:0.82,combo:2,magnetism:12},
  {id:'claws',label:'claws',baseDamage:0.64,cadence:1.62,reach:0.78,arc:1.05,combo:4,magnetism:20},
  {id:'glaive',label:'glaive',baseDamage:1.08,cadence:0.78,reach:1.48,arc:1.2,combo:3,magnetism:11},
  {id:'twin',label:'twin blades',baseDamage:0.74,cadence:1.35,reach:0.94,arc:0.92,combo:5,magnetism:18}
];

export const WEAPON_HEADS=[
  {id:'crescent',label:'crescent edge',damage:1.0,arc:1.12,stagger:0.9,visual:'crescent'},
  {id:'crusher',label:'stone crusher',damage:1.22,arc:0.72,stagger:1.5,visual:'hammer'},
  {id:'needle',label:'needle point',damage:0.96,arc:0.42,stagger:0.62,visual:'spear'},
  {id:'fork',label:'forked blade',damage:0.92,arc:0.85,stagger:0.82,visual:'fork'},
  {id:'sickle',label:'hooked sickle',damage:1.0,arc:0.82,stagger:0.92,visual:'hook'},
  {id:'saw',label:'toothed saw',damage:1.06,arc:0.94,stagger:0.75,visual:'saw'},
  {id:'axe',label:'broad axe',damage:1.14,arc:1.02,stagger:1.18,visual:'axe'},
  {id:'fangs',label:'paired fangs',damage:0.82,arc:0.92,stagger:0.55,visual:'fangs'},
  {id:'bell',label:'iron bell',damage:1.18,arc:0.88,stagger:1.36,visual:'bell'},
  {id:'slab',label:'red slab',damage:1.28,arc:0.68,stagger:1.58,visual:'slab'}
];

export const WEAPON_SKILLS=[
  {id:'parry',label:'PARRY',cue:'guard ring',cooldown:3.5},
  {id:'projectile',label:'BLOOD ARC',cue:'glowing core',cooldown:4.2},
  {id:'shield',label:'WARD',cue:'side guard',cooldown:5.0},
  {id:'hook',label:'HOOK',cue:'hooked secondary',cooldown:3.8},
  {id:'aoe',label:'GROUND RUPTURE',cue:'heavy core',cooldown:5.6},
  {id:'dash-cut',label:'PHASE CUT',cue:'split core',cooldown:4.5},
  {id:'execution',label:'EXECUTION',cue:'toothed edge',cooldown:5.2},
  {id:'pulse',label:'STAGGER PULSE',cue:'ring core',cooldown:4.7}
];

const HANDLES=[
  {id:'short',label:'short grip',reach:0.86,recovery:0.84,visualLength:0.72},
  {id:'standard',label:'standard grip',reach:1,recovery:1,visualLength:1},
  {id:'long',label:'long haft',reach:1.26,recovery:1.18,visualLength:1.42}
];
const SECONDARIES=[
  {id:'none',label:'bare spine',skillBias:null},
  {id:'hook',label:'rear hook',skillBias:'hook'},
  {id:'core',label:'glowing core',skillBias:'projectile'},
  {id:'guard',label:'side guard',skillBias:'parry'},
  {id:'ring',label:'resonance ring',skillBias:'pulse'},
  {id:'counterweight',label:'heavy counterweight',skillBias:'aoe'}
];
const TRAITS=[
  {id:'hungry',label:'Hungry',copy:'heal on execution',effect:'heal-exec'},
  {id:'chain',label:'Chained',copy:'stagger can chain to nearby targets',effect:'chain-stagger'},
  {id:'afterimage',label:'Afterimage',copy:'perfect dodge accelerates attacks',effect:'dodge-haste'},
  {id:'rupture',label:'Rupture',copy:'heavy stagger causes a small blast',effect:'stagger-blast'},
  {id:'echo',label:'Echo',copy:'skill repeats at reduced force',effect:'skill-echo'},
  {id:'redline',label:'Redline',copy:'low health increases stagger',effect:'lowhp-stagger'}
];
const ADJECTIVES=['Crooked','Red','Grave','Hollow','Choir','Iron','Sour','Mourning','Ash','Saint'];

export function weaponSignature(w){return [w.core,w.head,w.handle,w.secondary,w.trait,w.skill].join('/');}

export function generateWeapon(seed,floor=1,recent=[],tier=3){
  const history=recent.slice(-18);
  const level=clamp(Math.floor(tier)||1,1,3);
  const cores=WEAPON_CORES.slice(0,[0,4,5,6][level]);
  const heads=WEAPON_HEADS.slice(0,[0,6,8,10][level]);
  const skills=WEAPON_SKILLS.slice(0,[0,5,7,8][level]);
  const traits=TRAITS.slice(0,[0,4,5,6][level]);
  let result;
  for(let attempt=0;attempt<24;attempt+=1){
    const rng=makeRng((Number(seed)^Math.imul(floor+31,0x9e3779b1)^Math.imul(attempt+1,0x45d9f3b))>>>0);
    const core=choice(rng,cores), head=choice(rng,heads), handle=choice(rng,HANDLES), secondary=choice(rng,SECONDARIES), trait=choice(rng,traits);
    let skill=secondary.skillBias?skills.find(s=>s.id===secondary.skillBias):choice(rng,skills);
    if(!skill)skill=choice(rng,skills);
    if(core.id==='maul' && rng()<0.5) skill=skills.find(s=>s.id==='aoe')||skill;
    if(core.id==='claws' && rng()<0.45) skill=skills.find(s=>s.id==='dash-cut')||skill;
    const cadence=clamp(core.cadence*(head.id==='slab'?0.82:1)*(handle.id==='short'?1.12:handle.id==='long'?0.88:1),0.42,1.85);
    const reach=core.reach*handle.reach;
    const damage=(12+floor*1.05)*core.baseDamage*head.damage;
    result={
      seed:Number(seed)>>>0,core:core.id,head:head.id,handle:handle.id,secondary:secondary.id,trait:trait.id,skill:skill.id,
      coreSpec:core,headSpec:head,handleSpec:handle,secondarySpec:secondary,traitSpec:trait,skillSpec:skill,
      damage,cadence,reach,arc:core.arc*head.arc,stagger:head.stagger*(core.id==='maul'?1.25:1),
      recovery:(1/cadence)*handle.recovery,comboLength:core.combo,magnetism:core.magnetism,
      movement:core.id==='spear'?'lunge':core.id==='claws'||core.id==='twin'?'step-in':core.id==='maul'?'rooted':'advance',
      name:`${choice(rng,ADJECTIVES)} ${head.label.toUpperCase()}`
    };
    result.signature=weaponSignature(result);
    if(!history.includes(result.signature)) return result;
  }
  return result;
}
