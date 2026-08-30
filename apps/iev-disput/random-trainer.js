import { LEARNING_UNITS } from './learning-data.js';
import { QUIZ_1 } from './quiz-1.js';
import { QUIZ_2 } from './quiz-2.js';
import { QUIZ_3 } from './quiz-3.js';
import { EXTRA_PRACTICE } from './learning-extra.js';

const STORAGE_KEY='pocket-works:iev-disput:random-trainer:v1';
const TARGET_PER_UNIT=10;
const workbench=document.querySelector('#workbench');
const ledger=document.querySelector('.bottom-ledger');
const headerValue=document.querySelector('#cycleValue');
const headerLabel=headerValue?.parentElement?.querySelector('small');
const authoredById=new Map([...QUIZ_1,...QUIZ_2,...QUIZ_3].map(q=>[q.id,q]));

const esc=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=(value='')=>String(value).toLocaleLowerCase('uk-UA').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const words=(value='')=>new Set(norm(value).split(/\s+/).filter(word=>word.length>3));

function hash(input=''){
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function seededShuffle(items,seedText=''){
  const out=[...items];let seed=hash(seedText);
  for(let i=out.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[out[i],out[j]]=[out[j],out[i]]}
  return out;
}
function randomShuffle(items){
  const out=[...items];
  if(globalThis.crypto?.getRandomValues){
    const values=new Uint32Array(Math.max(1,out.length));globalThis.crypto.getRandomValues(values);
    for(let i=out.length-1;i>0;i--){const j=values[i]%(i+1);[out[i],out[j]]=[out[j],out[i]]}
  }else{
    for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}
  }
  return out;
}
function cleanFact(value=''){
  return String(value).replace(/^[•·▪‣-]\s*/,'').replace(/\s+/g,' ').trim();
}
function splitFacts(unit){
  const facts=[];
  for(const section of unit.sections||[]){
    const lines=String(section.text||'').split(/\n+/).flatMap(line=>{
      const cleaned=cleanFact(line);
      if(!cleaned)return[];
      if(cleaned.length>210){
        const parts=cleaned.split(/(?<=[.!?])\s+(?=[А-ЯІЇЄҐ0-9«])/u).map(cleanFact).filter(Boolean);
        if(parts.length>1)return parts;
      }
      return[cleaned];
    });
    for(const line of lines){
      if(line.length<24||line.length>260)continue;
      facts.push({text:line,section:section.title||'Конспект'});
    }
  }
  const seen=new Set();
  return facts.filter(fact=>{const key=norm(fact.text);if(!key||seen.has(key))return false;seen.add(key);return true});
}
function overlapScore(a,b){
  const aw=words(a);const bw=words(b);let score=0;
  for(const word of aw)if(bw.has(word))score++;
  return score;
}
function shortTitle(title=''){
  const value=String(title);return value.length<=64?value:`${value.slice(0,61).trim()}…`;
}

const UNIT_FACTS=new Map(LEARNING_UNITS.map(unit=>[unit.id,splitFacts(unit)]));
const GLOBAL_FACTS=LEARNING_UNITS.flatMap(unit=>(UNIT_FACTS.get(unit.id)||[]).map(fact=>({...fact,unitId:unit.id,unitTitle:unit.title})));
const FACT_ORIGIN=new Map();
for(const fact of GLOBAL_FACTS){const key=norm(fact.text);if(key&&!FACT_ORIGIN.has(key))FACT_ORIGIN.set(key,fact.unitTitle)}

