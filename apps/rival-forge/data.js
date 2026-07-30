export const SNAPSHOT = {
  season: 'Season 9',
  patch: '2026-07-30',
  label: 'S9 · 30 JUL 2026',
  sourceNote: 'Season 9 roster and selectable Team-Up loadout snapshot. Personal tiers, ratings and choices are stored only on this device.'
};

const portraitBase = 'https://rivalskins.com/wp-content/uploads/marvel-assets/assets/hero-icons-avatars/';
const slugify = name => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ROLE_COLORS = { Vanguard:'#ff6b4a', Duelist:'#9d65ff', Strategist:'#2dbf9f', Flex:'#f2bd31' };

const HERO_RAW = [
['Deadpool','Flex','A',86,'flex',['adaptable','self-sustain','burst','mobility'],4],
['Angela','Vanguard','A',84,'dive tank',['dive','mobility','disrupt','frontline'],4],
['Captain America','Vanguard','A',85,'dive tank',['dive','peel','mobility','frontline'],3],
['Devil Dinosaur','Vanguard','A',83,'brawl tank',['brawl','frontline','control','sustain'],2],
['Doctor Strange','Vanguard','S',92,'main tank',['shield','portal','control','frontline'],4],
['Emma Frost','Vanguard','A',88,'hybrid tank',['poke','control','frontline','anti-dive'],4],
['Groot','Vanguard','A',86,'space tank',['wall','control','frontline','brawl'],3],
['Hulk','Vanguard','A',84,'dive tank',['dive','disrupt','mobility','frontline'],4],
['Magneto','Vanguard','S',91,'off tank',['shield','poke','peel','frontline'],3],
['Peni Parker','Vanguard','A',87,'setup tank',['setup','area-control','anti-dive','frontline'],4],
['Rogue','Vanguard','S',90,'brawl tank',['brawl','adaptable','sustain','frontline'],4],
['The Thing','Vanguard','A',87,'brawl tank',['brawl','peel','frontline','disrupt'],2],
['Thor','Vanguard','A',86,'bruiser tank',['brawl','burst','dive','frontline'],3],
['Venom','Vanguard','A',85,'dive tank',['dive','mobility','disrupt','self-sustain'],3],
['Adam Warlock','Strategist','A',84,'utility support',['burst-heal','revive','poke','utility'],4],
['Cloak & Dagger','Strategist','S',93,'hybrid support',['sustain','cleanse','area-control','utility'],3],
['Gambit','Strategist','S',92,'tempo support',['sustain','poke','mobility','utility'],4],
['Invisible Woman','Strategist','S',94,'control support',['shield','sustain','control','stealth'],4],
['Jeff the Land Shark','Strategist','A',86,'sustain support',['sustain','mobility','disrupt','save'],2],
['Jubilee','Strategist','A',87,'tempo support',['sustain','burst','mobility','poke'],3],
['Loki','Strategist','A',85,'trick support',['burst-heal','clones','utility','survival'],5],
['Luna Snow','Strategist','S',91,'main support',['sustain','burst-heal','control','poke'],3],
['Mantis','Strategist','A',89,'buff support',['sustain','damage-boost','control','utility'],3],
['Rocket Raccoon','Strategist','A',86,'mobile support',['sustain','revive','mobility','utility'],3],
['Ultron','Strategist','A',85,'damage support',['poke','sustain','mobility','utility'],4],
['White Fox','Strategist','A',88,'tempo support',['sustain','mobility','damage-boost','utility'],4],
['Black Cat','Duelist','A',87,'flanker',['dive','mobility','burst','pick'],4],
['Black Panther','Duelist','A',84,'diver',['dive','mobility','burst','melee'],5],
['Black Widow','Duelist','A',86,'precision',['poke','pick','range','mobility'],5],
['Blade','Duelist','A',88,'bruiser',['brawl','self-sustain','anti-heal','melee'],4],
['Cyclops','Duelist','A',89,'beam carry',['poke','burst','range','control'],4],
['Daredevil','Duelist','A',86,'skirmisher',['dive','mobility','pick','melee'],5],
['Elsa Bloodstone','Duelist','A',87,'hunter',['range','control','burst','anti-dive'],4],
['Hawkeye','Duelist','A',85,'sniper',['poke','pick','range','burst'],5],
['Hela','Duelist','S',92,'hitscan carry',['poke','burst','range','pick'],4],
['Human Torch','Duelist','A',86,'area damage',['area-control','mobility','burst','poke'],4],
['Iron Fist','Duelist','B',80,'diver',['dive','mobility','self-sustain','melee'],4],
['Iron Man','Duelist','A',88,'aerial carry',['flight','poke','burst','range'],3],
['Magik','Duelist','A',87,'bruiser',['brawl','dive','self-sustain','melee'],4],
['Mister Fantastic','Duelist','S',93,'bruiser',['brawl','peel','control','self-sustain'],4],
['Moon Knight','Duelist','A',85,'area carry',['poke','area-control','burst','range'],3],
['Namor','Duelist','A',84,'turret carry',['poke','setup','anti-dive','range'],3],
['Phoenix','Duelist','S',91,'burst carry',['burst','poke','area-control','mobility'],4],
['Psylocke','Duelist','A',87,'assassin',['dive','stealth','burst','pick'],5],
['Scarlet Witch','Duelist','A',84,'control carry',['control','area-control','mobility','burst'],2],
['Spider-Man','Duelist','A',85,'assassin',['dive','mobility','pick','melee'],5],
['Squirrel Girl','Duelist','A',86,'artillery',['poke','area-control','control','range'],2],
['Star-Lord','Duelist','A',88,'mobile hitscan',['mobility','burst','range','flank'],3],
['Storm','Duelist','A',87,'team carry',['flight','damage-boost','area-control','poke'],4],
['The Punisher','Duelist','A',88,'sustained carry',['range','sustain-damage','anti-tank','setup'],2],
['Winter Soldier','Duelist','A',89,'combo carry',['burst','control','pick','range'],4],
['Wolverine','Duelist','A',86,'tank shredder',['brawl','anti-tank','self-sustain','melee'],4]
];
const aliasSlug = {'Cloak & Dagger':'cloak-and-dagger','Jeff the Land Shark':'jeff-the-land-shark','Mister Fantastic':'mister-fantastic','The Punisher':'the-punisher','The Thing':'the-thing'};
export const HEROES = HERO_RAW.map(([name,role,tier,power,archetype,tags,difficulty],order)=>{const id=aliasSlug[name]||slugify(name);return{id,name,role,roles:role==='Flex'?['Vanguard','Duelist','Strategist']:[role],tier,power,archetype,tags,difficulty,color:ROLE_COLORS[role],portrait:`${portraitBase}${id}_avatar.png`,order};});
export const HERO_BY_ID = Object.fromEntries(HEROES.map(hero=>[hero.id,hero]));

