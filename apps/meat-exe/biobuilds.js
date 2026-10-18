// MEAT.EXE / v1.6 — battle-altering grafts.
// A small, deterministic set of mutually exclusive one-time surgeries.
// Weapon and body builds live in saved state; stats are derived, never cached.
export const GRAFTS=Object.freeze([
 {id:'stinger',group:'weapon',name:'ИГЛОМЁТ',detail:'Третий ствол: пробивает два тела. Медленный, но точный.',cost:'Скорострельность ниже',mark:'III'},
 {id:'bolt_press',group:'weapon',name:'ТЯЖЁЛЫЙ ЗАТВОР',detail:'Костолом: +13 урона за выстрел.',cost:'Перезарядка на 22% дольше',mark:'I'},
 {id:'bolt_rapid',group:'weapon',name:'ЛЁГКАЯ КОСТЬ',detail:'Костолом стреляет на 35% чаще.',cost:'Урон выстрела −20%',mark:'I'},
 {id:'shot_teeth',group:'weapon',name:'ДОПОЛНИТЕЛЬНЫЕ ЗУБЫ',detail:'Мясорубка выпускает 9 дробин вместо 7.',cost:'Чуть шире разброс и дольше перезарядка',mark:'II'},
 {id:'shot_choke',group:'weapon',name:'УЗКОЕ ГОРЛО',detail:'Мясорубка бьёт вдвое кучнее.',cost:'−10% урона каждой дробины',mark:'II'},
 {id:'marrow_plate',group:'body',name:'КОСТНЫЙ ПАНЦИРЬ',detail:'Максимум здоровья +25. Исцеление сразу +25.',cost:'Двигаешься на 12% медленнее',mark:'+'},
 {id:'blood_pump',group:'body',name:'КРОВЯНОЙ НАСОС',detail:'За каждого убитого врага восстанавливаешь 7 HP.',cost:'Максимум здоровья −16',mark:'+'},
 {id:'nerve_splice',group:'body',name:'НЕРВНАЯ СШИВКА',detail:'Рывок перезаряжается на 40% быстрее.',cost:'Получаешь на 15% больше урона',mark:'+'},
 {id:'rupture_gland',group:'body',name:'РАЗРЫВНАЯ ЖЕЛЕЗА',detail:'Мембраны рвутся в 1,8 раза быстрее.',cost:'Иммунный ответ после вскрытия сильнее',mark:'+'},
 {id:'shock_dash',group:'body',name:'УДАРНАЯ МЫШЦА',detail:'Рывок ранит всех врагов рядом на 27 HP.',cost:'Рывок перезаряжается на 25% дольше',mark:'+'},
 {id:'scavenger',group:'body',name:'ПОЖИРАТЕЛЬ ОСТАТКОВ',detail:'Каждый фрагмент также лечит 9 HP.',cost:'Начинаешь с −10 максимальных HP',mark:'+'}
]);
const INDEX=new Map(GRAFTS.map(g=>[g.id,g]));
const bounded=(n,a,b)=>Math.max(a,Math.min(b,n));
export function sanitizeGrafts(raw){
 if(!Array.isArray(raw))return [];
 return [...new Set(raw.filter(id=>typeof id==='string'&&INDEX.has(id)))].slice(0,4);
}
export function hasGraft(state,id){return sanitizeGrafts(state?.grafts).includes(id);}
export function graftForId(id){return INDEX.get(id)||null;}
export function drawGrafts(seed,wave,existing=[],revision=0){
 const owned=new Set(sanitizeGrafts(existing));
 let pool=GRAFTS.filter(g=>!owned.has(g.id));
 if(pool.length<3)return pool;
 let v=((seed>>>0)^Math.imul(wave>>>0,0x9e3779b1)^Math.imul(revision>>>0,0x85ebca6b)^0xe5b173d9)>>>0;
 const random=()=>{v+=0x6d2b79f5;let t=v;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 // Guarantee at least one weapon + one body choice when available.
 const pick=arr=>{const i=Math.floor(random()*arr.length);const chosen=arr.splice(i,1)[0];pool=pool.filter(x=>x.id!==chosen.id);return chosen;};
 const result=[];
 if(pool.some(g=>g.group==='weapon'))result.push(pick(pool.filter(g=>g.group==='weapon')));
 if(pool.some(g=>g.group==='body'))result.push(pick(pool.filter(g=>g.group==='body')));
 while(result.length<3&&pool.length)result.push(pick(pool));
 return result;
}
export function weaponBuild(state,weapon){
 const owned=new Set(sanitizeGrafts(state?.grafts));
 const base=[
  {name:'КОСТОЛОМ',damage:26,cooldown:.22,pellets:1,spread:.015,range:17},
  {name:'МЯСОРУБКА',damage:14,cooldown:.55,pellets:7,spread:.12,range:12},
  {name:'ИГЛОМЁТ',damage:59,cooldown:.96,pellets:1,spread:.008,range:21}
 ][weapon]||{name:'КОСТОЛОМ',damage:26,cooldown:.22,pellets:1,spread:.015,range:17};
 const result={...base};
 if(weapon===0&&owned.has('bolt_press')){result.damage+=13;result.cooldown*=1.22;}
 if(weapon===0&&owned.has('bolt_rapid')){result.cooldown*=.74;result.damage*=.8;}
 if(weapon===1&&owned.has('shot_teeth')){result.pellets=9;result.spread*=1.16;result.cooldown*=1.10;}
 if(weapon===1&&owned.has('shot_choke')){result.spread*=.48;result.damage*=.9;}
 result.damage+=bounded(Number(state?.damageBonus)||0,0,250)+bounded(Number(state?.level)||0,0,8)*3;
 result.cooldown*=Math.max(.56,1-bounded(Number(state?.level)||0,0,8)*.055);
 return result;
}
export function dashCooldown(state){const owned=new Set(sanitizeGrafts(state?.grafts));return 2.7*(owned.has('nerve_splice')?.6:1)*(owned.has('shock_dash')?1.25:1);}
export function moveSpeed(state){return hasGraft(state,'marrow_plate')?.88:1;}
export function incomingDamage(state,raw){return raw*(hasGraft(state,'nerve_splice')?1.15:1);}
export function membraneDamage(state,base){return base*(hasGraft(state,'rupture_gland')?1.8:1);}
export function immuneHeatGain(state,base){return base*(hasGraft(state,'rupture_gland')?1.55:1);}
export function maxWeaponIndex(state){return hasGraft(state,'stinger')?2:1;}
export function applyGraft(state,id){
 if(!INDEX.has(id)||hasGraft(state,id)||sanitizeGrafts(state.grafts).length>=4)return false;
 state.grafts=[...sanitizeGrafts(state.grafts),id];
 if(id==='marrow_plate'){state.maxHp=Math.min(160,state.maxHp+25);state.hp=Math.min(state.maxHp,state.hp+25);}
 if(id==='blood_pump'){state.maxHp=Math.max(40,state.maxHp-16);state.hp=Math.min(state.hp,state.maxHp);}
 if(id==='scavenger'){state.maxHp=Math.max(40,state.maxHp-10);state.hp=Math.min(state.hp,state.maxHp);}
 if(!Number.isFinite(state.biomass))state.biomass=0;
 return true;
}
