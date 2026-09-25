export const VERSION = '1.0.0';
export const LANES = 4;

export const SIGILS = {
  pack: { name: 'Стая', mark: '▲', text: '+1 атака за соседнего союзника.' },
  thorn: { name: 'Шип', mark: '✣', text: 'Атакующий получает 1 урона.' },
  hunger: { name: 'Голод', mark: '⌁', text: '+1 атака после добивания.' },
  brood: { name: 'Выводок', mark: '◇', text: 'После смерти оставляет Моль 1/1.' },
  echo: { name: 'Эхо', mark: '↟', text: 'После смерти возвращается в руку.' },
  lurk: { name: 'Засада', mark: '⌄', text: '+1 урон по пустой линии.' },
  ward: { name: 'Оберег', mark: '□', text: 'Игнорирует первый полученный урон.' },
  scavenger: { name: 'Падальщик', mark: '○', text: '+1 Останок, когда погибает союзник.' },
  root: { name: 'Корень', mark: '╫', text: '+2 здоровья при входе в бой.' },
  bleed: { name: 'Кровь', mark: '◆', text: 'После удара по зверю наносит ещё 1.' }
};

const C = (id, name, faction, costType, cost, atk, hp, sigils, text, rarity='common') => ({
  id, name, type: 'creature', faction, costType, cost, atk, hp, sigils, text, rarity
});
const R = (id, name, cost, text, rite, rarity='common') => ({
  id, name, type: 'rite', faction:'rite', costType:'ember', cost, atk:0, hp:0, sigils:[], text, rite, rarity
});

export const CARD_LIBRARY = [
  C('hare','Серый заяц','beast','ember',0,0,1,['echo'],'Дешёвая кровь леса.'),
  C('crow','Ворон','carrion','ember',1,1,1,['scavenger'],'Собирает то, что другие оставляют.'),
  C('wolf','Лесной волк','beast','ember',2,2,2,['pack'],'Лучше рядом со своими.'),
  C('boar','Кабан','beast','remains',2,2,4,['thorn'],'Слишком злой, чтобы умирать тихо.'),
  C('stag','Чёрный олень','beast','remains',3,3,4,['root'],'Тяжёлый лесной якорь.','uncommon'),
  C('moth','Пепельная моль','spirit','ember',1,1,1,['brood'],'После неё всегда остаётся ещё немного ночи.'),
  C('owl','Слепая сова','spirit','ember',2,2,2,['lurk'],'Бьёт туда, где никто не ждёт.'),
  C('fox','Красная лиса','beast','ember',2,2,2,['hunger'],'Каждая добыча делает её хуже. В хорошем смысле.'),
  C('toad','Могильная жаба','fungal','remains',1,1,3,['scavenger'],'Ей нравится плохая компания.'),
  C('mushroom','Грибница','fungal','ember',1,0,4,['thorn','root'],'Стоит. Ждёт. Портит настроение.','uncommon'),
  C('adder','Гадюка','beast','remains',2,2,1,['bleed'],'Маленькая, быстрая, очень принципиальная.'),
  C('doe','Белая лань','spirit','ember',2,1,3,['ward'],'Первый удар проходит сквозь неё, как сон.'),
  C('hound','Псарь без хозяина','carrion','remains',3,3,3,['hunger','scavenger'],'Ему достаточно одного запаха смерти.','rare'),
  C('ram','Костяной баран','carrion','remains',4,4,5,['thorn','lurk'],'Ломает пустые линии и чужие планы.','rare'),
  C('weaver','Ткач корней','fungal','ember',3,1,6,['root','pack'],'Соседи быстро понимают, что теперь они семья.','rare'),
  C('nightjar','Козодой','spirit','ember',3,3,2,['ward','echo'],'Слишком часто возвращается.','rare'),
  C('moose','Старый лось','beast','remains',5,5,7,['root'],'Когда он входит, доска становится маленькой.','rare'),
  R('bark','Кора на рану',1,'Союзник получает +0/+3 и Оберег.','bark'),
  R('needle','Костяная игла',1,'Союзник получает +1/+1. Возьми карту.','needle'),
  R('salt','Чёрная соль',1,'Нанеси 2 урона вражескому зверю.','salt'),
  R('milk','Лунное молоко',2,'Восстанови 3 сердца.','milk'),
  R('molt','Линька',1,'Уничтожь союзника. Возьми 2 карты и получи 2 Останка.','molt','uncommon'),
  R('whisper','Шёпот из-под коры',2,'Возьми 3 карты.','whisper','uncommon')
];

