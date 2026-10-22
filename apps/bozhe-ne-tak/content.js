// One authored catalog for both the local rules and the pinned PocketNet module.
// Every incident has an actual scoring effect. No random text-only "events".
export const EXTRA_ITEMS=Object.freeze([
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
export const EXTRA_TREATMENTS=Object.freeze([
 {id:'ribbon',name:'Перевязать',short:'Лента'},
 {id:'anoint',name:'Умастить',short:'Масло'}
]);
export const EXTRA_RITES=Object.freeze([
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
export const EXTRA_DOCTRINES=Object.freeze([
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
export const INCIDENTS=Object.freeze([
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
