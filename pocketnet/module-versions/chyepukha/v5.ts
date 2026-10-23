// ЧЕПУХА · authoritative PocketNet game. Keep snapshots immutable.
export const PROTOCOL_VERSION = 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
const BANK = {"characterArc":{"label":"Цілісна історія","questions":[{"prompt":"Хто стане головним героєм цієї історії?","guidance":"Представ одну головну дійову особу й одну характерну рису.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка одна звичка або особливість вирізняла героя?","guidance":"Опиши лише помітну рису, не запускаючи головні події.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де і за яких звичайних обставин ми вперше бачимо героя?","guidance":"Задай початкове місце та повсякденний стан.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Якого одного конкретного результату герой захотів досягти?","guidance":"Познач одну мету, не розповідаючи про її досягнення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Яка одна можливість наблизила героя до мети?","guidance":"Введи шанс, інструмент або помічника, але не руйнуй його.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яка перешкода вперше завадила намірам героя?","guidance":"Опиши нову перешкоду й її безпосередню дію.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Яка несподівана знахідка змінила уявлення героя про ситуацію?","guidance":"Додай один факт або поворот, не пояснюючи результат боротьби.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"На яку конкретну дію наважився герой?","guidance":"Опиши одне рішення або вчинок, не підбиваючи підсумків.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Який безпосередній наслідок мав цей вчинок?","guidance":"Покажи одну ціну рішення, не завершуючи всю історію.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Чим зрештою закінчилася історія героя?","guidance":"Заверши головну лінію й за бажанням додай один останній образ.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"collapsingPlan":{"label":"Ланцюг провалів","questions":[{"prompt":"Хто вирішив утнути щось ризиковане?","guidance":"Представ ініціатора майбутньої авантюри, без самого плану.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"У чому полягав один головний задум цієї людини?","guidance":"Поясни суть плану, не починаючи його виконання.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"У якому місці збиралися реалізувати задум?","guidance":"Опиши лише місце й одну цікаву деталь обстановки.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Який перший крок плану здавався найпростішим?","guidance":"Назви конкретну заплановану дію, поки все працює.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Яка одна випадковість уперше завадила плану?","guidance":"Додай зовнішню перешкоду, але не загальний крах.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яку конкретну помилку допустив сам герой?","guidance":"Покажи окремий хибний вчинок без опису повної катастрофи.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Що саме вийшло з-під контролю після помилок?","guidance":"Створи одну ескалацію проблеми без остаточного фіналу.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Як герой спробував виправити становище?","guidance":"Опиши одну спробу порятунку, не визначаючи успіх наперед.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яку безпосередню ціну довелося заплатити за спробу?","guidance":"Назви втрату, прикрість або компроміс.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Яким став остаточний результат усієї авантюри?","guidance":"Закрий історію конкретним наслідком і комічним післясмаком.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"detectiveCase":{"label":"Детективна справа","questions":[{"prompt":"Хто взявся розслідувати дивну справу?","guidance":"Представ розслідувача, не називаючи справжнього винуватця.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Який один випадок став початком розслідування?","guidance":"Опиши загадковий факт або злочин без розгадки.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де відбувся цей випадок або почався пошук?","guidance":"Опиши одне місце без появи головного доказу.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Який незвичайний слід знайшли спочатку?","guidance":"Додай одну спостережувану деталь без пояснення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Хто або що спочатку викликало підозру?","guidance":"Назви першого підозрюваного та одну підставу.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яку попередню версію висунув розслідувач?","guidance":"Сформулюй припущення, прямо залишаючи його неперевіреним.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Який новий доказ поставив першу версію під сумнів?","guidance":"Введи суперечливий факт, поки не називаючи розгадку.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Кого або що розкрили як справжнє джерело таємниці?","guidance":"Назви ключове відкриття без повного пояснення мотивів.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яка конкретна обставина пояснила це відкриття?","guidance":"Дай мотив або механіку без нового повороту.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Як остаточно завершилося розслідування?","guidance":"Покажи результат справи та останній виразний штрих.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"nightSurvival":{"label":"Ніч виживання","questions":[{"prompt":"Хто стане героєм однієї незвичайної ночі?","guidance":"Представ людину та її початковий стан.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка дрібна дивина насторожила героя на початку ночі?","guidance":"Опиши одну ознаку тривоги без відкритої загрози.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де герой опинився, коли настав вечір?","guidance":"Задай конкретний простір і умови.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Чого герой найбільше хотів у цю ніч?","guidance":"Назви просту мету або потребу, не досягаючи її.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Який сигнал уперше натякнув на близьку небезпеку?","guidance":"Додай один видимий чи чутний знак, не показуючи джерела.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яка конкретна небезпека наздогнала героя?","guidance":"Опиши близьке зіткнення, не завершаючи боротьбу.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Що герой несподівано зрозумів про цю небезпеку?","guidance":"Додай відкриття, не перетворюючи його на фінальне спасіння.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Яку дію герой зробив, щоб вибратися?","guidance":"Одна спроба вижити чи втекти без результату наперед.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Чим довелося ризикнути заради порятунку?","guidance":"Покажи безпосередню втрату чи жертву.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Що сталося з героєм до завершення ночі?","guidance":"Дай чітку розв'язку й тривожний або комічний післясмак.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"relationshipCrash":{"label":"Емоційний розлом","questions":[{"prompt":"Хто був першою людиною в цих стосунках?","guidance":"Представ одного персонажа та його рису без другої людини.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Хто став другою важливою людиною?","guidance":"Представ другого персонажа, не починаючи конфлікту.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"За яких обставин ці двоє зустрілися або зблизилися?","guidance":"Опиши одну сцену початку зв'язку.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Чого один із них найбільше очікував від стосунків?","guidance":"Назви одне бажання без сварки.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Яка невелика суперечність між ними вже існувала?","guidance":"Додай одну приховану проблему, поки не вибухає конфлікт.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Який випадок зробив суперечність очевидною?","guidance":"Покажи одну ситуацію або репліку, що виявляє проблему.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Яку межу чи умову хтось із них тепер озвучив?","guidance":"Зафіксуй одне важливе рішення без розриву чи примирення.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Яку конкретну спробу налагодити стосунки зробили?","guidance":"Опиши жест, дію чи розмову без оцінки її успіху.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Як інша людина відреагувала на цю спробу?","guidance":"Покажи відповідь без припущення, що примирення провалилося.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Якими ці стосунки залишилися наприкінці?","guidance":"Заверши емоційну лінію однозначним або відкритим фіналом.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"questAdventure":{"label":"Пригодницький квест","questions":[{"prompt":"Хто вирушить у незвичайну пригоду?","guidance":"Представ мандрівника та одну особливість.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яким був світ або край, у якому жив герой?","guidance":"Дай одну виразну рису світу без початку квесту.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Яка одна подія змусила героя вирушити в дорогу?","guidance":"Опиши заклик або привід без проходження шляху.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Якої конкретної мети прагнув досягти герой?","guidance":"Назви пункт або результат пригоди без його досягнення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Яку одну корисну річ чи союзника герой здобув у дорозі?","guidance":"Додай допоміжний ресурс без великої перемоги.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яка перша серйозна перешкода перекрила шлях?","guidance":"Опиши одне випробування без розв'язання.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Яке відкриття змінило значення пригоди?","guidance":"Додай одну несподівану правду без фіналу.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Як герой використав нову інформацію?","guidance":"Покажи одне рішення чи дію без остаточної перемоги.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яку ціну герой заплатив на шляху до мети?","guidance":"Покажи наслідок учинку без закриття всього квесту.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Чим закінчилася пригода і що стало з героєм?","guidance":"Заверши основну подорож та додай заключний образ.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"heistOperation":{"label":"Пограбування / операція","questions":[{"prompt":"Хто задумав ризиковану операцію?","guidance":"Представ організатора, не розкриваючи план.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Який один об'єкт або результат був метою операції?","guidance":"Назви ціль і причину її цінності, без виконання.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де планувалося провести операцію?","guidance":"Задай місце та особливість його захисту.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Яким способом збиралися дістатися до мети?","guidance":"Опиши одну основну тактику без початку провалу.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Який союзник чи інструмент був необхідний для плану?","guidance":"Додай один ресурс, не описуючи його втрати.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Який перший непередбачений збій стався під час операції?","guidance":"Додай конкретну перешкоду без загального краху.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Якою імпровізацією відповіли на цей збій?","guidance":"Опиши одну спробу, не оголошуючи операцію врятованою.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Що сталося в найважливіший момент операції?","guidance":"Створи кульмінаційну дію без фінального підсумку.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яку жертву чи втрату спричинив цей момент?","guidance":"Покажи одну ціну, не починаючи нову операцію.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Чим завершилася операція?","guidance":"Покажи успіх, поразку або неоднозначний результат.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"sciFiIncident":{"label":"Науково-фантастичний інцидент","questions":[{"prompt":"Хто став головним учасником незвичного експерименту?","guidance":"Представ героя або дослідника без появи аномалії.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка технологія чи система була в центрі роботи?","guidance":"Назви одну вигадану технологію та її нормальну функцію.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де проводили експеримент або використовували систему?","guidance":"Опиши місце без початку збою.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Яку одну дію збиралися виконати з технологією?","guidance":"Познач початкову мету процедури.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Що спочатку свідчило, що все відбувається нормально?","guidance":"Опиши одну ознаку стабільності без катастрофи.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Який перший помітний збій порушив роботу системи?","guidance":"Введи один конкретний збій без повної розгадки.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Що нового герой дізнався про природу збою?","guidance":"Додай одне відкриття без остаточного вирішення.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Яке термінове рішення прийняв герой?","guidance":"Покажи один вибір або вчинок без опису його наслідку.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яким став безпосередній наслідок цього рішення?","guidance":"Опиши одну втрату чи зміну без завершення всього світу.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Чим завершився інцидент і що змінилося після нього?","guidance":"Зафіксуй фінальний стан героя або світу.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"roadTrip":{"label":"Дорожня пригода","questions":[{"prompt":"Хто вирішив вирушити в подорож?","guidance":"Представ мандрівника без маршруту та пригод.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"Яка одна причина спонукала його їхати?","guidance":"Назви мотив без завершення пошуку.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Куди саме він збирався дістатися?","guidance":"Познач один пункт призначення.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"З чого почалася сама поїздка?","guidance":"Опиши спокійний початок та атмосферу без пригоди.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Який супутник, транспорт чи предмет супроводжував героя?","guidance":"Додай один елемент подорожі, не створюючи ще великої проблеми.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яка перша проблема завадила дорозі?","guidance":"Опиши одне дорожнє ускладнення без розв'язки.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Яка подія змусила інакше подивитися на мету поїздки?","guidance":"Створи один несподіваний поворот без нового фіналу.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Яким новим маршрутом чи способом герой вирішив рухатися?","guidance":"Опиши одне рішення про подальшу дорогу.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Що довелося залишити або чим пожертвувати дорогою?","guidance":"Покажи одну втрату або компроміс.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Чим зрештою закінчилася подорож?","guidance":"Дай фінальне прибуття, повернення або інший підсумок.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]},"courtroomScandal":{"label":"Суд і скандал","questions":[{"prompt":"Хто опинився в центрі майбутнього скандалу?","guidance":"Представ головну дійову особу та її суспільну роль.","creativeFreedom":"Не описуй основні події, конфлікт або фінал: вони з'являться пізніше.","stage":"Герой"},{"prompt":"У чому її звинуватили або який випадок викликав скандал?","guidance":"Сформулюй одне звинувачення без встановлення істини.","creativeFreedom":"Не запускай головну кризу й не переходь до наслідків.","stage":"Вихідні умови"},{"prompt":"Де відбувався публічний розгляд цієї справи?","guidance":"Опиши суд, залу чи інше місце без викриття.","creativeFreedom":"Не додавай наступних випробувань чи розв'язки.","stage":"Місце"},{"prompt":"Який перший аргумент прозвучав найпереконливіше?","guidance":"Назви одну позицію без остаточного рішення.","creativeFreedom":"Не описуй майбутню проблему, її причину чи результат.","stage":"Намір"},{"prompt":"Хто або що несподівано вплинуло на перебіг слухання?","guidance":"Введи нового свідка, документ або фактор.","creativeFreedom":"Не розв'язуй проблему й не завершуй історію завчасно.","stage":"Підготовка"},{"prompt":"Яка одна суперечність ускладнила справу?","guidance":"Покажи факт, що ставить під сумнів просту версію.","creativeFreedom":"Не додавай подальших великих поворотів чи фіналу.","stage":"Проблема"},{"prompt":"Що виявилося правдою, а що — помилкою?","guidance":"Розкрий ключовий факт без опису вироку.","creativeFreedom":"Не оголошуй остаточну перемогу, поразку або розв'язку.","stage":"Поворот"},{"prompt":"Який учинок змінив перебіг справи наприкінці розгляду?","guidance":"Опиши одну вирішальну дію без фінального результату.","creativeFreedom":"Не описуй віддалені наслідки чи фінальну долю.","stage":"Рішення"},{"prompt":"Яку ціну цей учинок мав для учасників?","guidance":"Дай людський або професійний наслідок, не завершуючи справу.","creativeFreedom":"Не підводь повний підсумок: останній етап ще попереду.","stage":"Наслідок"},{"prompt":"Який остаточний результат отримала ця справа?","guidance":"Покажи рішення й наслідки для головного героя.","creativeFreedom":"Не запускай нову сюжетну лінію — завершуй уже розпочату.","stage":"Фінал"}]}};
const GENRES = [{"id":"groundedDrama","label":"Приземлена драма"},{"id":"absurdComedy","label":"Абсурдна комедія"},{"id":"horror","label":"Горор"},{"id":"detectiveNoir","label":"Нуарний детектив"},{"id":"romanticMelodrama","label":"Романтична мелодрама"},{"id":"fantasyEpic","label":"Фентезійна епіка"},{"id":"sciFiParanoia","label":"Науково-фантастична параноя"},{"id":"cyberpunk","label":"Кіберпанк"},{"id":"cozyWhimsy","label":"Затишна дивина"},{"id":"postApocalypse","label":"Постапокаліпсис"},{"id":"mythicLegend","label":"Міф і легенда"},{"id":"satire","label":"Сатира"}];
const IDS = Object.keys(BANK);
const GENRE_IDS = GENRES.map(g => g.id);
const GENDERS = ['male','female','nonbinary','unspecified'];
const MAX_ANSWER = 800;
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
   settings:settingsFrom(payload?.settings||{}),round:0,total:0,sheets:[],submitted:{},receipts:{},message:''};
}
function events(){return [{type:'state'}];}
function notice(to,message){return [{type:'notice',to,payload:message}];}
function resolveQuestions(settings,id) {
 if(id==='custom') return settings.customQuestions.map(prompt=>({prompt,guidance:'Продовжуй історію саме з цього моменту.',creativeFreedom:'Додай несподівану деталь, не переповідай попередні сцени.'}));
 return BANK[id]?.questions||BANK.collapsingPlan.questions;
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
 s.round=0;s.submitted={};s.receipts={};s.phase='writing';s.message='';s.revision++;
 return null;
}
function viewForPlayer({state:s,player,players}){
 const p=s.players.find(x=>x.id===player.id);
 const connected=new Set(players.map(x=>x.id));
 const common={protocol:1,revision:s.revision,phase:s.phase,host:s.host,
   players:s.players.map(x=>({id:x.id,name:clean(x.name,32)||'Гравець',submitted:Boolean(s.submitted[x.id]),departed:!connected.has(x.id),verified:x.verified===true&&typeof x.accountId==='string',accountId:x.verified===true&&typeof x.accountId==='string'?x.accountId:null,avatar:x.verified===true&&typeof x.avatar==='string'?clean(x.avatar,32):null})),
   settings:s.settings,questionSets:questionOptions(),genres:genreOptions(),
   round:s.round,total:s.total,message:s.message||'',lastReceipt:p?(s.receipts?.[p.id]||null):null};
 if(!p) return common;
 if(s.phase==='writing'){
  const pi=s.players.findIndex(x=>x.id===p.id);
  if(pi<0)return common;
  const si=(pi-s.round%s.players.length+s.players.length)%s.players.length;
  const sheet=s.sheets[si],previous=sheet.fragments.at(-1);
  return {...common,sheet:{id:sheet.id,set:sheet.set,setLabel:BANK[sheet.set]?.label||'Свій набір',
    genre:sheet.genre,genreLabel:GENRES.find(x=>x.id===sheet.genre)?.label||s.settings.customGenre||'Свій жанр',
    starter:s.players.find(x=>x.id===sheet.starter)?.name||'Автор',gender:sheet.heroGender,heroAnchor:sheet.heroAnchor||'',
    question:resolveQuestions(s.settings,sheet.set)[s.round],nextQuestion:s.settings.showNextQuestion===false?'':(resolveQuestions(s.settings,sheet.set)[s.round+1]?.prompt||''),tail:previous?.tail||''},waiting:Boolean(s.submitted[p.id])};
 }
 if(s.phase==='finished')return {...common,stories:s.sheets.map(sh=>({
   id:sh.id,starter:s.players.find(x=>x.id===sh.starter)?.name||'Автор',
   setLabel:BANK[sh.set]?.label||'Свій набір',
   genre:GENRES.find(x=>x.id===sh.genre)?.label||s.settings.customGenre||'Свій жанр',
   heroGender:sh.heroGender,
   // Assemble the whole story client-side from fragments to avoid doubling wire bytes.
   fragments:sh.fragments.map((f,i)=>({question:resolveQuestions(s.settings,sh.set)[i]?.prompt||'',answer:f.answer,
      author:s.players.find(x=>x.id===f.by)?.name||'Автор'}))
 }))};
 return common;
}
function submit(s,player,v){
 if(v.requestId!==undefined&&(!/^[a-zA-Z0-9_-]{12,96}$/.test(v.requestId)))return 'Некоректний ідентифікатор відправки.';
 if(s.phase!=='writing'||s.submitted[player.id])return 'Відповідь уже прийнято або раунд завершено.';
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
 onJoin({state:s,players}){
  if(s.phase!=='lobby'){
   // The same durable player identity can reclaim a deliberately vacated seat.
   const seat=s.players.find(p=>p.id===players.at(-1)?.id);
   if(!seat)throw Error('match_in_progress');
   const current=players.find(p=>p.id===seat.id);
   if(current){seat.name=clean(current.name,24)||seat.name;seat.avatar=current.avatar||seat.avatar;}
   s.revision++;return {state:s,events:events()};
  }
  if(players.length>s.settings.maxPlayers)throw Error('room_full');
  s.players=entries(players);s.revision++;return {state:s,events:events()};
 },
 onLeave({state:s,players}){
  if(s.phase==='lobby'){
   s.players=entries(players);
   s.host=s.players.some(p=>p.id===s.host)?s.host:s.players[0]?.id||'';
  }else{
   // Never reset writing or discard a finished issue when someone exits.
   // Permanent seat IDs keep the sheet rotation stable after departures.
   s.message='Учасник від’єднався. Його місце та рукописи збережено.';
  }
  s.revision++;return {state:s,events:events()};
 },
 viewForPlayer,
 onMessage({state:s,player,payload}){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(v.type==='sync')return {state:s,events:events()};
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
    if(!error&&v.requestId)return {state:s,events:[...events(),{type:'receipt',to:player.id,payload:s.receipts[player.id]}]};
  } else error='Дія недоступна.';
  return {state:s,events:error?notice(player.id,error):events()};
 }
};
export default module;
