export const VERSION='2.0.0';
export const LANES=4;
export const BALANCE_LIMIT=6;

export const SIGILS={
  pack:{name:'Стая',mark:'▲',text:'+1 атака за каждого соседнего союзника.'},
  thorn:{name:'Шип',mark:'✣',text:'Атакующий получает 1 урона.'},
  hunger:{name:'Голод',mark:'⌁',text:'+1 атака после добивания.'},
  brood:{name:'Выводок',mark:'◇',text:'После смерти оставляет Падальщика 1/1.'},
  echo:{name:'Эхо',mark:'↟',text:'После смерти возвращается в руку.'},
  lurk:{name:'Засада',mark:'⌄',text:'+1 прямого урона по пустой линии.'},
  ward:{name:'Оберег',mark:'□',text:'Игнорирует первый полученный урон.'},
  scavenger:{name:'Падальщик',mark:'○',text:'+1 Останок за смерть союзника.'},
  root:{name:'Кость',mark:'╫',text:'+2 здоровья при выходе на стол.'},
  bleed:{name:'Разрез',mark:'◆',text:'После удара по существу наносит ещё 1.'},
  twin:{name:'Двойной удар',mark:'Ⅱ',text:'Атакует дважды.'},
  martyr:{name:'Мученик',mark:'✚',text:'После смерти даёт +2 Останка.'},
  parasite:{name:'Паразит',mark:'⊙',text:'После смерти переходит в руку как бесплатная личинка.'},
  chain:{name:'Цепь',mark:'≋',text:'Прямой урон также ранит соседнюю вражескую карту.'}
};

const C=(id,name,faction,costType,cost,atk,hp,sigils,text,rarity='common',portrait=id)=>({id,name,type:'creature',faction,costType,cost,atk,hp,sigils,text,rarity,portrait});
const R=(id,name,cost,text,rite,rarity='common')=>({id,name,type:'rite',faction:'rite',costType:'ember',cost,atk:0,hp:0,sigils:[],text,rite,rarity,portrait:id});

export const CARD_LIBRARY=[
  C('hare','Пыльный заяц','beast','ember',0,0,1,['echo'],'Бесплатная жертва. Иногда возвращается.'),
  C('crow','Ворон-вор','carrion','ember',1,1,1,['scavenger'],'Питается тем, что ты всё равно потерял.'),
  C('wolf','Серый волк','beast','ember',2,2,2,['pack'],'Один волк — карта. Два — уже проблема.'),
  C('boar','Кабан в шрамах','beast','remains',2,2,4,['thorn'],'Бьёт в ответ даже умирая.'),
  C('stag','Королевский олень','beast','remains',3,3,4,['root'],'Тяжёлая карта, которую трудно снять со стола.','uncommon'),
  C('moth','Пепельная моль','spirit','ember',1,1,1,['brood'],'Умирает не одна.'),
  C('owl','Слепая сова','spirit','ember',2,2,2,['lurk'],'Любит пустые линии.'),
  C('fox','Рыжая лиса','beast','ember',2,2,2,['hunger'],'Каждое добивание делает её опаснее.'),
  C('toad','Могильная жаба','fungal','remains',1,1,3,['scavenger'],'Смерти рядом превращает в ресурс.'),
  C('mushroom','Грибница','fungal','ember',1,0,4,['thorn','root'],'Плохая идея бить её руками.','uncommon'),
  C('adder','Гадюка','beast','remains',2,2,1,['bleed'],'Прокусывает даже толстые карты.'),
  C('doe','Белая лань','spirit','ember',2,1,3,['ward'],'Первый удар проходит насквозь.'),
  C('hound','Псарь без хозяина','carrion','remains',3,3,3,['hunger','scavenger'],'Смерть делает его богаче и злее.','rare'),
  C('ram','Костяной баран','carrion','remains',4,4,5,['thorn','lurk'],'Если линия пуста, весы качнутся сильно.','rare'),
  C('weaver','Ткач жил','fungal','ember',3,1,6,['root','pack'],'Даже слабые соседи рядом с ним становятся угрозой.','rare'),
  C('nightjar','Козодой','spirit','ember',3,3,2,['ward','echo'],'Упрямо не остаётся мёртвым.','rare'),
  C('moose','Старый лось','beast','remains',5,5,7,['root'],'Почти отдельный босс в твоей руке.','rare'),
  C('butcher-bird','Птица-мясник','carrion','ember',3,2,2,['twin'],'Две атаки превращают любой бонус в проблему.','rare'),
  C('saint-rat','Святая крыса','carrion','ember',1,0,2,['martyr','echo'],'Умирает, платит тебе и иногда возвращается.','uncommon'),
  C('bell-rat','Звонкая крыса','carrion','ember',2,1,2,['martyr','twin'],'Дважды кусает и выгодно умирает.','uncommon'),
  C('leech','Чёрная пиявка','fungal','remains',1,1,2,['parasite'],'После смерти остаётся личинка.'),
  C('chain-dog','Цепной пёс','beast','ember',3,3,3,['chain'],'Удар по линии задевает соседей.','uncommon'),
  C('crypt-ox','Подземный вол','carrion','remains',4,2,8,['root','martyr'],'Долго живёт, выгодно умирает.','rare'),
  C('two-face','Двуликий ягнёнок','spirit','ember',2,1,2,['twin','echo'],'Слишком много ценности в слишком маленькой карте.','rare'),
  C('needle-hare','Игольчатый заяц','beast','ember',1,1,1,['thorn','echo'],'Возвращающийся раздражитель.','uncommon'),
  C('widow','Вдова колодца','spirit','remains',3,2,4,['bleed','ward'],'Снимает защиту с дорогих карт.','rare'),
  C('choir','Хор личинок','fungal','ember',2,0,5,['brood','martyr'],'Хорошая жертва и плохая цель.','uncommon'),
  C('lantern-wolf','Фонарный волк','spirit','ember',3,3,2,['pack','lurk'],'Стая плюс пустая линия — неприятная арифметика.','rare'),
  C('grave-king','Могильный король','carrion','remains',6,5,6,['scavenger','hunger','martyr'],'Колода вокруг него превращает смерть в двигатель.','rare'),
  C('mirror-doe','Зеркальная лань','spirit','ember',4,2,4,['ward','twin'],'Первый удар игнорирует, затем отвечает дважды.','rare'),
  R('bark','Кожаная стяжка',1,'Союзник получает +0/+3 и Оберег.','bark'),
  R('needle','Костяная игла',1,'Союзник получает +1/+1. Возьми карту.','needle'),
  R('salt','Чёрная соль',1,'Нанеси 2 урона вражеской карте.','salt'),
  R('milk','Горькое причастие',2,'Сдвинь чашу весов на 2 к себе.','milk'),
  R('molt','Снятая кожа',1,'Уничтожь союзника. Возьми 2 карты и получи 2 Останка.','molt','uncommon'),
  R('whisper','Шёпот под столом',2,'Возьми 3 карты.','whisper','uncommon'),
  R('nails','Три гвоздя',2,'Союзник получает Шип и +2 здоровья.','nails','uncommon'),
  R('lash','Ремень смотрителя',2,'Нанеси 1 урона всем вражеским картам.','lash','rare')
];

