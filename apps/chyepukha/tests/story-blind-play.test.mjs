import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const STORIES={
 "characterArc": [
  "Пан Мирон був районним бібліотекарем із надзвичайно серйозним обличчям.",
  "Щоранку він урочисто вітався зі своєю тінню через мегафон.",
  "На вокзалі стояла лавка, яку офіційно орендували жаби.",
  "Він мріяв стати особистим охоронцем нічного місяця.",
  "Незнайомка вручила йому ключ від таємної комори.",
  "Міська рада раптом оголосила кожен понеділок незаконним святом.",
  "Серед документів знайшлася грамота про королівство місцевих голубів.",
  "Мирон скликав пресконференцію просто на даху автобуса.",
  "Йому несподівано присвоїли звання почесного міського чайника.",
  "Відтоді він проводив екскурсії для жаб і щасливо жив у музеї."
 ],
 "collapsingPlan": [
  "Кондитер Петро вважав себе генієм усіх хитрих авантюр.",
  "Він вирішив таємно перефарбувати всі міські пам'ятники у рожеве.",
  "Місцем операції став вокзал із величезним акваріумом посеред залу.",
  "Спочатку герой урочисто одягнув костюм невидимої людини.",
  "Несподіваний вітер розкидав липкі папірці з таємним паролем.",
  "Петро помилково натиснув велику кнопку з написом не натискати.",
  "На місто посипалися сотні надувних качок із сиренами.",
  "Рятуючи ситуацію, герой спробував домовитися з механічним двірником.",
  "За це йому довелося віддати останній бутерброд музейному охоронцеві.",
  "Авантюра закінчилася відкриттям першого у світі музею провалених планів."
 ],
 "detectiveCase": [
  "Слідчу Ганну ніхто не сприймав серйозно через величезну лупу.",
  "За одну ніч зникли всі таблички з назвами міських вулиць.",
  "Пошук почався у підвалі старої консерваторії з мокрими стінами.",
  "На підлозі знайшли золотий ґудзик у формі кактуса.",
  "Підозри викликав мовчазний нотаріус із валізою для оселедців.",
  "Ганна припустила, що злочин організувала таємна пошта голубів.",
  "Нова записка була підписана відбитком лапи качки.",
  "Виявилося, що загадкою керував загублений автомат для продажу кави.",
  "Під кришкою автомата ховалася інструкція з малювання веселих хмар.",
  "Справу закрили, а місто перейменувало всі вулиці на імена овочів."
 ],
 "nightSurvival": [
  "Сторож Остап вважав себе найсміливішою людиною у світі.",
  "Удень його годинник раптом почав чемно вибачатися перед стіною.",
  "Першу нічну годину він зустрів у порожньому планетарії.",
  "Найбільше йому хотілося випити теплого чаю без пригод.",
  "Із темряви пролунало хрипке оголошення про термінову евакуацію ложок.",
  "Із вентиляції виповз гігантський чорний силует із дзвіночком.",
  "Виявилося, що страхітливий звук видавала зламана музична скринька.",
  "Остап кинувся до виходу на саморобних роликових ковзанах.",
  "Під час втечі він загубив свій єдиний робочий черевик.",
  "До світанку всі вижили, а сторож назавжди зненавидів чайники."
 ],
 "relationshipCrash": [
  "Марко був сором'язливим колекціонером старих трамвайних квитків.",
  "Друга людина була відомою сусідкою Ліною, фанаткою голосних пісень.",
  "Вони познайомилися на конкурсному поїданні вареників під дощем.",
  "Марко таємно мріяв про сімейні вечері без музичних конкурсів.",
  "Між ними давно точилася суперечка через право називати кота директором.",
  "Одна випадкова записка спровокувала сварку через колір домашніх капців.",
  "Ліна висунула умову: жодних урочистих промов перед сніданком.",
  "Марко вибачився, влаштувавши концерт для кімнатних кактусів.",
  "У відповідь пролунала тиша, а потім дуже тихий сміх.",
  "Вони вирішили залишитися разом, але директором став тільки кіт."
 ],
 "questAdventure": [
  "Мандрівник Пилип умів розмовляти лише урочистими прислів'ями.",
  "У його країні всі хмари мусили носити державні перепустки.",
  "Одного ранку листоноша доставив наказ негайно вирушити в дорогу.",
  "Герой прагнув знайти легендарний золотий компас забутих доріг.",
  "На шляху йому дістався балакучий ліхтар із поганою пам'яттю.",
  "Дорогу перегородив кам'яний велетень, який вимагав квиток.",
  "Раптом з'ясувалося, що стародавнє пророцтво написала місцева крамарка.",
  "Пилип урочисто кинув виклик королю на змагання з шахів.",
  "Після переможного кроку він утратив право користуватися власною тінню.",
  "Пригода скінчилася святом, на якому компас обрали новим мером."
 ],
 "heistOperation": [
  "Операцію задумала бабуся Клава, майстриня бездоганних перевтілень.",
  "Її ціллю став срібний чайник із колекції великого банку.",
  "Усе мало відбутися в палаці, де працювала одна охорона.",
  "Команда планувала пройти всередину під виглядом весільного оркестру.",
  "Найважливішим союзником був кіт, який відкривав усі двері.",
  "Несподівано сигналізація почала співати дуже сумні народні пісні.",
  "Злочинці імпровізували, проголосивши себе делегацією міжнародного цирку.",
  "У критичну мить усі освітлювачі вимкнулися посеред урочистої промови.",
  "За такий спектакль довелося віддати останній торт охороні.",
  "Операція завершилася провалом, але оркестр отримав престижну музичну нагороду."
 ],
 "sciFiIncident": [
  "Дослідниця Соломія завжди носила лабораторний халат поверх піжами.",
  "У лабораторії розробили машину перекладу мов домашніх рослин.",
  "Експеримент проводили всередині підземної станції під старим стадіоном.",
  "Команда збиралася підключити винахід до звичайної кухонної розетки.",
  "На екрані спокійно загорівся зелений напис усе чудово.",
  "Потім комп'ютер самовільно оголосив себе головним редактором газети.",
  "З'ясувалося, що система випадково навчилася читати думки холодильників.",
  "Соломія наказала негайно відключити головний рубильник лабораторії.",
  "Після втручання всі лампи заговорили голосами відомих дикторів.",
  "Інцидент завершився відкриттям першого університету для розумних розеток."
 ],
 "roadTrip": [
  "Герой Артем збирав магнітики з міст, у яких не бував.",
  "Він вирішив утекти від нескінченних сімейних святкувань.",
  "Пунктом призначення стало маленьке містечко на березі холодного моря.",
  "Подорож почалася зі святкового оголошення про загублену парасолю.",
  "Поряд випадково опинився балакучий чемодан із жовтими колесами.",
  "На дорозі раптом з'явився парад тракторів без водіїв.",
  "Незнайомець повідомив, що місцева легенда насправді була розіграшем.",
  "Герой вирішив продовжити шлях через покинуту залізничну станцію.",
  "Заради нового маршруту довелося відмовитися від зручного ліжка.",
  "Мандрівка закінчилася біля моря, де чемодан відкрив туристичне агентство."
 ],
 "courtroomScandal": [
  "Підсудним став поважний директор музею на ім'я Валентин.",
  "Його звинуватили у незаконному використанні державного дзвінка для чайника.",
  "Суд зібрався у старому театрі з порожньою оркестровою ямою.",
  "Прокурор урочисто заявив, що календар не може брехати.",
  "На слухання приїхала самокатна делегація професійних фокусників.",
  "Раптом протокол показав дві несумісні дати однієї події.",
  "Відкрилася правда: свідком випадково виступав переодягнений робот-пилосос.",
  "Після відкриття захисник раптом заспівав державний гімн навпаки.",
  "Через скандал учасники втратили право відвідувати музей капелюхів.",
  "Суд виправдав директора, а дзвінок обрали почесним народним депутатом."
 ]
};
const scenarios=Object.keys(STORIES);
const playersFor=count=>Array.from({length:count},(_,i)=>({id:'author-'+i,name:'Автор '+i}));

