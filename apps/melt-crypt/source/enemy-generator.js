import { clamp, choice, makeRng } from './core.js';

export const ENEMY_BODIES = [
  { id:'brute', label:'heavy torso', hp:1.38, speed:0.78, scale:1.18 },
  { id:'bishop', label:'tall torso', hp:1.02, speed:0.94, scale:1.02 },
  { id:'crawler', label:'low crawler', hp:0.84, speed:1.18, scale:0.92 },
  { id:'serpent', label:'segmented body', hp:0.9, speed:1.1, scale:0.9 },
  { id:'tripod', label:'tripod core', hp:1.08, speed:1.04, scale:1.0 },
  { id:'jaw', label:'jaw beast', hp:0.96, speed:1.12, scale:1.04 }
];

export const LOCOMOTIONS = [
  { id:'heavy-biped', label:'heavy steps', speed:0.84, cadence:0.88, visual:'boots' },
  { id:'fast-biped', label:'runner legs', speed:1.24, cadence:1.22, visual:'long-legs' },
  { id:'crawler', label:'crawler gait', speed:1.14, cadence:1.35, visual:'low-legs' },
  { id:'hopper', label:'hopper legs', speed:1.06, cadence:0.72, visual:'spring-legs' },
  { id:'floating', label:'floating', speed:0.96, cadence:0.82, visual:'levitation-ring' }
];

export const HEADS = [
  { id:'bare', label:'bare head', headArmor:0, cue:'open face' },
  { id:'armored', label:'armored head', headArmor:0.78, cue:'metal shell' },
  { id:'horned', label:'horned skull', headArmor:0.15, cue:'horns' },
  { id:'many-eyes', label:'many eyes', headArmor:0.05, cue:'eye cluster' },
  { id:'split-jaw', label:'split jaw', headArmor:0.08, cue:'wide jaw' },
  { id:'crowned', label:'crowned head', headArmor:0.22, cue:'crown plates' }
];

export const ARM_MODULES = [
  { id:'hammer', label:'great hammer', attack:'heavy-sweep', damage:1.42, reach:1.18, cadence:0.62, stagger:1.55, cue:'huge hammer' },
  { id:'claws', label:'claw hand', attack:'flurry', damage:0.72, reach:0.78, cadence:1.65, stagger:0.55, cue:'long claws' },
  { id:'spear', label:'bone spear', attack:'thrust', damage:1.0, reach:1.62, cadence:0.92, stagger:0.8, cue:'long spear' },
  { id:'shield', label:'side shield', attack:'shield-bash', damage:0.66, reach:0.8, cadence:0.78, stagger:1.18, cue:'large shield' },
  { id:'caster', label:'magic growth', attack:'bolt', damage:0.78, reach:5.8, cadence:0.72, stagger:0.38, cue:'glowing growth' },
  { id:'hook', label:'hook arm', attack:'hook-pull', damage:0.82, reach:2.0, cadence:0.78, stagger:0.92, cue:'hook blade' },
  { id:'crusher', label:'oversized fist', attack:'slam', damage:1.28, reach:1.0, cadence:0.7, stagger:1.32, cue:'oversized arm' },
  { id:'blade', label:'cleaver arm', attack:'cleave', damage:1.02, reach:1.18, cadence:1.0, stagger:0.88, cue:'broad blade' }
];

export const DEFENSES = [
  { id:'open', label:'open flesh', chestArmor:0, sideBlock:null, cue:'unarmored torso' },
  { id:'chest-plate', label:'heavy chest plate', chestArmor:0.72, sideBlock:null, cue:'armored chest / open legs' },
  { id:'left-shield', label:'left shield', chestArmor:0.12, sideBlock:'left', cue:'shield on left side' },
  { id:'right-shield', label:'right shield', chestArmor:0.12, sideBlock:'right', cue:'shield on right side' },
  { id:'leg-plates', label:'leg plates', chestArmor:0.08, sideBlock:null, legArmor:0.58, cue:'armored legs / open torso' },
  { id:'bone-cage', label:'bone cage', chestArmor:0.48, sideBlock:null, staggerResist:0.48, cue:'rib cage armor' }
];

export const MUTATIONS = [
  { id:'back-core', label:'volatile back core', cue:'glowing bubble on back', weakPoint:'back', death:'explode' },
  { id:'spikes', label:'contact spikes', cue:'body spikes', contactDamage:0.35 },
  { id:'arc-growth', label:'arcane growth', cue:'glowing shoulder growth', pulse:true },
  { id:'long-legs', label:'elongated legs', cue:'very long legs', dash:true, speed:1.16 },
  { id:'blood-sacs', label:'blood sacs', cue:'red sacs', death:'burst' },
  { id:'bone-plates', label:'bone plates', cue:'bone plates', staggerResist:0.4 },
  { id:'split-jaw', label:'split jaw mutation', cue:'split mouth', comboBonus:1 },
  { id:'none', label:'clean mutation', cue:'no obvious mutation' }
];

const PREFIXES=['Ash','Crooked','Saint','Red','Hollow','Grave','Iron','Pale','Burnt','Choir','Sour','Black'];
const NOUNS=['Warden','Butcher','Hound','Pilgrim','Maw','Knight','Widow','Clerk','Martyr','Stalker','Bell','Witness'];