const T=(id,name,members,beneficiary,effect,tags=[],type='official')=>({id,name,members,beneficiary,effect,tags,type});
export const TEAM_UPS=[
T('mrs-x','MR. & MRS. X',['rogue','gambit'],'Rogue','Кинетическая связка для агрессивного brawl и взаимного темпа.',['brawl','sustain']),
T('explosive-entanglement','EXPLOSIVE ENTANGLEMENT',['rogue','magneto'],'Magneto','Взрывной контроль пространства вокруг фронтлайна.',['burst','frontline']),
T('voltaic-union','VOLTAIC UNION',['captain-america','thor'],'Captain America','Молниеносный вход и усиленное давление щитом.',['dive','burst']),
T('two-in-one','TWO-IN-ONE',['the-thing','human-torch'],'The Thing','Бен удерживает врагов в огненной зоне Джонни.',['brawl','area-control']),
T('gamma-maelstrom','GAMMA MAELSTROM',['doctor-strange','hulk'],'Doctor Strange','Гамма-вихрь усиливает наказание сгруппированных целей.',['control','burst']),
T('surf-turf','SURF & TURF',['devil-dinosaur','jeff-the-land-shark'],'Devil Dinosaur','Надёжный engage, спасение и sustain для динозавра.',['brawl','save']),
T('vibrant-vitality','VIBRANT VITALITY',['loki','mantis'],'Loki','Усиленная поддержка иллюзий и благословений.',['sustain','damage-boost']),
T('planet-x-pals','PLANET X PALS',['rocket-raccoon','groot'],'Rocket Raccoon','Безопасный урон и лечение из-за фронтлайна Грута.',['sustain','frontline']),
T('mammalian-bond','MAMMALIAN BOND',['rocket-raccoon','squirrel-girl'],'Rocket Raccoon','Технологическое усиление дальнего давления.',['poke','utility']),
T('favorable-odds','FAVORABLE ODDS',['gambit','magneto'],'Gambit','Карты поддерживают темп и фронтлайн Магнето.',['sustain','frontline']),
T('gods-thunder','GODS OF THUNDER',['storm','thor'],'Storm','Тор усиливает молнии и зонирование Шторм.',['area-control','burst']),
T('storming-ignition','STORMING IGNITION',['human-torch','storm'],'Human Torch','Ветер ускоряет распространение огненных зон.',['area-control','mobility']),
T('moonlit-slash','MOONLIT SLASH',['hawkeye','cloak-and-dagger'],'Hawkeye','Свет и тьма дают Хоукаю дополнительную безопасность.',['pick','survival']),
T('squirrel-missile','SQUIRREL MISSILE',['squirrel-girl','iron-man'],'Squirrel Girl','Управляемая ракета усиливает артиллерию.',['poke','burst']),
T('light-dark-darts','LIGHT & DARK DARTS',['psylocke','cloak-and-dagger'],'Psylocke','Гибкость и выживаемость при заходе в тыл.',['dive','survival']),
T('devilish-affair','DEVILISH AFFAIR',['daredevil','black-widow'],'Daredevil','Точная охота на изолированные цели.',['pick','mobility']),
T('hex-fireworks','HEX FIREWORKS',['scarlet-witch','jubilee'],'Scarlet Witch','Взрывное зонирование и самоподдержка.',['area-control','sustain']),
T('prehistoric-trap','PREHISTORIC TRAP',['elsa-bloodstone','devil-dinosaur'],'Elsa Bloodstone','Контроль превращается в гарантированный burst.',['control','burst']),
T('blast-slash','BLAST SLASH',['wolverine','cyclops'],'Wolverine','Циклоп расширяет reach Росомахи.',['brawl','anti-tank']),
T('kinetic-kin','KINETIC KIN',['cyclops','gambit'],'Cyclops','Карты усиливают мобильность и темп стрельбы.',['poke','mobility']),
T('pair-threes','PAIR OF THREES',['wolverine','gambit'],'Wolverine','Скорость, прыжок и лечение для долгого brawl.',['brawl','sustain']),
T('stark-protocol','STARK PROTOCOL',['iron-man','ultron'],'Iron Man','Общие системы усиливают воздушное давление.',['flight','poke']),
T('chilling-assault','CHILLING ASSAULT',['luna-snow','emma-frost'],'Emma Frost','Ледяное поле расширяет контроль фронтлайна.',['control','frontline']),
T('lucky-loan','LUCKY LOAN',['black-cat','white-fox'],'White Fox','Аура ускоряет погоню и темп фланга.',['mobility','damage-boost']),
T('guardian-deep','GUARDIAN OF THE DEEP',['venom','jeff-the-land-shark'],'Venom','Экстренное лечение и бонусное здоровье для dive.',['dive','sustain']),
T('cosmic-cyclone','COSMIC CYCLONE',['storm','adam-warlock'],'Adam Warlock','Астральная гармония и командная утилита.',['utility','area-control']),
T('blessing-kumiho','BLESSING OF THE KUMIHO',['white-fox','luna-snow'],'Luna Snow','Мобильность и темп поддержки.',['sustain','mobility']),
T('primal-punishment','PRIMAL PUNISHMENT',['devil-dinosaur','the-punisher'],'The Punisher','Длительный огонь поверх мощного фронтлайна.',['sustain-damage','frontline']),
T('deep-wrath','DEEP WRATH',['hela','namor'],'Namor','Призванное существо усиливает фокус целей.',['poke','burst']),
T('parker-power','PARKER POWER-UP',['peni-parker','spider-man'],'Spider-Man','Липкая бомба завершает dive-комбо.',['dive','burst']),
T('pool-toybox','MR. POOL’S TOY BOX',['deadpool','jeff-the-land-shark'],'Jeff the Land Shark','Карманная вселенная даёт спасение и хаос.',['save','utility']),
T('rocket-network','ROCKET NETWORK',['rocket-raccoon','mister-fantastic'],'Mister Fantastic','Технологии Ракеты добавляют Риду дальнюю опцию.',['brawl','utility']),
T('psionic-mayhem','PSIONIC MAYHEM',['invisible-woman','doctor-strange'],'Doctor Strange','Слой дополнительного контроля пространства.',['control','frontline']),
T('reed-sue','BAXTER CORE',['mister-fantastic','invisible-woman'],'Team','Рид занимает пространство, Сью прикрывает его вход и отход.',['brawl','peel','sustain'],'tactical'),
T('peni-punisher','FORTIFIED FIRING LINE',['peni-parker','the-punisher'],'Team','Мины и турельный огонь наказывают любой заход.',['setup','anti-dive'],'tactical'),
T('strange-hela','PORTAL EXECUTION',['doctor-strange','hela'],'Team','Порталы создают неожиданные углы для burst Хелы.',['pick','poke'],'tactical'),
T('cap-star','MOBILE COLLAPSE',['captain-america','star-lord'],'Team','Быстрая изоляция цели и безопасный выход.',['dive','pick'],'tactical'),
T('magneto-gambit','KINETIC FORTRESS',['magneto','gambit'],'Team','Стабильный фронтлайн, poke и высокий sustain.',['frontline','sustain'],'tactical'),
T('groot-cd','ROOTED SANCTUARY',['groot','cloak-and-dagger'],'Team','Стены создают безопасные зоны для лечения и контроля.',['frontline','area-control'],'tactical'),
T('venom-psy','BACKLINE PANIC',['venom','psylocke'],'Team','Веном выбивает cooldowns, Псайлок закрывает убийство.',['dive','pick'],'tactical'),
T('emma-punisher','DIAMOND BUNKER',['emma-frost','the-punisher'],'Team','Эмма контролирует линии, Каратель стреляет из безопасности.',['poke','frontline'],'tactical'),
T('rogue-gambit-tactical','HONEYMOON BRAWL',['rogue','gambit'],'Team','Самодостаточное brawl-ядро с хорошим покрытием ролей.',['brawl','sustain'],'tactical'),
T('reed-sue-gambit','FLEXIBLE FORTRESS',['mister-fantastic','invisible-woman','gambit'],'Team','Давление Рида прикрыто щитами, displacement и лечением.',['brawl','sustain','peel'],'tactical')
];