const ENEMY_LIBRARY=[
  C('enemy-rat','Крыса','enemy','none',0,1,1,[],''),C('enemy-crow','Чёрный ворон','enemy','none',0,1,1,['scavenger'],''),
  C('enemy-wolf','Голодный волк','enemy','none',0,2,2,['pack'],''),C('enemy-boar','Дикий кабан','enemy','none',0,2,4,['thorn'],''),
  C('enemy-moth','Ночная моль','enemy','none',0,1,1,['brood'],''),C('enemy-owl','Сова без глаз','enemy','none',0,2,2,['lurk'],''),
  C('enemy-adder','Болотная гадюка','enemy','none',0,2,1,['bleed'],''),C('enemy-stag','Рогатый страж','enemy','none',0,3,5,['root'],''),
  C('enemy-ram','Костяной баран','enemy','none',0,4,5,['thorn','lurk'],''),C('enemy-bird','Птица мясника','enemy','none',0,2,2,['twin'],''),
  C('enemy-ox','Костяной вол','enemy','none',0,2,7,['root','martyr'],''),C('enemy-widow','Вдова','enemy','none',0,2,4,['bleed','ward'],'')
];

export const RELICS=[
  {id:'black-candle',name:'Чёрная свеча',text:'Первый ход каждого боя: +1 Уголь.',effect:'firstEmber'},
  {id:'crow-bell',name:'Колокол падали',text:'Первая смерть союзника в бою даёт +2 Останка.',effect:'firstDeathRemains'},
  {id:'moth-lantern',name:'Фонарь моли',text:'Первая карта за Уголь в бою дешевле на 1.',effect:'firstDiscount'},
  {id:'wet-teeth',name:'Мокрые зубы',text:'Первый прямой удар каждого хода получает +1.',effect:'firstDirect'},
  {id:'hare-foot',name:'Лапа зайца',text:'В начале боя возьми дополнительную карту.',effect:'extraDraw'},
  {id:'red-thread',name:'Красная нить',text:'Первое Наследие каждого боя переносится на две карты.',effect:'doubleHeritage'},
  {id:'split-coin',name:'Расколотая монета',text:'После победы иногда показывается четвёртая карта.',effect:'extraReward'},
  {id:'small-bell',name:'Малый колокол',text:'Каждый третий ход даёт +1 Уголь.',effect:'thirdEmber'}
];