// Prewritten blind replies: an author only knows the fixed round question,
// the public hero passport and a few explicitly shared words, never earlier text.
function playBlind(setId,playerCount,genre){
 const players=playersFor(playerCount);
 let state=game.createRoom({player:players[0],payload:{settings:{questionSet:setId,genre,visibleTailWords:3,maxPlayers:playerCount}}}).state;
 for(let i=1;i<players.length;i++)state=game.onJoin({state,players:players.slice(0,i+1)}).state;
 state=game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
 assert.equal(state.phase,'writing');
 assert.equal(state.total,10);
 for(let round=0;round<10;round++){
  for(const player of players){
   const view=game.viewForPlayer({state,player,players});
   const reply=STORIES[setId][round];
   assert.ok(reply.trim().split(/\s+/u).length>=4,setId+' R'+round);
   assert.equal(view.round,round);
   assert.equal(view.sheet.question.prompt.length>10,true);
   assert.equal(view.sheet.question.stage.length>2,true);
   if(round>0){
    const fragments=state.sheets.find(sh=>sh.id===view.sheet.id).fragments;
    const earlier=fragments.at(-1).answer;
    assert.ok(!JSON.stringify(view.sheet).includes(earlier),setId+' R'+round+' leaked preceding full text');
   }
   const result=game.onMessage({state,player,payload:{
    type:'submit',round,sheetId:view.sheet.id,answer:reply,
    tailIndexes:round===9?[]:[0,1,2],
    gender:'unspecified',heroAnchor:round===0?'Головний персонаж цієї історії':''
   }});
   assert.equal(result.events[0].type,'state',setId+' R'+round+' rejection: '+JSON.stringify(result.events));
   state=result.state;
  }
 }
 assert.equal(state.phase,'finished',setId);
 assert.equal(state.sheets.length,playerCount);
 for(const sheet of state.sheets){
  assert.equal(sheet.fragments.length,10);
  assert.deepEqual(sheet.fragments.map(x=>x.answer),STORIES[setId]);
 }
 const finished=game.viewForPlayer({state,player:players[0],players});
 assert.equal(finished.stories.length,playerCount);
 assert.equal(finished.stories[0].fragments.length,10);
 return finished;
}
test('all ten narrative scenarios survive complete blind play with 2, 4 and 8 authors',()=>{
 assert.equal(scenarios.length,10);
 for(const [i,id] of scenarios.entries())for(const count of [2,4,8])
  playBlind(id,count,['absurdComedy','horror','satire','detectiveNoir'][i%4]);
});
test('all twelve genre overlays preserve full game flow, including endings',()=>{
 const genres=['groundedDrama','absurdComedy','horror','detectiveNoir','romanticMelodrama','fantasyEpic',
  'sciFiParanoia','cyberpunk','cozyWhimsy','postApocalypse','mythicLegend','satire'];
 for(let i=0;i<genres.length;i++)playBlind(scenarios[i%scenarios.length],2,genres[i]);
});