function bestFact(unit,query){
  const facts=UNIT_FACTS.get(unit.id)||[];
  return [...facts].sort((a,b)=>overlapScore(b.text,query)-overlapScore(a.text,query))[0]||{text:cleanFact(unit.sections?.[0]?.text||unit.title),section:unit.sections?.[0]?.title||'Конспект'};
}
function distractorFacts(unitId,correct,seed){
  const desiredLength=correct.length;
  const candidates=GLOBAL_FACTS.filter(item=>item.unitId!==unitId&&norm(item.text)!==norm(correct)&&item.text.length>=24&&item.text.length<=260)
    .map(item=>({...item,distance:Math.abs(item.text.length-desiredLength)}))
    .sort((a,b)=>a.distance-b.distance);
  const selected=[];const used=new Set([norm(correct)]);
  const passes=[candidates.slice(0,120),candidates];
  for(const pass of passes){
    for(const item of seededShuffle(pass,`${seed}|${selected.length}`)){
      const key=norm(item.text);if(!key||used.has(key))continue;
      used.add(key);selected.push(item);if(selected.length===3)return selected;
    }
  }
  return selected;
}
function authoredForUnit(unit){
  const result=[];const seen=new Set();
  for(const id of unit.quizIds||[]){const q=authoredById.get(id);if(q&&!seen.has(q.id)){seen.add(q.id);result.push(q)}}
  for(const q of EXTRA_PRACTICE[unit.id]||[]){if(q&&!seen.has(q.id)){seen.add(q.id);result.push(q)}}
  for(const q of unit.final||[]){if(q&&!seen.has(q.id)){seen.add(q.id);result.push(q)}}
  return result;
}
function authoredQuestion(unit,q,index){
  const source=bestFact(unit,`${q.q} ${q.correct} ${q.explain||''}`);
  const distractors=[...(q.distractors||[])].filter(item=>norm(item)!==norm(q.correct)).slice(0,3);
  const origins={};
  for(const option of distractors){const origin=FACT_ORIGIN.get(norm(option));if(origin)origins[norm(option)]=origin}
  if(distractors.length<3){
    for(const item of distractorFacts(unit.id,q.correct,`${unit.id}|authored|${index}`)){
      if(distractors.some(option=>norm(option)===norm(item.text)))continue;
      distractors.push(item.text);origins[norm(item.text)]=item.unitTitle;if(distractors.length===3)break;
    }
  }
  return{
    id:`rt-${unit.id}-a-${q.id||index}`,
    unitId:unit.id,
    unitTitle:unit.title,
    topic:q.topic||unit.eyebrow||unit.title,
    q:q.q,
    correct:q.correct,
    distractors:distractors.slice(0,3),
    explain:q.explain||`Правильна відповідь: ${q.correct}.`,
    sourceSection:source.section,
    sourceExcerpt:source.text,
    sourceTitle:unit.sourceTitle||unit.title,
    origins
  };
}
const PROMPTS=[
  (unit)=>`Що правильно про «${shortTitle(unit.title)}»?`,
  (unit)=>`Який факт стосується теми «${shortTitle(unit.title)}»?`,
  (unit,fact)=>`Що треба запам’ятати про «${shortTitle(fact.section)}»?`,
  (unit)=>`Яке твердження правильне для теми «${shortTitle(unit.title)}»?`,
  (unit,fact)=>`Який факт відповідає розділу «${shortTitle(fact.section)}»?`
];
function generatedQuestion(unit,fact,index,variant=0){
  const distractorItems=distractorFacts(unit.id,fact.text,`${unit.id}|${index}|${variant}`);
  if((index+variant)%3===2){
    const otherTitles=[];
    for(const item of distractorItems){if(item.unitTitle!==unit.title&&!otherTitles.includes(item.unitTitle))otherTitles.push(item.unitTitle)}
    for(const other of LEARNING_UNITS){if(other.id!==unit.id&&!otherTitles.includes(other.title))otherTitles.push(other.title);if(otherTitles.length===3)break}
    return{
      id:`rt-${unit.id}-g-${index}-${variant}`,
      unitId:unit.id,
      unitTitle:unit.title,
      topic:unit.eyebrow||unit.title,
      q:`До якої теми належить цей факт: «${fact.text}»?`,
      correct:unit.title,
      distractors:otherTitles.slice(0,3),
      explain:`Цей факт узято з блоку «${unit.title}».`,
      sourceSection:fact.section,
      sourceExcerpt:fact.text,
      sourceTitle:unit.sourceTitle||unit.title,
      origins:Object.fromEntries(otherTitles.slice(0,3).map(title=>[norm(title),title]))
    };
  }
  const origins=Object.fromEntries(distractorItems.map(item=>[norm(item.text),item.unitTitle]));
  return{
    id:`rt-${unit.id}-g-${index}-${variant}`,
    unitId:unit.id,
    unitTitle:unit.title,
    topic:unit.eyebrow||unit.title,
    q:PROMPTS[(index+variant)%PROMPTS.length](unit,fact),
    correct:fact.text,
    distractors:distractorItems.map(item=>item.text).slice(0,3),
    explain:`У цьому блоці треба пам’ятати саме цю тезу: ${fact.text}`,
    sourceSection:fact.section,
    sourceExcerpt:fact.text,
    sourceTitle:unit.sourceTitle||unit.title,
    origins
  };
}
function buildUnitQuestions(unit){
  const questions=[];const usedQuestionText=new Set();
  for(const [index,q] of authoredForUnit(unit).entries()){
    const item=authoredQuestion(unit,q,index);
    if(item.distractors.length<3)continue;
    const key=norm(item.q);if(!key||usedQuestionText.has(key))continue;
    questions.push(item);usedQuestionText.add(key);
    if(questions.length>=5)break;
  }
  const facts=UNIT_FACTS.get(unit.id)||[];
  let cursor=0;let guard=0;
  while(questions.length<TARGET_PER_UNIT&&guard<160){
    const fact=facts[cursor%Math.max(1,facts.length)]||bestFact(unit,unit.title);
    const variant=Math.floor(cursor/Math.max(1,facts.length));
    const item=generatedQuestion(unit,fact,cursor,variant);
    const key=norm(item.q);
    if(item.distractors.length===3&&key&&!usedQuestionText.has(key)){questions.push(item);usedQuestionText.add(key)}
    cursor++;guard++;
  }
  if(questions.length<TARGET_PER_UNIT){
    const fact=bestFact(unit,unit.title);
    while(questions.length<TARGET_PER_UNIT){
      const index=questions.length;
      const item=generatedQuestion(unit,fact,index,index+11);
      item.q=`Що з цього треба пам’ятати про «${shortTitle(unit.title)}»? · ${index+1}`;
      if(item.distractors.length<3)break;
      questions.push(item);
    }
  }
  return questions.slice(0,TARGET_PER_UNIT);
}

