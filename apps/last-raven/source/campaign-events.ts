import type { Encounter, EncounterChoice, Faction, ResourceKey } from './core';

export type StoryEncounter = Encounter & { minDay?: number; maxDay?: number; requiresFlag?: string };
type Eff = Partial<Record<ResourceKey, number>>;
type Rel = Partial<Record<Faction, number>>;
const consequence = (delay:number,id:string,text:string,effects:Eff={},flag?:string,relations?:Rel) => ({delay,id,text,effects,flag,relations});
const choice = (id:EncounterChoice['id'],label:string,hint:string,effects?:Eff,relations?:Rel,after?:ReturnType<typeof consequence>):EncounterChoice => ({id,label,hint,effects,relations,consequence:after});
const gate = (id:string,title:string,source:string,body:string,visual:Encounter['visual'],choices:EncounterChoice[],minDay=1,requiresFlag?:string):StoryEncounter => ({id,kind:'visitor',title,source,body,visual,choices,minDay,requiresFlag});
const raven = (id:string,title:string,source:string,body:string,seal:Faction|undefined,choices:EncounterChoice[],minDay=1,requiresFlag?:string):StoryEncounter => ({id,kind:'letter',title,source,body,seal,visual:'letter',choices,minDay,requiresFlag});

// Each event is a real decision, not a cosmetic card. Follow-ups use flags from older decisions.
export const VISITORS_EXTRA:StoryEncounter[]=[
  gate('deserter','Человек без знамени','один дезертир, меч в ножнах','Он знает распорядок болтонского лагеря. За убежище обещает назвать место, где завтра будет патруль.','soldiers',[
    choice('admit','УКРЫТЬ','еда −2 · риск предательства',{food:-2,guards:1},{bolton:-4},consequence(3,'deserter-trail','На месте лагеря нашли следы сотни сапог. Дезертир не лгал.',{morale:3},'deserter-intel')),
    choice('search','РАЗОРУЖИТЬ','добыть сведения',{morale:-1},undefined,consequence(1,'deserter-map','В сапоге спрятана схема обходной тропы.',{},'secret-path')),
    choice('refuse','ВЫДАТЬ','Болтоны оценят',{}, {bolton:5,stark:-4})]),
  gate('hunters','Охотники с волоком','двое с санями','Оленина ещё тёплая, но один охотник кашляет кровью. Они предлагают мясо за ночлег.','trader',[
    choice('admit','ТОРГОВАТЬ','еда +6 · лекарства −1',{food:6,medicine:-1},undefined,consequence(2,'hunter-fever','После их отъезда заболели два стражника.',{guards:-2},'winter-fever')),
    choice('search','ОСМОТРЕТЬ','лекарства −1 · еда +3',{medicine:-1,food:3,morale:1}),
    choice('refuse','НЕ ВПУСКАТЬ','без риска')],2),
  gate('widow','Вдова знаменосца','женщина в потёртой шерсти','Несёт обломок знамени погибшего отряда. Просит показать ей лица часовых: среди них должен быть её сын.','refugees',[
    choice('aid','ПОМОЧЬ','дух +5',{morale:5}, {stark:3},consequence(2,'widow-song','На вечернем карауле запели старую северную песню.',{morale:3},'widow-helped')),
    choice('search','РАССПРОСИТЬ','разведданные',{},undefined,consequence(1,'widow-news','Её рассказ подтвердил, что восточный тракт занят.',{},'east-blocked')),
    choice('deny','ПРОГНАТЬ','дух −3',{morale:-3})],2),
  gate('smith','Кузнец с разбитой наковальней','ремесленник и двое подмастерьев','Просит место в кузне. Говорит, железа осталось на полсотни наконечников.','trader',[
    choice('admit','ПРИНЯТЬ','еда −3 · стража +2',{food:-3,guards:2,morale:2},undefined,consequence(3,'smith-arrows','Кузнец выковал новые наконечники и починил кольчуги.',{guards:2},'smith-equipped')),
    choice('search','ПРОВЕРИТЬ','золото +1',{gold:1},undefined,consequence(1,'smith-truth','Кузнец ушёл, оставив сломанную печать Дредфорта.',{},'smith-bolton')),
    choice('refuse','ЗАКРЫТЬ','без обязательств')],3),
  gate('levy','Сборщики податей','четыре всадника','Они требуют золото за право пользоваться зимней дорогой. Печать подлинная — дата нет.','soldiers',[
    choice('aid','ЗАПЛАТИТЬ','золото −4',{gold:-4}, {bolton:6},consequence(2,'levy-return','Сборщики больше не останавливали ваш обоз.',{food:3},'paid-levy')),
    choice('search','ОСПОРИТЬ','дух +3 · гнев Болтонов',{morale:3},{bolton:-6},consequence(3,'levy-witness','В округе говорят, что ваш замок первым отказал сборщикам.',{morale:2},'tax-resistance')),
    choice('refuse','ПРОГНАТЬ','опасное неповиновение',{}, {bolton:-10})],3),
  gate('grain-cart','Телега с ложным дном','три возчика','Повозка кажется слишком тяжёлой для мешков с отрубями. Возчики просят лишь воды.','trader',[
    choice('search','ОБЫСКАТЬ','оружие для стражи',{guards:3},{stark:2},consequence(1,'cart-secret','Под отрубями лежали копья и послание без подписи.',{},'hidden-arms')),
    choice('admit','ПРОПУСТИТЬ','еда +2',{food:2},undefined,consequence(2,'cart-ambush','За рекой задержали телегу с вашим клеймом.',{morale:-3},'cart-suspicion')),
    choice('refuse','ОТОСЛАТЬ','без риска')],4),
  gate('wounded-scout','Раненый разведчик','один мужчина, обмороженные руки','На плаще — цвет Ночного Дозора. Он утверждает, что за перевалом множество костров.','rangers',[
    choice('aid','ЛЕЧИТЬ','лекарства −2 · сведения',{medicine:-2,morale:2},{watch:4},consequence(2,'scout-report','Разведчик добрался до Дозора и прислал точную карту.',{},'scout-report')),
    choice('search','ВЫСЛУШАТЬ','дух −1',{morale:-1},undefined,consequence(1,'scout-rumor','Костры севернее оказались погребальными.',{},'burning-north')),
    choice('refuse','НЕ ОТКРЫВАТЬ','Дозор −4',{}, {watch:-4})],4),
  gate('pilgrims','Паломники зимнего пути','шестеро в белом','Молчат, пока старшая не просит оставить их у очага до утра. Один держит чужую печать.','refugees',[
    choice('admit','ВПУСТИТЬ','дрова −3 · дух +4',{wood:-3,morale:4},undefined,consequence(2,'pilgrim-gift','Паломники оставили у ворот мешочек монет и старую карту.',{gold:3},'pilgrim-map')),
    choice('search','РАССПРОСИТЬ','дух −1 · сведения',{morale:-1},undefined,consequence(1,'pilgrim-seal','Печать принадлежала давно разграбленному замку.',{},'ruined-fort')),
    choice('refuse','ОТКАЗАТЬ','без расходов')],5),
  gate('lost-boys','Три мальчика с луками','дети из соседней долины','Ночью их деревню разграбили. Они умеют ставить силки, но едва держатся на ногах.','refugees',[
    choice('admit','ПРИЮТИТЬ','еда −3 · будущая помощь',{food:-3,morale:3},undefined,consequence(3,'boys-watch','Мальчики заметили обходящего дозор лазутчика.',{guards:2},'boys-scout')),
    choice('aid','НАКОРМИТЬ','еда −2 · дух +2',{food:-2,morale:2}),
    choice('refuse','ПРОГНАТЬ','сохранить припасы',{morale:-4})],5),
  gate('old-knight','Рыцарь без коня','старый солдат в кольчуге','Прибыл служить за крышу и миску похлёбки. Умеет строить оборону, но не скрывает шрамов Дредфорта.','soldiers',[
    choice('admit','НАНЯТЬ','еда −3 · стража +4',{food:-3,guards:4},{bolton:-1},consequence(2,'knight-drill','Рыцарь обучил караул держать строй у бреши.',{guards:2},'trained-guard')),
    choice('search','ПРОВЕРИТЬ','дух +1',{morale:1},undefined,consequence(1,'knight-past','Рыцарь признался, что бежал после приказа убивать мирных.',{},'knight-confessed')),
    choice('deny','ОТКАЗАТЬ','без риска')],6),
  gate('silent-sledge','Сани под чёрным полотном','двое грузчиков','Они не называют того, кто лежит под полотном. За пропуск предлагают золото.','trader',[
    choice('admit','ПРОПУСТИТЬ','золото +4 · тревога',{gold:4,morale:-3},undefined,consequence(2,'sledge-secret','В деревне нашли погребение в чужих доспехах.',{},'black-sledge')),
    choice('search','РАСКРЫТЬ','сведения · опасность',{morale:-1},undefined,consequence(1,'sledge-burden','Под тканью лежал раненый знаменосец Старков.',{morale:2},'saved-standard')),
    choice('refuse','НЕ ПУСКАТЬ','без обязательств')],7),
  gate('frost-broken','Беглецы из вьюги','два человека в ледяной корке','Они пришли по тайной тропе, о которой никто не должен знать. Позади видны свежие следы.','rangers',[
    choice('admit','УКРЫТЬ','еда −2 · стража +2',{food:-2,guards:2},undefined,consequence(2,'path-hunters','Беглецы предупредили о засаде у узкого перевала.',{},'path-ambush')),
    choice('search','РАЗВЕДАТЬ','стража −1',{guards:-1},undefined,consequence(1,'path-watch','Разведчики перехватили чужого проводника.',{gold:2},'caught-guide')),
    choice('refuse','ПРОГНАТЬ','дух −2',{morale:-2})],5,'secret-path'),
  gate('bolton-informant','Гость под розовым плащом','бывший писарь Дредфорта','Он видит ваш замок издали. Говорит, что зарубка на воротах означает направление главного удара.','soldiers',[
    choice('search','ДОПРОСИТЬ','узнать замысел',{}, {bolton:-2},consequence(1,'siege-direction','Штурм, вероятно, начнётся с восточной стены.',{},'know-siege')),
    choice('admit','УКРЫТЬ','еда −2 · дух +3',{food:-2,morale:3},undefined,consequence(2,'informant-proof','Писарь показал список замков, предназначенных к разгрому.',{},'know-siege')),
    choice('refuse','ОТКАЗАТЬ','Болтоны +3',{}, {bolton:3})],6,'marked-by-bolton'),
  gate('winter-physician','Лекарка от реки','женщина с сумкой трав','Услышала, что у вас есть мейстер. Просит разрешения остаться и помогать больным.','maester',[
    choice('admit','ПРИНЯТЬ','еда −2 · лекарства +3',{food:-2,medicine:3,morale:2},undefined,consequence(2,'physician-report','Мейстер и лекарка остановили лихорадку в карауле.',{guards:2},'infirmary')),
    choice('aid','КУПИТЬ ТРАВЫ','золото −2 · лекарства +2',{gold:-2,medicine:2}),
    choice('refuse','ОТКАЗАТЬ','без расходов')],4,'maester-ally'),
  gate('refugee-return','Возвращение беженцев','женщина, которую вы уже видели','Вместо просьбы о ночлеге они приносят мешок зерна. Разведчики Дредфорта видели их на дороге.','refugees',[
    choice('admit','ПРИНЯТЬ ДАР','еда +5 · дух +3',{food:5,morale:3},undefined,consequence(1,'refugee-gratitude','Люди укрыли ваш дозор, когда пошёл снег.',{guards:2},'refugee-loyalty')),
    choice('search','ПРОВЕРИТЬ','не доверять никому',{morale:-1},undefined,consequence(1,'refugee-hurt','Их слова подтвердились, но к воротам они больше не подходят.',{},'refugees-alienated')),
    choice('refuse','НЕ ПРИНИМАТЬ','сохранить дистанцию')],5,'know-bolton-patrol'),
  gate('night-guide','Проводник от Дозора','один всадник в чёрном','Говорит о северной тропе. Может вывести раненых до рассвета, но просит выделить ему караульных.','rangers',[
    choice('aid','ДАТЬ ЛЮДЕЙ','стража −2 · дух +5',{guards:-2,morale:5},{watch:4},consequence(2,'guide-returns','Проводник вернулся с людьми из покинутого хутора.',{guards:3,food:2},'guided-survivors')),
    choice('search','ПРОВЕРИТЬ','стража −1',{guards:-1},undefined,consequence(1,'guide-report','Тропа проходима, но только до сильной метели.',{},'scout-report')),
    choice('refuse','НЕ РИСКОВАТЬ','без потерь')],6,'north-path')
];