const ENEMY_LIBRARY = [
  C('enemy-wolf','Голодный волк','enemy','none',0,2,2,['pack'],''),
  C('enemy-crow','Чёрный ворон','enemy','none',0,1,1,['scavenger'],''),
  C('enemy-boar','Дикий кабан','enemy','none',0,2,4,['thorn'],''),
  C('enemy-moth','Ночная моль','enemy','none',0,1,1,['brood'],''),
  C('enemy-owl','Сова без глаз','enemy','none',0,2,2,['lurk'],''),
  C('enemy-adder','Болотная гадюка','enemy','none',0,2,1,['bleed'],''),
  C('enemy-stag','Рогатый страж','enemy','none',0,3,5,['root'],''),
  C('enemy-ram','Костяной баран','enemy','none',0,4,5,['thorn','lurk'],'')
];

export const RELICS = [
  { id:'black-candle', name:'Чёрная свеча', text:'Первый ход каждого боя: +1 Уголь.', effect:'firstEmber' },
  { id:'crow-bell', name:'Колокол падали', text:'Первая смерть союзника в бою даёт +2 Останка.', effect:'firstDeathRemains' },
  { id:'root-idol', name:'Корневой идол', text:'+3 максимальных сердца.', effect:'maxHp' },
  { id:'moth-lantern', name:'Фонарь моли', text:'Первая разыгранная карта в бою дешевле на 1 Уголь.', effect:'firstDiscount' },
  { id:'wet-teeth', name:'Мокрые зубы', text:'Первый прямой удар по врагу в каждом ходу наносит +1.', effect:'firstDirect' },
  { id:'hare-foot', name:'Лапа зайца', text:'В начале боя возьми дополнительную карту.', effect:'extraDraw' }
];

