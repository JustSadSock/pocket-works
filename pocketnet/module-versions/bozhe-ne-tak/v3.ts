// Authoritative BNT v0.4 role-driven rituals. PocketNet v3 source. Old room snapshots remain immutable..
// State contains secrets; viewForPlayer projects only the recipient's own clues.
export const MIN_PLAYERS=2,MAX_PLAYERS=5,RULESET_VERSION=3;
// One authored catalog for both the local rules and the pinned PocketNet module.
// Every incident has an actual scoring effect. No random text-only "events".
const EXTRA_ITEMS=Object.freeze([
 {id:'goat',name:'Коза',color:'white',shape:'long',kind:'living',material:'fur',hint:'Белая · живая · шерсть'},
 {id:'apple',name:'Яблоко',color:'red',shape:'round',kind:'food',material:'fruit',hint:'Красное · пища · плод'},
 {id:'mushroom',name:'Гриб',color:'dark',shape:'round',kind:'food',material:'plant',hint:'Тёмный · пища · растение'},
 {id:'flower',name:'Цветок',color:'red',shape:'long',kind:'relic',material:'plant',hint:'Красный · реликвия · растение'},
 {id:'mirror',name:'Зеркало',color:'silver',shape:'round',kind:'regalia',material:'glass',hint:'Серебряное · регалия · стекло'},
 {id:'mask',name:'Маска',color:'gold',shape:'angular',kind:'regalia',material:'wood',hint:'Золотая · регалия · дерево'},
 {id:'scroll',name:'Свиток',color:'white',shape:'long',kind:'relic',material:'paper',hint:'Белый · реликвия · бумага'},
 {id:'sword',name:'Меч',color:'silver',shape:'long',kind:'tool',material:'metal',hint:'Серебряный · инструмент · металл'},
 {id:'shield',name:'Щит',color:'gold',shape:'angular',kind:'tool',material:'metal',hint:'Золотой · инструмент · металл'},
 {id:'hourglass',name:'Часы',color:'gold',shape:'angular',kind:'relic',material:'glass',hint:'Золотые · реликвия · стекло'},
 {id:'book',name:'Книга',color:'dark',shape:'angular',kind:'relic',material:'paper',hint:'Тёмная · реликвия · бумага'},
 {id:'boot',name:'Сапог',color:'dark',shape:'long',kind:'tool',material:'leather',hint:'Тёмный · инструмент · кожа'},
 {id:'cheese',name:'Сыр',color:'gold',shape:'angular',kind:'food',material:'milk',hint:'Золотой · пища · молоко'},
 {id:'lantern',name:'Фонарь',color:'gold',shape:'round',kind:'tool',material:'metal',hint:'Золотой · инструмент · металл'},
 {id:'frog',name:'Жаба',color:'green',shape:'round',kind:'living',material:'skin',hint:'Зелёная · живая · кожа'},
 {id:'compass',name:'Компас',color:'silver',shape:'round',kind:'tool',material:'metal',hint:'Серебряный · инструмент · металл'},
 {id:'skull',name:'Череп',color:'white',shape:'angular',kind:'relic',material:'bone',hint:'Белый · реликвия · кость'},
 {id:'potato',name:'Картошка',color:'dark',shape:'round',kind:'food',material:'earth',hint:'Тёмная · пища · земля'}
]);
const EXTRA_TREATMENTS=Object.freeze([
 {id:'ribbon',name:'Перевязать',short:'Лента'},
 {id:'anoint',name:'Умастить',short:'Масло'}
]);
const EXTRA_RITES=Object.freeze([
 {id:'red',title:'Кровавый закат',riddle:'«Дайте мне красное, но ничего живого. Перевяжите дар лентой, звоните дважды и поднимайте выше».',need:'color',value:'red',taboo:'living',treatment:'ribbon',bell:2,height:'high',emblem:'sun'},
 {id:'frog',title:'Болотное откровение',riddle:'«Нужен зелёный знак; еду не нести! Окурите его, звоните один раз и поставьте у ног».',need:'color',value:'green',taboo:'food',treatment:'smoke',bell:1,height:'low',emblem:'frog'},
 {id:'shadow',title:'Чёрный четверг',riddle:'«Тёмный предмет, но не съестной. Помажьте маслом, бейте три раза и поднимайте его».',need:'color',value:'dark',taboo:'food',treatment:'anoint',bell:3,height:'high',emblem:'moon'},
 {id:'scroll',title:'Бюрократия небес',riddle:'«Нужно бумажное, но не тёмное. Перевяжите печать, один звон, подножие».',need:'material',value:'paper',taboo:'dark',treatment:'ribbon',bell:1,height:'low',emblem:'scroll'},
 {id:'flower',title:'Божественная ботаника',riddle:'«Растение, но без еды. Омойте, звоните трижды, вознесите к небесам».',need:'material',value:'plant',taboo:'food',treatment:'wash',bell:3,height:'high',emblem:'flower'},
 {id:'blade',title:'Стальной испуг',riddle:'«Металл без золота. Окурите, ударьте дважды, оставьте внизу».',need:'material',value:'metal',taboo:'gold',treatment:'smoke',bell:2,height:'low',emblem:'sword'},
 {id:'boot',title:'След святого',riddle:'«Принесите кожаное, избегая золота. Смажьте маслом, раз позвоните и поднимите».',need:'material',value:'leather',taboo:'gold',treatment:'anoint',bell:1,height:'high',emblem:'boot'},
 {id:'mirror',title:'Отражение тщеславия',riddle:'«Стекло без золота. Омыть, трижды ударить, поставить у подножия».',need:'material',value:'glass',taboo:'gold',treatment:'wash',bell:3,height:'low',emblem:'mirror'},
 {id:'bones',title:'Прах предков',riddle:'«Мне нужна кость, но не металл. Окурите её, дважды звоните и возвышайте».',need:'material',value:'bone',taboo:'metal',treatment:'smoke',bell:2,height:'high',emblem:'skull'},
 {id:'cheese',title:'Молочная ересь',riddle:'«Только из молока, никакого серебра. Позолотите, три звона и низкая подставка».',need:'material',value:'milk',taboo:'silver',treatment:'gild',bell:3,height:'low',emblem:'cheese'},
 {id:'wool',title:'Шерстяной апокалипсис',riddle:'«Дайте шерсть, но без съестного. Перевяжите, два звона, поднимайте».',need:'material',value:'fur',taboo:'food',treatment:'ribbon',bell:2,height:'high',emblem:'goat'},
 {id:'orchard',title:'Последний урожай',riddle:'«Дайте плод, но не живое существо. Помажьте, звоните раз и держите внизу».',need:'material',value:'fruit',taboo:'living',treatment:'anoint',bell:1,height:'low',emblem:'apple'},
 {id:'roots',title:'Подземное пророчество',riddle:'«Хочу земли, а железа не признаю. Омойте, два звона, высокий алтарь».',need:'material',value:'earth',taboo:'metal',treatment:'wash',bell:2,height:'high',emblem:'potato'},
 {id:'round-two',title:'Великое колесо',riddle:'«Круглое, но без золота. Умастите, звоните раз и поставьте внизу».',need:'shape',value:'round',taboo:'gold',treatment:'anoint',bell:1,height:'low',emblem:'circle'},
 {id:'angles',title:'Угольники веры',riddle:'«Только углы, железо не предлагать. Лента, третий звон, высокий алтарь».',need:'shape',value:'angular',taboo:'metal',treatment:'ribbon',bell:3,height:'high',emblem:'shield'},
 {id:'living',title:'Жизнь в обмен',riddle:'«Живое существо, но не белое. Омойте его, один звон, держите высоко».',need:'kind',value:'living',taboo:'white',treatment:'wash',bell:1,height:'high',emblem:'frog'},
 {id:'relics',title:'Музейная ночь',riddle:'«Священную реликвию, но не тёмную. Дым, два звона, низкий алтарь».',need:'kind',value:'relic',taboo:'dark',treatment:'smoke',bell:2,height:'low',emblem:'candle'},
 {id:'tools',title:'Орудия благочестия',riddle:'«Рабочий инструмент, но не серебряный. Перевяжите его, два звона, вознесите».',need:'kind',value:'tool',taboo:'silver',treatment:'ribbon',bell:2,height:'high',emblem:'shield'},
 {id:'regalia',title:'Королевский скандал',riddle:'«Регалию, только не золотую. Умастите, один звон, высокий постамент».',need:'kind',value:'regalia',taboo:'gold',treatment:'anoint',bell:1,height:'high',emblem:'mirror'},
 {id:'noisy',title:'Ночь серебра',riddle:'«Серебряный предмет, но не металлический. Омойте, трижды звоните, оставьте низко».',need:'color',value:'silver',taboo:'metal',treatment:'wash',bell:3,height:'low',emblem:'fish'}
]);
const EXTRA_DOCTRINES=Object.freeze([
 {id:'ribbons',name:'Узы веры',desc:'Лента +1, другая подготовка −1.',positive:'Все связаны одним бантом.',negative:'Узы веры развязались.'},
 {id:'oil',name:'Священное масло',desc:'Умащение +1, иное −1.',positive:'Алтарь благоухает.',negative:'В храме слишком сухо.'},
 {id:'smoke',name:'Дымовая завеса',desc:'Окуривание +1, иное −1.',positive:'Дым принят за знак.',negative:'Пророчество недостаточно дымное.'},
 {id:'gilding',name:'Блестящая правда',desc:'Позолота +1, иное −1.',positive:'Прихожане ослеплены блеском.',negative:'Слишком мало золота для истины.'},
 {id:'second',name:'Двойное аминь',desc:'Два звона +1, иначе −1.',positive:'Второй звон звучит идеально.',negative:'Звонарь не умеет считать до двух.'},
 {id:'humble',name:'Смирение',desc:'Низкий алтарь +1, высокий −1.',positive:'Бог уважает скромность.',negative:'Гордыня оказалась слишком высока.'},
 {id:'living',name:'Святые звери',desc:'Живой дар +1, остальное −1.',positive:'Живое само благословляет алтарь.',negative:'Церковь требует признаков жизни.'},
 {id:'relic',name:'Мощи в моде',desc:'Реликвия +1, иное −1.',positive:'Древность подтверждает святость.',negative:'Слишком современный предмет.'},
 {id:'tools',name:'Культ труда',desc:'Инструмент +1, остальное −1.',positive:'Труд облагораживает.',negative:'Безделье наказывается.'},
 {id:'royal',name:'Парад корон',desc:'Регалия +1, остальное −1.',positive:'Монархия одобрила обряд.',negative:'Недостаточно королевского величия.'},
 {id:'red',name:'Багровые нимбы',desc:'Красный дар +1, иной −1.',positive:'Нимбы обрели цвет.',negative:'Нимб выглядит бледно.'},
 {id:'green',name:'Зелёная благодать',desc:'Зелёный дар +1, иной −1.',positive:'Болотная курия ликует.',negative:'Природа отвергла жрецов.'},
 {id:'dark',name:'Сумрачные псалмы',desc:'Тёмный дар +1, иной −1.',positive:'Тьма священна.',negative:'Слишком светло для псалма.'},
 {id:'silver',name:'Серебряная неделя',desc:'Серебряный дар +1, иной −1.',positive:'Серебро всё объяснило.',negative:'Серебра в казне нет.'},
 {id:'round',name:'Круговорот грехов',desc:'Круглый дар +1, иной −1.',positive:'Замкнутый круг спасения.',negative:'Форма не одобрена.'},
 {id:'angular',name:'Острые догматы',desc:'Угловатый дар +1, иной −1.',positive:'Углы твёрдо стоят на своём.',negative:'Слишком гладкая ересь.'},
 {id:'paper',name:'Бумажная церковь',desc:'Бумага +1, иное −1.',positive:'Документы заверены небом.',negative:'На обряд не подали справку.'},
 {id:'stone',name:'Тяжёлый аргумент',desc:'Камень +1, иное −1.',positive:'Камень доказал догмат.',negative:'Аргумент слишком лёгкий.'}
]);
// Public round incidents: conditional blessing or penalty, never a hard lock.
const INCIDENTS=Object.freeze([
 {id:'tax',title:'Сборщик десятины',story:'Казначей проверяет дары. Металл ценится выше всего.',field:'material',value:'metal',delta:1},
 {id:'rats',title:'Нашествие крыс',story:'Крысы грызут съестные подношения ещё до суда.',field:'kind',value:'food',delta:-1},
 {id:'choir',title:'Бунт хора',story:'Певчие готовы подпевать только трём ударам колокола.',field:'bell',value:3,delta:1},
 {id:'drought',title:'Великая засуха',story:'Вода редка, а омовение стало драгоценным.',field:'treatment',value:'wash',delta:1},
 {id:'festival',title:'Праздник лент',story:'Прихожане несут ленты. Перевязанный дар встречают овацией.',field:'treatment',value:'ribbon',delta:1},
 {id:'audit',title:'Небесная ревизия',story:'Строгий писарь сегодня особенно любит бумагу.',field:'material',value:'paper',delta:1},
 {id:'wind',title:'Сквозняк в храме',story:'Сильный ветер срывает дым и рушит благовония.',field:'treatment',value:'smoke',delta:-1},
 {id:'eclipse',title:'Солнечное затмение',story:'Во время затмения высокие алтари привлекают небесный взор.',field:'height',value:'high',delta:1},
 {id:'pilgrims',title:'Паломники с болот',story:'Паломники требуют зелёного знака милости.',field:'color',value:'green',delta:1},
 {id:'thieves',title:'Ночь воров',story:'Позолоченные дары привлекают слишком много внимания.',field:'treatment',value:'gild',delta:-1},
 {id:'fashion',title:'Епископская мода',story:'Угловатые вещи объявлены новым каноном формы.',field:'shape',value:'angular',delta:1},
 {id:'silence',title:'Обет молчания',story:'Третий удар колокола нарушает священную тишину.',field:'bell',value:3,delta:-1},
 {id:'market',title:'Ярмарка чудес',story:'Съедобный дар почитают знаком изобилия.',field:'kind',value:'food',delta:1},
 {id:'democracy',title:'Собор спорщиков',story:'Низкий алтарь вызывает меньше возражений у собора.',field:'height',value:'low',delta:1},
 {id:'flood',title:'Потоп в ризнице',story:'Вода уничтожила бумажные реликвии.',field:'material',value:'paper',delta:-1},
 {id:'oil',title:'Постановление о масле',story:'Умащение теперь считается особенно важным обрядом.',field:'treatment',value:'anoint',delta:1}
]);


