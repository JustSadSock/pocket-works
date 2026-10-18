// ПЕРЕКОС 0.5 — deterministic rune grammar, three chains and school-weighted choices.
// Nine slots, across up to three independent WHEN chains, are read from left to right: WHEN -> DO -> CHANGE. A new WHEN starts a new chain.
import {mage} from './mages.mjs';
const entry=(id,type,name,desc,detail='')=>({id,type,name,desc,detail});
const SCHOOL_FAVORITES={
 fire:new Set(['ball','blast','mine','strong','wide','on_cast','on_hit','drain']),
 storm:new Set(['blink','slow','haste','quick','fastshot','on_dash','on_bounce','bounce']),
 stone:new Set(['wall','armor','push','lasting','on_hurt','on_guard','on_break','strong'])
};
export const RUNES=Object.freeze([
entry('on_cast','when','При выстреле','Когда сам выпускаю обычный шар.'),
entry('on_hit','when','При попадании','Когда мой шар наносит урон.'),
entry('on_hurt','when','Когда меня бьют','Когда получаю урон здоровью.'),
entry('on_guard','when','После щита','Когда сам ставлю щит.'),
entry('on_dash','when','После рывка','Когда применяю рывок.'),
entry('on_break','when','Когда щит разбили','Когда последний щит пропадает от удара.'),
entry('on_bounce','when','При отскоке','Когда мой шар отскакивает от стены.'),
entry('on_heal','when','После лечения','Когда здоровье действительно восстановилось.'),
entry('on_close','when','Рядом с врагом','Раз в секунду, если враг близко.'),
entry('on_clock','when','Раз в две секунды','Пока идёт раунд, каждые две секунды.'),
entry('on_overload','when','При перегреве','Когда шкала перегрузки заполняется.'),
entry('on_expire','when','Когда шар пропал','Когда мой шар исчез, не попав в цель.'),
entry('ball','do','Выпустить шар','Дополнительный шар летит в сторону врага.'),
entry('heal','do','Подлечиться','Восстанавливаю 7 здоровья.'),
entry('armor','do','Добавить щит','Получаю 11 щита, но не больше 80.'),
entry('blast','do','Ударить рядом','Раню врага, если он близко.'),
entry('blink','do','Прыгнуть вперёд','Смещаюсь на 38 шагов по направлению взгляда.'),
entry('clone','do','Оставить копию','Копия дважды стреляет и исчезает.'),
entry('mine','do','Поставить мину','Мина взрывается рядом с врагом.'),
entry('wall','do','Поставить стену','Короткая каменная стена перекрывает выстрелы.'),
entry('push','do','Толкнуть врага','Отбрасываю близкого врага.'),
entry('slow','do','Замедлить врага','Враг движется медленнее две секунды.'),
entry('haste','do','Ускориться','Я двигаюсь быстрее две секунды.'),
entry('cool','do','Остудиться','Снимаю 22 единицы перегрузки.'),
entry('double','how','Сделать дважды','Предыдущее действие срабатывает дважды.'),
entry('triple','how','Сделать трижды','Предыдущее действие срабатывает трижды.'),
entry('strong','how','Сделать сильнее','Больше урона, щита или лечения.'),
entry('far','how','Дальше','Снаряд летит дальше, перемещение длиннее.'),
entry('bounce','how','От стены назад','Снаряд один раз отскакивает от стены.'),
entry('drain','how','Лечить от удара','Если созданный шар попал, лечусь на 3.'),
entry('lasting','how','Дольше','Стены, копии и эффекты живут дольше.'),
entry('wide','how','Пошире','Радиус взрыва и размер снаряда больше.'),
entry('cheap','how','Меньше нагрев','Эта цепочка создаёт меньше перегрузки.'),
entry('quick','how','Чаще','У этой цепочки короче пауза.'),
entry('reverse','how','В обратную сторону','Шар и прыжок идут в обратном направлении.'),
entry('fastshot','how','Быстрее летит','Снаряд летит быстрее, толчок сильнее.')
]);
export const RUNE_BY_ID=new Map(RUNES.map(r=>[r.id,r]));
export const TYPES=Object.freeze({when:'КОГДА',do:'ЧТО',how:'КАК'});
export const MAX_RUNES=9,MAX_CHAINS=3,MAX_CHAIN_DEPTH=3,MAX_REACTIONS_PER_TICK=20,MAX_QUEUE=48,HEAT_LIMIT=100;
export function rune(id){return RUNE_BY_ID.get(id)||null}
export function legalRunes(ids){return Array.isArray(ids)&&ids.length<=MAX_RUNES&&ids.filter(id=>RUNE_BY_ID.get(id)?.type==='when').length<=MAX_CHAINS&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&RUNE_BY_ID.has(id))}
export function compile(ids){
 const chains=[];let chain=null,lastAction=null;
 for(const id of ids||[]){
  const r=rune(id);if(!r)continue;
  if(r.type==='when'){chain={trigger:id,actions:[]};chains.push(chain);lastAction=null}
  else if(r.type==='do'){if(chain){lastAction={id,mods:[]};chain.actions.push(lastAction)}}
  else if(lastAction)lastAction.mods.push(id);
 }
 return chains;
}
export function description(ids){
 const chains=compile(ids),readable=[];
 for(const chain of chains){const title=rune(chain.trigger)?.name||'';for(const a of chain.actions){readable.push([title,rune(a.id).name,...a.mods.map(m=>rune(m).name)].join(' → '))}}
 const dormant=(ids||[]).filter(id=>!chains.some(c=>c.trigger===id||c.actions.some(a=>a.id===id||a.mods.includes(id))));
 return {chains,lines:readable,dormant,ready:readable.length>0};
}
export function cooldown(mods){return mods.includes('quick')?.28:.56}
export function heatCost(mods){return Math.max(2,Math.round((11+mods.length*4)*(mods.includes('cheap')?.38:1)))}
export function repetitions(mods){return mods.includes('triple')?3:mods.includes('double')?2:1}
export function eligibleOffers(state,player=0){
 const ids=state.actors[player].runes,existing=new Set(ids),pool=RUNES.filter(r=>!existing.has(r.id));
 const info=description(ids);
 // A meaningful action is always favored when a newly opened trigger still has none.
 let pref=info.chains.some(c=>!c.actions.length)?'do':info.chains.length===0?'when':info.chains.some(c=>c.actions.some(a=>a.mods.length===0))?'how':'when';
 const favorites=SCHOOL_FAVORITES[mage(state.actors[player]?.mageId).school];
 const weight=r=>(r.type===pref?3:1)*(favorites.has(r.id)?1.6:1);
 const shuffled=[];const allowWhen=ids.filter(id=>RUNE_BY_ID.get(id)?.type==='when').length<MAX_CHAINS;
 while(pool.length){if(!allowWhen){for(let i=pool.length-1;i>=0;i--)if(pool[i].type==='when')pool.splice(i,1)}let total=0;for(const r of pool)total+=weight(r);let x=stateRandom(state)*total,chosen=pool.length-1;for(let i=0;i<pool.length;i++){x-=weight(pool[i]);if(x<0){chosen=i;break}}shuffled.push(pool.splice(chosen,1)[0].id)}
 return shuffled.slice(0,3);
}
function stateRandom(state){state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;return state.seed/4294967296}
export function chainMatches(id,event){return id===event}
export function compilePreview(ids){const info=description(ids);return info.lines.length?info.lines:['Поставь после «КОГДА» руну «ЧТО». Порядок рун влияет на результат.']}