export const LETTERS_EXTRA:StoryEncounter[]=[
  raven('millers-note','Зерно у старой мельницы','записка в мокром конверте','Мельник просит людей: без конвоя зерно достанется мародёрам.',undefined,[
    choice('send','ОТПРАВИТЬ КОНВОЙ','стража −2 · еда позднее',{guards:-2},undefined,consequence(2,'mill-grain','Конвой вернулся. Двое остались у мельницы, но запас пополнен.',{food:9,guards:1},'mill-protected')),
    choice('lie','ОБЕЩАТЬ ПОМОЩЬ','дух −2',{morale:-2},undefined,consequence(2,'mill-lost','Мельница опустела до прихода вашего дозора.',{food:-2},'mill-abandoned')),
    choice('burn','ПРОИГНОРИРОВАТЬ','без риска')],2),
  raven('border-signal','Сигнал с пограничной башни','три удара колокола','На башне поднято чужое знамя. Его можно вернуть, но потребуется отряд.',undefined,[
    choice('send','ОТПРАВИТЬ ЛЮДЕЙ','стража −3 · дух +3',{guards:-3,morale:3},undefined,consequence(2,'tower-back','На башне снова ваш факел. Враги ушли ночью.',{guards:1,morale:3},'tower-held')),
    choice('lie','СООБЩИТЬ СОЮЗНИКАМ','отношения со Старками +4',{}, {stark:4}),
    choice('burn','НЕ ВМЕШИВАТЬСЯ','дух −3',{morale:-3})],2),
  raven('north-oath','Старая присяга','письмо со знаком лютоволка','Старки требуют ответа: кому останетесь верны, когда сойдут снега?', 'stark',[
    choice('send','ПРИСЯГНУТЬ','Старки +12 · Болтоны −8',{morale:3},{stark:12,bolton:-8},consequence(4,'oath-paid','Под стены прибыли двое добровольцев из верных дому деревень.',{guards:2},'stark-oath')),
    choice('lie','ОТВЕТИТЬ НЕЯСНО','Старки −2',{}, {stark:-2}),
    choice('burn','СЖЕЧЬ ПИСЬМО','Старки −7',{}, {stark:-7})],3),
  raven('bolton-ultimatum','Ультиматум Дредфорта','трижды сложенный пергамент','«Последний раз требуем открыть ворота во время похода наших войск».', 'bolton',[
    choice('send','СОГЛАСИТЬСЯ','дух −7 · Болтоны +8',{morale:-7},{bolton:8},consequence(2,'bolton-quarter','Болтоны прислали временную охранную грамоту.',{food:2},'bolton-deal')),
    choice('lie','ТЯНУТЬ ВРЕМЯ','Болтоны −4',{}, {bolton:-4}),
    choice('burn','ОТКАЗАТЬ','дух +3 · Болтоны −9',{morale:3},{bolton:-9},consequence(3,'bolton-threat','Вдали зажглись сторожевые костры.',{morale:-3},'bolton-fire'))],4),
  raven('flock-sign','Три ворона без печатей','весть с далёкой переправы','Ворон вернулся с обрезанной нитью. Письмо не дошло. Переправа под наблюдением.',undefined,[
    choice('send','ПОСЛАТЬ ДРУГОГО','золото −1 · сведения',{gold:-1},undefined,consequence(2,'flock-route','Второй ворон вернулся с картой патрулей.',{},'enemy-patrols')),
    choice('lie','СДЕЛАТЬ ВИД, ЧТО ДОШЛО','дух −2',{morale:-2}),
    choice('burn','ПРЕКРАТИТЬ ПОЧТУ','без риска')],3),
  raven('watch-request','Холодная просьба','ворон с Чёрного замка','Дозор просит лекарства для людей, вернувшихся из-за Стены.', 'watch',[
    choice('send','ПОСЛАТЬ ЛЕКАРСТВА','лекарства −2 · Дозор +10',{medicine:-2},{watch:10},consequence(3,'watch-medic','В благодарность Дозор прислал к вам опытного следопыта.',{guards:2},'watch-debt')),
    choice('lie','ОТВЕТИТЬ: НЕТ ЗАПАСОВ','Дозор −4',{}, {watch:-4}),
    choice('burn','ПРОМОЛЧАТЬ','Дозор −7',{}, {watch:-7})],4),
  raven('winter-tax','Счёт казначея','запись из ближайшего города','Выплата на содержание тракта просрочена. Вместо золота можно отправить зерно.',undefined,[
    choice('send','ЗАПЛАТИТЬ ЗОЛОТО','золото −3 · дух +2',{gold:-3,morale:2}),
    choice('lie','ОТПРАВИТЬ ЗЕРНО','еда −5 · золото +1',{food:-5,gold:1}),
    choice('burn','НЕ ПЛАТИТЬ','дух −2',{morale:-2},undefined,consequence(2,'tax-debt','Ваша недоимка дошла до Дредфорта.',{},'unpaid-tax'))],5),
  raven('frost-census','Перепись у печи','записка управляющего','В кладовых пустеет. Можно выдать паёк караулу или семьям, но сразу обоим не хватит.',undefined,[
    choice('send','НАКОРМИТЬ СТРАЖУ','еда −3 · стража +2',{food:-3,guards:2,morale:-1}),
    choice('lie','НАКОРМИТЬ СЕМЬИ','еда −3 · дух +6',{food:-3,morale:6}),
    choice('burn','СБЕРЕЧЬ ЗАПАСЫ','дух −5',{morale:-5})],6),
  raven('stark-riders','Известие о коннице','письмо с лютоволком','Старки могут выслать малый отряд к зимним воротам, если ваш замок поклянётся защищать тракт.', 'stark',[
    choice('send','ПРОСИТЬ ПОМОЩИ','золото −2 · союз',{gold:-2},{stark:6},consequence(2,'stark-riders-return','Из метели появились вооружённые всадники. Они останутся до осады.',{guards:6},'stark-cavalry')),
    choice('lie','НЕ ОБЯЗЫВАТЬСЯ','Старки −3',{}, {stark:-3}),
    choice('burn','ОСТАВИТЬ БЕЗ ОТВЕТА','Старки −6',{}, {stark:-6})],6,'stark-oath'),
  raven('miller-gratitude','Долг мельника','записка на грубой бумаге','«Зерно осталось в наших амбарах благодаря вашим людям. Чем помочь замку?»',undefined,[
    choice('send','ПРОСИТЬ ЗЕРНО','еда +5',{food:5}),
    choice('lie','ПРОСИТЬ РАБОЧИХ','дрова +5',{wood:5}),
    choice('burn','ОТКАЗАТЬСЯ ОТ ПЛАТЫ','дух +4',{morale:4})],6,'mill-protected'),
  raven('smoke-warning','Дым за перевалом','предупреждение от разведчиков','Старый тракт охвачен огнём. Ваша кузня может сделать сигнальные стрелы для соседей.',undefined,[
    choice('send','СДЕЛАТЬ СТРЕЛЫ','дрова −3 · союз',{wood:-3,morale:2},{watch:3},consequence(2,'signal-arrows','Стрелы помогли дозору собрать людей для защиты дороги.',{guards:3},'signal-ready')),
    choice('lie','ПРОМОЛЧАТЬ','дух −1',{morale:-1}),
    choice('burn','УНИЧТОЖИТЬ ВЕСТЬ','без расходов')],7,'smith-equipped'),
  raven('guard-mutiny','Письмо от сотника','без печати, складка смята','Сотник предупреждает: люди готовы уйти, если хлеб снова урежут. Нужна немедленная мера.',undefined,[
    choice('send','ВЫДАТЬ ПАЁК','еда −4 · дух +10',{food:-4,morale:10},undefined,consequence(1,'guard-loyal','Стража сама выставила двойной дозор.',{guards:2},'guard-loyal')),
    choice('lie','ОБЕЩАТЬ ЖАЛОВАНЬЕ','золото −3 · дух +6',{gold:-3,morale:6}),
    choice('burn','ПОДАВИТЬ','стража −3 · дух −6',{guards:-3,morale:-6})],7),
  raven('hidden-arsenal','Запись о тайном оружии','бумага из найденной телеги','В подвале за кладовой скрыта старая оружейная. Кто-то забил дверь досками.',undefined,[
    choice('send','ВСКРЫТЬ КЛАДОВУЮ','дрова −2 · стража +4',{wood:-2,guards:4},undefined,consequence(1,'arsenal-used','Караульные распределили оружие по стенам.',{morale:2},'armed-walls')),
    choice('lie','СКРЫТЬ НАХОДКУ','золото +2',{gold:2}),
    choice('burn','ОСТАВИТЬ ЗАКРЫТОЙ','без риска')],6,'hidden-arms'),
  raven('siege-intelligence','Письмо с картой осады','стрелка в грязи, без подписи','Дозор определил направление главного удара. Можно поставить ловушки или усилить караул.',undefined,[
    choice('send','СТАВИТЬ ЗАСЕКИ','дрова −4 · будущая защита',{wood:-4,morale:2},undefined,consequence(1,'stakes-built','На подступах появились скрытые колья.',{},'siege-stakes')),
    choice('lie','УКРЕПИТЬ КАРАУЛ','стража +2',{guards:2}),
    choice('burn','НЕ МЕНЯТЬ ПЛАН','без расходов')],8,'know-siege')
];