export const ITEMS=[
  {id:'knife',name:'Костяной нож',mark:'†',text:'Убей своего зверя и получи 3 Останка.',target:'player'},
  {id:'smoke',name:'Сосуд дыма',mark:'≈',text:'Сотри все намерения противника на этот ход.',target:'none'},
  {id:'bell',name:'Железный колокол',mark:'◉',text:'+2 Угля сейчас.',target:'none'},
  {id:'thread',name:'Чёрная нить',mark:'⌁',text:'Следующее Наследие применяется дважды.',target:'none'},
  {id:'mirror',name:'Осколок зеркала',mark:'◇',text:'Возьми копию самой сильной вражеской карты 1/1.',target:'none'},
  {id:'teeth',name:'Горсть зубов',mark:'∴',text:'Сдвинь весы на 2 к себе.',target:'none'}
];

export const BOSSES={
  warden:{id:'warden',name:'Смотритель',mask:'IRON',text:'Каждый третий ход запирает одну линию цепью.',phases:1},
  bellkeeper:{id:'bellkeeper',name:'Звонарь',mask:'BELL',text:'На чётных ходах вызывает второго врага.',phases:1},
  prior:{id:'prior',name:'Безликий приор',mask:'VEIL',text:'Две фазы. После первой меняет правила стола.',phases:2}
};

export function hashSeed(value){const s=String(value??'morok');let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
export function rngFrom(seed){let x=hashSeed(seed)||0x12345678;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}}
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function uid(prefix='u'){return`${prefix}-${Math.random().toString(36).slice(2,8)}-${Date.now().toString(36).slice(-5)}`}
export function cloneCard(template,patch={}){const source=typeof template==='string'?CARD_LIBRARY.find(c=>c.id===template):template;if(!source)throw new Error(`Unknown card: ${template}`);return{...source,sigils:[...(source.sigils||[])],instanceId:uid(source.id),upgrades:0,mutationLevel:0,...patch}}
export function cardById(id){return CARD_LIBRARY.find(c=>c.id===id)}
export function enemyById(id){return ENEMY_LIBRARY.find(c=>c.id===id)}
export function sigilInfo(id){return SIGILS[id]||{name:id,mark:'?',text:''}}
export function itemInfo(id){return ITEMS.find(x=>x.id===id)}
export function bossInfo(id){return BOSSES[id]||null}
export function nodeLabel(type){return({battle:'Схватка',boss:'Хозяин',cache:'Карты',altar:'Алтарь',hearth:'Костёр',omen:'Знак',item:'Шкаф'})[type]||type}

export function starterDeck(){return['hare','hare','crow','wolf','moth','toad','fox','bark','needle','salt'].map(cloneCard)}
export function createProfile(){return{version:2,bestDepth:0,wins:0,totalRuns:0,discovered:[]}}
function startingItems(seed){const rng=rngFrom(seed^0x51f15e);return shuffle(ITEMS,rng).slice(0,2).map(x=>x.id)}
export function createRun(seed=Date.now(),profile=createProfile()){
  const runSeed=hashSeed(seed);return{
    version:2,seed:runSeed,depth:0,maxDepth:9,deck:starterDeck(),relics:[],items:startingItems(runSeed),
    battle:null,pending:null,result:null,trail:generateTrail(runSeed),log:['За спиной щёлкнул замок.'],stats:{kills:0,sacrifices:0,cardsPlayed:0,itemsUsed:0},
    profileSnapshot:{wins:profile.wins||0}
  }
}
function generateTrail(seed){
  const rng=rngFrom(seed^0x9e3779b9),stages=[];
  const pools=[['battle','cache'],['battle','item','altar'],['boss'],['battle','hearth','omen'],['battle','cache','item'],['boss'],['battle','altar','omen'],['battle','hearth','item'],['boss']];
  for(let i=0;i<pools.length;i++){
    if(pools[i][0]==='boss'){const bossId=i===2?'warden':i===5?'bellkeeper':'prior';stages.push([{id:`${i}-boss-${bossId}`,type:'boss',elite:true,bossId}]);continue}
    const pool=shuffle(pools[i],rng),count=i===4||i===6?3:2;stages.push(pool.slice(0,count).map((type,j)=>({id:`${i}-${j}-${type}`,type,elite:type==='battle'&&rng()>.72})))
  }
  return stages
}

