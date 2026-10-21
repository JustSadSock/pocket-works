// PocketWorks CANTICA catalogue: reward IDs and profile slots are stable entitlements.
export const canticaAchievements=Object.freeze([
 {id:'cantica.first-light',name:'Первый луч',tier:'Начало',detail:'Освети первое окно.',reward:'Титул «Проводник света»',slot:'title',item:'Проводник света'},
 {id:'cantica.precision',name:'Точная огранка',tier:'Мастерство',detail:'Пройди окно за 12 поворотов или меньше.',reward:'Титул «Ювелир витража»',slot:'title',item:'Ювелир витража'},
 {id:'cantica.ten',name:'Малый свод',tier:'Путь',detail:'Освети 10 разных окон.',reward:'Титул «Витражист»',slot:'title',item:'Витражист'},
 {id:'cantica.twenty-five',name:'Капелла',tier:'Путь',detail:'Освети 25 разных окон.',reward:'Фон «Лунная часовня»',slot:'background',item:'chapel'},
 {id:'cantica.fifty',name:'Золотая роза',tier:'Путь',detail:'Освети 50 разных окон.',reward:'Рамка «Роза собора»',slot:'portraitFrame',item:'rose-window'},
 {id:'cantica.hundred',name:'Хранитель сводов',tier:'Редкое',detail:'Освети 100 разных окон.',reward:'Титул «Хранитель света»',slot:'title',item:'Хранитель света'},
 {id:'cantica.seven',name:'Семь граней',tier:'Редкое',detail:'Освети окно 7×7.',reward:'Венец «Солнечная роза»',slot:'hat',item:'solar-circlet'},
 {id:'cantica.four-altars',name:'Четыре алтаря',tier:'Редкое',detail:'Одновременно освети все четыре реликвария.',reward:'Наплечный солнечный кристалл',slot:'accessory',item:'sun-crystal'},
 {id:'cantica.complete',name:'Великая книга',tier:'Легендарное',detail:'Освети все 500 разных окон.',reward:'Мантия иллюминатора',slot:'clothes',item:'illuminator'}
]);
export const canticaAwardById=new Map(canticaAchievements.map(a=>[a.id,a]));
export const canticaOwns=(item,slot,unlocks)=>canticaAchievements.some(a=>a.slot===slot&&a.item===item&&unlocks.includes(a.id));
