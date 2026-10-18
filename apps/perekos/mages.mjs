// Six mechanically distinct fighters in three plain-language magic families.
// This data is frozen into the matching server ruleset version.
const entry=(id,school,name,trait,description,style,speed,power,reload,shield)=>({id,school,name,trait,description,style,speed,power,reload,shield});
export const SCHOOLS=Object.freeze([
 {id:'fire',name:'Жар',explain:'Плотные горячие сгустки. Попадания и перегрузка.'},
 {id:'storm',name:'Искра',explain:'Быстрые тонкие разряды. Рывки и контроль.'},
 {id:'stone',name:'Камень',explain:'Тяжёлые куски и волны. Щиты и ближний бой.'}
]);
export const MAGES=Object.freeze([
 entry('kindle','fire','Искра','burn','Попадание чуть нагревает врага.','orb',1,1,.98,.94),
 entry('cinder','fire','Уголёк','miss_cool','Промах помогает остыть.','flame',1.05,.92,.9,.9),
 entry('wire','storm','Провод','dash_haste','После рывка ненадолго ускоряется.','bolt',1.07,.94,.88,.88),
 entry('coil','storm','Катушка','guard_slow','Щит замедляет врага рядом.','arc',1.02,.95,1,.94),
 entry('pebble','stone','Галька','guard_extra','Щит получает ещё немного прочности.','rock',.94,1.1,1.12,1.15),
 entry('slate','stone','Плита','hit_push','Попадания слегка толкают врага.','wave',.92,1.06,1.1,1.08)
]);
export const MAGE_BY_ID=new Map(MAGES.map(x=>[x.id,x]));
export function mage(id){return MAGE_BY_ID.get(id)||MAGES[0]}
export function validMage(id){return typeof id==='string'&&MAGE_BY_ID.has(id)}