export function enemySignature(enemy) {
  return [enemy.body,enemy.locomotion,enemy.head,enemy.leftArm,enemy.rightArm,enemy.defense,enemy.mutation,enemy.behavior].join('/');
}

export function signatureDistance(a,b) {
  const pa=String(a).split('/'), pb=String(b).split('/');
  let diff=0;
  const weight=[2,2,1,1,2,2,2,1];
  for(let i=0;i<Math.max(pa.length,pb.length);i+=1) if(pa[i]!==pb[i]) diff+=weight[i]||1;
  return diff;
}

function build(seed,floor,danger,salt=0,tier=3) {
  const rng=makeRng((Number(seed)^Math.imul(floor+17,0x45d9f3b)^Math.imul(salt+1,0x27d4eb2d))>>>0);
  const level=clamp(Math.floor(tier)||1,1,3);
  const bodies=ENEMY_BODIES.slice(0,[0,4,5,6][level]);
  const locomotions=LOCOMOTIONS.slice(0,[0,3,4,5][level]);
  const heads=HEADS.slice(0,[0,4,5,6][level]);
  const arms=ARM_MODULES.slice(0,[0,5,7,8][level]);
  const defenses=DEFENSES.slice(0,[0,4,5,6][level]);
  const mutations=MUTATIONS.slice(0,[0,5,7,8][level]);

  const body=choice(rng,bodies);
  let locomotion=choice(rng,locomotions);
  if(body.id==='crawler' && rng()<0.72) locomotion=locomotions.find(x=>x.id==='crawler')||locomotion;
  if(body.id==='serpent' && rng()<0.7) locomotion=locomotions.find(x=>x.id==='floating')||locomotion;
  const head=choice(rng,heads);
  const right=choice(rng,arms);
  let left=choice(rng,arms);
  if(right.id==='shield' && left.id==='shield') left=arms.find(x=>x.id==='blade')||arms.find(x=>x.id==='claws')||arms[0];
  let defense=choice(rng,defenses);
  if(left.id==='shield') defense=DEFENSES.find(x=>x.id==='left-shield');
  if(right.id==='shield') defense=DEFENSES.find(x=>x.id==='right-shield');
  const mutation=choice(rng,mutations);
  const threat=clamp(danger*(0.9+rng()*0.25),0.6,4);
  const elite=rng()<Math.min(0.06+floor*0.01,0.18);
  const size=clamp(body.scale*(0.9+rng()*0.2)*(elite?1.12:1),0.72,1.42);
  const speed=clamp((2.35+floor*0.035)*body.speed*locomotion.speed*(mutation.speed||1),1.25,5.0);
  const baseDamage=(5.5+floor*1.18)*threat;
  const maxHp=Math.round((24+floor*5.8)*threat*body.hp*(elite?1.62:1));
  const behavior=right.attack==='bolt'||mutation.pulse?'ranged':right.attack==='heavy-sweep'||right.attack==='slam'?'pressure':locomotion.id==='fast-biped'||mutation.dash?'charger':'hunter';
  const hue=350+Math.floor(rng()*18)-9;
  const accentHue=8+Math.floor(rng()*24);
  const enemy={
    seed:Number(seed)>>>0, body:body.id, locomotion:locomotion.id, head:head.id,
    leftArm:left.id, rightArm:right.id, defense:defense.id, mutation:mutation.id, behavior,
    bodySpec:body, locomotionSpec:locomotion, headSpec:head, leftArmSpec:left, rightArmSpec:right,
    defenseSpec:defense, mutationSpec:mutation,
    size, speed, maxHp, damage:Math.round(baseDamage*right.damage*(elite?1.22:1)),
    cadence:right.cadence*locomotion.cadence, reach:right.reach, stagger:right.stagger,
    elite, hue, accentHue, motion:locomotion.id, phase:rng()*Math.PI*2,
    eyes: head.id==='many-eyes'?5:head.id==='split-jaw'?2:1,
    horns: head.id==='horned'?3:head.id==='crowned'?2:0,
    crest: head.id==='crowned'?3:0,
    halo: mutation.id==='arc-growth',
    limbs: locomotion.id==='crawler'?6:locomotion.id==='floating'?0:2,
    wobble: locomotion.id==='hopper'?1.5:locomotion.id==='fast-biped'?1.25:0.85,
    ability:right.attack,
    name:`${elite?'EXALTED ':''}${choice(rng,PREFIXES)} ${choice(rng,NOUNS)}`
  };
  enemy.signature=enemySignature(enemy);
  return enemy;
}

export function generateEnemyBlueprint(seed,floor=1,danger=1,recent=[],tier=3) {
  let candidate=build(seed,floor,danger,0,tier);
  const history=recent.slice(-30);
  for(let attempt=0;attempt<32;attempt+=1){
    candidate=build(seed,floor,danger,attempt,tier);
    const tooSimilar=history.some(sig=>signatureDistance(candidate.signature,sig)<5);
    if(!tooSimilar) return candidate;
  }
  return candidate;
}
