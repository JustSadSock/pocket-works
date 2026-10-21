// Verified PocketNet achievements, displayed identically in Blockies and Pocket Social.
// Only PocketNet v3 metrics can unlock these profile items; no client-side granting.
export const blockiesAchievements=[
 {id:'blockies.first-lock',name:'Первый кирпич',tier:'Лёгкое',detail:'Уложи свою первую фигуру в сетевой партии.',reward:'Титул «Укладчик»',slot:'title',item:'Укладчик'},
 {id:'blockies.first-line',name:'Чистый ряд',tier:'Лёгкое',detail:'Лично замкни и очисти линию в онлайн-матче.',reward:'Титул «Ловец линий»',slot:'title',item:'Ловец линий'},
 {id:'blockies.ten-locks',name:'Твёрдая рука',tier:'Среднее',detail:'Выполни 10 успешных мгновенных сбросов за один раунд онлайн.',reward:'Пиксельный визор',slot:'face',item:'pixel-visor'},
 {id:'blockies.double',name:'Двойной шов',tier:'Среднее',detail:'Одной фигурой очисти сразу две или больше линий.',reward:'Головной убор «Тетрокепка»',slot:'hat',item:'block-cap'},
 {id:'blockies.duo',name:'Общий фундамент',tier:'Среднее',detail:'В матче вдвоём или больше каждый из двух участников уложит 3 фигуры, а команда очистит 3 линии.',reward:'Фон «Сетка»',slot:'background',item:'stack-grid'},
 {id:'blockies.quartet',name:'Полный комплект',tier:'Сложное',detail:'Вчетвером уложите хотя бы по 2 фигуры и очистите 6 линий в одном раунде, не теряя игроков.',reward:'Рамка «Схема»',slot:'portraitFrame',item:'circuit'},
 {id:'blockies.steadfast',name:'Несущая конструкция',tier:'Сложное',detail:'Вдвоём или больше очистите 20 линий, каждый уложив 8 фигур, без выхода игроков.',reward:'Куртка сборщика',slot:'clothes',item:'block-jacket'},
 {id:'blockies.master',name:'Архитекторы',tier:'Легендарное',detail:'Вместе очистите 40 линий; минимум двое должны уложить по 10 фигур без выхода участников.',reward:'Титул «Архитектор блоков»',slot:'title',item:'Архитектор блоков'}
];
export const blockiesAwardById=new Map(blockiesAchievements.map(a=>[a.id,a]));
