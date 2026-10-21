// One immutable achievement catalogue shared by the verified server and profile/game UIs.
// Only the PocketNet → Pocket Social internal channel can mint these entitlements.
export const zamazkaAchievements=[
 {id:'zamazka.first-stroke',name:'Первый мазок',tier:'Лёгкое',detail:'Заверши реставрацию минимум с 4 мазками.',reward:'Титул «Подмастерье»',slot:'title',item:'Подмастерье'},
 {id:'zamazka.sharp-eye',name:'Верный глаз',tier:'Лёгкое',detail:'Поставь все 3 фишки на правильный оригинал.',reward:'Монокль',slot:'face',item:'monocle'},
 {id:'zamazka.shared-canvas',name:'Общее дело',tier:'Среднее',detail:'Добавь 10 мазков на общем холсте вместе с другими.',reward:'Кисть за ухом',slot:'hat',item:'brush'},
 {id:'zamazka.three-rounds',name:'Трижды прозорливый',tier:'Среднее',detail:'Угадай хотя бы одну фишку в каждом из первых трёх раундов.',reward:'Титул «Знаток подделок»',slot:'title',item:'Знаток подделок'},
 {id:'zamazka.five-works',name:'Большая выставка',tier:'Среднее',detail:'Сдай работы во всех пяти раундах и заверши матч.',reward:'Фон «Галерея при свечах»',slot:'background',item:'gallery'},
 {id:'zamazka.perfect-forgery',name:'Ни следа оригинала',tier:'Сложное',detail:'Трое других игроков не угадают твою картину.',reward:'Рамка «Потёртая позолота»',slot:'portraitFrame',item:'worn-gilt'},
 {id:'zamazka.duo-detectives',name:'Двойной агент',tier:'Среднее',detail:'В матче вдвоём оба игрока угадают картины друг друга в одном раунде.',reward:'Титул «Двойной агент»',slot:'title',item:'Двойной агент'},
 {id:'zamazka.ghost-brush',name:'Призрачная кисть',tier:'Сложное',detail:'Все соперники (от одного до семи) проголосуют, но никто не обнаружит твою реставрацию.',reward:'Титул «Призрачная кисть»',slot:'title',item:'Призрачная кисть'},
 {id:'zamazka.eagle-eye',name:'Всевидящий',tier:'Сложное',detail:'В двух последовательных раундах найди хотя бы одну правильную картину каждого другого игрока.',reward:'Титул «Всевидящий»',slot:'title',item:'Всевидящий'},
 {id:'zamazka.three-theories',name:'Три версии',tier:'Среднее',detail:'Поставь по одной монете на три разные картины, включая верную.',reward:'Титул «Авантюрист»',slot:'title',item:'Авантюрист'},

 {id:'zamazka.maestro',name:'Маэстро Замазки',tier:'Легендарное',detail:'Единолично победи в матче из 5 раундов с 4+ игроками.',reward:'Мантия великого реставратора',slot:'clothes',item:'restorer'}
];
export const zamazkaAwardById=new Map(zamazkaAchievements.map(item=>[item.id,item]));
export const ownedAchievementItem=(id,items)=>zamazkaAchievements.some(a=>a.item===id&&items.includes(a.id));