export const RANDOM_TRAINER_QUESTIONS=LEARNING_UNITS.flatMap(buildUnitQuestions);
const QUESTION_BY_ID=new Map(RANDOM_TRAINER_QUESTIONS.map(q=>[q.id,q]));
const BANK_SIGNATURE=`${LEARNING_UNITS.length}:${RANDOM_TRAINER_QUESTIONS.length}:v2`;

const defaults={signature:BANK_SIGNATURE,deck:[],cursor:0,round:1,correct:0,total:0,streak:0,bestStreak:0,mistakes:[],topicStats:{},answer:null,lastQuestionId:null,mode:'all',mistakeDeck:[],mistakeCursor:0};
function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    const state={...structuredClone(defaults),...(parsed&&typeof parsed==='object'?parsed:{})};
    if(state.signature!==BANK_SIGNATURE){state.signature=BANK_SIGNATURE;state.deck=[];state.cursor=0;state.answer=null;state.mode='all';state.mistakeDeck=[];state.mistakeCursor=0}
    state.topicStats=state.topicStats&&typeof state.topicStats==='object'?state.topicStats:{};
    state.mistakes=Array.isArray(state.mistakes)?state.mistakes.filter(id=>QUESTION_BY_ID.has(id)):[];
    return state;
  }catch{return structuredClone(defaults)}
}
let state=loadState();
let active=false;

