// VЕНЕЦ 1.0: archive-backed, deterministic chapter outcomes.
// No invented battles, dynasties, title transfers or narrative RNG.
import {assertCampaign,campaignScore} from './campaign.js';
const person=(w,id)=>w.people.find(p=>p.id===id);
const title=(w,id)=>w.titles.find(t=>t.id===id);
const label=(w,id)=>person(w,id)?.name??'Безымянный правитель';
const own=(g,id)=>person(g.world,id)?.dynastyId===g.dynastyId;
const actionWords={
  petition:'Право потребовано',faction:'Создана фракция',
  ultimatum:'Выдвинут ультиматум',war:'Объявлена война',
  peace:'Заключён мир',marriage:'Заключён брак',gift:'Отправлен дар',
  grant:'Пожалована земля',join:'Поддержан претендент',
  contract:'Заключена грамота',blackmail:'Начата тайная операция',
  assassinate:'Подготовлено покушение'
};
function pickMilestones(events,limit=5){
  const seen=new Set(),result=[];
  for(const e of events){
    const key=e.kind==='inheritance'?'inheritance':e.kind==='war-peace'?'war-peace':
      e.kind==='title-transfer'?'title-transfer':e.kind;
    if(seen.has(key))continue;
    seen.add(key);result.push(e);
    if(result.length>=limit)break;
  }
  return result.sort((a,b)=>a.year-b.year||a.order-b.order);
}
export function campaignLegacy(g){
  assertCampaign(g);
  const w=g.world,s=campaignScore(g);
  const family=w.people.filter(p=>p.dynastyId===g.dynastyId);
  const house=w.dynasties.find(d=>d.id===g.dynastyId)?.name||'Неизвестный дом';
  const playerEvents=w.events.filter(e=>{
    const x=e.effect||{};
    switch(e.kind){
      case 'title-transfer':return own(g,x.oldHolderId)||own(g,x.newHolderId);
      case 'war-peace':case 'war-declared':return own(g,x.attackerId)||own(g,x.defenderId);
      case 'inheritance':return own(g,x.deceasedId)||own(g,x.heirId);
      case 'marriage':return own(g,x.personAId)||own(g,x.personBId);
      case 'faction-founded':return own(g,x.claimantId)||own(g,x.leaderId);
      case 'scheme-ended':return own(g,x.actorId)||own(g,x.targetId);
      default:return false;
    }
  }).filter(e=>e.year>=1066 && e.year<=w.year);
  const transfers=playerEvents.filter(e=>e.kind==='title-transfer');
  const warPeace=playerEvents.filter(e=>e.kind==='war-peace');
  const victories=warPeace.filter(e=>e.effect.outcome==='victory'&&own(g,e.effect.attackerId)).length;
  const conflicts=warPeace.length;
  const marriages=playerEvents.filter(e=>e.kind==='marriage').length;
  const latestDynastyTitles=w.titles.filter(t=>own(g,t.holderId));
  const name=(g.finished?'end':
    s.crown?'crown':
    s.duchies>=2?'princes':
    s.duchies>=1?'duchy':
    s.titles>=3?'landholders':
    !s.titles?'exiles':'survivors');
  const outcomes={
    end:['Последняя ветвь','Живых представителей рода больше нет.'],
    crown:['Венец Междуречья','Королевская корона принадлежит вашему дому.'],
    princes:['Союз земель','Ваш дом удерживает несколько герцогств.'],
    duchy:['Герцогская грамота','Ваш дом достиг герцогской власти.'],
    landholders:['Земли под знаменем','Ваш дом удерживает несколько титулов.'],
    exiles:['Дом в изгнании','Род продолжает жить без собственного титула.'],
    survivors:['Хранители рода','Ваш дом сохранил владение и продолжает историю.']
  };
  const activeEnd=g.finished||g.chapterComplete;
  const titleText=outcomes[name][0],summary=outcomes[name][1];
  const raw=[
    {year:1066,order:-1,kind:'founding',heading:'Основание дома',
      detail:label(w,g.founderId),titleId:g.startCountyId}
  ];
  for(const [i,e] of playerEvents.entries()){
    const x=e.effect||{};
    const entry={year:e.year,order:i,kind:e.kind,heading:'',detail:'',titleId:x.titleId??null};
    if(e.kind==='title-transfer'){
      entry.heading='Переход титула';
      entry.detail=(title(w,x.titleId)?.name||x.titleId)+': '+label(w,x.oldHolderId)+' → '+label(w,x.newHolderId);
    }else if(e.kind==='war-peace'){
      entry.heading=e.effect.outcome==='victory'?'Победа в войне':'Окончание войны';
      entry.detail=(title(w,x.titleId)?.name||x.titleId)+' · '+({
        victory:'победа',defeat:'поражение',withdrawal:'отступление',
        retreat:'мир без передачи титула'}[x.outcome]||x.outcome);
    }else if(e.kind==='inheritance'){
      entry.heading='Наследование';entry.detail=label(w,x.deceasedId)+' → '+label(w,x.heirId);
    }else if(e.kind==='marriage'){
      entry.heading='Династический брак';entry.detail=label(w,x.personAId)+' и '+label(w,x.personBId);
    }else if(e.kind==='faction-founded'){
      entry.heading='Притязание';entry.detail=title(w,x.titleId)?.name||x.titleId;
    }else if(e.kind==='scheme-ended'){
      entry.heading='Тайная операция';entry.detail=x.success?'Успех':'Провал';
    }else if(e.kind==='war-declared'){
      entry.heading='Начало войны';entry.detail=title(w,x.titleId)?.name||x.titleId;
    }
    if(entry.heading)raw.push(entry);
  }
  const selected=pickMilestones(raw.filter(x=>x.kind!=='founding'),5);
  const chapters=[
    raw[0],...selected,
    ...(activeEnd?[{year:w.year,order:999999,kind:'ending',heading:titleText,detail:summary}]:[])
  ];
  return {
    id:name,chapterFinished:activeEnd,house,founderId:g.founderId,year:w.year,
    start:1066,elapsed:w.year-1066,title:titleText,summary,
    herald:g.dynastyId,score:s,
    stats:{family:family.filter(p=>p.alive).length,decisions:g.actions,
      generations:s.generations,holdings:latestDynastyTitles.length,
      transfers:transfers.length,wars:conflicts,victories,marriages},
    paths:Object.keys(actionWords).filter(kind=>g.history.some(e=>e.kind==='choice'&&e.detail===kind))
      .map(kind=>({kind,label:actionWords[kind],
        count:g.history.filter(e=>e.kind==='choice'&&e.detail===kind).length})),
    timeline:chapters
  };
}
export function campaignChronicleText(g){
  const x=campaignLegacy(g);
  const lines=[
    'ВЕНЕЦ · ЛЕТОПИСЬ ДОМА '+x.house,
    'Междуречье · '+x.start+'–'+x.year,
    '',
    x.title,
    x.summary,
    '',
    'Поколения: '+x.stats.generations,
    'Владения: '+x.stats.holdings,
    'Политические решения: '+x.stats.decisions,
    'Передачи титулов при участии дома: '+x.stats.transfers,
    'Завершённые войны с участием дома: '+x.stats.wars,
    'Победы претендентов дома: '+x.stats.victories,
    '',
    'ВЕХИ ЛЕТОПИСИ',
    ...x.timeline.map(e=>e.year+' · '+e.heading+' — '+e.detail),
    '',
    'ЛИЧНЫЕ РЕШЕНИЯ',
    ...(x.paths.length?x.paths.map(p=>p.label+': '+p.count):['Ни одного']),
    '',
    'Архивная запись по событиям текущей партии Венца.'
  ];
  return lines.join('\n')+'\n';
}