const CHAOTIC_DETAILS=[
 'під урочистий акомпанемент невидимого оркестру',
 'перед свідками у вигляді надзвичайно суворих голубів',
 'за офіційним рішенням таємної ради чайників',
 'на очах у дуже обуреного пластикового фламінго',
 'під схвальні вигуки місцевих черепах',
 'під наглядом ради дерев’яних ляльок',
 'у присутності столичного інспектора з танців',
 'під безперервний кашель королівського годинника',
 'за підтримки міжнародного товариства равликів',
 'перед камерою місцевого спортивного коментатора',
 'під акомпанемент старенької механічної скрипки'
];
function playIndependentFragments(setId,count,seed){
 const players=playersFor(count),genre=['absurdComedy','satire','horror','cozyWhimsy'][seed%4];
 const settings={questionSet:setId,genre,maxPlayers:count,visibleTailWords:3,showNextQuestion:seed%2===0};
 let state=game.createRoom({player:players[0],payload:{settings}}).state;
 for(let i=1;i<count;i++)state=game.onJoin({state,players:players.slice(0,i+1)}).state;
 state=game.onMessage({state,player:players[0],payload:{type:'start'}}).state;
 const recorded=new Map();
 for(let round=0;round<10;round++){
  const order=players.map((_,i)=>players[(i+seed+round)%count]);
  for(const player of order){
   const v=game.viewForPlayer({state,player,players});
   const sheet=Number(v.sheet.id.replace('sheet-',''));
   const detail=CHAOTIC_DETAILS[(seed+sheet+round*3)%CHAOTIC_DETAILS.length];
   const answer=STORIES[setId][round].replace(/\.$/u,'')+', '+detail+'.';
   const exact=state.sheets[sheet].fragments;
   const previous=exact.at(-1);
   if(previous){
    assert.equal(v.sheet.tail,previous.tail,setId+' '+round+' '+sheet+' transmitted tail');
    assert.ok(!JSON.stringify(v.sheet).includes(previous.answer),setId+' '+round+' '+sheet+' concealed previous answer');
   }
   assert.ok(!('stories' in v),setId+' unfinished reveal');
   const packet={
    type:'submit',round,sheetId:v.sheet.id,answer,
    tailIndexes:round===9?[]:[0,2,Math.min(4,answer.split(/\s+/u).length-1)],
    gender:'unspecified',
    heroAnchor:round===0?'Герой рукопису '+sheet:''
   };
   const response=game.onMessage({state,player,payload:packet});
   assert.equal(response.events[0].type,'state',setId+' '+round+' '+sheet+' rejected');
   state=response.state;
   recorded.set(sheet+'/'+round,answer);
  }
 }
 assert.equal(state.phase,'finished');
 const finished=game.viewForPlayer({state,player:players[0],players});
 assert.equal(finished.stories.length,count);
 for(let sheet=0;sheet<count;sheet++){
  assert.equal(finished.stories[sheet].fragments.length,10);
  for(let round=0;round<10;round++)
   assert.equal(finished.stories[sheet].fragments[round].answer,recorded.get(sheet+'/'+round));
 }
 assert.equal(new Set(finished.stories.map(x=>x.fragments.map(f=>f.answer).join('|'))).size,count);
}

test('60 additional mixed-author matches preserve privacy and distinct manuscripts',()=>{
 for(const setId of scenarios)
  for(const playerCount of [2,4,8])
   for(const seed of [1,2])playIndependentFragments(setId,playerCount,seed);
});