export const PRESETS=[
{id:'reed-sue',name:'Baxter Core',subtitle:'Рид + Сью, затем свободное продолжение',heroes:['mister-fantastic','invisible-woman']},
{id:'ranked',name:'Ranked 2–2–2',subtitle:'Стабильный фронтлайн, урон и sustain',heroes:['doctor-strange','magneto','hela','winter-soldier','invisible-woman','gambit']},
{id:'dive',name:'Dive Collapse',subtitle:'Быстрый вход и удаление цели',heroes:['captain-america','venom','psylocke','star-lord','luna-snow','rocket-raccoon']},
{id:'brawl',name:'Corner Brawl',subtitle:'Ближнее давление и слоёное лечение',heroes:['rogue','the-thing','mister-fantastic','blade','gambit','cloak-and-dagger']},
{id:'poke',name:'Long Sightline',subtitle:'Дальность, щиты и pick pressure',heroes:['doctor-strange','emma-frost','hela','hawkeye','invisible-woman','luna-snow']},
{id:'setup',name:'Fortified Setup',subtitle:'Закрыть точку и наказать dive',heroes:['peni-parker','magneto','the-punisher','namor','rocket-raccoon','mantis']}
];
export const TIERS=['S+','S','A','B','C','D'];
export const ROLE_ORDER=['Vanguard','Duelist','Strategist','Flex'];
export const ROLE_TARGETS={1:[0,1,0],2:[1,0,1],3:[1,1,1],4:[1,2,1],5:[2,1,2],6:[2,2,2]};
