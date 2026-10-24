// ЧЕПУХА · authoritative PocketNet game. Keep snapshots immutable.
export const PROTOCOL_VERSION = 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
const BANK = {"characterArc":{"label":"Цілісна історія","questions":[{"prompt":"Хто стане головним героєм цієї історії?","guidance":"Назви лише героя та його роль у житті; особливу звичку вигадає наступний автор.","creativeFreedom":"Не описуй незвичайну рису, місце, мету або події.","stage":"Герой"},{"prompt":"Яку незвичайну звичку помітили в героя?","guidance":"Придумай одну рису, зрозумілу без знання імені. Якщо ім'я не передали, назви героя за його роллю.","creativeFreedom":"Не вводь іншого головного героя; місце та мету визначать далі.","stage":"Риса"},{"prompt":"Де і за яких звичайних обставин ми вперше бачимо героя?","guidance":"Задай початкове місце та повсякденний стан.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Початкова сцена"},{"prompt":"Якого одного конкретного результату герой захотів досягти?","guidance":"Познач одну мету, не розповідаючи про її досягнення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Мета"},{"prompt":"Яка несподівана нагода змусила героя діяти?","guidance":"Вигадай конкретну можливість: річ, пропозицію чи зустріч. Не потрібно знати точну мету.","creativeFreedom":"Не оголошуй успіх: перешкода й наслідки ще попереду.","stage":"Шанс"},{"prompt":"Яка перешкода вперше завадила намірам героя?","guidance":"Опиши нову перешкоду й її безпосередню дію.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Перешкода"},{"prompt":"Яка несподіванка змінила погляд героя на події?","guidance":"Додай самостійне відкриття: химерне правило, властивість предмета або чужу таємницю.","creativeFreedom":"Не стверджуй, що знаєш попередні невидимі події, і не розв'язуй проблему.","stage":"Відкриття"},{"prompt":"На яку конкретну дію наважився герой?","guidance":"Опиши одне рішення або вчинок, не підбиваючи підсумків.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Вчинок"},{"prompt":"Яка зміна сталася після ризикованого вчинку героя?","guidance":"Покажи один відчутний наслідок: користь, шкоду чи дивний побічний ефект.","creativeFreedom":"Не переказуй невідомий вчинок і не завершуй історію.","stage":"Наслідок"},{"prompt":"Чим зрештою закінчилася історія героя?","guidance":"Заверши головну лінію й за бажанням додай один останній образ.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"collapsingPlan":{"label":"Ланцюг провалів","questions":[{"prompt":"Хто вирішив утнути щось ризиковане?","guidance":"Назви лише героя й одну його кумедну рису. Сам ризикований задум відкриється в наступному питанні.","creativeFreedom":"Не розкривай план, місце дії, перебіг подій чи фінал — для них є окремі етапи.","stage":"Авантюрист"},{"prompt":"Що саме герой задумав зробити?","guidance":"Назви одну конкретну ризиковану мету або витівку, але не її місце та не спосіб виконання.","creativeFreedom":"Не називай локацію: її обере наступний гравець. Не описуй перший крок, перешкоди, наслідки чи фінал.","stage":"Задум"},{"prompt":"Де саме герой збирався здійснити задум?","guidance":"Назви локацію та одну виразну деталь довкола; не змінюй сам задум.","creativeFreedom":"Не описуй виконання плану, першу невдачу, наслідки або фінал — це наступні питання.","stage":"Місце"},{"prompt":"З якої наївної дії герой почав свою авантюру?","guidance":"Вигадай простий перший крок; нехай на цю мить він здається геніальним.","creativeFreedom":"Не описуй випадковість, помилку героя чи повний крах.","stage":"Перший крок"},{"prompt":"Яка безглузда випадковість уперше збила авантюру з колії?","guidance":"Вигадай перешкоду, зрозумілу без точного плану: гостя, дивне правило чи поломку.","creativeFreedom":"Не описуй повного краху: власна помилка героя ще попереду.","stage":"Випадковість"},{"prompt":"Яку конкретну помилку допустив сам герой?","guidance":"Покажи окремий хибний вчинок без опису повної катастрофи.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Помилка"},{"prompt":"Яка нова невдача зробила ситуацію ще гіршою?","guidance":"Підвищ ставки однією конкретною халепою, смішною навіть без попередніх подробиць.","creativeFreedom":"Не називай невідомих тобі попередніх невдач і не роби остаточного провалу.","stage":"Ескалація"},{"prompt":"Як герой спробував виправити становище?","guidance":"Опиши одну спробу порятунку, не визначаючи успіх наперед.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Порятунок"},{"prompt":"Який дивний побічний ефект дістався героєві перед фіналом?","guidance":"Додай окрему втрату, халепу або несподіваний бонус, що пасує до будь-якої спроби порятунку.","creativeFreedom":"Не переказуй точних дій попереднього автора й не визначай підсумок.","stage":"Розплата"},{"prompt":"Яким став остаточний результат усієї авантюри?","guidance":"Закрий історію конкретним наслідком і комічним післясмаком.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"detectiveCase":{"label":"Детективна справа","questions":[{"prompt":"Хто взявся розслідувати дивну справу?","guidance":"Представ розслідувача, не називаючи справжнього винуватця.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Слідчий"},{"prompt":"Який один випадок став початком розслідування?","guidance":"Опиши, що незрозумілого сталося, без місця, слідів та винуватця.","creativeFreedom":"Місце визначить наступний автор; не називай докази чи розгадку.","stage":"Загадка"},{"prompt":"Де саме розгорнулося розслідування?","guidance":"Обери одне місце для пошуку і додай деталь обстановки.","creativeFreedom":"Не вигадуй новий злочин, підозрюваного чи доказ: вони мають окремі кроки.","stage":"Місце"},{"prompt":"Який незвичайний слід знайшли спочатку?","guidance":"Додай одну спостережувану деталь без пояснення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Слід"},{"prompt":"Хто або що спочатку викликало підозру?","guidance":"Назви першого підозрюваного та одну підставу.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підозра"},{"prompt":"Яку сміливу, але непевну версію висунув слідчий?","guidance":"Додай химерне припущення про загадку, а не доведений факт.","creativeFreedom":"Не приписуй попередньому автору конкретних доказів; версію ще можна спростувати.","stage":"Версія"},{"prompt":"Яка нова знахідка поставила розслідування з ніг на голову?","guidance":"Опиши новий доказ: предмет, повідомлення або свідчення, цікаве саме по собі.","creativeFreedom":"Не називай невідому тобі першу версію та не розкривай усю таємницю.","stage":"Контрдоказ"},{"prompt":"Яке несподіване пояснення таємниці врешті відкрилося?","guidance":"Назви можливе джерело загадки: людину, істоту, випадок або дивний механізм.","creativeFreedom":"Не завершуй справу та не описуй усіх мотивів.","stage":"Розкриття"},{"prompt":"Яка ще одна дивна подробиця зробила справу незабутньою?","guidance":"Додай незалежну дрібницю про місце, свідка чи доказ; не потрібно знати точну розгадку.","creativeFreedom":"Не вигадуй іншого головного винуватця й не переписуй попереднє відкриття.","stage":"Деталь розгадки"},{"prompt":"Як остаточно завершилося розслідування?","guidance":"Покажи результат справи та останній виразний штрих.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"nightSurvival":{"label":"Ніч виживання","questions":[{"prompt":"Хто стане героєм однієї незвичайної ночі?","guidance":"Представ людину та її початковий стан.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка нешкідлива, але дивна дрібниця трапилася з героєм ще до ночі?","guidance":"Вигадай одну незрозумілу подію без загрози — вона може бути кумедною або моторошною.","creativeFreedom":"Не називай нічну локацію, сигнал небезпеки або саму небезпеку.","stage":"Дивина"},{"prompt":"Де герой зустрів початок ночі?","guidance":"Назви конкретне нічне місце й одну особливість простору.","creativeFreedom":"Не продовжуй ранню дивину та не запускай загрозу.","stage":"Місце"},{"prompt":"Чого герой найбільше хотів у цю ніч?","guidance":"Назви просту мету або потребу, не досягаючи її.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Бажання"},{"prompt":"Який новий знак зробив ніч по-справжньому тривожною?","guidance":"Покажи помітний сигнал: звук, слід або поведінку предмета. Це нова деталь, не пояснення давньої.","creativeFreedom":"Не називай саму небезпеку й не пропонуй порятунок.","stage":"Передвісник"},{"prompt":"Яка конкретна небезпека наздогнала героя?","guidance":"Опиши близьке зіткнення, не завершаючи боротьбу.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Загроза"},{"prompt":"Яке відкриття зробило ніч ще страшнішою?","guidance":"Додай несподівану властивість загрози, не визначаючи, що саме бачив попередній автор.","creativeFreedom":"Не оголошуй порятунок і не розв'язуй усі таємниці.","stage":"Відкриття"},{"prompt":"Який відчайдушний спосіб урятуватися спробував герой?","guidance":"Опиши одну дію — хоробру, нерозумну або кумедну — без результату.","creativeFreedom":"Не оголошуй, чи вдалося остаточно вижити.","stage":"Втеча"},{"prompt":"Яку дивну ціну довелося заплатити за спробу врятуватися?","guidance":"Назви втрату, жертву чи кумедну незручність, яка підійде до будь-якої втечі.","creativeFreedom":"Не описуй точного попереднього способу втечі й не вирішуй, чи герой вижив.","stage":"Ціна"},{"prompt":"Що сталося з героєм до завершення ночі?","guidance":"Дай чітку розв'язку й тривожний або комічний післясмак.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"relationshipCrash":{"label":"Емоційний розлом","questions":[{"prompt":"Хто був першою людиною в цих стосунках?","guidance":"Представ одного персонажа та його рису без другої людини.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Перша людина"},{"prompt":"Хто став другою важливою людиною?","guidance":"Представ другого персонажа, не починаючи конфлікту.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Друга людина"},{"prompt":"Який незручний випадок уперше зблизив цих двох людей?","guidance":"Вигадай окрему сцену: непорозуміння, послугу або несподіваний жест. Усі імена знати не потрібно.","creativeFreedom":"Не вводь головну сварку та не вирішуй долю стосунків.","stage":"Зустріч"},{"prompt":"Чого перша людина таємно чекала від цих стосунків?","guidance":"Опиши одне очікування першого героя, без відповіді другого.","creativeFreedom":"Не вводь суперечність, сварку чи примирення.","stage":"Очікування"},{"prompt":"Яка дрібна звичка однієї людини почала дратувати іншу?","guidance":"Додай конкретний побутовий подразник, зрозумілий без знання прихованих секретів.","creativeFreedom":"Не описуй сварку, ультиматум або примирення.","stage":"Розбіжність"},{"prompt":"Який дрібний випадок уперше спричинив сварку між ними?","guidance":"Вигадай одну конкретну сцену конфлікту; причину можна зрозуміти й без попередніх слів.","creativeFreedom":"Не переходь до ультиматуму, примирення чи розриву.","stage":"Конфлікт"},{"prompt":"Яку дивну або серйозну умову хтось висунув після сварки?","guidance":"Сформулюй одну конкретну вимогу, не передбачаючи відповіді іншої людини.","creativeFreedom":"Не описуй спробу налагодити стосунки та її результат.","stage":"Умова"},{"prompt":"Який жест чи вчинок став спробою відновити стосунки?","guidance":"Опиши одну конкретну спробу без її оцінки.","creativeFreedom":"Не пиши реакцію другої людини — це окремий наступний крок.","stage":"Жест"},{"prompt":"Якою несподіваною реакцією один герой здивував іншого?","guidance":"Опиши теплу, невдалу або абсурдну реакцію. Не треба знати точний жест із попередньої сцени.","creativeFreedom":"Не визначай остаточну долю стосунків.","stage":"Реакція"},{"prompt":"Якими ці стосунки залишилися наприкінці?","guidance":"Заверши емоційну лінію однозначним або відкритим фіналом.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"questAdventure":{"label":"Пригодницький квест","questions":[{"prompt":"Хто вирушить у незвичайну пригоду?","guidance":"Представ мандрівника та одну особливість.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яким був світ або край, у якому жив герой?","guidance":"Дай одну виразну рису світу без початку квесту.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Світ"},{"prompt":"Яка випадкова подія вигнала героя зі звичного життя?","guidance":"Опиши лише поштовх до подорожі, не встановлюючи її кінцеву мету.","creativeFreedom":"Не називай пункт призначення, важливу знахідку або випробування.","stage":"Поштовх"},{"prompt":"Якої конкретної мети прагнув досягти герой?","guidance":"Назви одну мету або пункт призначення, які герой обрав після цієї події.","creativeFreedom":"Не описуй здобуття помічника, перешкоду чи фінал.","stage":"Мета"},{"prompt":"Яку одну корисну річ чи союзника герой здобув у дорозі?","guidance":"Додай допоміжний ресурс без великої перемоги.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Помічник"},{"prompt":"Яка перша серйозна перешкода перекрила шлях?","guidance":"Опиши одне випробування без розв'язання.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Перешкода"},{"prompt":"Яка дивна правда відкрилася героєві під час подорожі?","guidance":"Вигадай відкриття про дорогу, світ чи правила пригоди, зрозуміле без попередніх деталей.","creativeFreedom":"Не переписуй невідому тобі мету та не показуй фінальний вибір.","stage":"Таємниця"},{"prompt":"На який сміливий крок наважився герой після відкриття?","guidance":"Опиши одну рішучу дію, що наближає до фіналу, навіть якщо точна таємниця невідома.","creativeFreedom":"Не описуй ціну цього кроку та фінальну перемогу.","stage":"Рішення"},{"prompt":"Що герой отримав або втратив через сміливий вибір?","guidance":"Додай одну ціну, винагороду або дивний компроміс; точних деталей вибору знати не потрібно.","creativeFreedom":"Не переказуй чужого рішення і не завершуй пригоду.","stage":"Ціна"},{"prompt":"Чим закінчилася пригода і що стало з героєм?","guidance":"Заверши основну подорож та додай заключний образ.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"heistOperation":{"label":"Пограбування / операція","questions":[{"prompt":"Хто задумав ризиковану операцію?","guidance":"Представ організатора, не розкриваючи план.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Організатор"},{"prompt":"Який один об'єкт або результат був метою операції?","guidance":"Назви одну бажану річ або результат, не пояснюючи, де вона перебуває.","creativeFreedom":"Місце операції, захист і спосіб проникнення вигадають наступні автори.","stage":"Ціль"},{"prompt":"Де планувалося провести операцію?","guidance":"Вигадай локацію та одну загальну особливість її атмосфери.","creativeFreedom":"Не визначай охорону, спосіб проникнення або потрібний інструмент.","stage":"Місце"},{"prompt":"Яким способом збиралися дістатися до мети?","guidance":"Назви одну хитру тактику, не зазначаючи конкретного помічника чи предмета.","creativeFreedom":"Не додавай потрібного союзника, збою або результату.","stage":"Спосіб"},{"prompt":"Який союзник чи інструмент був необхідний для плану?","guidance":"Додай один ресурс, не описуючи його втрати.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підтримка"},{"prompt":"Який перший непередбачений збій стався під час операції?","guidance":"Додай конкретну перешкоду без загального краху.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Збій"},{"prompt":"Який неймовірний трюк команда спробувала серед хаосу?","guidance":"Вигадай одну імпровізацію, що пасує до будь-якого збою: маскування, підміну чи хитрий обхід.","creativeFreedom":"Не вигадуй, що знаєш конкретний збій, і не оголошуй успіх пограбування.","stage":"Імпровізація"},{"prompt":"Що сталося в найважливіший момент операції?","guidance":"Створи кульмінаційну дію без фінального підсумку.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Кульмінація"},{"prompt":"Чим несподівано довелося пожертвувати команді?","guidance":"Назви обладнання, союзника, престиж або щось недоречне. Точну кульмінацію знати не потрібно.","creativeFreedom":"Не визначай, чи досягли мети, і не переписуй попередню дію.","stage":"Ціна"},{"prompt":"Чим завершилася операція?","guidance":"Покажи успіх, поразку або неоднозначний результат.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"sciFiIncident":{"label":"Науково-фантастичний інцидент","questions":[{"prompt":"Хто став головним учасником незвичного експерименту?","guidance":"Представ героя або дослідника без появи аномалії.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка технологія чи система була в центрі роботи?","guidance":"Назви одну вигадану технологію та її призначення, але не місце використання.","creativeFreedom":"Не описуй сам експеримент, перевірку успіху чи майбутній збій.","stage":"Технологія"},{"prompt":"Де проводили експеримент або використовували систему?","guidance":"Опиши місце без початку збою.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Лабораторія"},{"prompt":"Яку одну дію збиралися виконати з технологією?","guidance":"Познач початкову мету процедури.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Експеримент"},{"prompt":"Що спочатку свідчило, що все відбувається нормально?","guidance":"Опиши одну ознаку стабільності без катастрофи.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Перший успіх"},{"prompt":"Який перший помітний збій порушив роботу системи?","guidance":"Введи один конкретний збій без повної розгадки.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Збій"},{"prompt":"Яка прихована властивість раптом відкрилася в технології?","guidance":"Додай нову рису системи: химерне правило, побічний ефект або неможливу поведінку.","creativeFreedom":"Не вгадуй попереднього збою й не розв'язуй інцидент.","stage":"Відкриття"},{"prompt":"Яке термінове рішення прийняв герой?","guidance":"Покажи один вибір або вчинок без опису його наслідку.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яка незвичайна зміна проявилася після втручання в експеримент?","guidance":"Опиши зміну в лабораторії, житті героя або технології, не прив'язуючись до невідомого рішення.","creativeFreedom":"Не оголошуй остаточний результат і не запускай іншу катастрофу.","stage":"Наслідок"},{"prompt":"Чим завершився інцидент і що змінилося після нього?","guidance":"Зафіксуй фінальний стан героя або світу.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"roadTrip":{"label":"Дорожня пригода","questions":[{"prompt":"Хто вирішив вирушити в подорож?","guidance":"Представ мандрівника без маршруту та пригод.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Мандрівник"},{"prompt":"Яка одна причина спонукала його їхати?","guidance":"Назви причину мандрівки без конкретного пункту призначення.","creativeFreedom":"Не називай, куди герой вирушить, на чому поїде або що трапиться дорогою.","stage":"Причина"},{"prompt":"Куди саме він збирався дістатися?","guidance":"Познач один пункт призначення.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Пункт призначення"},{"prompt":"Яка дрібниця стала першою подією подорожі?","guidance":"Опиши одну коротку сцену на старті, не визначаючи транспорт чи супутника.","creativeFreedom":"Не вигадуй головну дорожню проблему — вона трапиться пізніше.","stage":"Старт"},{"prompt":"Який незвичайний супутник або предмет опинився поруч у дорозі?","guidance":"Додай одну характерну деталь супроводу, не змінюючи місце призначення.","creativeFreedom":"Не розпочинай дорожню проблему або її вирішення.","stage":"Супутник"},{"prompt":"Яка перша проблема завадила дорозі?","guidance":"Опиши одне дорожнє ускладнення без розв'язки.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Перешкода"},{"prompt":"Яка дивна зустріч або новина змінила настрій поїздки?","guidance":"Вигадай несподіванку, що могла б статися будь-де дорогою. За бажанням обіграй передані слова.","creativeFreedom":"Не вимагай знати точний маршрут і не оголошуй прибуття.","stage":"Поворот"},{"prompt":"Що герой вирішив змінити у своїй подорожі після несподіванки?","guidance":"Вигадай об'їзд, нову домовленість або навіть рішення продовжити шлях інакше.","creativeFreedom":"Не описуй втрату дорогою чи прибуття.","stage":"Новий шлях"},{"prompt":"Що зручне або цінне герой мусив залишити позаду?","guidance":"Назви одну втрату або смішну поступку, зрозумілу без знання останнього повороту.","creativeFreedom":"Не описуй невідому дорогу й не вирішуй, чи вдалося приїхати.","stage":"Втрата"},{"prompt":"Чим зрештою закінчилася подорож?","guidance":"Дай фінальне прибуття, повернення або інший підсумок.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"courtroomScandal":{"label":"Суд і скандал","questions":[{"prompt":"Хто опинився в центрі майбутнього скандалу?","guidance":"Представ головну дійову особу та її суспільну роль.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Фігурант"},{"prompt":"У чому безглуздо або серйозно звинуватили головну людину?","guidance":"Назви одне конкретне звинувачення; не вирішуй, чи воно правдиве.","creativeFreedom":"Не описуй залу суду, докази, свідків або вирок.","stage":"Звинувачення"},{"prompt":"Де відбувався публічний розгляд цієї справи?","guidance":"Опиши суд, залу чи інше місце без викриття.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Який аргумент першим прозвучав на слуханні?","guidance":"Вигадай одну гучну заяву обвинувачення або захисту.","creativeFreedom":"Не вирішуй, хто правий, і не вводь нових свідків.","stage":"Позиція"},{"prompt":"Хто або що несподівано вплинуло на перебіг слухання?","guidance":"Додай несподіваного свідка, папірець чи іншу подію, яка ще нічого не доводить.","creativeFreedom":"Не розкривай суперечність або справжню істину.","stage":"Несподіванка"},{"prompt":"Який безглуздий факт поставив слухання під сумнів?","guidance":"Назви незалежний доказ чи суперечність, від якої судді стало незручно.","creativeFreedom":"Не заперечуй невідомих свідчень і не відкривай усю правду.","stage":"Суперечність"},{"prompt":"Яка абсурдна або шокуюча правда раптом спливла на слуханні?","guidance":"Вигадай одне відкриття, яке змінює погляд на звинувачення.","creativeFreedom":"Не описуй реакцію учасників або рішення суду.","stage":"Правда"},{"prompt":"Який несподіваний вчинок сколихнув залу перед вироком?","guidance":"Опиши одну дію героя, свідка або сторонньої особи, не вимагаючи знати попереднє викриття.","creativeFreedom":"Не оголошуй вирок і не вигадуй іншого головного звинувачення.","stage":"Вчинок"},{"prompt":"Який побічний наслідок слухання виявився найдивнішим?","guidance":"Додай репутаційну втрату або абсурдну незручність, яка може статися в будь-якій справі.","creativeFreedom":"Не винось вирок і не приписуй невідомих доказів іншим авторам.","stage":"Ціна"},{"prompt":"Який остаточний результат отримала ця справа?","guidance":"Покажи рішення й наслідки для головного героя.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Вирок"}]}};
const GENRES = [{"id":"groundedDrama","label":"Приземлена драма"},{"id":"absurdComedy","label":"Абсурдна комедія"},{"id":"horror","label":"Горор"},{"id":"detectiveNoir","label":"Нуарний детектив"},{"id":"romanticMelodrama","label":"Романтична мелодрама"},{"id":"fantasyEpic","label":"Фентезійна епіка"},{"id":"sciFiParanoia","label":"Науково-фантастична параноя"},{"id":"cyberpunk","label":"Кіберпанк"},{"id":"cozyWhimsy","label":"Затишна дивина"},{"id":"postApocalypse","label":"Постапокаліпсис"},{"id":"mythicLegend","label":"Міф і легенда"},{"id":"satire","label":"Сатира"}];
const IDS = Object.keys(BANK);
const GENRE_IDS = GENRES.map(g => g.id);
const GENDERS = ['male','female','nonbinary','unspecified'];
const MAX_ANSWER = 800;
const REACTION_KEYS = ['laugh','surprised','heart'];
const DEFAULTS = {maxPlayers:4,questionSet:'collapsingPlan',customQuestions:[],visibleTailWords:3,showNextQuestion:true,genre:'absurdComedy',customGenre:''};
const clean = (v,n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const clamp = (v,a,b,d) => Number.isFinite(Number(v)) ? Math.max(a,Math.min(b,Math.trunc(Number(v)))) : d;
const words = text => clean(text,MAX_ANSWER).split(/\s+/u).filter(Boolean);
const entries = players => players.map(p => ({id:p.id,name:clean(p.name,24)||'Гравець',accountId:p.verified===true&&typeof p.accountId==='string'?p.accountId:null,avatar:p.verified===true&&typeof p.avatar==='string'?clean(p.avatar,32):null,verified:p.verified===true}));
const questionOptions = () => IDS.map(id=>({id,label:BANK[id].label}));
const genreOptions = () => GENRES.map(g=>({id:g.id,label:g.label}));
const choose = list => list[Math.floor(Math.random()*list.length)];
function settingsFrom(raw,previous=DEFAULTS) {
 const v=raw && typeof raw==='object' ? raw : {};
 const q=typeof v.questionSet==='string'&&([...IDS,'custom','random','perSheetRandom'].includes(v.questionSet))?v.questionSet:previous.questionSet;
 const g=typeof v.genre==='string'&&([...GENRE_IDS,'custom','random','perSheetRandom'].includes(v.genre))?v.genre:previous.genre;
 const custom=Array.isArray(v.customQuestions) ? v.customQuestions.slice(0,16).map(x=>clean(x,120)).filter(Boolean) : previous.customQuestions;
 return {maxPlayers:clamp(v.maxPlayers,2,MAX_PLAYERS,previous.maxPlayers),questionSet:q,customQuestions:custom,
   visibleTailWords:clamp(v.visibleTailWords,0,12,previous.visibleTailWords),showNextQuestion:v.showNextQuestion===undefined?previous.showNextQuestion!==false:v.showNextQuestion===true,genre:g,
   customGenre:clean(v.customGenre===undefined?previous.customGenre:v.customGenre,60)};
}
function initial(player,payload){
 return {schema:1,revision:0,phase:'lobby',host:player.id,players:entries([player]),
   settings:settingsFrom(payload?.settings||{}),round:0,total:0,issue:0,sheets:[],submitted:{},receipts:{},paused:false,bannedIds:[],bannedAccounts:[],claim:null,hostOfflineSince:0,hostVotes:{},reactions:{},message:''};
}
function events(){return [{type:'state'}];}
function notice(to,message){return [{type:'notice',to,payload:message}];}
const GENRE_TONE = {
 groundedDrama:'Навіть у дивній сцені покажи конкретний людський мотив чи жест.',
 absurdComedy:'Нехай безглузда річ спричинить одну зрозумілу кумедну незручність.',
 horror:'Зроби один звичайний предмет або звук тривожним без пояснень.',
 detectiveNoir:'Нехай реакція, мовчання або тінь зробить сцену підозрілою.',
 romanticMelodrama:'Почуття покажи через надмірний жест або недоречну дрібницю.',
 fantasyEpic:'Навіть буденна дія може мати епічну назву та несподіваний обов’язок.',
 sciFiParanoia:'Додай речі дивне технічне правило або надто особисту поведінку.',
 cyberpunk:'Нехай технологія зачепить чиєсь побутове життя, не лише декорації.',
 cozyWhimsy:'Залиш дивині лагідну нотку, навіть коли вона створила халепу.',
 postApocalypse:'Буденна річ може виявитися цінним ресурсом або предметом торгу.',
 mythicLegend:'Звичайний жест нехай звучить як давній обряд із дивною ціною.',
 satire:'Зроби смішним одне конкретне правило, посаду чи суспільну звичку.'
};
const GENRE_ENDING = {
 groundedDrama:'Дай людський, відчутний підсумок без зайвих пояснень.',
 absurdComedy:'Заверши все конкретним абсурдним наслідком; не пояснюй жарт.',
 horror:'Заверши напругою, страшним відкриттям або моторошною іронією.',
 detectiveNoir:'Залиш фінальну гірку іронію, але дай розв’язку.',
 romanticMelodrama:'Нехай остання емоція буде сильною, хоч смішною, хоч щемкою.',
 fantasyEpic:'Заверши епічним, можливо безглуздо урочистим образом.',
 sciFiParanoia:'Покажи наслідок технологічної дивини без нової загадки.',
 cyberpunk:'Заверши конкретним наслідком для людей у технологічному світі.',
 cozyWhimsy:'Залиши теплий або химерно-добрий післясмак.',
 postApocalypse:'Покажи, як герой або світ тепер виживатиме.',
 mythicLegend:'Нехай завершення звучить як фінал переказу.',
 satire:'Заверши влучною іронією над правилами або владою.'
};
function resolveQuestions(settings,id,genre) {
 if(id==='custom')return settings.customQuestions.map(prompt=>({prompt,guidance:'Відповідай саме на це питання; використовуй доступні слова як натяк.',creativeFreedom:'Вигадуй вільно, не приписуючи невідомому попередньому автору точні події.'}));
 const questions=BANK[id]?.questions||BANK.collapsingPlan.questions;
 return questions.map((q,index)=>({
  ...q,
  guidance:q.guidance+' '+((index===questions.length-1?GENRE_ENDING[genre]:GENRE_TONE[genre])||'Додай одну влучну деталь.')
 }));
}
function begin(s){
 const opts=s.settings;
 if(s.players.length<MIN_PLAYERS) return 'Потрібно щонайменше двоє гравців.';
 if(opts.questionSet==='custom'&&opts.customQuestions.length<2) return 'Додай щонайменше два власні питання.';
 const commonSet=opts.questionSet==='random'?choose(IDS):opts.questionSet;
 const commonGenre=opts.genre==='random'?choose(GENRE_IDS):opts.genre;
 s.sheets=s.players.map((player,i)=>{
  const set=commonSet==='perSheetRandom'?choose(IDS):commonSet;
  const genre=commonGenre==='perSheetRandom'?choose(GENRE_IDS):commonGenre;
  return {id:'sheet-'+i,starter:player.id,set,genre,heroGender:null,
    fragments:[]};
 });
 s.total=resolveQuestions(opts,s.sheets[0].set).length;
 s.issue=(s.issue||0)+1;s.round=0;s.submitted={};s.receipts={};s.phase='writing';s.paused=false;s.claim=null;s.hostVotes={};s.hostOfflineSince=0;s.reactions={};s.message='';s.revision++;
 return null;
}
function viewForPlayer({state:s,player,players,onlineIds}){
 const p=s.players.find(x=>x.id===player.id);
 const connected=new Set(Array.isArray(onlineIds)?onlineIds:players.map(x=>x.id));
 const common={protocol:1,revision:s.revision,phase:s.phase,host:s.host,
   players:s.players.map(x=>({id:x.id,name:clean(x.name,32)||'Гравець',submitted:Boolean(s.submitted[x.id]),departed:!connected.has(x.id),excluded:(s.bannedIds||[]).includes(x.id),verified:x.verified===true&&typeof x.accountId==='string',accountId:x.verified===true&&typeof x.accountId==='string'?x.accountId:null,avatar:x.verified===true&&typeof x.avatar==='string'?clean(x.avatar,32):null})),
   settings:s.settings,questionSets:questionOptions(),genres:genreOptions(),
   round:s.round,total:s.total,issue:s.issue||0,message:s.message||'',paused:!!s.paused,
 hostOfflineSince:s.hostOfflineSince||0,hostVotes:s.hostVotes||{},
 claim:s.host===player.id&&s.claim?{seatId:s.claim.seatId,code:s.claim.code,expiresAt:s.claim.expiresAt}:null,
 message:s.message||'',lastReceipt:p?(s.receipts?.[p.id]||null):null};
 if(!p) return common;
 if(s.phase==='writing'){
  const pi=s.players.findIndex(x=>x.id===p.id);
  if(pi<0)return common;
  const si=(pi-s.round%s.players.length+s.players.length)%s.players.length;
  const sheet=s.sheets[si],previous=sheet.fragments.at(-1);
  return {...common,sheet:{id:sheet.id,set:sheet.set,setLabel:BANK[sheet.set]?.label||'Свій набір',
    genre:sheet.genre,genreLabel:GENRES.find(x=>x.id===sheet.genre)?.label||s.settings.customGenre||'Свій жанр',
    starter:s.players.find(x=>x.id===sheet.starter)?.name||'Автор',gender:sheet.heroGender,heroAnchor:sheet.heroAnchor||'',
    question:resolveQuestions(s.settings,sheet.set,sheet.genre)[s.round],nextQuestion:s.settings.showNextQuestion===false?'':(resolveQuestions(s.settings,sheet.set,sheet.genre)[s.round+1]?.prompt||''),tail:previous?.tail||''},waiting:Boolean(s.submitted[p.id])};
 }
 if(s.phase==='finished'){
  // Readers see totals and only their own chosen reaction, never others' votes.
  const reactionTotals={},myReactions={};
  for(const sh of s.sheets){
   const responses=s.reactions?.[sh.id]||{};
   reactionTotals[sh.id]=Object.fromEntries(REACTION_KEYS.map(key=>[key,
    s.players.filter(x=>!(s.bannedIds||[]).includes(x.id)&&responses[x.id]===key).length]));
   if(REACTION_KEYS.includes(responses[player.id]))myReactions[sh.id]=responses[player.id];
  }
  return {...common,reactionTotals,myReactions,stories:s.sheets.map(sh=>({
   id:sh.id,starter:sh.starterName||s.players.find(x=>x.id===sh.starter)?.name||'Автор',
   setLabel:BANK[sh.set]?.label||'Свій набір',
   genre:GENRES.find(x=>x.id===sh.genre)?.label||s.settings.customGenre||'Свій жанр',
   heroGender:sh.heroGender,
   // Assemble the whole story client-side from fragments to avoid doubling wire bytes.
   fragments:sh.fragments.map((f,i)=>({question:resolveQuestions(s.settings,sh.set)[f.questionIndex??i]?.prompt||'',answer:f.answer,skipped:f.skipped===true,
      author:f.authorName||s.players.find(x=>x.id===f.by)?.name||'Автор'}))
 }))};
 }
 return common;
}
function submit(s,player,v){
 if(v.requestId!==undefined&&(!/^[a-zA-Z0-9_-]{12,96}$/.test(v.requestId)))return 'Некоректний ідентифікатор відправки.';
 if(s.phase!=='writing'||s.submitted[player.id])return 'Відповідь уже прийнято або раунд завершено.';
 if(s.paused)return 'Партія на паузі. Ведучий може продовжити її.';
 if(v.round!==s.round)return 'Раунд змінився. Онови сторінку.';
 const pi=s.players.findIndex(p=>p.id===player.id);if(pi<0)return 'Твоє місце не знайдено.';
 const si=(pi-s.round%s.players.length+s.players.length)%s.players.length;
 const sh=s.sheets[si];
 if(v.sheetId!==sh.id)return 'Це інший аркуш. Синхронізуй кімнату.';
 if(typeof v.answer!=='string'||v.answer.length>MAX_ANSWER)return 'Фрагмент завеликий (до 800 символів).';
 const answer=clean(v.answer,MAX_ANSWER);
 const ws=words(answer);if(ws.length<4||answer.length>MAX_ANSWER)return 'Напиши принаймні чотири слова (до 800 символів).';
 if(s.round===0&&!GENDERS.includes(v.gender))return 'Обери стать персонажа або «неважливо».';
 const indexes=Array.isArray(v.tailIndexes)?v.tailIndexes:[];
 const target=s.round===s.total-1?0:Math.min(s.settings.visibleTailWords,ws.length);
 const chosen=[...new Set(indexes)].sort((a,b)=>a-b);
 if(chosen.length!==target||chosen.some(x=>!Number.isInteger(x)||x<0||x>=ws.length))return 'Познач рівно '+target+' слова для наступного автора.';
 const tail=chosen.map(i=>ws[i]).join(' ').slice(0,160);
 if(s.round===0){sh.heroGender=v.gender;sh.heroAnchor=clean(v.heroAnchor,72)}
 if(sh.fragments.length)delete sh.fragments[sh.fragments.length-1].tail;
 sh.fragments.push({by:player.id,answer,tail});
 s.submitted[player.id]=true;
 if(v.requestId)s.receipts[player.id]={requestId:v.requestId,round:s.round,sheetId:sh.id,accepted:true};
 if(s.players.every(p=>s.submitted[p.id])){
  s.round++;
  s.submitted={};
  if(s.round>=s.total){s.phase='finished';s.message='Усі історії розкриті.';}
 }
 s.revision++;return null;
}
const module={
 protocolVersion:1,
 createRoom({player,payload}){return {state:initial(player,payload)};},
 onJoin({state:s,players,player,payload}){
  const entrant=player||players.at(-1);
  if((s.bannedIds||[]).includes(entrant.id)||(entrant.accountId&&(s.bannedAccounts||[]).includes(entrant.accountId)))throw Error('room_kicked');
  if(s.phase!=='lobby'){
   const claim=typeof payload?.claimCode==='string'?payload.claimCode.trim().toUpperCase():'';
   if(claim){
    if(!s.claim||s.claim.code!==claim||s.claim.expiresAt<Date.now())throw Error('invalid_replacement_code');
    const index=s.players.findIndex(p=>p.id===s.claim.seatId);
    if(index<0||s.players.some(p=>p.id===entrant.id))throw Error('invalid_replacement_code');
    const old=s.players[index],assigned=s.players[index]={...entries([entrant])[0],originalSeat:old.originalSeat||old.id};
    s.bannedIds||=[];if(!s.bannedIds.includes(old.id))s.bannedIds.push(old.id);
    if(old.accountId){s.bannedAccounts||=[];if(!s.bannedAccounts.includes(old.accountId))s.bannedAccounts.push(old.accountId)}
    if(s.submitted[old.id])s.submitted[assigned.id]=true;
    delete s.submitted[old.id];
    // Preserve historical attribution by stamping authors before changing IDs.
    for(const sh of s.sheets){
      if(sh.starter===old.id)sh.starterName=sh.starterName||old.name;
      for(const fragment of sh.fragments)if(fragment.by===old.id)fragment.authorName=fragment.authorName||old.name;
    }
    if(s.host===old.id)s.host=entrant.id;
    s.claim=null;s.hostVotes={};s.revision++;return {state:s,events:events()};
   }

   // The same durable player identity can reclaim a deliberately vacated seat.
   const seat=s.players.find(p=>p.id===entrant.id);
   if(!seat)throw Error('match_in_progress');
   const current=players.find(p=>p.id===seat.id);
   if(current){seat.name=clean(current.name,24)||seat.name;seat.avatar=current.avatar||seat.avatar;}
   s.revision++;return {state:s,events:events()};
  }
  if(players.length>s.settings.maxPlayers)throw Error('room_full');
  s.players=entries(players);s.revision++;return {state:s,events:events()};
 },
 onLeave({state:s,players,player}){
  if(s.phase==='lobby'){
   s.players=entries(players);
   s.host=s.players.some(p=>p.id===s.host)?s.host:s.players[0]?.id||'';
  }else{
   // Never reset writing or discard a finished issue when someone exits.
   // Permanent seat IDs keep the sheet rotation stable after departures.
   if(player?.id===s.host&&!s.hostOfflineSince)s.hostOfflineSince=Date.now();
   s.message='Учасник від’єднався. Його місце та рукописи збережено.';
  }
  s.revision++;return {state:s,events:events()};
 },
 viewForPlayer,
 onPresence({state:s,player,online,onlineIds,now}){
  if(s.phase==='lobby'||s.phase==='finished')return {state:s,events:events()};
  if(player.id===s.host){
   if(online){s.hostOfflineSince=0;s.hostVotes={};}
   else if(!s.hostOfflineSince&&!onlineIds?.includes(s.host))s.hostOfflineSince=now||Date.now();
  }
  s.revision++;return {state:s,events:events()};
 },
 onMessage({state:s,player,payload,connectedIds,now}){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(v.type==='sync')return {state:s,events:events()};
  const online=new Set(Array.isArray(connectedIds)?connectedIds:s.players.map(x=>x.id)),clock=now||Date.now();
  const host=player.id===s.host,seatId=typeof v.seatId==='string'?v.seatId:'';
  const target=s.players.find(p=>p.id===seatId);
  if(v.type==='react_story'){
   const storyId=typeof v.storyId==='string'?v.storyId:'';
   const reaction=typeof v.reaction==='string'?v.reaction:'';
   if(s.phase!=='finished'||!s.players.some(p=>p.id===player.id)||(s.bannedIds||[]).includes(player.id)||
      !s.sheets.some(sh=>sh.id===storyId)||!REACTION_KEYS.includes(reaction))
    return {state:s,events:notice(player.id,'Цю реакцію зараз не дозволено.')};
   s.reactions||={};
   const responses=s.reactions[storyId]||{};
   if(responses[player.id]===reaction)delete responses[player.id];
   else responses[player.id]=reaction;
   if(Object.keys(responses).length)s.reactions[storyId]=responses;
   else delete s.reactions[storyId];
   s.revision++;return {state:s,events:events()};
  }
  if(v.type==='skip_slot'&&host&&s.phase==='writing'&&!s.paused&&target&&!online.has(target.id)&&!s.submitted[target.id]){
    const pi=s.players.findIndex(p=>p.id===target.id),si=(pi-s.round%s.players.length+s.players.length)%s.players.length;
    const paper=s.sheets[si];
    if(paper.fragments.length)delete paper.fragments[paper.fragments.length-1].tail;
    paper.fragments.push({by:target.id,answer:'[Фрагмент пропущено: автор не завершив свою частину.]',tail:'',skipped:true,questionIndex:s.round});
    s.submitted[target.id]=true;
    if(s.players.every(p=>s.submitted[p.id])){s.round++;s.submitted={};if(s.round>=s.total){s.phase='finished';s.message='Випуск готовий із позначеними пропусками.'}}
    s.revision++;return {state:s,events:events()};
  }
  if(v.type==='pause'&&host&&s.phase==='writing'&&!s.paused){s.paused=true;s.message='Партію призупинено ведучим.';s.revision++;return {state:s,events:events()}}
  if(v.type==='unpause'&&host&&s.phase==='writing'&&s.paused){s.paused=false;s.message='Партію продовжено.';s.revision++;return {state:s,events:events()}}
  if(v.type==='transfer_host'&&host&&target&&online.has(target.id)&&!(s.bannedIds||[]).includes(target.id)){
    s.host=target.id;s.hostOfflineSince=0;s.hostVotes={};s.revision++;return {state:s,events:events()};
  }
  if(v.type==='kick'&&host&&target&&target.id!==player.id){
    if(s.phase==='lobby')s.players=s.players.filter(p=>p.id!==target.id);
    if(!s.bannedIds)s.bannedIds=[];
    if(!s.bannedIds.includes(target.id))s.bannedIds.push(target.id);
    if(target.accountId){s.bannedAccounts||=[];if(!s.bannedAccounts.includes(target.accountId))s.bannedAccounts.push(target.accountId)}
    if(s.claim?.seatId===target.id)s.claim=null;
    s.message='Учасника виключено. Його фрагменти залишилися в рукописах.';
    s.revision++;return {state:s,events:[...events(),{type:'player_kicked',to:target.id}]};
  }
  if(v.type==='open_seat'&&host&&s.phase==='writing'&&target&&target.id!==player.id&&!online.has(target.id)){
    s.claim={seatId:target.id,code:crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),expiresAt:clock+10*60_000};
    s.revision++;return {state:s,events:events()};
  }
  if(v.type==='close_seat'&&host){s.claim=null;s.revision++;return {state:s,events:events()}}
  if(v.type==='vote_host'&&s.phase==='writing'&&!host&&s.hostOfflineSince>0&&clock-s.hostOfflineSince>=5*60_000&&!online.has(s.host)&&
    target&&online.has(target.id)&&!(s.bannedIds||[]).includes(target.id)&&online.has(player.id)){
    s.hostVotes||={};
    s.hostVotes[player.id]=target.id;
    const eligible=s.players.filter(p=>online.has(p.id)&&p.id!==s.host&&!(s.bannedIds||[]).includes(p.id));
    const votes=eligible.filter(p=>s.hostVotes[p.id]===target.id).length;
    if(votes>eligible.length/2&&eligible.length>0){s.host=target.id;s.hostOfflineSince=0;s.hostVotes={};s.claim=null;s.message='Нового ведучого обрано голосуванням.'}
    s.revision++;return {state:s,events:events()};
  }
  if(['pause','unpause','transfer_host','kick','open_seat','close_seat','vote_host','skip_slot'].includes(v.type))
    return {state:s,events:notice(player.id,'Цю дію зараз не дозволено.')};
  let error=null;
  if(v.type==='settings'&&s.phase==='lobby'&&player.id===s.host){
    const next=settingsFrom(v.settings,s.settings);
    if(next.maxPlayers<s.players.length)error='Ліміт менший за кількість учасників.';
    else if(next.questionSet==='custom'&&next.customQuestions.length<2)error='Потрібно хоча б два власні питання.';
    else {s.settings=next;s.revision++;}
  } else if((v.type==='start'||v.type==='again')&&player.id===s.host&&
           (s.phase==='lobby'||s.phase==='finished')){
    error=begin(s);
  } else if(v.type==='finish_early'&&player.id===s.host&&s.phase==='writing'){
    // Explicit host action preserves every committed fragment, including an incomplete current round.
    s.phase='finished';s.message='Випуск завершено достроково; збережено всі здані фрагменти.';s.revision++;
  } else if(v.type==='submit'){
    // Idempotency: the same packet can safely arrive after a lost acknowledgement.
    const prior=s.receipts?.[player.id];
    if(v.requestId&&prior?.requestId===v.requestId){
      return {state:s,events:[{type:'receipt',to:player.id,payload:prior}]};
    }
    error=submit(s,player,v);
    if(error&&v.requestId)return {state:s,events:[{type:'submission_rejected',to:player.id,payload:{requestId:v.requestId,reason:error}}]};
    if(!error&&v.requestId)return {state:s,events:[...events(),{type:'receipt',to:player.id,payload:s.receipts[player.id]}]};
  } else error='Дія недоступна.';
  return {state:s,events:error?notice(player.id,error):events()};
 }
};
export default module;
