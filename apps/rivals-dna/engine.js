
import { AXES, HEROES, SNAPSHOT } from './hero-data.js';
import { byId, ADAPTIVE, sequenceFor } from './questions.js';

export const AXIS_TITLES = {
  aim:'Точность',range:'Дистанция',mobility:'Мобильность',
  aggression:'Инициатива',frontline:'Передовая',support:'Поддержка',
  utility:'Контроль',setup:'Подготовка',mechanics:'Комбинации',
  tempo:'Темп',autonomy:'Независимость',burst:'Взрывной урон',brawl:'Ближний бой'
};
export const ROLE_NAMES = { Vanguard:'Авангард', Duelist:'Дуэлянт', Strategist:'Стратег', Flex:'Несколько ролей' };
const KEYS = Object.keys(AXES);
const WEIGHTS = {
  aim:.35,range:1.18,mobility:1.3,aggression:1.02,frontline:1.13,
  support:1.18,utility:1.43,setup:1.05,mechanics:.69,tempo:.98,
  autonomy:.94,burst:.88,brawl:1.2
};
const clamp = (n, low=0, high=100) => Math.min(high,Math.max(low,Number.isFinite(n)?n:low));

export function isValidAnswer(q, value) {
  if (!q || !Number.isInteger(value)) return false;
  return q.kind === 'scale' ? value >= 0 && value <= 4 : value >= 0 && value < q.options.length;
}
export function answeredCount(answers, mode='full', adaptive=[]) {
  return [...sequenceFor(mode).map(q=>q.id),...adaptive].filter(id=>isValidAnswer(byId[id],answers[id])).length;
}
export function buildPlayer(answers={}) {
  const prefs = Object.fromEntries(KEYS.map(axis => [axis,{sum:50*.56,weight:.56,measured:0}]));
  const skills = Object.fromEntries(['aim','mechanics','tempo','support'].map(k => [k,{sum:62*.6,weight:.6,measured:0}]));
  const scenarios = Object.fromEntries(KEYS.map(axis=>[axis,{sum:50*.15,weight:.15,measured:0}]));
  for (const [id,value] of Object.entries(answers)) {
    const q=byId[id]; if (!isValidAnswer(q,value)) continue;
    const chosen=q.kind==='choice'?q.options[value]:null;
    const t=(q.kind==='scale')?value/4:null;
    const prefMap=q.kind==='scale'?Object.fromEntries(Object.entries(q.prefs).map(([k,v])=>[k,v[0]+(v[1]-v[0])*t])):(chosen.prefs||{});
    const skillMap=q.kind==='scale'?Object.fromEntries(Object.entries(q.skills).map(([k,v])=>[k,v[0]+(v[1]-v[0])*t])):(chosen.skills||{});
    const weight=q.adaptive?1.45:1;
    for (const [axis,answer] of Object.entries(prefMap)) {
      if (!prefs[axis]) continue;
      const w=weight;
      prefs[axis].sum+=clamp(answer)*w; prefs[axis].weight+=w; prefs[axis].measured+=w;
      if(q.scenario){scenarios[axis].sum+=clamp(answer)*1.15;scenarios[axis].weight+=1.15;scenarios[axis].measured+=1.15;}
    }
    for (const [axis,answer] of Object.entries(skillMap)) {
      if (!skills[axis]) continue;
      skills[axis].sum+=clamp(answer)*weight;skills[axis].weight+=weight;skills[axis].measured+=weight;
    }
  }
  return {
    vector:Object.fromEntries(KEYS.map(axis=>[axis,Math.round(prefs[axis].sum/prefs[axis].weight)])),
    measured:Object.fromEntries(KEYS.map(axis=>[axis,prefs[axis].measured])),
    abilities:Object.fromEntries(Object.entries(skills).map(([k,v])=>[k,Math.round(v.sum/v.weight)])),
    context:Object.fromEntries(KEYS.map(axis=>[axis,Math.round(scenarios[axis].sum/scenarios[axis].weight)])),
    contextMeasured:Object.fromEntries(KEYS.map(axis=>[axis,scenarios[axis].measured]))
  };
}
export function heroFit(hero, player, feedback={}, mode='joy') {
  let total=0, distance=0, contextTotal=0, contextDiff=0;
  for(const axis of KEYS) {
    const weight=WEIGHTS[axis] * (player.measured[axis]/(player.measured[axis]+1.2));
    distance+=Math.abs(hero.vector[axis]-player.vector[axis])*weight;total+=weight;
    const cw=player.contextMeasured[axis];
    if(cw){contextDiff+=Math.abs(hero.vector[axis]-player.context[axis])*cw;contextTotal+=cw;}
  }
  const enjoyment=clamp(100-(distance/Math.max(.01,total))*1.16);
  const situational=contextTotal?clamp(100-(contextDiff/contextTotal)*1.2):enjoyment;
  const needAim=Math.max(0,hero.vector.aim-player.abilities.aim-10);
  const needMechanics=Math.max(0,hero.vector.mechanics-player.abilities.mechanics-9);
  const needTempo=Math.max(0,hero.vector.tempo-player.abilities.tempo-16);
  const needSupport=hero.role==='Strategist'?Math.max(0,hero.vector.support-player.abilities.support-16):0;
  const ease=clamp(98-needAim*.64-needMechanics*.68-needTempo*.22-needSupport*.32);
  const f=feedback?.[hero.id]||{};
  const raw = mode==='easy'
    ? .43*enjoyment+.47*ease+.1*situational
    : .64*enjoyment+.25*ease+.11*situational;
  const selfBonus=clamp(Number(f.rating||0),-2,2)*7.5;
  const similar=Object.entries(feedback||{}).reduce((score,[id,record])=>{
    if(id===hero.id || !record?.rating)return score;
    const other=HEROES.find(h=>h.id===id);if(!other)return score;
    const overlap=hero.tags.filter(t=>other.tags.includes(t)).length;
    return score+Math.sign(record.rating)*Math.min(1.35,overlap*.38);
  },0);
  return {
    hero,
    score:Math.round(clamp(raw+selfBonus+clamp(similar,-5,5),1,99)),
    enjoyment:Math.round(enjoyment),
    ease:Math.round(ease),
    situational:Math.round(situational),
    feedbackRating:clamp(Number(f.rating||0),-2,2)
  };
}
export function rankHeroes(answers={},feedback={},mode='joy') {
  const player=buildPlayer(answers);
  return HEROES.map(hero=>heroFit(hero,player,feedback,mode))
    .sort((a,b)=>b.score-a.score||b.enjoyment-a.enjoyment||a.hero.order-b.hero.order);
}
export function explanation(hero,player) {
  const axes=KEYS.filter(axis=>player.measured[axis]>.5).map(axis=>({
    axis,label:AXIS_TITLES[axis],desired:player.vector[axis],
    actual:hero.vector[axis],difference:Math.abs(hero.vector[axis]-player.vector[axis]),
    relevant:WEIGHTS[axis]*(player.measured[axis]/(player.measured[axis]+1))
  }));
  const matching=[...axes].sort((a,b)=>(a.difference/(a.relevant+.5))-(b.difference/(b.relevant+.5))).slice(0,3);
  const tensions=[...axes].sort((a,b)=>(b.difference*b.relevant)-(a.difference*a.relevant)).filter(x=>x.difference>22).slice(0,2);
  return {matching,tensions};
}
export function chooseAdaptive(answers={},excluded=[]) {
  const used=new Set(excluded);
  const player=buildPlayer(answers);
  const candidates=rankHeroes(answers).slice(0,8).map(r=>r.hero);
  const scores=ADAPTIVE.filter(q=>!used.has(q.id)).map(q=>{
    const score=q.axes.reduce((sum,axis)=>{
      const average=candidates.reduce((s,h)=>s+h.vector[axis],0)/Math.max(1,candidates.length);
      const variance=candidates.reduce((s,h)=>s+(h.vector[axis]-average)**2,0)/Math.max(1,candidates.length);
      const spread=Math.sqrt(variance);
      return sum+spread*(1.6/(1+player.measured[axis]*.3));
    },0);
    return {q,score};
  }).sort((a,b)=>b.score-a.score||a.q.id.localeCompare(b.q.id));
  return scores[0]?.q||null;
}
export function resultsSummary(answers={},feedback={},mode='joy') {
  const player=buildPlayer(answers);
  const ranking=rankHeroes(answers,feedback,mode);
  const confidence=clamp(Math.round(42+Math.min(30,Object.keys(answers).length*1.35)+Math.min(14,(ranking[0].score-(ranking[4]?.score||ranking[0].score))*1.6)),30,86);
  return {player,ranking,confidence};
}
export function pairRecommendations(p1,p2) {
  const a=rankHeroes(p1.answers,p1.feedback).slice(0,7);
  const b=rankHeroes(p2.answers,p2.feedback).slice(0,7);
  const duo=[];
  for(const left of a) for(const right of b) {
    if(left.hero.id===right.hero.id) continue;
    const roleVariety=left.hero.role===right.hero.role?0:5;
    const tankSupport=(left.hero.role==='Vanguard'&&right.hero.role==='Strategist')||(left.hero.role==='Strategist'&&right.hero.role==='Vanguard')?4:0;
    const sharedTempo=5-Math.abs(left.hero.vector.tempo-right.hero.vector.tempo)/20;
    duo.push({left,right,score:Math.round((left.score+right.score)/2+roleVariety+tankSupport+Math.max(0,sharedTempo)*.5)});
  }
  return duo.sort((x,y)=>y.score-x.score).slice(0,5);
}
export function verifyDataset() {
  return SNAPSHOT.heroCount===54 && HEROES.length===54 &&
    new Set(HEROES.map(h=>h.id)).size===54 &&
    HEROES.every(h=>Object.keys(AXES).every(axis=>Number.isFinite(h.vector[axis])));
}