function weightedCardPool(depth=0){return CARD_LIBRARY.filter(c=>{if(c.id==='hare')return depth<3;if(c.rarity==='rare')return depth>=3;if(c.rarity==='uncommon')return depth>=1;return true})}
export function rollCardChoices(run,count=3,salt='reward'){const rng=rngFrom(run.seed^hashSeed(`${salt}:${run.depth}:${run.deck.length}:${run.relics.length}`)),pool=weightedCardPool(run.depth),picked=[];while(picked.length<count&&picked.length<pool.length){const c=pool[Math.floor(rng()*pool.length)];if(!picked.some(x=>x.id===c.id))picked.push(cloneCard(c))}return picked}
export function rollRelicChoices(run,count=3){const rng=rngFrom(run.seed^hashSeed(`relic:${run.depth}`));return shuffle(RELICS.filter(r=>!run.relics.includes(r.id)),rng).slice(0,count)}
export function rollItemChoices(run,count=3){const rng=rngFrom(run.seed^hashSeed(`item:${run.depth}:${run.items.length}`));return shuffle(ITEMS,rng).slice(0,count)}

function encounterPool(depth,bossId=null){
  if(bossId==='warden')return['enemy-boar','enemy-wolf','enemy-ram'];
  if(bossId==='bellkeeper')return['enemy-crow','enemy-bird','enemy-owl','enemy-adder'];
  if(bossId==='prior')return['enemy-widow','enemy-ox','enemy-ram','enemy-bird','enemy-stag'];
  if(depth<2)return['enemy-rat','enemy-wolf','enemy-crow','enemy-moth'];
  if(depth<5)return['enemy-wolf','enemy-boar','enemy-owl','enemy-adder','enemy-moth','enemy-bird'];
  return['enemy-boar','enemy-owl','enemy-adder','enemy-stag','enemy-ram','enemy-ox','enemy-widow']
}
function makeEnemyUnit(id,depth=0){const base=enemyById(id),scale=Math.floor(depth/4);return{...base,sigils:[...base.sigils],instanceId:uid(id),maxHp:base.hp+scale,hp:base.hp+scale,atk:base.atk+scale,wardUsed:false,side:'enemy'}}
function makePlayerUnit(card){const rootBonus=card.sigils.includes('root')?2:0;return{...card,sigils:[...card.sigils],maxHp:card.hp+rootBonus,hp:card.hp+rootBonus,atk:card.atk,wardUsed:false,side:'player'}}
function planIntent(battle,count=1){
  const rng=rngFrom(battle.seed^hashSeed(`intent:${battle.round}:${battle.spawnSerial++}`)),pool=encounterPool(battle.depth,battle.bossId);
  const free=[0,1,2,3].filter(l=>l!==battle.lockedLane&&!battle.enemy[l]&&!battle.intent.some(x=>x.lane===l));
  for(const lane of shuffle(free,rng).slice(0,Math.min(count,free.length))){const id=pool[Math.floor(rng()*pool.length)];battle.intent.push({lane,unit:makeEnemyUnit(id,battle.depth)})}
}
export function createBattle(run,bossId=null,elite=false){
  const rng=rngFrom(run.seed^hashSeed(`battle:${run.depth}:${bossId||'none'}:${elite}`)),relics=new Set(run.relics);
  const battle={
    seed:hashSeed(`${run.seed}:${run.depth}:${Date.now()}`),depth:run.depth,bossId,elite,round:1,balance:0,balanceLimit:BALANCE_LIMIT,
    phase:1,phasesTotal:bossId?(BOSSES[bossId]?.phases||1):1,lockedLane:null,
    ember:3+(relics.has('black-candle')?1:0),maxEmber:3,remains:0,player:Array(LANES).fill(null),enemy:Array(LANES).fill(null),intent:[],
    hand:[],drawPile:shuffle(run.deck.map(c=>({...c,sigils:[...c.sigils]})),rng),discard:[],heritage:null,heritageCharges:1,
    sacrificedThisTurn:false,firstDeathBonusUsed:false,firstDiscountUsed:false,firstDirectUsed:false,spawnSerial:1,ended:false,winner:null,
    log:[bossId?`${BOSSES[bossId].name} положил ладони на стол.`:'Противник молча раздал карты.']
  };
  drawCards(battle,relics.has('hare-foot')?5:4);planIntent(battle,bossId?2:1);if(elite&&!bossId)planIntent(battle,1);return battle
}
export function drawCards(battle,count=1){
  for(let n=0;n<count;n++){if(!battle.drawPile.length){if(!battle.discard.length)break;const rng=rngFrom(battle.seed^hashSeed(`reshuffle:${battle.round}:${n}`));battle.drawPile=shuffle(battle.discard.splice(0),rng)}if(battle.hand.length>=7)break;const card=battle.drawPile.shift();if(card)battle.hand.push(card)}
}
function effectiveCost(battle,card,relics=new Set()){let cost=card.cost;if(card.costType==='ember'&&relics.has('moth-lantern')&&!battle.firstDiscountUsed)cost=Math.max(0,cost-1);return cost}
export function canPlay(run,battle,card,lane=null,targetLane=null){
  if(!battle||battle.ended)return{ok:false,reason:'Сдача уже закончена.'};const cost=effectiveCost(battle,card,new Set(run.relics));
  if(card.costType==='ember'&&battle.ember<cost)return{ok:false,reason:'В жаровне не хватает Угля.'};if(card.costType==='remains'&&battle.remains<cost)return{ok:false,reason:'Не хватает костей.'};
  if(card.type==='creature'){if(lane==null||lane<0||lane>=LANES)return{ok:false,reason:'Выбери место на столе.'};if(lane===battle.lockedLane)return{ok:false,reason:'Линия стянута цепью.'};if(battle.player[lane])return{ok:false,reason:'Место занято.'}}
  else{if(['bark','needle','molt','nails'].includes(card.rite)&&(targetLane==null||!battle.player[targetLane]))return{ok:false,reason:'Выбери своего зверя.'};if(card.rite==='salt'&&(targetLane==null||!battle.enemy[targetLane]))return{ok:false,reason:'Выбери карту противника.'}}
  return{ok:true,cost}
}
function payCost(battle,card,cost){if(card.costType==='ember')battle.ember-=cost;if(card.costType==='remains')battle.remains-=cost}
export function playCard(run,battle,cardInstanceId,lane=null,targetLane=null){
  const index=battle.hand.findIndex(c=>c.instanceId===cardInstanceId);if(index<0)return{ok:false,reason:'Карты уже нет в руке.'};const card=battle.hand[index],check=canPlay(run,battle,card,lane,targetLane);if(!check.ok)return check;
  payCost(battle,card,check.cost);if(card.costType==='ember'&&new Set(run.relics).has('moth-lantern')&&!battle.firstDiscountUsed)battle.firstDiscountUsed=true;battle.hand.splice(index,1);
  if(card.type==='creature'){
    const copy={...card,sigils:[...card.sigils]};if(battle.heritage&&!copy.sigils.includes(battle.heritage)){copy.sigils.push(battle.heritage);battle.heritageCharges--;if(battle.heritageCharges<=0)battle.heritage=null}
    battle.player[lane]=makePlayerUnit(copy);battle.log.unshift(`${copy.name} лёг на стол.`)
  }else{resolveRite(run,battle,card,targetLane);battle.discard.push(card)}
  run.stats.cardsPlayed++;const ended=phaseOrFinish(run,battle);return{ok:true,ended:!!ended?.ended,winner:ended?.winner,phase:!!ended?.phase}
}
function resolveRite(run,battle,card,targetLane){
  if(card.rite==='bark'){const u=battle.player[targetLane];u.maxHp+=3;u.hp+=3;if(!u.sigils.includes('ward'))u.sigils.push('ward');u.wardUsed=false}
  else if(card.rite==='needle'){const u=battle.player[targetLane];u.atk+=1;u.maxHp+=1;u.hp+=1;drawCards(battle,1)}
  else if(card.rite==='salt')damageUnit(run,battle,'enemy',targetLane,2,null);
  else if(card.rite==='milk')battle.balance=Math.min(BALANCE_LIMIT,battle.balance+2);
  else if(card.rite==='molt'){killUnit(run,battle,'player',targetLane,'rite');battle.remains+=2;drawCards(battle,2)}
  else if(card.rite==='whisper')drawCards(battle,3);
  else if(card.rite==='nails'){const u=battle.player[targetLane];u.maxHp+=2;u.hp+=2;if(!u.sigils.includes('thorn'))u.sigils.push('thorn')}
  else if(card.rite==='lash'){for(let i=0;i<LANES;i++)if(battle.enemy[i])damageUnit(run,battle,'enemy',i,1,null)}
}
export function sacrificeUnit(run,battle,lane,sigil=null){
  if(battle.sacrificedThisTurn)return{ok:false,reason:'Одной жертвы за ход достаточно.'};const unit=battle.player[lane];if(!unit)return{ok:false,reason:'Здесь некого резать.'};
  const pick=sigil&&unit.sigils.includes(sigil)?sigil:unit.sigils[0]||null;battle.sacrificedThisTurn=true;battle.heritage=pick;battle.heritageCharges=(new Set(run.relics).has('red-thread')||battle.threadPrimed)?2:1;battle.threadPrimed=false;battle.remains+=Math.max(1,Math.ceil((unit.cost||0)/2));run.stats.sacrifices++;killUnit(run,battle,'player',lane,'sacrifice');battle.log.unshift(pick?`Наследие: ${SIGILS[pick]?.name||pick}.`:'На столе осталась только кровь.');return{ok:true,heritage:pick}
}
function attackValue(unit,board,lane,direct=false){let value=unit.atk;if(unit.sigils.includes('pack')){if(board[lane-1])value++;if(board[lane+1])value++}if(direct&&unit.sigils.includes('lurk'))value++;return Math.max(0,value)}
function damageUnit(run,battle,side,lane,amount,attacker){
  const board=side==='player'?battle.player:battle.enemy,unit=board[lane];if(!unit)return 0;if(unit.sigils.includes('ward')&&!unit.wardUsed){unit.wardUsed=true;battle.log.unshift(`${unit.name}: печать поглотила удар.`);return 0}
  unit.hp-=amount;if(attacker&&unit.sigils.includes('thorn'))attacker.hp-=1;if(attacker&&attacker.sigils.includes('bleed')&&unit.hp>0)unit.hp-=1;
  if(attacker&&attacker.sigils.includes('chain')){for(const adj of[lane-1,lane+1])if(adj>=0&&adj<LANES&&board[adj]){board[adj].hp-=1;if(board[adj].hp<=0)killUnit(run,battle,side,adj,'chain')}}
  if(unit.hp<=0)killUnit(run,battle,side,lane,'combat');if(attacker&&attacker.hp<=0){const other=side==='player'?'enemy':'player',otherBoard=other==='player'?battle.player:battle.enemy,idx=otherBoard.indexOf(attacker);if(idx>=0)killUnit(run,battle,other,idx,'thorns')}return amount
}
function notifyDeath(run,battle,side){
  const board=side==='player'?battle.player:battle.enemy;for(const u of board)if(u?.sigils.includes('scavenger')&&side==='player')battle.remains++;
  if(side==='player'&&new Set(run.relics).has('crow-bell')&&!battle.firstDeathBonusUsed){battle.remains+=2;battle.firstDeathBonusUsed=true}
}
function killUnit(run,battle,side,lane,cause='combat'){
  const board=side==='player'?battle.player:battle.enemy,unit=board[lane];if(!unit)return;board[lane]=null;if(side==='enemy')run.stats.kills++;notifyDeath(run,battle,side);
  if(side==='player'&&unit.sigils.includes('martyr'))battle.remains+=2;
  if(unit.sigils.includes('brood')){const base=side==='player'?cardById('leech'):enemyById('enemy-rat');const child=side==='player'?makePlayerUnit(cloneCard(base,{atk:1,hp:1,sigils:[]})):makeEnemyUnit('enemy-rat',0);child.atk=1;child.hp=1;child.maxHp=1;child.sigils=[];board[lane]=child}
  if(side==='player'&&unit.sigils.includes('echo')&&cause!=='rite'&&battle.hand.length<7){const source=cardById(unit.id);if(source)battle.hand.push(cloneCard(source,{upgrades:unit.upgrades||0,mutationLevel:unit.mutationLevel||0,atk:unit.atk,hp:unit.maxHp,sigils:[...unit.sigils]}))}
  if(side==='player'&&unit.sigils.includes('parasite')&&battle.hand.length<7)battle.hand.push(cloneCard('leech',{name:'Личинка',cost:0,costType:'ember',atk:1,hp:1,sigils:[]}));
  battle.log.unshift(`${unit.name} убран со стола.`)
}
function spawnIntent(battle){for(const p of battle.intent)if(!battle.enemy[p.lane]&&p.lane!==battle.lockedLane)battle.enemy[p.lane]=p.unit;battle.intent=[]}
function directDamage(run,battle,side,amount){let dealt=amount;if(side==='player'&&new Set(run.relics).has('wet-teeth')&&!battle.firstDirectUsed){dealt++;battle.firstDirectUsed=true}battle.balance+=side==='player'?dealt:-dealt;battle.log.unshift(`${dealt} на чашу весов.`)}
function doAttacks(run,battle,side){
  const own=side==='player'?battle.player:battle.enemy,foe=side==='player'?battle.enemy:battle.player;
  for(let lane=0;lane<LANES;lane++){const attacker=own[lane];if(!attacker)continue;const attacks=attacker.sigils.includes('twin')?2:1;for(let n=0;n<attacks;n++){if(!attacker||attacker.hp<=0)break;const defender=foe[lane];if(defender){damageUnit(run,battle,side==='player'?'enemy':'player',lane,attackValue(attacker,own,lane,false),attacker);if(attacker.sigils.includes('hunger')&&!foe[lane])attacker.atk++}else directDamage(run,battle,side,attackValue(attacker,own,lane,true));if(Math.abs(battle.balance)>=BALANCE_LIMIT)break}if(Math.abs(battle.balance)>=BALANCE_LIMIT)break}
}
function bossHook(run,battle){
  battle.lockedLane=null;
  if(battle.bossId==='warden'&&battle.round%3===0){const open=[0,1,2,3].filter(i=>battle.player[i]||!battle.enemy[i]);battle.lockedLane=open[battle.round%open.length]??0;battle.log.unshift(`Смотритель затянул цепь на линии ${battle.lockedLane+1}.`)}
  if(battle.bossId==='bellkeeper'&&battle.round%2===0)planIntent(battle,1);
  if(battle.bossId==='prior'&&battle.phase===2){battle.maxEmber=2;battle.ember=Math.min(battle.ember,2)}
}
function phaseOrFinish(run,battle){
  if(battle.balance>=BALANCE_LIMIT){
    if(battle.bossId&&battle.phase<battle.phasesTotal){battle.phase++;battle.balance=0;battle.enemy.fill(null);battle.intent=[];battle.lockedLane=null;planIntent(battle,2);battle.log.unshift(`${BOSSES[battle.bossId].name} сменил маску. Правила стола изменились.`);return{ok:true,phase:true}}
    return finishBattle(run,battle,'player')
  }
  if(battle.balance<=-BALANCE_LIMIT)return finishBattle(run,battle,'enemy');
  return null
}
export function endTurn(run,battle){
  if(battle.ended)return{ok:false,reason:'Сдача окончена.'};battle.firstDirectUsed=false;doAttacks(run,battle,'player');let end=phaseOrFinish(run,battle);if(end?.ended)return end;if(end?.phase)return end;
  doAttacks(run,battle,'enemy');end=phaseOrFinish(run,battle);if(end)return end;spawnIntent(battle);battle.round++;battle.ember=battle.maxEmber+(new Set(run.relics).has('small-bell')&&battle.round%3===0?1:0);battle.sacrificedThisTurn=false;drawCards(battle,1);bossHook(run,battle);
  const count=battle.bossId?(battle.bossId==='bellkeeper'&&battle.round%2===0?2:1):(battle.elite&&battle.round%3===0?2:1);planIntent(battle,count);return{ok:true}
}
function finishBattle(run,battle,winner){battle.ended=true;battle.winner=winner;if(winner==='player')run.log.unshift('Противник медленно убрал руки со стола.');else run.result='lost';return{ok:true,ended:true,winner}}

