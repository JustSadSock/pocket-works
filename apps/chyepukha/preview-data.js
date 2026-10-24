// Fictional room views for the real client renderer. No sockets, storage or shared rooms.
const SETS=[{"id":"characterArc","label":"Цілісна історія"},{"id":"collapsingPlan","label":"Ланцюг провалів"},{"id":"detectiveCase","label":"Детективна справа"},{"id":"nightSurvival","label":"Ніч виживання"},{"id":"relationshipCrash","label":"Емоційний розлом"},{"id":"questAdventure","label":"Пригодницький квест"},{"id":"heistOperation","label":"Пограбування / операція"},{"id":"sciFiIncident","label":"Науково-фантастичний інцидент"},{"id":"roadTrip","label":"Дорожня пригода"},{"id":"courtroomScandal","label":"Суд і скандал"}];
const GENRES=[{"id":"groundedDrama","label":"Приземлена драма"},{"id":"absurdComedy","label":"Абсурдна комедія"},{"id":"horror","label":"Горор"},{"id":"detectiveNoir","label":"Нуарний детектив"},{"id":"romanticMelodrama","label":"Романтична мелодрама"},{"id":"fantasyEpic","label":"Фентезійна епіка"},{"id":"sciFiParanoia","label":"Науково-фантастична параноя"},{"id":"cyberpunk","label":"Кіберпанк"},{"id":"cozyWhimsy","label":"Затишна дивина"},{"id":"postApocalypse","label":"Постапокаліпсис"},{"id":"mythicLegend","label":"Міф і легенда"},{"id":"satire","label":"Сатира"}];
export function demoView(id){
 if(['results-v9','results-v9-second','results-archive-unsaved','results-v10'].includes(id)){
  const d=demoView('results');
  d.view.reactionTotals=Object.fromEntries(d.view.stories.map((s,i)=>[s.id,{
   laugh:i===0?2:i===1?1:0,surprised:i===1?2:0,heart:i===2?1:0
  }]));
  d.view.myReactions={'sheet-0':'laugh'};
  if(id==='results-v9-second')d.storyId='sheet-1';
  return d;
 }

 if(['moderation-host','moderation-paused','moderation-guest','moderation-v7','moderation-recovery-wait','moderation-recovery-ready','moderation-solo','moderation-kicked'].includes(id)){
  const d=demoView('writing-first');
  d.view.paused=id==='moderation-paused';
  const recovering=['moderation-guest','moderation-recovery-wait','moderation-recovery-ready','moderation-solo'].includes(id);
  d.view.host='qa-host';
  d.view.players[1].departed=!recovering;
  if(recovering){
   d.view.players[0].departed=true;
   d.view.hostOfflineSince=Date.now()-(id==='moderation-recovery-wait'?45_000:330_000);
   if(id==='moderation-solo')d.view.players.forEach(p=>{p.departed=p.id!=='qa-third'});
  }else d.view.hostOfflineSince=0;
  d.view.claim=recovering?null:{seatId:'qa-guest',code:'1A2B3C4D5E6F',expiresAt:Date.now()+600000};
  d.me=recovering?'qa-third':'qa-host';
  if(id==='moderation-kicked'){d.view.players[1].excluded=true;d.view.players[1].departed=true;d.view.claim=null}
  d.modal=id==='moderation-kicked'?'seat-choice':'moderation';return d;
 }

 const people=[{id:'qa-host',name:'Марта',submitted:false},{id:'qa-guest',name:'Назар',submitted:false},{id:'qa-third',name:'Софія',submitted:false},{id:'qa-fourth',name:'Ярина',submitted:false}];
 const settings={maxPlayers:4,questionSet:'collapsingPlan',visibleTailWords:3,showNextQuestion:true,genre:'absurdComedy',customQuestions:[],customGenre:''};
 const v={protocol:1,revision:1,phase:'lobby',host:'qa-host',players:people.slice(0,2),settings,questionSets:SETS,genres:GENRES,round:0,total:0,message:''};
 const d={view:v,me:id==='lobby-guest'?'qa-guest':'qa-host',room:'a1b2c3d4',connected:true,connecting:false,notice:'',invitation:'',storyId:'',modal:'',answer:'',selection:[]};
 if(['home','home-member','invite','error','connecting'].includes(id)){
  d.view=null;d.connected=false;
  if(id==='invite')d.invitation=d.room;
  if(id==='error')d.notice='Кімната не існує або вже закрита.';
  if(id==='connecting')d.connecting=true;
 }else if(id.startsWith('lobby')){
  v.players=id==='lobby-host'?[people[0]]:people;
  if(id==='lobby-custom')v.settings={...settings,questionSet:'custom',customQuestions:['Хто знайшов таємну карту?','Чим скінчилась пригода?'],genre:'custom',customGenre:'Паперова пригода'};
 }else if(['results','results-second','comic','reveal'].includes(id)){
  v.phase='finished';v.round=3;v.total=3;v.players=people;
  const f=[
   [{author:'Марта',question:'Хто вліз у цю авантюру?',answer:'Архіваріус вирішив продати вчорашній дощ як музейний експонат.'},{author:'Назар',question:'Що пішло не так?',answer:'Дощ украв валізу директора і скликав таємну раду голубів.'},{author:'Софія',question:'Чим закінчилось?',answer:'Валізу обрали мером, а директор отримав посаду хмаринки.'}],
   [{author:'Назар',question:'Хто це був?',answer:'Кондитер винайшов автомат, що перетворював компліменти на огірки.'},{author:'Софія',question:'Що сталося?',answer:'Невидима коза в окулярах призначила себе міністром етикету.'},{author:'Ярина',question:'Фінал?',answer:'Увесь королівський бал став салатом, і гості вимагали добавки.'}],
   [{author:'Софія',question:'Хто розпочав?',answer:'Дівчина знайшла в бібліотеці листа, який відповідав на ще не поставлені питання.'},{author:'Ярина',question:'Що сталося?',answer:'Кожен написаний рядок міняв погоду над містом і плутав усі прогнози.'},{author:'Марта',question:'Як усе скінчилося?',answer:'Містяни домовилися писати лише про сонце, але випадково викликали дощ із кавунів.'}],
   [{author:'Ярина',question:'Хто був героєм?',answer:'Нічний сторож зібрав під сходами музей загублених понеділків.'},{author:'Марта',question:'Що змінилося?',answer:'До музею завітав інспектор із майбутнього і зажадав квиток на вчора.'},{author:'Назар',question:'Чим закінчилося?',answer:'Сторож зачинив двері на вихідні, яких тепер ніхто не міг знайти.'}]
  ];
  v.stories=f.map((fragments,i)=>({id:'sheet-'+i,starter:people[i].name,genre:'Абсурдна комедія',setLabel:'Ланцюг провалів',fragments,text:fragments.map(x=>x.answer).join('\n\n')}));
  d.storyId=id==='results-second'?'sheet-1':'sheet-0';
  if(id==='comic')d.modal='comic-prompt';
 }else{
  v.phase='writing';v.round=['writing-first','writing-selection','writing-zero','leave','writing-v7','writing-v7-selection'].includes(id)?0:id==='writing-v7-final'?2:1;v.total=3;
  v.players=people;v.settings={...settings,visibleTailWords:id==='writing-zero'?0:3};
  v.sheet={id:'sheet-0',starter:'Марта',set:'collapsingPlan',setLabel:'Ланцюг провалів',genre:'absurdComedy',genreLabel:'Абсурдна комедія',gender:v.round?'female':null,tail:v.round?'директора дощ валізу':'',
   nextQuestion:v.round?'Як герої намагалися виправити ситуацію?':'Який задум спав герою на думку?',question:v.round?{prompt:'Що або хто внесли перший серйозний збій?',guidance:'Додай несподіваний поворот.',creativeFreedom:'Залиши простір для інших.'}:{prompt:'Хто вліз у цю авантюру?',guidance:'Представ героя.',creativeFreedom:'Можеш додати дивну дрібницю.'}};
  v.waiting=id==='waiting';
  if(v.waiting)v.players.forEach((p,i)=>{p.submitted=i!==2});
  if(id==='offline')d.connected=false;
  if(id==='leave')d.modal='leave';
  if(id==='writing-selection'||id==='writing-v7-selection'){d.writerStep='select';d.answer='Архіваріус вирішив продати вчорашній дощ як музейний експонат але передумав';d.selection=[0,2,4];}
  if(id==='writing-zero')d.answer='Маленький цирк вирішив переїхати на Місяць просто у неділю.';
  if(id==='writing-v7'||id==='writing-v7-selection') {
    v.sheet.question={prompt:'Хто вирішив утнути щось ризиковане?',guidance:'Назви лише героя й одну кумедну рису. Одна влучна безглузда деталь краща за довге пояснення жарту.',creativeFreedom:'Не розкривай план, місце дії, перебіг подій чи фінал.',stage:'Авантюрист'};
    v.sheet.nextQuestion='Що саме герой задумав зробити?';
  }
  if(['writing-v8','writing-v8-selection'].includes(id)){
    v.round=6;v.total=10;v.sheet.tail='голуби музей дощ';v.sheet.heroAnchor='Архіваріус';
    v.sheet.question={prompt:'Яка нова невдача зробила ситуацію ще гіршою?',guidance:'Підвищ ставки однією конкретною халепою, смішною навіть без попередніх подробиць. Нехай безглузда річ спричинить одну зрозумілу кумедну незручність.',creativeFreedom:'Не називай невідомих тобі попередніх невдач і не роби остаточного провалу.',stage:'Ескалація'};
    v.sheet.nextQuestion='Як герой спробував виправити становище?';
    if(id==='writing-v8-selection'){d.writerStep='select';d.answer='Архіваріус віддав директору музею суворий наказ танцювати з голубами';d.selection=[0,2,5]}
  }
  if(id==='writing-v8-final'){
    v.round=9;v.total=10;v.sheet.question={prompt:'Яким став остаточний результат усієї авантюри?',guidance:'Закрий історію конкретним наслідком і комічним післясмаком. Заверши все конкретним абсурдним наслідком; не пояснюй жарт.',creativeFreedom:'Не запускай нову сюжетну лінію — завершуй уже розпочату.',stage:'Фінал'};
    v.sheet.nextQuestion='';d.answer='Усі невдачі офіційно визнали пам’ятками культури, а директора обрали мером.';
  }
  if(id==='writing-v7-final') {
    v.sheet.question={prompt:'Яким став остаточний результат усієї авантюри?',guidance:'Закрий історію конкретним наслідком і комічним післясмаком. Заверши все конкретним абсурдним наслідком; не пояснюй жарт.',creativeFreedom:'Не запускай нову сюжетну лінію — завершуй уже розпочату.',stage:'Фінал'};
    v.sheet.nextQuestion='';
    d.answer='Усе закінчилося тим, що відчайдушного героя обрали директором музею провалів.';
  }
 }
 return d;
}
