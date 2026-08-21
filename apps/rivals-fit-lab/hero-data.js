export const SNAPSHOT = Object.freeze({
  season: 'Season 9.5',
  date: '2026-08-20',
  heroCount: 53
});

export const AXES = Object.freeze({
  aim: { label: 'Точность', low: 'прощает промахи', high: 'точность решает' },
  range: { label: 'Дистанция', low: 'в упор', high: 'издалека' },
  mobility: { label: 'Мобильность', low: 'стоять и держать', high: 'постоянно двигаться' },
  aggression: { label: 'Инициатива', low: 'реагировать', high: 'начинать драку' },
  frontline: { label: 'Фронтлайн', low: 'вторая линия', high: 'быть под огнём' },
  support: { label: 'Поддержка', low: 'делать самому', high: 'спасать и усиливать' },
  utility: { label: 'Контроль', low: 'чистый урон', high: 'контроль и сейвы' },
  setup: { label: 'Подготовка', low: 'импровизация', high: 'заранее готовить сцену' },
  mechanics: { label: 'Механика', low: 'простая реализация', high: 'сложная техника' },
  tempo: { label: 'Темп', low: 'спокойные решения', high: 'высокий APM' },
  autonomy: { label: 'Автономность', low: 'играть от команды', high: 'сам искать возможности' },
  burst: { label: 'Тип урона', low: 'долго давить', high: 'взрывать окно' },
  brawl: { label: 'Ближний бой', low: 'не подпускать', high: 'лезть в мясо' }
});

const ROLE_BASE = {
  Vanguard: { aim:45, range:35, mobility:45, aggression:65, frontline:90, support:18, utility:65, setup:45, mechanics:55, tempo:60, autonomy:58, burst:55, brawl:75 },
  Duelist: { aim:60, range:55, mobility:60, aggression:70, frontline:25, support:5, utility:35, setup:40, mechanics:65, tempo:70, autonomy:72, burst:70, brawl:50 },
  Strategist: { aim:50, range:60, mobility:55, aggression:35, frontline:20, support:90, utility:75, setup:50, mechanics:60, tempo:65, autonomy:40, burst:40, brawl:25 },
  Flex: { aim:55, range:50, mobility:65, aggression:65, frontline:55, support:55, utility:60, setup:40, mechanics:85, tempo:80, autonomy:72, burst:65, brawl:60 }
};

const MODS = {
  adaptable:{mechanics:10,utility:8,autonomy:5}, 'self-sustain':{autonomy:14,frontline:9}, burst:{burst:18,aggression:5}, mobility:{mobility:16,tempo:8},
  dive:{mobility:22,aggression:18,autonomy:8,brawl:12,range:-18,setup:-10}, disrupt:{utility:16,aggression:5}, frontline:{frontline:12,brawl:8,range:-8},
  peel:{utility:18,support:5,aggression:-5}, brawl:{brawl:18,aggression:8,range:-12}, control:{utility:18,setup:8}, poke:{range:17,aim:9,brawl:-10},
  shield:{utility:14,frontline:10,support:4}, portal:{utility:20,setup:20,mechanics:12}, wall:{utility:16,setup:16}, setup:{setup:24,tempo:-8},
  'area-control':{utility:14,setup:14,range:4}, 'anti-dive':{utility:11,setup:10,aggression:-3}, sustain:{burst:-8,tempo:-3}, 'burst-heal':{support:10,burst:8},
  revive:{support:10,utility:8,setup:6}, utility:{utility:11}, stealth:{autonomy:14,mobility:8,setup:4}, save:{support:10,utility:11}, 'damage-boost':{support:7,utility:9},
  clones:{mechanics:14,setup:14,utility:9}, survival:{autonomy:9}, pick:{burst:14,aim:10,autonomy:8}, range:{range:16,aim:7}, melee:{brawl:23,range:-22,mechanics:3},
  'anti-heal':{utility:10}, flight:{mobility:14,range:11,mechanics:5}, flank:{autonomy:12,mobility:10,aggression:8}, 'sustain-damage':{burst:-18,aim:7,range:9},
  'anti-tank':{brawl:4,burst:-7}, turret:{setup:18,utility:10}, 'damage-support':{aim:8,range:8,aggression:8,support:-8}, 'tempo-support':{tempo:10,mobility:6},
  'main-support':{support:10,autonomy:-5}, 'main-tank':{frontline:10,autonomy:-4}, 'off-tank':{autonomy:6,range:6}, bruiser:{brawl:12,frontline:8,aggression:8}
};