export function useItem(run,battle,itemId,targetLane=null){
  const idx=run.items.indexOf(itemId);if(idx<0)return{ok:false,reason:'Этого предмета уже нет.'};const item=itemInfo(itemId);if(!item)return{ok:false,reason:'Неизвестный предмет.'};
  if(item.target==='player'&&(targetLane==null||!battle.player[targetLane]))return{ok:false,reason:'Выбери своего зверя.'};
  if(itemId==='knife'){killUnit(run,battle,'player',targetLane,'item');battle.remains+=3}
  if(itemId==='smoke')battle.intent=[];
  if(itemId==='bell')battle.ember+=2;
  if(itemId==='thread'){battle.threadPrimed=true;battle.log.unshift('Нить ждёт следующего Наследия.')}
  if(itemId==='mirror'){const candidates=battle.enemy.filter(Boolean).sort((a,b)=>(b.atk+b.hp)-(a.atk+a.hp));if(candidates[0]&&battle.hand.length<7){const u=candidates[0];battle.hand.push(cloneCard('hare',{name:`Отражение: ${u.name}`,atk:1,hp:1,cost:0,sigils:[...u.sigils].slice(0,1),portrait:u.portrait}))}}
  if(itemId==='teeth')battle.balance=Math.min(BALANCE_LIMIT,battle.balance+2);
  run.items.splice(idx,1);run.stats.itemsUsed++;const ended=phaseOrFinish(run,battle);return{ok:true,ended:!!ended?.ended,winner:ended?.winner}
}