import {EXTRA_ITEMS,EXTRA_TREATMENTS,EXTRA_RITES,EXTRA_DOCTRINES,INCIDENTS} from './content.js';

/* BNT v0.2 - deterministic, dependency-free local ritual engine.
   The pure transition functions are deliberately reusable by a future PocketNet server. */
const ITEMS = Object.freeze([
 {id:'goose',name:'Гусь',color:'white',shape:'long',kind:'living',material:'feather',hint:'Белый · живой · вытянутый'},
 {id:'bread',name:'Каравай',color:'gold',shape:'round',kind:'food',material:'grain',hint:'Золотой · пища · круглый'},
 {id:'crown',name:'Корона',color:'gold',shape:'angular',kind:'regalia',material:'metal',hint:'Золотая · металл · угловатая'},
 {id:'egg',name:'Яйцо',color:'white',shape:'round',kind:'food',material:'shell',hint:'Белое · пища · круглое'},
 {id:'candle',name:'Свеча',color:'white',shape:'long',kind:'relic',material:'wax',hint:'Белая · воск · вытянутая'},
 {id:'fish',name:'Рыба',color:'silver',shape:'long',kind:'food',material:'water',hint:'Серебряная · пища · вытянутая'},
 {id:'key',name:'Ключ',color:'silver',shape:'angular',kind:'tool',material:'metal',hint:'Серебряный · металл · угловатый'},
 {id:'cup',name:'Чаша',color:'gold',shape:'round',kind:'regalia',material:'metal',hint:'Золотая · металл · круглая'},
 {id:'stone',name:'Камень',color:'dark',shape:'angular',kind:'relic',material:'stone',hint:'Тёмный · камень · угловатый'},
 {id:'bell',name:'Колокол',color:'silver',shape:'round',kind:'relic',material:'metal',hint:'Серебряный · металл · круглый'}
 ,...EXTRA_ITEMS
]);
const TREATMENTS=Object.freeze([
 {id:'wash',name:'Омыть',short:'Вода'},
 {id:'smoke',name:'Окурить',short:'Дым'},
 {id:'gild',name:'Золотить',short:'Золото'}
 ,...EXTRA_TREATMENTS
]);
const RITES=Object.freeze([
 {id:'white',title:'Белее облака',riddle:'«Принесите светлое. Не терплю железа. Пусть омовение станет первым благословением. Два звона и низкий постамент».',
  need:'color',value:'white',taboo:'metal',treatment:'wash',bell:2,height:'low',emblem:'light'},
 {id:'round',title:'Пир небесного колеса',riddle:'«Не имеющее углов согреет меня. Но живому сюда нельзя. Пусть дым укажет дорогу. Три звона, высокий постамент».',
  need:'shape',value:'round',taboo:'living',treatment:'smoke',bell:3,height:'high',emblem:'circle'},
 {id:'feast',title:'Великий обед',riddle:'«Голоден. Съедобное, но не золотое! Украсьте его сиянием, поднимите повыше и ударьте в колокол лишь раз».',
  need:'kind',value:'food',taboo:'gold',treatment:'gild',bell:1,height:'high',emblem:'feast'},
 {id:'metal',title:'Железная милость',riddle:'«Жажду холодного металла. Но серебро сегодня мне противно. Обмойте дар, трижды звоните, ставьте у подножия».',
  need:'material',value:'metal',taboo:'silver',treatment:'wash',bell:3,height:'low',emblem:'key'},
 {id:'long',title:'Священная длина',riddle:'«Чем длиннее силуэт, тем ближе ко мне. Пищу не подавать. Дым, один удар и низкий постамент».',
  need:'shape',value:'long',taboo:'food',treatment:'smoke',bell:1,height:'low',emblem:'line'},
 {id:'treasure',title:'Цена небес',riddle:'«Мне нужно золото. Железа не выношу. Нанесите золото ещё раз, даже если оно уже блестит. Дважды звони, возвышай дар».',
  need:'color',value:'gold',taboo:'metal',treatment:'gild',bell:2,height:'high',emblem:'crown'}
 ,...EXTRA_RITES
]);
const DOCTRINES=Object.freeze([
 {id:'goose',name:'Гусь — епископ',desc:'Гусь получает +2 к суду. Любой другой дар —1.',positive:'Гусь благословляет подношение.',negative:'Епископ-гусь неодобрительно гогочет.'},
 {id:'washing',name:'Вечное омовение',desc:'Омытые дары +1. Остальные —1.',positive:'Вода очищает от сомнений.',negative:'Священная вода никого не дождалась.'},
 {id:'height',name:'Ближе к небу',desc:'Высокий алтарь +1. Низкий —1.',positive:'Подношение приближается к небу.',negative:'Подношение унизительно низко.'},
 {id:'quiet',name:'Единственный удар',desc:'Один звон +1. Больше —1.',positive:'Тишина после первого звона почтена.',negative:'Лишние удары оскорбляют тишину.'},
 {id:'thunder',name:'Тройное громыхание',desc:'Три звона +1. Меньше —1.',positive:'Три грома услышаны.',negative:'Божеству недодали грома.'},
 {id:'white',name:'Светлая ересь',desc:'Белое подношение +1. Иное —1.',positive:'Белизна признана священной.',negative:'Это недостаточно белое для собора.'},
 {id:'iron',name:'Железная вера',desc:'Металлическое подношение +1. Иное —1.',positive:'Звучит священный металл.',negative:'Церковь требует металла.'},
 {id:'food',name:'Съедобная истина',desc:'Пища +1. Иное —1.',positive:'Вера поддерживается пищей.',negative:'Жрецы забыли кормить веру.'}
 ,...EXTRA_DOCTRINES
]);
const MAX_ROUNDS=5;
const START_FAITH=6;
const MAX_FAITH=10;
const validItem=id=>ITEMS.some(x=>x.id===id);
const idSet=x=>new Set(x.map(a=>a.id));
const doctrineSet=idSet(DOCTRINES);
const treatSet=idSet(TREATMENTS);
const getItem=id=>ITEMS.find(x=>x.id===id)||null;
const getDoctrine=id=>DOCTRINES.find(x=>x.id===id)||null;
const getRite=s=>RITES[s.order[s.round]];
const getIncident=state=>{
 const seed=(state.seed^0x7b39cf81)>>>0,random=random32(seed);
 const deck=INCIDENTS.map((_,i)=>i);
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 return INCIDENTS[deck[state.round%deck.length]];
};
const getIncidentById=id=>INCIDENTS.find(x=>x.id===id)||null;
const defaultAction=()=>({itemId:null,treatment:null,bell:1,height:'low'});
function random32(seed) { let x=(seed>>>0)||0x6d2b79f5; return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};}
function createGame(seed=0x6ab52d19) {
 const number=Number.isInteger(seed)?(seed>>>0):0x6ab52d19;
 const rand=random32(number);const order=RITES.map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return {schema:2,seed:number,order:order.slice(0,MAX_ROUNDS),round:0,faith:START_FAITH,
 phase:'play',actions:defaultAction(),doctrines:[],history:[],judgment:null,offers:[],councilUsed:false};
}
function setAction(state,patch){
 if(state.phase!=='play')return state;
 const next={...state.actions};
 if(Object.hasOwn(patch,'itemId')&&(patch.itemId===null||validItem(patch.itemId)))next.itemId=patch.itemId;
 if(Object.hasOwn(patch,'treatment')&&(patch.treatment===null||treatSet.has(patch.treatment)))next.treatment=patch.treatment;
 if([1,2,3].includes(patch.bell))next.bell=patch.bell;
 if(['low','high'].includes(patch.height))next.height=patch.height;
 return {...state,actions:next};
}
function doctrineEffect(id,action){
 const item=getItem(action.itemId);
 const pass=({
  goose:()=>item?.id==='goose',washing:()=>action.treatment==='wash',height:()=>action.height==='high',
  quiet:()=>action.bell===1,thunder:()=>action.bell===3,white:()=>item?.color==='white',
  iron:()=>item?.material==='metal',food:()=>item?.kind==='food',
  ribbons:()=>action.treatment==='ribbon',oil:()=>action.treatment==='anoint',
  smoke:()=>action.treatment==='smoke',gilding:()=>action.treatment==='gild',
  second:()=>action.bell===2,humble:()=>action.height==='low',
  living:()=>item?.kind==='living',relic:()=>item?.kind==='relic',
  tools:()=>item?.kind==='tool',royal:()=>item?.kind==='regalia',
  red:()=>item?.color==='red',green:()=>item?.color==='green',dark:()=>item?.color==='dark',
  silver:()=>item?.color==='silver',round:()=>item?.shape==='round',angular:()=>item?.shape==='angular',
  paper:()=>item?.material==='paper',stone:()=>item?.material==='stone'
 })[id];
 if(!pass)return {delta:0,text:''};
 const good=!!pass(),d=getDoctrine(id);
 return {delta:good?(id==='goose'?2:1):-1,text:good?d.positive:d.negative};
}
function evaluateRite(rite,action,doctrines=[],incident=null){
 const item=getItem(action.itemId);if(!item)throw Error('Missing offering');
 const matches=(field,value)=>item[field]===value;
 const taboo=['material','kind','color','shape'].some(field=>item[field]===rite.taboo);
 const incidentScore=incident&&((incident.field==='bell'||incident.field==='height'||incident.field==='treatment')?
  action[incident.field]===incident.value:item[incident.field]===incident.value)?incident.delta:0;
 const criteria=[
  {name:'Дар по знамению',score:matches(rite.need,rite.value)?2:0,max:2},
  {name:'Запрет соблюдён',score:taboo?0:1,max:1},
  {name:'Подготовка',score:action.treatment===rite.treatment?1:0,max:1},
  {name:'Звон',score:action.bell===rite.bell?1:0,max:1},
  {name:'Высота',score:action.height===rite.height?1:0,max:1},
  ...(incident?[{name:'Событие: '+incident.title,score:incidentScore,max:1}]:[])
 ];
 const doctrineResults=doctrines.map(id=>({id,...doctrineEffect(id,action)}));
 const score=criteria.reduce((n,c)=>n+c.score,0)+doctrineResults.reduce((n,d)=>n+d.delta,0);
 const verdict=score>=4?'bless':score>=3?'doubt':'wrath';
 const delta=verdict==='bless'?2:verdict==='wrath'?-2:0;
 // Four authored miracle families arise from real actions, not a random joke generator.
 const special={goat:'goat',apple:'apple',mushroom:'mushroom',flower:'flower',mirror:'mirror',mask:'mask',scroll:'scroll',sword:'sword',shield:'shield',hourglass:'hourglass',book:'book',boot:'boot',cheese:'cheese',lantern:'lantern',frog:'frog',compass:'compass',skull:'skull',potato:'potato'};
 const miracleId=special[item.id]|| (item.id==='goose'?'goose':action.treatment==='gild'?'gilded':
  action.bell===3?'thunder':'ash');
 const miracleText={
  goose:'Гусь оглядел прихожан и объявил себя единственным настоящим епископом.',
  gilded:'Небо пролилось золотой пылью. ОГО потребовал выдать её за пожертвования.',
  thunder:'Колокол ударил снова без участия звонаря. Никто не посмел возразить.',
  ash:'С алтаря поднялся клуб пыли. Совет признал его священным дымом.',
  goat:'Коза съела лист с молитвой. Церковь назначила её главным архивариусом.',
  apple:'Яблоко упало точно на голову настоятелю. Это назвали законом тяготения.',
  mushroom:'Гриб начал светиться. В храме срочно утвердили праздник подозрительных супов.',
  flower:'Цветок распустился посреди суда. Бог потребовал прибавку садовнику.',
  mirror:'В зеркале отразился второй бог. Первый обвинил его в ереси.',
  mask:'Маска подмигнула собору. Её немедленно назначили официальным лицом церкви.',
  scroll:'Свиток размотался до выхода. В очереди за индульгенциями стало тесно.',
  sword:'Меч вонзился в пол. Бог объявил, что церковь теперь имеет собственную границу.',
  shield:'Щит отразил молнию. Канонизировали техника безопасности.',
  hourglass:'Песок в часах потёк вверх. Паломники попросили вернуть вчерашний день.',
  book:'Книга открылась на странице с долгами жрецов. Началась налоговая реформа.',
  boot:'Сапог самостоятельно сделал три шага. Его признали первым миссионером.',
  cheese:'Сыр покрылся священными дырками. Собор провёл расследование их происхождения.',
  lantern:'Фонарь осветил подвал. Выяснилось, что бог прятал там пожертвования.',
  frog:'Жаба квакнула громче колокола. Звонаря отправили на переподготовку.',
  compass:'Компас указал на буфет. Новая священная география принята единогласно.',
  skull:'Череп засмеялся без нижней челюсти. Бог потребовал позвать анатома.',
  potato:'Картошка пустила росток. Церковь объявила это первым земным пророчеством.'
 }[miracleId];
 return {score,criteria,doctrineResults,verdict,faithDelta:delta,selected:item.id,miracleId,miracleText,
  incidentId:incident?.id||null,incidentText:incident?incident.story:null,incidentScore};
}
function makeOffers(state,judgment){
 const item=getItem(state.actions.itemId),incident=getIncident(state);
 const linked=[
  item.id==='goose'?'goose':item.kind==='food'?'food':item.material==='metal'?'iron':'white',
  {wash:'washing',smoke:'smoke',gild:'gilding',ribbon:'ribbons',anoint:'oil'}[state.actions.treatment],
  {living:'living',food:'food',relic:'relic',regalia:'royal',tool:'tools'}[item.kind],
  {white:'white',red:'red',green:'green',dark:'dark',silver:'silver',gold:'royal'}[item.color],
  {round:'round',angular:'angular',long:'height'}[item.shape],
  {1:'quiet',2:'second',3:'thunder'}[state.actions.bell],
  state.actions.height==='high'?'height':'humble',
  {paper:'paper',stone:'stone',metal:'iron'}[item.material],
  incident?.field==='treatment'?{wash:'washing',smoke:'smoke',gild:'gilding',ribbon:'ribbons',anoint:'oil'}[incident.value]:null
 ];
 const shuffled=DOCTRINES.map(d=>d.id),random=random32(state.seed^((state.round+1)*0x9e3779b9));
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const options=[...linked.filter(Boolean),...shuffled].filter(id=>!state.doctrines.includes(id));
 return [...new Set(options)].slice(0,2);
}
function commitRite(state){
 if(state.phase!=='play'||!getItem(state.actions.itemId))return state;
 const rite=getRite(state);
 const judgment=evaluateRite(rite,state.actions,state.doctrines,getIncident(state));
 const faith=Math.max(0,Math.min(MAX_FAITH,state.faith+judgment.faithDelta));
 const event={round:state.round+1,riteId:rite.id,riteTitle:rite.title,itemId:state.actions.itemId,
  actions:{...state.actions},...judgment,faithAfter:faith,adopted:null};
 const history=[...state.history,event];
 return {...state,faith,phase:'judgment',judgment,history,offers:makeOffers(state,judgment)};
}
function continueFromJudgment(state){
 if(state.phase!=='judgment')return state;
 if(state.faith===0||state.round===MAX_ROUNDS-1)return {...state,phase:'end',offers:[]};
 return {...state,phase:'dogma'};
}
function chooseDoctrine(state,id){
 if(state.phase!=='dogma'||!state.offers.includes(id))return state;
 const doctrines=[...state.doctrines,id].slice(-3);
 const history=state.history.map((x,i)=>i===state.round?{...x,adopted:id}:x);
 return {...state,doctrines,history,round:state.round+1,phase:'play',
  actions:defaultAction(),judgment:null,offers:[]};
}
function conveneCouncil(state){
 if(state.phase!=='play'||state.councilUsed||state.doctrines.length===0||state.faith<2)return state;
 return {...state,councilUsed:true,faith:state.faith-1,doctrines:state.doctrines.slice(1)};
}
function getBestPossible(state){
 const rite=getRite(state);let best=-999;
 for(const item of ITEMS)for(const treatment of TREATMENTS)for(const bell of [1,2,3])for(const height of ['low','high']){
  best=Math.max(best,evaluateRite(rite,{itemId:item.id,treatment:treatment.id,bell,height},state.doctrines,getIncident(state)).score);
 }
 return best;
}
function loadGame(raw){
 try {
  if(!raw||raw.schema!==2||!Number.isInteger(raw.seed)||!Array.isArray(raw.order)||raw.order.length!==MAX_ROUNDS||
    new Set(raw.order).size!==MAX_ROUNDS||raw.order.some(n=>!Number.isInteger(n)||n<0||n>=RITES.length)||
    !Number.isInteger(raw.round)||raw.round<0||raw.round>=MAX_ROUNDS||
    !Number.isFinite(raw.faith)||raw.faith<0||raw.faith>MAX_FAITH||
    !['play','judgment','dogma','end'].includes(raw.phase)||
    !Array.isArray(raw.doctrines)||raw.doctrines.length>3||raw.doctrines.some(id=>!doctrineSet.has(id))||
    !Array.isArray(raw.history)||raw.history.length>MAX_ROUNDS||
    !raw.actions||typeof raw.actions!=='object')return null;
  const clean={...defaultAction()};
  if(raw.actions.itemId!==null&&!validItem(raw.actions.itemId))return null;clean.itemId=raw.actions.itemId;
  if(raw.actions.treatment!==null&&!treatSet.has(raw.actions.treatment))return null;
  clean.treatment=raw.actions.treatment;
  if(![1,2,3].includes(raw.actions.bell)||!['low','high'].includes(raw.actions.height))return null;
  clean.bell=raw.actions.bell;clean.height=raw.actions.height;
  if(raw.history.length!==raw.round+(raw.phase==='play'?0:1) && !(raw.phase==='end'&&raw.faith===0))return null;
  if(raw.history.some(x=>!x||!RITES.some(r=>r.id===x.riteId)||!validItem(x.itemId)))return null;
  return {...raw,actions:clean,councilUsed:raw.councilUsed===true,
   offers:Array.isArray(raw.offers)?raw.offers.filter(id=>doctrineSet.has(id)).slice(0,2):[]};
 }catch{return null}
}
function isWin(state){return state.phase==='end'&&state.faith>0;}


