// Combat rules for medieval oared warships. Deterministic: no unseeded random hits.
const TAU=Math.PI*2;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const fraction=(v,max)=>clamp((Number(v)||0)/(Number(max)||1),0,1);
const normalize=(angle)=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function oarFraction(s){return fraction(s.oars??100,s.maxOars??100);}
export function moraleFraction(s){return fraction(s.morale??100,100);}
export function condition(s){
 const oars=oarFraction(s),crew=fraction(s.crew,s.maxCrew),morale=moraleFraction(s);
 return {oars,crew,morale,
  speed:clamp(.2+.8*oars, .18,1)*(.66+.34*crew)*(.78+.22*morale),
  turn:clamp(.25+.75*oars,.22,1)*(.8+.2*crew),
  range: .65+.35*morale,
  fighters:.35+.65*crew};
}
// Point of impact relative to defender's heading. Bow and stern are harder to hit.
export function attackSector(defender,source){
 const a=normalize(Math.atan2(source.y-defender.y,source.x-defender.x)-defender.angle);
 if(Math.abs(a)<.69)return 'bow';
 if(Math.abs(a)>Math.PI-.76)return 'stern';
 return a>0?'starboard':'port';
}
export function attackPacket(attacker,defender,kind='arrows',contactSpeed=null){
 const sector=attackSector(defender,attacker),side=sector==='port'||sector==='starboard';
 const attackerMorale=moraleFraction(attacker),eff=.65+.35*attackerMorale;
 if(kind==='ram'){
  const impact=Math.max(0,(contactSpeed??(Math.abs(attacker.velocity)+Math.abs(defender.velocity)))*.092);
  const power=impact*(sector==='stern'?1.22:side?1.05:.8);
  return {sector,hull:power,crew:power*.17,oars:side?power*2.4:power*.32,morale:power*.7};
 }
 const base=(attacker.damage||3)*eff;
 return {sector,hull:base*(side?.84:sector==='stern'?1.18:.65),
   crew:base*(sector==='stern'?.43:.22),
   oars:base*(side?1.3:.14),
   morale:base*(sector==='stern'?1.18:.65)};
}
export function boardingStrength(ship,position='bow',support=0){
 const c=condition(ship),p=Number(ship.board||2.5);
 const pos=position==='stern'?1.35:position==='port'||position==='starboard'?1.1:1;
 return p*(.42+.58*c.crew)*(.6+.4*c.morale)*pos*(1+support*.22);
}
export function contest(attacker,defender,supportAttacker=0,supportDefender=0){
 const flank=attackSector(defender,attacker),defendAngle=attackSector(attacker,defender);
 const attack=boardingStrength(attacker,flank,supportAttacker);
 const defense=boardingStrength(defender,defendAngle,supportDefender)*.9;
 return {flank,pressure:(attack-defense)*3.7+0.45,attack,defense,
  attackerCrewDamage:Math.max(.3,defense*.27),
  defenderCrewDamage:Math.max(.5,attack*.4),
  attackerMoraleDamage:defense*.15,
  defenderMoraleDamage:attack*.24};
}
export function nearbySupport(ships,ship,other){
 return ships.filter(s=>s.alive&&s.id!==ship.id&&s.id!==other.id&&s.side===ship.side&&
  Math.hypot(s.x-ship.x,s.y-ship.y)<125&&s.order!=='evade').length;
}
export function rangeBlocked(a,b,islands,terrainDistance){
 for(let i=1;i<11;i++){
  let x=a.x+(b.x-a.x)*i/11,y=a.y+(b.y-a.y)*i/11;
  if(islands.some(isl=>terrainDistance(isl,x,y)<1.2))return true;
 }return false;
}
