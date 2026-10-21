// Six mechanically distinct fighters in three plain-language magic families.
// This data is frozen into the matching server ruleset version.
const mageEntry=(id,school,name,trait,description,style,speed,power,reload,shield)=>({id,school,name,trait,description,style,speed,power,reload,shield});
export const SCHOOLS=Object.freeze([
 {id:'fire',name:'Жар',explain:'Горение от попаданий или поток огня вблизи.'},
 {id:'storm',name:'Ток',explain:'Пробой щитов или мгновенная молния.'},
 {id:'stone',name:'Камень',explain:'Осколочные валуны или фронт ударной волны.'}
]);
export const MAGES=Object.freeze([
 mageEntry('kindle','fire','Искра','burn','Шар поджигает врага. «Дольше» продлевает горение.','orb',1,.95,1.04,.94),
 mageEntry('cinder','fire','Уголёк','miss_cool','Зажми атаку: непрерывный огненный поток на близкой дистанции.','flame',1.05,.92,.9,.9),
 mageEntry('wire','storm','Провод','dash_haste','Сквозь щиты пробивает быстрый болт, рывок ускоряет.','bolt',1.07,.86,1.04,.88),
 mageEntry('coil','storm','Катушка','guard_slow','Короткое накопление энергии, затем мгновенная молния и пробой щита.','arc',1.03,.98,.97,.96),
 mageEntry('pebble','stone','Галька','guard_extra','Замах, бросок по дуге и тяжёлое падение в точку прицела.','rock',.94,1.1,1.12,1.15),
 mageEntry('slate','stone','Плита','hit_push','Удар в землю после подготовки выпускает расходящуюся волну.','wave',.97,1.06,1.06,1.06)
]);
export const MAGE_BY_ID=new Map(MAGES.map(x=>[x.id,x]));
export function mage(id){return MAGE_BY_ID.get(id)||MAGES[0]}
export function validMage(id){return typeof id==='string'&&MAGE_BY_ID.has(id)}