const TIME_PLAY=145000,TIME_JUDGE=19000,TIME_VOTE=34000;
const TASKS=['need','taboo','offering','bell','height'];
const roles=n=>n===2?[['need','taboo','offering'],['bell','height']]:
 n===3?[['need','taboo'],['offering'],['bell','height']]:
 n===4?[['need'],['taboo'],['offering'],['bell','height']]:
 [['need'],['taboo'],['offering'],['bell'],['height']];
const labels={need:'Пророк знамений',taboo:'Хранитель запретов',offering:'Ризничий',bell:'Звонарь',height:'Алтарщик'};
const announcements={help:'Нужна подсказка',warn:'Проверьте запрет!',agree:'Согласен с обрядом',urgent:'Скоро суд!'};
const signText={
 need:r=>({color:'Нужен цвет',shape:'Нужна форма',kind:'Нужен вид',material:'Нужен материал'}[r.need]||'Нужна метка')+': '+({
 white:'белый',gold:'золотой',silver:'серебряный',dark:'тёмный',red:'красный',green:'зелёный',round:'круглый',long:'вытянутый',
 angular:'угловатый',food:'пища',living:'живое',relic:'реликвия',tool:'инструмент',regalia:'регалия',metal:'металл',paper:'бумага',plant:'растение',leather:'кожа',glass:'стекло',bone:'кость',milk:'молоко',fur:'шерсть',fruit:'плод',earth:'земля'
 }[r.value]||r.value),
 taboo:r=>'Запрещено: '+({metal:'металл',living:'живые существа',food:'пища',gold:'золотой цвет',silver:'серебряный цвет',white:'белый цвет',dark:'тёмный цвет',red:'красный цвет'}[r.taboo]||r.taboo)
};
const has=(s,id,task)=>s.assignments[id]?.includes(task)||false;
const roster=s=>s.players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
const emit=()=>[{type:'state',payload:null}]; // Hub replaces payload with opt-in personal projection.
const note=(player,txt)=>[{type:'notice',to:player.id,payload:txt}];
const bump=s=>({state:{...s,revision:s.revision+1},events:emit()});
const taskOwners=s=>Object.fromEntries(s.players.flatMap((p,i)=>s.assignments[p.id].map(task=>[task,p.id])));
const initRoles=s=>{
 const scheme=roles(s.players.length);
 s.assignments=Object.fromEntries(s.players.map((p,i)=>[p.id,scheme[(i+(s.match?.round||0))%s.players.length]]));
};
const clearRound=s=>{
 s.altar={itemId:null,treatment:null,bell:null,height:null};
 s.done={};s.locked={};s.announcements=[];s.votes={};s.acks={};
};
function newPhase(s,phase){
 s.phase=phase;s.phaseNonce=(s.phaseNonce||0)+1;
 s.phaseId=s.match?.round+':'+phase+':'+s.phaseNonce;
 s.deadlineAt=phase==='play'?Date.now()+TIME_PLAY:phase==='judgment'?Date.now()+TIME_JUDGE:
  phase==='dogma'?Date.now()+TIME_VOTE:0;
 if(phase==='play')clearRound(s);
 if(phase==='judgment')s.acks={};
 if(phase==='dogma')s.votes={};
}
function isReady(s){
 return TASKS.every(task=>s.done[task]===true)&&s.players.every(p=>s.locked[p.id]===true);
}
function playResult(s){
 if(s.phase!=='play')return;
 const a={itemId:s.altar.itemId||'bread',treatment:s.altar.treatment||'wash',
  bell:s.altar.bell||1,height:s.altar.height||'low'};
 const previous=s.match;
 const next=commitRite({...previous,actions:a});
 if(next===previous)throw Error('cannot_resolve_rite');
 next.judgment={...next.judgment,unfinished:TASKS.filter(k=>!s.done[k]),
  lockedCount:Object.values(s.locked).filter(Boolean).length,contributors:taskOwners(s)};
 next.history[next.history.length-1]={...next.history[next.history.length-1],
   unfinished:next.judgment.unfinished};
 s.match=next;newPhase(s,'judgment');
}
function continueJudgment(s){
 if(s.phase!=='judgment')return;
 s.match=continueFromJudgment(s.match);
 if(s.match.phase==='end'){s.phase='end';s.phaseId=s.match.round+':end';s.deadlineAt=0;}
 else newPhase(s,'dogma');
}
function concludeCouncil(s){
 if(s.phase!=='dogma')return;
 const offers=s.match.offers||[];
 const scores=offers.map(x=>Object.values(s.votes).filter(v=>v===x).length);
 s.match=chooseDoctrine(s.match,scores[1]>scores[0]?offers[1]:offers[0]);
 initRoles(s);newPhase(s,'play');
}
function advance(s){
 if(!s.deadlineAt||Date.now()<s.deadlineAt)return false;
 if(s.phase==='play')playResult(s);
 else if(s.phase==='judgment')continueJudgment(s);
 else if(s.phase==='dogma')concludeCouncil(s);
 else return false;
 s.revision++;
 return true;
}
function matchView(m){
 return m?{phase:m.phase,round:m.round,faith:m.faith,doctrines:[...m.doctrines],
  offers:[...m.offers],incident:getIncident(m),judgment:m.judgment,history:m.history.map(h=>({
   round:h.round,riteTitle:h.riteTitle,itemId:h.itemId,score:h.score,verdict:h.verdict,
   miracleText:h.miracleText,adopted:h.adopted,faithAfter:h.faithAfter,unfinished:h.unfinished||[]
  }))}:null;
}
const game={
 protocolVersion:1,
 viewForPlayer({state:s,player}){
  const tasks=s.assignments?.[player.id]||[];
  const rite=s.match&&s.phase==='play'?getRite(s.match):null;
  const clues={};
  if(rite){
   if(tasks.includes('need'))clues.need={field:rite.need,value:rite.value,text:signText.need(rite)};
   if(tasks.includes('taboo'))clues.taboo={value:rite.taboo,text:signText.taboo(rite)};
   if(tasks.includes('offering'))clues.treatment={value:rite.treatment,text:'Подготовка: '+({
    wash:'омыть',smoke:'окурить',gild:'позолотить',ribbon:'перевязать',anoint:'умастить'}[rite.treatment]||rite.treatment)};
   if(tasks.includes('bell'))clues.bell={value:rite.bell,text:'Колокольных ударов: '+rite.bell};
   if(tasks.includes('height'))clues.height={value:rite.height,text:rite.height==='high'?'Вознести дар':'Оставить у подножия'};
  }
  return {
   phase:s.phase,phaseId:s.phaseId,revision:s.revision,serverNow:Date.now(),
   host:s.host,players:roster(s),assignments:s.assignments,match:matchView(s.match),
   riteTitle:rite?.title||null,ownTasks:tasks,ownClues:clues,
   altar:{...s.altar},done:{...s.done},locked:{...s.locked},
   announcements:s.announcements.map(x=>({...x})),votes:{...s.votes},acks:{...s.acks},
   deadlineAt:s.deadlineAt,ownSeq:s.lastSeq?.[player.id]||0
  };
 },
 createRoom({player}){
  const s={phase:'lobby',phaseId:'lobby',revision:0,host:player.id,
   players:[{id:player.id,name:player.name,verified:!!player.verified}],
   assignments:{},match:null,altar:{itemId:null,treatment:null,bell:null,height:null},
   done:{},locked:{},announcements:[],votes:{},acks:{},lastSeq:{},deadlineAt:0,
   phaseNonce:0,matchNo:0};
  initRoles(s);return {state:s};
 },
 onJoin({state:s,players}){
  if(s.phase!=='lobby'&&s.phase!=='end')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  s.players=players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
  initRoles(s);return bump(s);
 },
 onLeave({state:s,players}){
  s.players=players.map(p=>({id:p.id,name:p.name,verified:!!p.verified}));
  if(!s.players.some(p=>p.id===s.host))s.host=s.players[0]?.id||null;
  const ids=new Set(s.players.map(p=>p.id));
  for(const key of ['locked','votes','acks','lastSeq'])for(const id of Object.keys(s[key]||{}))
   if(!ids.has(id))delete s[key][id];
  initRoles(s);
  if(s.players.length<MIN_PLAYERS&&s.phase!=='lobby'&&s.phase!=='end'){
   s.phase='lobby';s.phaseId='lobby';s.match=null;s.deadlineAt=0;clearRound(s);
  }else if(s.phase==='play'){newPhase(s,'play');}
  else if(s.phase==='judgment'&&s.players.every(p=>s.acks[p.id]))continueJudgment(s);
  else if(s.phase==='dogma'&&s.players.every(p=>s.votes[p.id]))concludeCouncil(s);
  return bump(s);
 },
 onMessage({state:s,player,payload}){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const advanced=advance(s);
  if(p.type==='sync'||p.type==='pulse')
   return {state:s,events:[{type:'state',to:player.id,payload:null},...(advanced?emit():[])]};
  if(p.type==='start'){
   if(s.host!==player.id)return {state:s,events:note(player,'Начать может только настоятель.')};
   if(s.phase!=='lobby'&&s.phase!=='end')return {state:s,events:note(player,'Обряд уже начат.')};
   if(s.players.length<MIN_PLAYERS||s.players.length>MAX_PLAYERS)
    return {state:s,events:note(player,'Нужно 2–5 жрецов.')};
   s.matchNo++;
   s.match=createGame((Date.now()^(s.matchNo*2654435761))>>>0);
   s.lastSeq={};initRoles(s);newPhase(s,'play');return bump(s);
  }
  if(!s.match)return {state:s,events:note(player,'Ждите начала обряда.')};
  if(typeof p.phaseId!=='string'||p.phaseId!==s.phaseId)
   return {state:s,events:note(player,'Фаза уже изменилась. Обновите ритуал.')};
  if(!Number.isInteger(p.seq)||p.seq<1||p.seq>10000000)return {state:s,events:note(player,'Неверный номер действия.')};
  if(p.seq<=(s.lastSeq[player.id]||0))return {state:s,events:[{type:'state',to:player.id,payload:null}]};
  s.lastSeq[player.id]=p.seq;
  if(s.phase==='play'){
   if(p.type==='call'&&Object.hasOwn(announcements,p.kind)&&typeof p.kind==='string'){
    const cooldown=s.announcements.filter(x=>x.by===player.id);
    if(cooldown.length>=6)return {state:s,events:note(player,'Небесная доска заполнена вашими знаками.')};
    s.announcements=[...s.announcements,{by:player.id,kind:p.kind,text:announcements[p.kind]}].slice(-12);
    return bump(s);
   }
   if(s.locked[player.id])return {state:s,events:note(player,'Вы уже запечатали свою работу.')};
   if(p.type==='reveal'&&has(s,player.id,p.task)&&['need','taboo'].includes(p.task)){
    const rite=getRite(s.match);
    s.done[p.task]=true;
    s.announcements=[...s.announcements,{by:player.id,kind:'revelation',
      text:signText[p.task](rite)}].slice(-12);
    return bump(s);
   }
   if(p.type==='set'&&typeof p.task==='string'&&has(s,player.id,p.task)){
    if(p.task==='offering'){
     if(!validItem(p.itemId)||!treatSet.has(p.treatment))return {state:s,events:note(player,'Нужен настоящий дар и способ подготовки.')};
     s.altar.itemId=p.itemId;s.altar.treatment=p.treatment;s.done.offering=true;return bump(s);
    }
    if(p.task==='bell'&&[1,2,3].includes(p.value)){s.altar.bell=p.value;s.done.bell=true;return bump(s);}
    if(p.task==='height'&&['low','high'].includes(p.value)){s.altar.height=p.value;s.done.height=true;return bump(s);}
   }
   if(p.type==='lock'&&s.assignments[player.id].every(task=>s.done[task]===true)){
    s.locked[player.id]=true;
    if(isReady(s))playResult(s);
    return bump(s);
   }
   if(p.type==='unlock'){delete s.locked[player.id];return bump(s);}
   return {state:s,events:note(player,'Этот инструмент принадлежит другому жрецу.')};
  }
  if(s.phase==='judgment'&&p.type==='ack'){
   s.acks[player.id]=true;
   if(s.players.every(w=>s.acks[w.id]))continueJudgment(s);
   return bump(s);
  }
  if(s.phase==='dogma'&&p.type==='vote'&&s.match.offers.includes(p.id)){
   s.votes[player.id]=p.id;
   if(s.players.every(w=>s.votes[w.id]))concludeCouncil(s);
   return bump(s);
  }
  return {state:s,events:note(player,'Действие сейчас недоступно.')};
 }
};
export default game;