const RAW_HEROES = [
  ['Deadpool','Flex','wildcard',['adaptable','self-sustain','burst','mobility'],5,{}],
  ['Angela','Vanguard','dive tank',['dive','mobility','disrupt','frontline'],4,{}],
  ['Captain America','Vanguard','dive tank',['dive','peel','mobility','frontline'],3,{aim:32}],
  ['Devil Dinosaur','Vanguard','brawl tank',['brawl','frontline','control','sustain'],2,{aim:28,mobility:38}],
  ['Doctor Strange','Vanguard','main tank',['shield','portal','control','frontline','main-tank'],4,{range:54}],
  ['Emma Frost','Vanguard','hybrid tank',['poke','control','frontline','anti-dive'],4,{brawl:52}],
  ['Groot','Vanguard','space tank',['wall','control','frontline','brawl'],3,{mobility:18,setup:82}],
  ['Hulk','Vanguard','dive tank',['dive','disrupt','mobility','frontline','melee'],4,{aggression:94}],
  ['Magneto','Vanguard','off tank',['shield','poke','peel','frontline','off-tank'],3,{mobility:28}],
  ['Peni Parker','Vanguard','setup tank',['setup','area-control','anti-dive','frontline'],4,{aggression:38,setup:98}],
  ['Rogue','Vanguard','brawl tank',['brawl','adaptable','sustain','frontline','mobility'],4,{range:28}],
  ['The Hood','Vanguard','gunner bruiser',['range','brawl','self-sustain','shield','burst','bruiser'],4,{frontline:76,aim:67,range:52}],
  ['The Thing','Vanguard','brawl tank',['brawl','peel','frontline','disrupt','melee'],2,{mobility:38,aim:25}],
  ['Thor','Vanguard','bruiser tank',['brawl','burst','dive','frontline','bruiser'],3,{mobility:62}],
  ['Venom','Vanguard','dive tank',['dive','mobility','disrupt','self-sustain','melee'],3,{autonomy:86}],

  ['Adam Warlock','Strategist','utility support',['burst-heal','revive','poke','utility'],4,{mobility:25,tempo:48}],
  ['Cloak & Dagger','Strategist','hybrid support',['sustain','control','area-control','utility','save'],3,{aim:28,mechanics:62}],
  ['Gambit','Strategist','tempo support',['sustain','poke','mobility','utility','tempo-support'],4,{burst:55,mechanics:74}],
  ['Invisible Woman','Strategist','control support',['shield','sustain','control','stealth','save'],4,{setup:68}],
  ['Jeff the Land Shark','Strategist','sustain support',['sustain','mobility','disrupt','save'],2,{aim:30,mechanics:34}],
  ['Jubilee','Strategist','tempo support',['sustain','burst','mobility','poke','tempo-support'],3,{aggression:48}],
  ['Loki','Strategist','trick support',['burst-heal','clones','utility','survival'],5,{mechanics:96,setup:82}],
  ['Luna Snow','Strategist','main support',['sustain','burst-heal','control','poke','main-support'],3,{aim:68}],
  ['Mantis','Strategist','buff support',['sustain','damage-boost','control','utility'],3,{aim:58}],
  ['Rocket Raccoon','Strategist','mobile support',['sustain','revive','mobility','utility'],3,{autonomy:46}],
  ['Ultron','Strategist','damage support',['poke','sustain','mobility','utility','damage-support','flight'],4,{support:67,autonomy:58}],
  ['White Fox','Strategist','tempo support',['sustain','mobility','damage-boost','utility','tempo-support'],4,{aggression:44}],

  ['Black Cat','Duelist','flanker',['dive','mobility','burst','pick','flank'],4,{range:28}],
  ['Black Panther','Duelist','diver',['dive','mobility','burst','melee'],5,{mechanics:96,tempo:94}],
  ['Black Widow','Duelist','precision',['poke','pick','range','mobility'],5,{aim:98,brawl:12}],
  ['Blade','Duelist','bruiser',['brawl','self-sustain','anti-heal','melee','bruiser'],4,{frontline:48}],
  ['Cyclops','Duelist','beam carry',['poke','burst','range','control'],4,{aim:80,mobility:42}],
  ['Daredevil','Duelist','skirmisher',['dive','mobility','pick','melee'],5,{mechanics:94}],
  ['Elsa Bloodstone','Duelist','hunter',['range','control','burst','anti-dive'],4,{setup:56}],
  ['Hawkeye','Duelist','sniper',['poke','pick','range','burst'],5,{aim:98,mobility:32,brawl:8}],
  ['Hela','Duelist','hitscan carry',['poke','burst','range','pick'],4,{aim:92,mobility:38}],
  ['Human Torch','Duelist','area damage',['area-control','mobility','burst','poke','flight'],4,{setup:62}],
  ['Iron Fist','Duelist','diver',['dive','mobility','self-sustain','melee'],4,{range:14}],
  ['Iron Man','Duelist','aerial carry',['flight','poke','burst','range'],3,{mobility:78,brawl:10}],
  ['Magik','Duelist','bruiser',['brawl','dive','self-sustain','melee','bruiser'],4,{frontline:46}],
  ['Mister Fantastic','Duelist','bruiser',['brawl','peel','control','self-sustain','bruiser'],4,{mobility:44,frontline:52}],
  ['Moon Knight','Duelist','area carry',['poke','area-control','burst','range'],3,{aim:46,setup:58}],
  ['Namor','Duelist','turret carry',['poke','setup','anti-dive','range','turret'],3,{mobility:28,setup:88}],
  ['Phoenix','Duelist','burst carry',['burst','poke','area-control','mobility'],4,{mechanics:76}],
  ['Psylocke','Duelist','assassin',['dive','stealth','burst','pick'],5,{mechanics:94}],
  ['Scarlet Witch','Duelist','control carry',['control','area-control','mobility','burst'],2,{aim:20,mechanics:30}],
  ['Spider-Man','Duelist','assassin',['dive','mobility','pick','melee'],5,{mechanics:100,tempo:98}],
  ['Squirrel Girl','Duelist','artillery',['poke','area-control','control','range'],2,{aim:42,mobility:34}],
  ['Star-Lord','Duelist','mobile hitscan',['mobility','burst','range','flank'],3,{aim:72,tempo:90}],
  ['Storm','Duelist','team carry',['flight','damage-boost','area-control','poke'],4,{support:28,autonomy:48}],
  ['The Punisher','Duelist','sustained carry',['range','sustain-damage','anti-tank','setup'],2,{mobility:30,burst:34}],
  ['Winter Soldier','Duelist','combo carry',['burst','control','pick','range'],4,{aim:78,mechanics:78}],
  ['Wolverine','Duelist','tank shredder',['brawl','anti-tank','self-sustain','melee'],4,{range:10,frontline:48,burst:40}]
];

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
const slugify = name => name.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function buildHeroVector(role, tags, difficulty, overrides) {
  const vector = { ...ROLE_BASE[role] };
  for (const tag of tags) {
    const mod = MODS[tag];
    if (!mod) continue;
    for (const [axis, delta] of Object.entries(mod)) vector[axis] = (vector[axis] ?? 50) + delta;
  }
  vector.mechanics += (difficulty - 3) * 9;
  for (const [axis, value] of Object.entries(overrides || {})) vector[axis] = value;
  for (const axis of Object.keys(AXES)) vector[axis] = clamp(vector[axis] ?? 50);
  return vector;
}

export const HEROES = RAW_HEROES.map(([name,role,archetype,tags,difficulty,overrides], index) => ({
  id: slugify(name), name, role, archetype, tags, difficulty, order:index,
  vector: buildHeroVector(role,tags,difficulty,overrides)
}));