function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}}
function freshDeck(){
  const deck=randomShuffle(RANDOM_TRAINER_QUESTIONS.map(q=>q.id));
  if(state.lastQuestionId&&deck.length>1&&deck[0]===state.lastQuestionId)[deck[0],deck[1]]=[deck[1],deck[0]];
  state.deck=deck;state.cursor=0;state.round=Math.max(1,(state.round||1)+(state.total?1:0));state.answer=null;save();
}
function ensureDeck(){if(!state.deck.length||state.cursor>=state.deck.length||state.deck.some(id=>!QUESTION_BY_ID.has(id)))freshDeck()}
function startMistakes(){
  if(!state.mistakes.length)return;
  state.mode='mistakes';state.mistakeDeck=randomShuffle([...new Set(state.mistakes)]);state.mistakeCursor=0;state.answer=null;save();renderTrainer();
}
function stopMistakes(){state.mode='all';state.answer=null;save();renderTrainer()}
function currentQuestion(){
  if(state.mode==='mistakes'){
    if(!state.mistakeDeck.length||state.mistakeCursor>=state.mistakeDeck.length){state.mode='all';state.mistakeDeck=[];state.mistakeCursor=0;save()}
    else return QUESTION_BY_ID.get(state.mistakeDeck[state.mistakeCursor]);
  }
  ensureDeck();return QUESTION_BY_ID.get(state.deck[state.cursor]);
}
function optionOrder(q){return seededShuffle([q.correct,...q.distractors],`${q.id}|${state.mode}|${state.mode==='mistakes'?state.mistakeCursor:state.cursor}`)}
function topicStat(unitId){const value=state.topicStats[unitId];return value&&typeof value==='object'?value:{correct:0,total:0}}
function remaining(){return state.mode==='mistakes'?Math.max(0,state.mistakeDeck.length-state.mistakeCursor):Math.max(0,state.deck.length-state.cursor)}
function accuracy(){return state.total?Math.round(state.correct/state.total*100):0}
function reasonForWrong(q,selected){
  const origin=q.origins?.[norm(selected)]||FACT_ORIGIN.get(norm(selected));
  if(origin&&origin!==q.unitTitle)return`Ти вибрав тезу з іншої теми — «${origin}». Тут перевіряється «${q.unitTitle}».`;
  if(norm(selected)===norm(q.correct))return'';
  return`У цьому фрагменті конспекту такої тези немає. Правильна відповідь спирається на конкретний факт, наведений нижче.`;
}
function answer(index){
  if(state.answer)return;
  const q=currentQuestion();if(!q)return;
  const options=optionOrder(q);const selected=options[index];if(selected==null)return;
  const correct=norm(selected)===norm(q.correct);
  state.answer={questionId:q.id,selected,correct};state.total++;if(correct){state.correct++;state.streak++;state.bestStreak=Math.max(state.bestStreak,state.streak)}else{state.streak=0;if(!state.mistakes.includes(q.id))state.mistakes.push(q.id)}
  const stat=topicStat(q.unitId);stat.total++;if(correct)stat.correct++;state.topicStats[q.unitId]=stat;
  save();renderTrainer();if(navigator.vibrate)navigator.vibrate(correct?15:35);
}
function nextQuestion(){
  const q=currentQuestion();if(q)state.lastQuestionId=q.id;
  if(state.mode==='mistakes'){
    if(state.answer?.correct)state.mistakes=state.mistakes.filter(id=>id!==q?.id);
    state.mistakeCursor++;
    if(state.mistakeCursor>=state.mistakeDeck.length){state.mode='all';state.mistakeDeck=[];state.mistakeCursor=0}
  }else state.cursor++;
  state.answer=null;save();renderTrainer();
}
function skipQuestion(){if(state.answer)return;nextQuestion()}

