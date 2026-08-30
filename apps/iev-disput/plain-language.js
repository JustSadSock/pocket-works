import { QUIZ_1 } from './quiz-1.js';
import { QUIZ_2 } from './quiz-2.js';
import { QUIZ_3 } from './quiz-3.js';
import { LEARNING_UNITS } from './learning-data.js';
import { EXTRA_PRACTICE } from './learning-extra.js';

const DIRECT_STUDY_REWRITES=new Map([
  ['здійснюється суднобудування -> розвиток торгівлі','розвивається суднобудування, а разом із ним — торгівля'],
  ['надлишок товарів -> розвиток торгівлі','надлишок товарів стимулює розвиток торгівлі'],
  ['перші профспілки купців (формувалися страхові фонди для захисту купців)','купці створюють об’єднання зі страховими фондами для взаємного захисту'],
  ['перші металеві гроші -> стабілізація торгових зв’язків','з’являються перші металеві гроші, що робить торговельні зв’язки стабільнішими'],
  ['рабство','використовується рабська праця'],
  ['Пам’ятки економічних вчень','Основні джерела економічної думки']
]);

function tidySpaces(value=''){
  return String(value)
    .replace(/\s*->\s*/g,' — ')
    .replace(/\s*→\s*/g,' — ')
    .replace(/\s+([,.;:!?])/g,'$1')
    .replace(/([,.;:!?])(?=\S)/g,'$1 ')
    .replace(/[ \t]{2,}/g,' ')
    .trim();
}

function upperFirst(value=''){
  const text=String(value).trim();
  return text?text[0].toLocaleUpperCase('uk-UA')+text.slice(1):text;
}

