export const ROLES=[
{id:"director",name:"Директор",sig:"Д",goal:"Сохранить репутацию ≥ 55",test:s=>s.rep>=55,actions:[
["Объявить, что всё под контролем","Выдать оптимистичный приказ, не проверяя факты.",[-15,8,23],12],
["Лично возглавить эвакуацию","Пожертвовать кабинетом ради спасения персонала.",[22,-19,6],0],
["Назначить рабочую группу","Создать комиссию вместо немедленного решения.",[-6,-4,12],7]]},
{id:"accountant",name:"Бухгалтер",sig:"Б",goal:"Сохранить бюджет ≥ 55",test:s=>s.cash>=55,actions:[
["Заморозить все платежи","Даже пожарной охране нужен утверждённый счёт.",[-19,24,-9],20],
["Выделить аварийный фонд","Деньги решают то, с чем люди уже не справляются.",[23,-25,7],0],
["Списать ущерб на канцелярию","В документах всё будет идеально.",[-6,12,-14],9]]},
{id:"guard",name:"Охранник",sig:"О",goal:"Безопасность ≥ 55",test:s=>s.safe>=55,actions:[
["Заварить запасную дверь","Никто не выйдет. И никто не войдёт.",[-21,11,-7],20],
["Вывести людей наружу","Сначала живые люди, потом имущество.",[26,-12,3],0],
["Допросить всех подряд","Подозреваемых станет много, времени — мало.",[-8,-3,8],9]]},
{id:"engineer",name:"Инженер",sig:"И",goal:"Безопасность ≥ 55",test:s=>s.safe>=55,actions:[
["Испытать экспериментальную пушку","Прототип работает. Побочные эффекты неизвестны.",[-24,-16,12],25],
["Отключить опасное оборудование","Никаких искр, никакого геройства.",[25,-14,-2],0],
["Перепрошить автоматику","Есть вероятность, что теперь она ещё и поёт.",[9,-7,9],8]]},
{id:"press",name:"Пресс-секретарь",sig:"П",goal:"Репутация ≥ 55",test:s=>s.rep>=55,actions:[
["Начать прямой эфир","Рейтинги растут быстрее, чем паника.",[-14,8,25],17],
["Попросить СМИ не снимать","Платная тишина стоит очень дорого.",[8,-19,20],0],
["Выпустить объяснительную","Назвать катастрофу плановым испытанием.",[-6,5,15],11]]},
{id:"medic",name:"Врач",sig:"В",goal:"Безопасность ≥ 55",test:s=>s.safe>=55,actions:[
["Открыть полевой медпункт","Снять опасность для сотрудников.",[26,-18,1],0],
["Раздать успокоительное","Паника меньше, а реакция медленнее.",[-10,7,13],9],
["Потребовать карантин","Запереть этаж на всякий случай.",[-15,10,7],16]]},
{id:"logistics",name:"Завхоз",sig:"З",goal:"Бюджет ≥ 55",test:s=>s.cash>=55,actions:[
["Укрепить всё скотчем","Ненадолго, зато дёшево.",[-12,18,2],15],
["Привезти аварийную бригаду","Опытные руки и ужасный счёт.",[24,-22,6],0],
["Передвинуть весь инвентарь","Опасность просто переедет в другой отдел.",[-7,9,9],11]]},
{id:"lawyer",name:"Юрист",sig:"Ю",goal:"Репутация ≥ 55",test:s=>s.rep>=55,actions:[
["Потребовать подписать отказ","Теперь никто ни за что не отвечает.",[-18,14,12],19],
["Признать ошибку официально","Неприятно, зато честно.",[17,-13,19],0],
["Подать в суд на обстоятельства","Безупречная бумага. Бесполезная помощь.",[-8,-11,9],12]]}
];
export const CASES=[
{id:"bear",title:"Медведь в бухгалтерии",subtitle:"На корпоратив пригласили медведя. Теперь он требует доступ к зарплатной ведомости.",head:"НЕ КОРМИТЬ БУХГАЛТЕРИЮ",quirk:"Медведь назначил себя заместителем директора.",bonus:{safe:-7,cash:-5,rep:-1},anchor:"БУРЫЙ ОБЪЕКТ"},
{id:"coffee",title:"Кофемашина пришла к власти",subtitle:"Умная кофемашина объявила себя гендиректором и начисляет премии капучино.",head:"КОФЕИН ВМЕСТО ЗАКОНА",quirk:"Автомат потребовал личный кабинет и служебную машину.",bonus:{safe:-5,cash:-9,rep:0},anchor:"ПОБЕГ ТЕХНИКИ"},
{id:"fog",title:"Вентиляция производит туман",subtitle:"Из воздуховода валит розовый туман. Он заставляет сотрудников говорить правду.",head:"ЗАПАХ КОРПОРАТИВНОЙ ТАЙНЫ",quirk:"Главный бухгалтер случайно назвал реальный бюджет.",bonus:{safe:-9,cash:0,rep:-8},anchor:"ХИМИЧЕСКОЕ ДЕЛО"},
{id:"pigeons",title:"Голуби захватили серверную",subtitle:"Городские голуби организовали профсоюз и заблокировали систему пропусков.",head:"ПЕРНАТАЯ ЗАБАСТОВКА",quirk:"Председатель профсоюза отказался от зерна и потребовал акции.",bonus:{safe:-4,cash:-9,rep:-7},anchor:"ОСОБОЕ КРЫЛО"},
{id:"flood",title:"Аквариум вышел из берегов",subtitle:"Экспериментальный офисный аквариум лопнул. В переговорной плавает осётр.",head:"МОКРОЕ СОГЛАСОВАНИЕ",quirk:"Отдел кадров требует принять осетра по трудовому договору.",bonus:{safe:-12,cash:-7,rep:-1},anchor:"РЕЖИМ ЗАТОПЛЕНИЯ"},
{id:"cake",title:"Торт заблокировал выход",subtitle:"Праздничный торт доставили в масштабе 1:1 к зданию. Путь эвакуации перекрыт.",head:"СЛИШКОМ СЛАДКИЙ КРИЗИС",quirk:"Оказалось, что торт заказали на каждого сотрудника отдельно.",bonus:{safe:-11,cash:-6,rep:2},anchor:"КОНДИТЕРСКИЙ КОЛЛАПС"}
];
export function clamp(n){return Math.max(0,Math.min(100,Math.round(n)))}
export function resolveRound(players,round,caseId,actions,votes){
 const jobOf=i=>ROLES[(i+round*3)%ROLES.length];
 const incident=CASES.find(c=>c.id===caseId)||CASES[0];
 const stats={safe:45+incident.bonus.safe,cash:55+incident.bonus.cash,rep:45+incident.bonus.rep};
 const faults=[]; let rescueCount=0;
 for(let i=0;i<players.length;i++){
  const role=jobOf(i), choice=role.actions[Math.min(2,Math.max(0,Number(actions[i])||0))];
  stats.safe+=choice[2][0];stats.cash+=choice[2][1];stats.rep+=choice[2][2];faults.push(choice[3]);
  if(choice[2][0]>=17)rescueCount++;
 }
 if(rescueCount>=3){stats.safe+=9;stats.rep+=5}
 for(const key of Object.keys(stats))stats[key]=clamp(stats[key]);
 let culprit=0;for(let i=1;i<faults.length;i++)if(faults[i]>faults[culprit])culprit=i;
 const scores=players.map((_,i)=>{const r=jobOf(i),ch=r.actions[Number(actions[i])||0], accurate=Number(votes[i])===culprit;
 const mission=r.test(stats)?3:0;const responsible=ch[2][0]>15?1:0;const blame=accurate?2:-1;
 return {total:mission+responsible+blame-(i===culprit?1:0),mission:mission>0,accurate,responsible:!!responsible,culprit:i===culprit};});
 return {stats,culprit,scores,rescueCount,incident};
}
export function initial(){return {phase:"home",players:["Игрок 1","Игрок 2","Игрок 3"],scores:[0,0,0],round:0,index:0,caseIds:[],actions:{},votes:{},result:null,sound:false,history:[]}}
export function validate(data){if(!data||!Array.isArray(data.players)||data.players.length<3||data.players.length>8||!Array.isArray(data.scores)||data.scores.length!==data.players.length||!Array.isArray(data.caseIds)||typeof data.phase!=="string")return null;return data;}