export function resolveNode(run,node){
  if(!node||run.pending)return{ok:false,reason:'Сначала закончи текущий ритуал.'};
  if(node.type==='battle'||node.type==='boss'){run.battle=createBattle(run,node.type==='boss'?node.bossId:null,!!node.elite);run.pending={type:'battle',nodeId:node.id,bossId:node.bossId||null};return{ok:true,type:'battle'}}
  if(node.type==='cache')run.pending={type:'card-choice',title:'Три карты на грязном подносе',choices:rollCardChoices(run,new Set(run.relics).has('split-coin')?4:3,'cache'),nodeId:node.id};
  if(node.type==='omen')run.pending={type:'relic-choice',title:'Знак под воском',choices:rollRelicChoices(run,3),nodeId:node.id};
  if(node.type==='item')run.pending={type:'item-choice',title:'Шкаф с чужими вещами',choices:rollItemChoices(run,3),nodeId:node.id};
  if(node.type==='hearth')run.pending={type:'hearth',title:'Жаровня ещё тёплая',nodeId:node.id};
  if(node.type==='altar')run.pending={type:'altar',title:'Камень принимает только одно имя',nodeId:node.id,donor:null};
  return{ok:true,type:run.pending?.type}
}
export function chooseCardReward(run,id){const p=run.pending;if(!p||p.type!=='card-choice')return{ok:false};const card=p.choices.find(c=>c.instanceId===id);if(!card)return{ok:false};run.deck.push(card);completeNode(run);return{ok:true}}
export function chooseRelic(run,id){const p=run.pending;if(!p||p.type!=='relic-choice')return{ok:false};const relic=RELICS.find(r=>r.id===id);if(!relic||run.relics.includes(id))return{ok:false};run.relics.push(id);completeNode(run);return{ok:true}}
export function chooseItem(run,id){const p=run.pending;if(!p||p.type!=='item-choice')return{ok:false};if(!ITEMS.find(x=>x.id===id))return{ok:false};if(run.items.length>=3)run.items.shift();run.items.push(id);completeNode(run);return{ok:true}}
export function hearthUpgrade(run,id,mode='fang'){
  const p=run.pending;if(!p||p.type!=='hearth')return{ok:false};const card=run.deck.find(c=>c.instanceId===id&&c.type==='creature');if(!card)return{ok:false};
  if(mode==='fang')card.atk++;else card.hp+=2;card.upgrades=(card.upgrades||0)+1;
  if(card.upgrades>=2&&card.mutationLevel<1){const pool=['twin','martyr','bleed','ward','parasite','chain'].filter(s=>!card.sigils.includes(s));const rng=rngFrom(run.seed^hashSeed(card.instanceId));const sigil=pool[Math.floor(rng()*pool.length)];if(sigil){card.sigils.push(sigil);card.mutationLevel=1;card.name='Шрамированный '+card.name}}
  completeNode(run);return{ok:true}
}
export function altarSelect(run,id){
  const p=run.pending;if(!p||p.type!=='altar')return{ok:false};const card=run.deck.find(c=>c.instanceId===id&&c.type==='creature');if(!card)return{ok:false};
  if(!p.donor){if(!card.sigils.length)return{ok:false,reason:'У этой карты нечего переносить.'};p.donor=id;return{ok:true,stage:'receiver'}}
  if(p.donor===id)return{ok:false,reason:'Нужны две разные карты.'};const donor=run.deck.find(c=>c.instanceId===p.donor);if(!donor)return{ok:false};const sigil=donor.sigils[0];if(sigil&&!card.sigils.includes(sigil))card.sigils.push(sigil);card.mutationLevel=(card.mutationLevel||0)+1;card.name=card.mutationLevel>1?'Изуродованный '+card.name:card.name;run.deck=run.deck.filter(c=>c.instanceId!==donor.instanceId);completeNode(run);return{ok:true,transferred:sigil}
}
export function afterBattleVictory(run){
  if(!run.battle||run.battle.winner!=='player')return{ok:false};const bossId=run.battle.bossId;run.battle=null;
  if(bossId){if(run.depth>=run.maxDepth-1||bossId==='prior'){run.result='won';run.pending={type:'run-win'};return{ok:true,won:true}}run.pending={type:'relic-choice',title:`Трофей после: ${BOSSES[bossId].name}`,choices:rollRelicChoices(run,3),nodeId:'boss-trophy'};return{ok:true,boss:true}}
  run.pending={type:'card-choice',title:'Противник оставил три карты',choices:rollCardChoices(run,new Set(run.relics).has('split-coin')?4:3,'battle'),nodeId:'battle-reward'};return{ok:true}
}
export function completeNode(run){run.pending=null;run.battle=null;run.depth++;if(run.depth>=run.maxDepth&&!run.result)run.result='won';return run}
export function skipReward(run){if(run.pending?.type==='card-choice'){completeNode(run);return{ok:true}}return{ok:false}}
export function serializeRun(run){return JSON.stringify(run)}
export function hydrateRun(raw){const parsed=typeof raw==='string'?JSON.parse(raw):raw;if(!parsed||![1,2].includes(parsed.version)||!Array.isArray(parsed.deck)||!Array.isArray(parsed.trail))throw new Error('Повреждённое сохранение МОРОК.');if(parsed.version===1){parsed.version=2;parsed.items=parsed.items||[];parsed.relics=parsed.relics||[];parsed.stats={itemsUsed:0,...parsed.stats};parsed.trail=generateTrail(parsed.seed);parsed.depth=Math.min(parsed.depth,8);parsed.battle=null;parsed.pending=null;parsed.result=null}return parsed}
