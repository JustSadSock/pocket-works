// Element pairs react only on an actual hit, never from a cosmetic particle.
export const ELEMENTS=Object.freeze({
 fire:{label:'Жар',color:'#ed9765'},
 storm:{label:'Заряд',color:'#8bd8d1'},
 stone:{label:'Крошка',color:'#bcc49b'}
});
export const REACTIONS=Object.freeze({
 'fire|storm':{id:'steam',label:'Пар',bonus:4,slow:.65,shield:0,heat:0,push:0},
 'fire|stone':{id:'slag',label:'Шлак',bonus:5,slow:0,shield:0,heat:5,push:0},
 'stone|storm':{id:'crack',label:'Пробой',bonus:2,slow:0,shield:10,heat:0,push:12}
});
export function reactionFor(a,b){
 if(!ELEMENTS[a]||!ELEMENTS[b]||a===b)return null;
 return REACTIONS[[a,b].sort().join('|')]||null;
}
export function isElement(id){return Object.hasOwn(ELEMENTS,id)}