export function hashSeed(value) {
  const s = String(value ?? 'morok');
  let h = 2166136261 >>> 0;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
  return h >>> 0;
}
export function rngFrom(seed) {
  let x = hashSeed(seed) || 0x12345678;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function shuffle(items, rng=Math.random) {
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
export function uid(prefix='u'){ return `${prefix}-${Math.random().toString(36).slice(2,8)}-${Date.now().toString(36).slice(-5)}`; }
export function cloneCard(template, patch={}) {
  const source = typeof template === 'string' ? CARD_LIBRARY.find(c=>c.id===template) : template;
  if (!source) throw new Error(`Unknown card: ${template}`);
  return { ...source, sigils:[...(source.sigils||[])], instanceId:uid(source.id), upgrades:0, ...patch };
}
export function starterDeck() {
  return ['hare','hare','crow','wolf','moth','toad','fox','bark','needle','salt'].map(id=>cloneCard(id));
}
export function createProfile() { return { version:1, bestDepth:0, wins:0, totalRuns:0, discovered:[] }; }
export function createRun(seed=Date.now(), profile=createProfile()) {
  const runSeed=hashSeed(seed);
  const rng=rngFrom(runSeed);
  const maxHp=15;
  const run={
    version:1, seed:runSeed, depth:0, maxDepth:9, hp:maxHp, maxHp,
    deck:starterDeck(), relics:[], battle:null, pending:null, result:null,
    trail:generateTrail(runSeed), log:['Лес закрылся за спиной.'], stats:{kills:0,sacrifices:0,cardsPlayed:0},
    profileSnapshot:{wins:profile.wins||0}
  };
  const starters=['bark','needle','salt'];
  if (rng()>.55) run.deck.push(cloneCard(starters[Math.floor(rng()*starters.length)]));
  return run;
}

function generateTrail(seed){
  const rng=rngFrom(seed ^ 0x9e3779b9);
  const stages=[];
  const pools=[
    ['battle','cache'],['battle','hearth','altar'],['battle','omen'],
    ['battle','cache','altar'],['battle','hearth'],['battle','omen','cache'],
    ['battle','altar','hearth'],['battle','cache','omen']
  ];
  for(let i=0;i<8;i++){
    const pool=shuffle(pools[i],rng);
    const count=i===2||i===5?3:2;
    stages.push(pool.slice(0,count).map((type,j)=>({id:`${i}-${j}-${type}`,type,elite:type==='battle'&&rng()>.72})));
  }
  stages.push([{id:'8-boss',type:'boss',elite:true}]);
  return stages;
}

export function cardById(id){ return CARD_LIBRARY.find(c=>c.id===id); }
export function enemyById(id){ return ENEMY_LIBRARY.find(c=>c.id===id); }
export function sigilInfo(id){ return SIGILS[id] || {name:id,mark:'?',text:''}; }
export function nodeLabel(type){
  return ({battle:'Схватка',boss:'Хозяин чащи',cache:'Следы',altar:'Алтарь',hearth:'Костёр',omen:'Знак'})[type]||type;
}

function weightedCardPool(depth=0){
  return CARD_LIBRARY.filter(c=>{
    if(c.id==='hare') return depth<3;
    if(c.rarity==='rare') return depth>=3;
    if(c.rarity==='uncommon') return depth>=1;
    return true;
  });
}
export function rollCardChoices(run,count=3,salt='reward'){
  const rng=rngFrom(run.seed ^ hashSeed(`${salt}:${run.depth}:${run.deck.length}:${run.relics.length}`));
  const pool=weightedCardPool(run.depth);
  const picked=[];
  while(picked.length<count && picked.length<pool.length){
    const c=pool[Math.floor(rng()*pool.length)]; if(!picked.some(x=>x.id===c.id)) picked.push(cloneCard(c));
  }
  return picked;
}
export function rollRelicChoices(run,count=3){
  const rng=rngFrom(run.seed ^ hashSeed(`relic:${run.depth}`));
  return shuffle(RELICS.filter(r=>!run.relics.includes(r.id)),rng).slice(0,count);
}

function encounterPool(depth,boss=false){
  if(boss) return ['enemy-stag','enemy-ram','enemy-wolf','enemy-adder'];
  if(depth<2) return ['enemy-wolf','enemy-crow','enemy-moth'];
  if(depth<5) return ['enemy-wolf','enemy-boar','enemy-owl','enemy-adder','enemy-moth'];
  return ['enemy-boar','enemy-owl','enemy-adder','enemy-stag','enemy-ram'];
}
function makeEnemyUnit(id, depth=0){
  const base=enemyById(id); const scale=Math.floor(depth/4);
  return { ...base, sigils:[...base.sigils], instanceId:uid(id), maxHp:base.hp+scale, hp:base.hp+scale, atk:base.atk+scale, wardUsed:false, side:'enemy' };
}
function makePlayerUnit(card){
  const rootBonus=card.sigils.includes('root')?2:0;
  return { ...card, sigils:[...card.sigils], maxHp:card.hp+rootBonus, hp:card.hp+rootBonus, atk:card.atk, wardUsed:false, side:'player' };
}
function planIntent(battle, count=1){
  const rng=rngFrom(battle.seed ^ hashSeed(`intent:${battle.round}:${battle.spawnSerial++}`));
  const pool=encounterPool(battle.depth,battle.boss);
  const free=[0,1,2,3].filter(l=>!battle.enemy[l]&&!battle.intent.some(x=>x.lane===l));
  const lanes=shuffle(free,rng).slice(0,Math.min(count,free.length));
  for(const lane of lanes){
    const id=pool[Math.floor(rng()*pool.length)];
    battle.intent.push({lane, unit:makeEnemyUnit(id,battle.depth)});
  }
}

export function createBattle(run, boss=false, elite=false){
  const rng=rngFrom(run.seed ^ hashSeed(`battle:${run.depth}:${boss}:${elite}`));
  const drawPile=shuffle(run.deck.map(c=>({ ...c, sigils:[...c.sigils] })),rng);
  const maxHp = boss ? 22 + run.depth : 12 + run.depth*2 + (elite?4:0);
  const relics=new Set(run.relics);
  const battle={
    seed:hashSeed(`${run.seed}:${run.depth}:${Date.now()}`),depth:run.depth,boss,elite,round:1,
    playerHp:run.hp,playerMaxHp:run.maxHp,enemyHp:maxHp,enemyMaxHp:maxHp,
    ember:3+(relics.has('black-candle')?1:0),maxEmber:3,remains:0,
    player:Array(LANES).fill(null),enemy:Array(LANES).fill(null),intent:[],hand:[],drawPile,discard:[],
    heritage:null,sacrificedThisTurn:false,firstDeathBonusUsed:false,firstDiscountUsed:false,
    firstDirectUsed:false,spawnSerial:1,ended:false,winner:null,log:['Туман раздвинулся. Кто-то ждёт.']
  };
  drawCards(battle, relics.has('hare-foot')?5:4);
  planIntent(battle,boss?2:1);
  if(elite&&!boss) planIntent(battle,1);
  return battle;
}

export function drawCards(battle,count=1){
  for(let n=0;n<count;n++){
    if(!battle.drawPile.length){
      if(!battle.discard.length) break;
      const rng=rngFrom(battle.seed ^ hashSeed(`reshuffle:${battle.round}:${n}`));
      battle.drawPile=shuffle(battle.discard.splice(0),rng);
    }
    if(battle.hand.length>=7) break;
    const card=battle.drawPile.shift(); if(card) battle.hand.push(card);
  }
}
function effectiveCost(battle,card,relics=new Set()){
  let cost=card.cost;
  if(card.costType==='ember' && relics.has('moth-lantern') && !battle.firstDiscountUsed) cost=Math.max(0,cost-1);
  return cost;
}
export function canPlay(run,battle,card,lane=null,targetLane=null){
  if(!battle||battle.ended) return {ok:false,reason:'Бой уже закончен.'};
  const relics=new Set(run.relics);
  const cost=effectiveCost(battle,card,relics);
  if(card.costType==='ember' && battle.ember<cost) return {ok:false,reason:'Не хватает Угля.'};
  if(card.costType==='remains' && battle.remains<cost) return {ok:false,reason:'Не хватает Останков.'};
  if(card.type==='creature'){
    if(lane==null||lane<0||lane>=LANES) return {ok:false,reason:'Выбери линию.'};
    if(battle.player[lane]) return {ok:false,reason:'Линия занята.'};
  } else {
    if(['bark','needle','molt'].includes(card.rite) && (targetLane==null||!battle.player[targetLane])) return {ok:false,reason:'Выбери своего зверя.'};
    if(card.rite==='salt' && (targetLane==null||!battle.enemy[targetLane])) return {ok:false,reason:'Выбери врага.'};
  }
  return {ok:true,cost};
}
function payCost(battle,card,cost){
  if(card.costType==='ember') battle.ember-=cost;
  if(card.costType==='remains') battle.remains-=cost;
}
export function playCard(run,battle,cardInstanceId,lane=null,targetLane=null){
  const index=battle.hand.findIndex(c=>c.instanceId===cardInstanceId);
  if(index<0) return {ok:false,reason:'Карта уже ушла.'};
  const card=battle.hand[index]; const check=canPlay(run,battle,card,lane,targetLane); if(!check.ok) return check;
  payCost(battle,card,check.cost);
  if(card.costType==='ember' && new Set(run.relics).has('moth-lantern') && !battle.firstDiscountUsed){ battle.firstDiscountUsed=true; }
  battle.hand.splice(index,1);
  if(card.type==='creature'){
    const copy={...card,sigils:[...card.sigils]};
    if(battle.heritage && !copy.sigils.includes(battle.heritage)){ copy.sigils.push(battle.heritage); battle.heritage=null; }
    battle.player[lane]=makePlayerUnit(copy);
    battle.log.unshift(`${copy.name} вошёл в линию ${lane+1}.`);
  } else {
    resolveRite(run,battle,card,targetLane);
    battle.discard.push(card);
  }
  run.stats.cardsPlayed++;
  return {ok:true};
}
function resolveRite(run,battle,card,targetLane){
  if(card.rite==='bark'){
    const u=battle.player[targetLane]; u.maxHp+=3;u.hp+=3;if(!u.sigils.includes('ward'))u.sigils.push('ward');u.wardUsed=false;
  } else if(card.rite==='needle'){
    const u=battle.player[targetLane];u.atk+=1;u.maxHp+=1;u.hp+=1;drawCards(battle,1);
  } else if(card.rite==='salt'){
    damageUnit(run,battle,'enemy',targetLane,2,null);
  } else if(card.rite==='milk'){
    battle.playerHp=Math.min(battle.playerMaxHp,battle.playerHp+3);
  } else if(card.rite==='molt'){
    killUnit(run,battle,'player',targetLane,'rite');battle.remains+=2;drawCards(battle,2);
  } else if(card.rite==='whisper') drawCards(battle,3);
}

export function sacrificeUnit(run,battle,lane,sigil=null){
  if(battle.sacrificedThisTurn) return {ok:false,reason:'Один ритуал за ход. Лес тоже умеет считать.'};
  const unit=battle.player[lane]; if(!unit) return {ok:false,reason:'Здесь некого отдавать.'};
  const pick=sigil && unit.sigils.includes(sigil) ? sigil : unit.sigils[0] || null;
  battle.sacrificedThisTurn=true; battle.heritage=pick; battle.remains+=Math.max(1,Math.ceil((unit.cost||0)/2)); run.stats.sacrifices++;
  killUnit(run,battle,'player',lane,'sacrifice');
  battle.log.unshift(pick?`Наследие: ${SIGILS[pick]?.name||pick}.`:'Осталась только кровь.');
  return {ok:true,heritage:pick};
}

function attackValue(unit, board, lane, direct=false){
  let value=unit.atk;
  if(unit.sigils.includes('pack')){
    if(board[lane-1]) value+=1;
    if(board[lane+1]) value+=1;
  }
  if(direct && unit.sigils.includes('lurk')) value+=1;
  return Math.max(0,value);
}
function damageUnit(run,battle,side,lane,amount,attacker){
  const board=side==='player'?battle.player:battle.enemy; const unit=board[lane]; if(!unit)return 0;
  if(unit.sigils.includes('ward')&&!unit.wardUsed){unit.wardUsed=true;battle.log.unshift(`${unit.name}: Оберег поглотил удар.`);return 0;}
  unit.hp-=amount;
  if(attacker && unit.sigils.includes('thorn')) attacker.hp-=1;
  if(attacker && attacker.sigils.includes('bleed') && unit.hp>0) unit.hp-=1;
  if(unit.hp<=0) killUnit(run,battle,side,lane,'combat');
  if(attacker && attacker.hp<=0){
    const other=side==='player'?'enemy':'player'; const otherBoard=other==='player'?battle.player:battle.enemy;
    const idx=otherBoard.indexOf(attacker); if(idx>=0) killUnit(run,battle,other,idx,'thorns');
  }
  return amount;
}
function notifyAllyDeath(run,battle,side,deadLane){
  const board=side==='player'?battle.player:battle.enemy;
  for(const u of board){
    if(!u) continue;
    if(u.sigils.includes('scavenger') && side==='player') battle.remains+=1;
  }
  if(side==='player' && new Set(run.relics).has('crow-bell') && !battle.firstDeathBonusUsed){battle.remains+=2;battle.firstDeathBonusUsed=true;}
}
function killUnit(run,battle,side,lane,cause='combat'){
  const board=side==='player'?battle.player:battle.enemy; const unit=board[lane]; if(!unit)return;
  board[lane]=null;
  if(side==='enemy') run.stats.kills++;
  notifyAllyDeath(run,battle,side,lane);
  if(unit.sigils.includes('brood')){
    const mothBase = side==='player'?cardById('moth'):enemyById('enemy-moth');
    const moth = side==='player'?makePlayerUnit({...cloneCard(mothBase),atk:1,hp:1,maxHp:1,sigils:[]}):makeEnemyUnit('enemy-moth',0);
    moth.atk=1;moth.hp=1;moth.maxHp=1;moth.sigils=[];board[lane]=moth;
  }
  if(side==='player' && unit.sigils.includes('echo') && cause!=='rite' && battle.hand.length<7){
    const source=cardById(unit.id); if(source) battle.hand.push(cloneCard(source,{upgrades:unit.upgrades||0,atk:unit.atk,hp:unit.maxHp,sigils:[...unit.sigils]}));
  }
  battle.log.unshift(`${unit.name} пал.`);
}

function spawnIntent(battle){
  for(const plan of battle.intent){ if(!battle.enemy[plan.lane]) battle.enemy[plan.lane]=plan.unit; }
  battle.intent=[];
}
function doAttacks(run,battle,side){
  const own=side==='player'?battle.player:battle.enemy; const foe=side==='player'?battle.enemy:battle.player;
  for(let lane=0;lane<LANES;lane++){
    const attacker=own[lane]; if(!attacker)continue;
    const defender=foe[lane];
    if(defender){
      const dealt=attackValue(attacker,own,lane,false); damageUnit(run,battle,side==='player'?'enemy':'player',lane,dealt,attacker);
      if(attacker.sigils.includes('hunger') && !foe[lane]) attacker.atk+=1;
    } else {
      let dealt=attackValue(attacker,own,lane,true);
      if(side==='player'){
        if(new Set(run.relics).has('wet-teeth')&&!battle.firstDirectUsed){dealt+=1;battle.firstDirectUsed=true;}
        battle.enemyHp-=dealt;
      } else battle.playerHp-=dealt;
      battle.log.unshift(`${attacker.name}: ${dealt} прямо.`);
    }
    if(battle.enemyHp<=0||battle.playerHp<=0) break;
  }
}
export function endTurn(run,battle){
  if(battle.ended) return {ok:false,reason:'Уже всё.'};
  battle.firstDirectUsed=false;
  doAttacks(run,battle,'player');
  if(battle.enemyHp<=0) return finishBattle(run,battle,'player');
  doAttacks(run,battle,'enemy');
  if(battle.playerHp<=0) return finishBattle(run,battle,'enemy');
  spawnIntent(battle);
  battle.round++;
  battle.ember=battle.maxEmber;
  battle.sacrificedThisTurn=false;
  drawCards(battle,1);
  const baseCount=battle.boss?(battle.round%2===0?2:1):(battle.elite&&battle.round%3===0?2:1);
  planIntent(battle,baseCount);
  return {ok:true};
}
function finishBattle(run,battle,winner){
  battle.ended=true;battle.winner=winner;
  if(winner==='player'){
    run.hp=Math.max(1,battle.playerHp); run.log.unshift('Тишина вернулась слишком быстро.');
  } else { run.hp=0; run.result='lost'; }
  return {ok:true,ended:true,winner};
}

export function resolveNode(run,node){
  if(!node||run.pending) return {ok:false,reason:'Сначала закончи текущее событие.'};
  if(node.type==='battle'||node.type==='boss'){
    run.battle=createBattle(run,node.type==='boss',!!node.elite); run.pending={type:'battle',nodeId:node.id}; return {ok:true,type:'battle'};
  }
  if(node.type==='cache') run.pending={type:'card-choice',title:'Следы под снегом',choices:rollCardChoices(run,3,'cache'),nodeId:node.id};
  if(node.type==='omen') run.pending={type:'relic-choice',title:'Лес показал знак',choices:rollRelicChoices(run,3),nodeId:node.id};
  if(node.type==='hearth') run.pending={type:'hearth',title:'Костёр ещё тёплый',nodeId:node.id};
  if(node.type==='altar') run.pending={type:'altar',title:'Камень помнит кровь',nodeId:node.id,donor:null};
  return {ok:true,type:run.pending?.type};
}
export function chooseCardReward(run,cardInstanceId){
  const p=run.pending;if(!p||p.type!=='card-choice')return {ok:false};
  const card=p.choices.find(c=>c.instanceId===cardInstanceId);if(!card)return {ok:false};
  run.deck.push(card);completeNode(run);return {ok:true};
}
export function chooseRelic(run,id){
  const p=run.pending;if(!p||p.type!=='relic-choice')return {ok:false};
  const relic=RELICS.find(r=>r.id===id);if(!relic||run.relics.includes(id))return {ok:false};
  run.relics.push(id);if(relic.effect==='maxHp'){run.maxHp+=3;run.hp+=3;}completeNode(run);return {ok:true};
}
export function hearthUpgrade(run,instanceId,mode='fang'){
  const p=run.pending;if(!p||p.type!=='hearth')return {ok:false};
  const card=run.deck.find(c=>c.instanceId===instanceId&&c.type==='creature');if(!card)return {ok:false};
  if(mode==='fang')card.atk+=1;else card.hp+=2;card.upgrades=(card.upgrades||0)+1;run.hp=Math.min(run.maxHp,run.hp+4);completeNode(run);return {ok:true};
}
export function altarSelect(run,instanceId){
  const p=run.pending;if(!p||p.type!=='altar')return {ok:false};
  const card=run.deck.find(c=>c.instanceId===instanceId&&c.type==='creature');if(!card)return {ok:false};
  if(!p.donor){ if(!card.sigils.length)return {ok:false,reason:'У этого зверя нечего наследовать.'}; p.donor=instanceId; return {ok:true,stage:'receiver'}; }
  if(p.donor===instanceId)return {ok:false,reason:'Камень требует двух разных зверей.'};
  const donor=run.deck.find(c=>c.instanceId===p.donor);if(!donor)return {ok:false};
  const sigil=donor.sigils[0]; if(sigil&&!card.sigils.includes(sigil))card.sigils.push(sigil);
  run.deck=run.deck.filter(c=>c.instanceId!==donor.instanceId);completeNode(run);return {ok:true,transferred:sigil};
}
export function afterBattleVictory(run){
  if(!run.battle||run.battle.winner!=='player')return {ok:false};
  const wasBoss=run.battle.boss;run.battle=null;
  if(wasBoss){run.result='won';run.pending={type:'run-win'};return {ok:true,won:true};}
  run.pending={type:'card-choice',title:'Что осталось после драки',choices:rollCardChoices(run,3,'battle'),nodeId:'battle-reward'};
  return {ok:true};
}
export function completeNode(run){
  run.pending=null;run.battle=null;run.depth++;
  if(run.depth>=run.maxDepth&&!run.result) run.result='won';
  return run;
}
export function skipReward(run){ if(run.pending?.type==='card-choice'){completeNode(run);return {ok:true};} return {ok:false}; }

export function serializeRun(run){ return JSON.stringify(run); }
export function hydrateRun(raw){
  const parsed=typeof raw==='string'?JSON.parse(raw):raw;
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.deck)||!Array.isArray(parsed.trail)) throw new Error('Повреждённое сохранение МОРОК.');
  return parsed;
}