function plainKey(value=''){
  return String(value).toLocaleLowerCase('uk-UA').replace(/[«»“”"'’.,:;!?()—-]/g,' ').replace(/\s+/g,' ').trim();
}

function simplifyStudyLine(line=''){
  const raw=String(line).trim();
  if(!raw)return'';
  const bullet=/^[•·▪‣-]\s*/.test(raw);
  let body=raw.replace(/^[•·▪‣-]\s*/, '').trim();
  const direct=DIRECT_STUDY_REWRITES.get(body);
  if(direct) body=direct;

  body=body
    .replace(/буддійські та брахманські економічні трактати.*«?економіка жертвоприношення»?.*$/i,'Буддійські та брахманські трактати пояснюють господарство через релігійні норми: працю пов’язують із виконанням релігійного обов’язку')
    .replace(/^перші профспілки купців.*$/i,'Купці створюють об’єднання зі страховими фондами для взаємного захисту')
    .replace(/^перші металеві гроші.*$/i,'З’являються перші металеві гроші, що робить торговельні зв’язки стабільнішими')
    .replace(/^здійснюється суднобудування.*$/i,'Розвивається суднобудування, а разом із ним — торгівля')
    .replace(/^надлишок товарів.*$/i,'Надлишок товарів стимулює розвиток торгівлі');

  body=tidySpaces(body)
    .replace(/^землеробство$/i,'Основою господарства є землеробство')
    .replace(/^розвиток ремісництва\s*[-—]\s*/i,'Розвиваються ремесла: ')
    .replace(/^здійснюється\s+/i,'Розвивається ')
    .replace(/^перші\s+/i,'З’являються перші ')
    .replace(/^наявність\s+/i,'Є ')
    .replace(/^відбувається\s+/i,'Відбувається ');

  if(/^характерні риси$/i.test(body))return'';
  body=upperFirst(body);
  if(body&&!/[.!?…»)]$/.test(body))body+='.';
  return `${bullet?'• ':''}${body}`;
}

function simplifyStudyText(text='',unitTitle=''){
  const titleKey=plainKey(unitTitle);
  return String(text).split('\n').map(line=>{
    const rawBody=line.trim().replace(/^[•·▪‣-]\s*/, '').trim();
    const key=plainKey(rawBody);
    if(key.length>5&&titleKey.startsWith(key))return'';
    return simplifyStudyLine(line);
  }).filter(Boolean).join('\n');
}

function simplifyQuestion(text=''){
  let q=tidySpaces(text)
    .replace(/\s+за конспектом\?/i,'?')
    .replace(/\s+у конспекті\?/i,'?')
    .replace(/,\s*за конспектом,?/gi,', ')
    .replace(/\bза конспектом\s+/gi,'')
    .replace(/\bу конспекті\s+/gi,'')
    .replace(/\bконспект прямо називає\b/gi,'названо')
    .replace(/^Що в конспекті названо «([^»]+)»\?$/i,'Що означає «$1»?')
    .replace(/^Що в конспекті названо ([^?]+)\?$/i,'Що означає $1?')
    .replace(/^Який набір ознак .*? належить саме ([^?]+)\?$/i,'Що характерно для $1?')
    .replace(/^Яка пара правильно зіставляє ([^?]+)\?$/i,'Яке зіставлення правильне: $1?')
    .replace(/^Що в системному підході є необхідним доповненням до набору акторів, щоб виникла міжнародна система\?$/i,'Що, крім акторів, потрібне для міжнародної системи?')
    .replace(/^Яка зміна найточніше описує перехід від раннього до пізнього меркантилізму\?$/i,'Що змінилося від раннього до пізнього меркантилізму?')
    .replace(/^Яка система безпосередньо передує сучасній постбіполярній у періодизації конспекту\?$/i,'Яка система була перед сучасною постбіполярною?')
    .replace(/^Що є характерним для ([^?]+)\?$/i,'Що характерно для $1?')
    .replace(/^Що характерно для ([^?]+) в конспекті\?$/i,'Що характерно для $1?')
    .replace(/^Який часовий проміжок у конспекті відповідає ([^?]+)\?$/i,'Коли тривав $1?')
    .replace(/^Який інструмент характерний для ([^?]+)\?$/i,'Який інструмент використовує $1?')
    .replace(/^Яку ранню форму колективного захисту купців згадує .*?\?$/i,'Як купці Стародавньої Індії захищали себе від ризиків?')
    .replace(/^Що належить до типів ([^?]+) у конспекті\?$/i,'Що належить до типів $1?')
    .replace(/^Який недолік ([^?]+) прямо названо в конспекті\?$/i,'Який недолік має $1?')
    .replace(/^Які ([^?]+) прямо згадано в конспекті\?$/i,'Які $1 згадано?')
    .replace(/^З чим конспект пов’язує ([^?]+)\?$/i,'З чим пов’язане $1?');
  q=q.replace(/\s{2,}/g,' ').replace(/\s+\?/g,'?').trim();
  return upperFirst(q);
}

function simplifyAnswer(text=''){
  return upperFirst(tidySpaces(text)
    .replace(/\bяк окрема категорія\b/gi,'')
    .replace(/\bяк єдиний фактор\b/gi,'')
    .replace(/\bяк єдина стадія\b/gi,'')
    .replace(/\s{2,}/g,' '));
}

function simplifyExplain(text=''){
  let value=tidySpaces(text)
    .replace(/^Саме так конспект /i,'')
    .replace(/^Саме так це подано в конспекті\.?$/i,'Це правильна відповідь.')
    .replace(/^Так сформульовано .*? в конспекті\.?$/i,'Це ключова теза цієї теми.')
    .replace(/^Це формулювання (?:безпосередньо |прямо )?міститься в конспекті\.?$/i,'Це правильна відповідь.')
    .replace(/^Конспект прямо (?:називає|згадує|визначає)\s+/i,'')
    .replace(/^У конспекті\s+/i,'')
    .replace(/^За конспектом\s+/i,'')
    .replace(/^Саме\s+/i,'');
  value=upperFirst(value);
  return value||'Це правильна відповідь.';
}

function simplifyQuestionObject(q){
  if(!q||typeof q!=='object')return;
  if(q.q)q.q=simplifyQuestion(q.q);
  if(q.correct)q.correct=simplifyAnswer(q.correct);
  if(Array.isArray(q.distractors))q.distractors=q.distractors.map(simplifyAnswer);
  if(q.explain)q.explain=simplifyExplain(q.explain);
}

const questionObjects=[];
for(const q of [...QUIZ_1,...QUIZ_2,...QUIZ_3])questionObjects.push(q);
for(const list of Object.values(EXTRA_PRACTICE))for(const q of list||[])questionObjects.push(q);
for(const unit of LEARNING_UNITS){
  for(const section of unit.sections||[])section.text=simplifyStudyText(section.text,unit.title);
  for(const q of unit.final||[])questionObjects.push(q);
}

const seen=new Set();
for(const q of questionObjects){
  if(!q||seen.has(q))continue;
  seen.add(q);
  simplifyQuestionObject(q);
}

const remainingVerbose=[...seen].filter(q=>/за конспектом|у конспекті|який набір ознак|необхідним доповненням/i.test(q.q||''));
globalThis.__IEV_PLAIN_LANGUAGE__={questions:seen.size,units:LEARNING_UNITS.length,remainingVerbose:remainingVerbose.length};