function renderAnswer(q,option,index){
  const answered=state.answer;let cls='';let disabled='';
  if(answered){disabled='disabled';if(norm(option)===norm(q.correct))cls='right';else if(norm(option)===norm(answered.selected)&&!answered.correct)cls='wrong';else cls='muted'}
  return`<button class="answer trainer-answer ${cls}" type="button" data-trainer-action="answer" data-index="${index}" ${disabled} data-native-press><span>${String.fromCharCode(65+index)}</span><b>${esc(option)}</b></button>`;
}
function renderFeedback(q){
  const a=state.answer;if(!a)return'';
  const wrong=a.correct?'':`<div class="trainer-error"><span>ДЕ ПОМИЛКА</span><p>${esc(reasonForWrong(q,a.selected))}</p><p><b>Ти обрав:</b> ${esc(a.selected)}</p><p><b>Правильно:</b> ${esc(q.correct)}</p></div>`;
  return`<section class="trainer-feedback ${a.correct?'good':'bad'}"><header><strong>${a.correct?'Правильно.':'Неправильно.'}</strong><span>${a.correct?'Йдемо далі.':'Розбери помилку зараз.'}</span></header>${wrong}<div class="trainer-explain"><b>Чому:</b><p>${esc(q.explain)}</p></div><details class="trainer-source" ${a.correct?'':'open'}><summary>Відсилка до конспекту · ${esc(q.sourceSection)}</summary><blockquote>${esc(q.sourceExcerpt)}</blockquote><small>${esc(q.sourceTitle)}</small></details></section>`;
}
function renderTrainer(){
  if(!active||!workbench)return;
  const q=currentQuestion();if(!q){workbench.innerHTML='<div class="page"><div class="loading">Не вдалося зібрати повний банк питань.</div></div>';return}
  const options=optionOrder(q);const unitIndex=Math.max(0,LEARNING_UNITS.findIndex(unit=>unit.id===q.unitId));const stat=topicStat(q.unitId);const answered=Boolean(state.answer);
  workbench.innerHTML=`<div class="page random-trainer-page"><header class="trainer-hero"><div><span class="stamp dark">РАНДОМНИЙ ТРЕНАЖЕР</span><h1>Питання з усього курсу</h1><p>${RANDOM_TRAINER_QUESTIONS.length} питань · по ${TARGET_PER_UNIT} на кожну з ${LEARNING_UNITS.length} тем. Повторів немає, доки не закінчиться вся колода.</p></div><div class="trainer-count"><strong>${remaining()}</strong><span>${state.mode==='mistakes'?'помилок у черзі':'до повтору'}</span></div></header><section class="trainer-stats"><div><b>${accuracy()}%</b><span>точність</span></div><div><b>${state.streak}</b><span>серія</span></div><div><b>${state.mistakes.length}</b><span>помилок</span></div></section><article class="question-card trainer-card"><div class="question-meta"><span>ТЕМА ${unitIndex+1}/${LEARNING_UNITS.length}</span><span>${esc(q.topic)}</span></div><h2>${esc(q.q)}</h2><p class="trainer-topic">${esc(q.unitTitle)} · ${stat.total?Math.round(stat.correct/stat.total*100):'—'}% по темі</p><div class="answers">${options.map((option,index)=>renderAnswer(q,option,index)).join('')}</div>${renderFeedback(q)}</article><div class="trainer-actions">${answered?`<button class="primary wide" type="button" data-trainer-action="next" data-native-press>Наступне випадкове питання</button>`:`<button class="trainer-skip" type="button" data-trainer-action="skip">Пропустити без оцінки</button>`}${state.mode==='mistakes'?`<button class="secondary wide" type="button" data-trainer-action="all">Повернутися до всіх тем</button>`:state.mistakes.length?`<button class="secondary wide" type="button" data-trainer-action="mistakes">Повторити помилки (${state.mistakes.length})</button>`:''}</div></div>`;
  if(headerValue)headerValue.textContent=state.mode==='mistakes'?String(state.mistakes.length):String(remaining());
  if(headerLabel)headerLabel.textContent=state.mode==='mistakes'?'помилки':'питань';
  workbench.scrollTop=0;
}
function activate(){
  active=true;
  document.querySelectorAll('.bottom-ledger [data-tab]').forEach(btn=>btn.classList.remove('active'));
  trainerTab?.classList.add('active');
  renderTrainer();
}
function deactivate(){
  active=false;trainerTab?.classList.remove('active');
  if(headerLabel)headerLabel.textContent='цикл';
}

let trainerTab=null;
if(ledger&&workbench){
  trainerTab=document.createElement('button');trainerTab.type='button';trainerTab.className='trainer-tab';trainerTab.setAttribute('data-native-press','');trainerTab.innerHTML='<span>04</span>Тренажер';ledger.appendChild(trainerTab);
  trainerTab.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();activate()});
  document.querySelectorAll('.bottom-ledger [data-tab]').forEach(btn=>btn.addEventListener('click',()=>deactivate(),{capture:true}));
  workbench.addEventListener('click',event=>{
    if(!active)return;
    const button=event.target.closest('[data-trainer-action]');if(!button)return;
    event.preventDefault();event.stopPropagation();
    const action=button.dataset.trainerAction;
    if(action==='answer')answer(Number(button.dataset.index));
    else if(action==='next')nextQuestion();
    else if(action==='skip')skipQuestion();
    else if(action==='mistakes')startMistakes();
    else if(action==='all')stopMistakes();
  },{capture:true});
}

globalThis.__IEV_RANDOM_TRAINER__={questions:RANDOM_TRAINER_QUESTIONS.length,units:LEARNING_UNITS.length,perUnit:TARGET_PER_UNIT,signature:BANK_SIGNATURE};
