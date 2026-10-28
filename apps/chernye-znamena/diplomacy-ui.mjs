// A compact diplomatic council: two sovereign seals, one selected court, real orders.
import {agreement,diplomacyChoice,relation,league,pactName,tributeIncome,POLITICAL_ACTIONS} from './diplomacy.mjs';
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const names={1:'Багровый орден',2:'Каменные князья'};
const descriptions={
 envoy:{label:'Отправить посольство',cost:'4 серебра',body:'Договориться через посредников: доверие увеличится на 26. Не устраняет прошлые потери и не прекращает войну.'},
 truce:{label:'Заключить перемирие',cost:'6 серебра',body:'Три следующих сезона стороны не могут атаковать, осаждать и грабить друг друга. Действующие блокады снимаются.'},
 alliance:{label:'Скрепить союз',cost:'8 серебра · 1 слава',body:'Четыре следующих сезона стороны не воюют, получают проход для обозов и по 1 серебру торгового дохода за сезон. Военные дружины не переходят на союзные земли.'},
 submission:{label:'Принять вассальную присягу',cost:'2 славы',body:'Только ослабленная держава с максимум двумя землями и малой армией признаёт верховенство Севера. Владения остаются её собственными, а северная казна получает по 2 серебра за каждую из них.'},
 tribute:{label:'Потребовать чрезвычайную дань',cost:'+6 серебра',body:'Немедленный доход +6. Верность вассала снижается на 24. Низкая верность приведёт к восстанию.'},
 charter:{label:'Даровать грамоту привилегий',cost:'5 серебра',body:'Уступить придворным: верность вассала возрастёт на 26, доверие на 8. Сдерживает будущий мятеж.'},
 break:{label:'Разорвать договор',cost:'−1 слава',body:'Прекратить союз или перемирие. Обе стороны снова смогут воевать; доверие снизится на 45 и будет потеряна одна военная слава, если она есть.'}
};
export function courtTitle(s){
 const treats=[1,2].map(n=>agreement(s,n)).filter(Boolean);
 return '<span class="court-counter">ДОГОВОРЫ '+treats.length+' / 2</span>'+
  (league(s)?'<span class="court-league">ВРАЖЕСКАЯ ЛИГА · ДО СЕЗОНА '+s.diplomacy.coalitionUntil+'</span>':'')+
  (tributeIncome(s)>0?'<span class="court-tribute">ПОСТУПЛЕНИЯ +' +tributeIncome(s)+'</span>':'');
}
export function courtMarkup(s,selectedSide=1){
 const d=s.diplomacy || {relations:{1:-32,2:-12},treaties:[],coalitionUntil:0};
 const states=[1,2].map(side=>{
  const pact=agreement(s,side),score=relation(s,side);
  const title=pact?pactName(pact):'Без договора';
  const flag=pact?.kind==='vassal'?' · верность '+pact.loyalty:pact?' · до сезона '+pact.until:'';
  return '<button class="court-seal '+(selectedSide===side?'selected':'')+'" data-court-side="'+side+'" aria-pressed="'+(selectedSide===side)+'">'+
    '<span class="court-seal-symbol '+(side===1?'court-ember':'court-stone')+'">'+(side===1?'✣':'◆')+'</span>'+
    '<span><strong>'+esc(names[side])+'</strong><small>'+title+flag+'</small></span>'+
    '<b>'+String(score>=0?'+':'')+score+'</b></button>';
 }).join('');
 const pact=agreement(s,selectedSide),score=relation(s,selectedSide);
 const countryCount=s.provinces.filter(p=>p.owner===selectedSide).length;
 const force=s.armies.filter(a=>a.side===selectedSide).reduce((sum,a)=>sum+a.strength,0);
 const status=pact?.kind==='vassal'
  ?'<p class="court-status">Вассальная держава. Верность '+pact.loyalty+'/100. При падении верности до 12 вассал восстанет и поднимет новую дружину.</p>'
  :pact?.kind==='alliance'?'<p class="court-status">Союз: проход обозов, +1 серебро торговли за сезон, запрет на войны до сезона '+pact.until+'.</p>'
  :pact?.kind==='truce'?'<p class="court-status">Перемирие: запрещены штурмы, осады и рейды до сезона '+pact.until+'.</p>'
  :'<p class="court-status">Открытая граница. Возможны войны, переговоры и подчинение силой.</p>';
 const actions=POLITICAL_ACTIONS.map(id=>{
  const option=diplomacyChoice(s,selectedSide,id),info=descriptions[id];
  return '<button class="court-action" data-political-action="'+id+'"'+(!option.ok?' disabled':'')+' title="'+esc(option.ok?info.body:option.reason)+'">'+
   '<span><strong>'+info.label+'</strong><small>'+esc(option.ok?info.cost:option.reason)+'</small></span>'+
   '<span class="court-arrow">↗</span></button>';
 }).join('');
 return '<div class="court-intro"><span>СОВЕТ ТРЁХ КОРОН</span>'+courtTitle(s)+'<h2>Хрупкая присяга</h2><p>Решения стоят один стратегический приказ. Слава зарабатывается военными победами. Договоры имеют последствия для военных путей и доходов.</p></div>'+
 '<div class="court-seals">'+states+'</div>'+
 '<div class="court-tally"><span>'+countryCount+' владений · '+force+' воинов</span><span>Доверие '+(score>0?'+':'')+score+'</span></div>'+
 status+'<div class="court-actions">'+actions+'</div>'+
 '<p class="court-footnote">Договоры не заменяют военную победу. Присягу примут только державы, утратившие способность сопротивляться.</p>';
}
export function politicalConfirmation(s,side,action){
 const info=descriptions[action],option=diplomacyChoice(s,side,action);
 if(!info||!option.ok)return null;
 const pact=agreement(s,side);
 return {
  eyebrow:'ДИПЛОМАТИЧЕСКАЯ ГРАМОТА',title:info.label,
  content:info.body+' Держава: '+names[side]+'. Расход: один приказ'+(option.cost?', '+option.cost+' серебра':'')+'.'+
   (pact?.kind==='vassal'?' Текущая верность: '+pact.loyalty+'.':''),
  confirm:action==='break'?'Да, разорвать договор':action==='tribute'?'Взыскать дань':'Подтвердить договор'
 };
}
