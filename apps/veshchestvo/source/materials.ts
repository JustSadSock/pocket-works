// @ts-nocheck
export const STATE = Object.freeze({ EMPTY:'empty', POWDER:'powder', LIQUID:'liquid', GAS:'gas', SOLID:'solid', BIO:'bio', ENERGY:'energy' });

const m = (id, key, name, state, color, props = {}) => ({
  id, key, name, state, color,
  density: props.density ?? ({gas:0.1, liquid:1, powder:1.3, solid:2.2, bio:1.1, energy:0.02}[state] ?? 0),
  viscosity: props.viscosity ?? (state === 'liquid' ? 0.35 : 0),
  cohesion: props.cohesion ?? 0,
  granularity: props.granularity ?? (state === 'powder' ? 0.8 : 0),
  heatCapacity: props.heatCapacity ?? 1,
  conductivity: props.conductivity ?? 0.12,
  meltingPoint: props.meltingPoint ?? null,
  boilingPoint: props.boilingPoint ?? null,
  ignitionPoint: props.ignitionPoint ?? null,
  flammability: props.flammability ?? 0,
  burnRate: props.burnRate ?? 0,
  transparency: props.transparency ?? 0,
  solubility: props.solubility ?? 0,
  acidity: props.acidity ?? 0,
  electrical: props.electrical ?? 0,
  strength: props.strength ?? (state === 'solid' ? 0.7 : 0),
  brittleness: props.brittleness ?? 0.1,
  corrosionResistance: props.corrosionResistance ?? 0.5,
  glow: props.glow ?? 0,
  toxicity: props.toxicity ?? 0,
  growth: props.growth ?? 0,
  phaseLow: props.phaseLow ?? null,
  phaseHigh: props.phaseHigh ?? null,
  tags: props.tags ?? [],
  hidden: props.hidden ?? false
});

export const BASE_MATERIALS = [
  m(0,'empty','Пустота',STATE.EMPTY,'#101311',{density:0, transparency:1, hidden:true}),
  m(1,'sand','Песок',STATE.POWDER,'#d3ad6c',{density:1.6,granularity:.95,heatCapacity:.8,meltingPoint:1500,phaseHigh:'glass'}),
  m(2,'soil','Земля',STATE.POWDER,'#70513d',{density:1.35,granularity:.75,cohesion:.2,growth:.25}),
  m(3,'salt','Соль',STATE.POWDER,'#e8e1d2',{density:2.1,granularity:.9,solubility:1,meltingPoint:801,phaseHigh:'liquid-metal'}),
  m(4,'sugar','Сахар',STATE.POWDER,'#f5ead0',{density:1.55,granularity:.8,solubility:1,ignitionPoint:186,flammability:.45,burnRate:.4}),
  m(5,'coal','Уголь',STATE.POWDER,'#2d2b29',{density:1.4,granularity:.55,ignitionPoint:360,flammability:.85,burnRate:.2}),
  m(6,'gunpowder','Порох',STATE.POWDER,'#45433d',{density:1.2,granularity:.8,ignitionPoint:170,flammability:1,burnRate:1,tags:['explosive']}),
  m(7,'ash','Пепел',STATE.POWDER,'#8d8b83',{density:.55,granularity:.7}),
  m(8,'snow','Снег',STATE.POWDER,'#edf5f7',{density:.35,granularity:.7,meltingPoint:0,phaseHigh:'water',heatCapacity:2}),
  m(9,'metal-powder','Металлический порошок',STATE.POWDER,'#8f9798',{density:4,granularity:.65,electrical:.85,conductivity:.8,meltingPoint:1100,phaseHigh:'liquid-metal',corrosionResistance:.45}),

  m(10,'water','Вода',STATE.LIQUID,'#4f8fb9',{density:1,viscosity:.12,heatCapacity:4.2,conductivity:.25,meltingPoint:0,boilingPoint:100,phaseLow:'ice',phaseHigh:'steam',transparency:.45}),
  m(11,'oil','Масло',STATE.LIQUID,'#6d5629',{density:.82,viscosity:.45,ignitionPoint:210,flammability:.9,burnRate:.25}),
  m(12,'acid','Кислота',STATE.LIQUID,'#a5c35b',{density:1.12,viscosity:.16,acidity:1,toxicity:.7}),
  m(13,'alkali','Щёлочь',STATE.LIQUID,'#c5b8e8',{density:1.08,viscosity:.18,acidity:-1,toxicity:.45}),
  m(14,'lava','Лава',STATE.LIQUID,'#e65f2d',{density:2.8,viscosity:.62,heatCapacity:1.2,conductivity:.55,glow:1,phaseLow:'stone',meltingPoint:760,temperature:1150}),
  m(15,'liquid-metal','Жидкий металл',STATE.LIQUID,'#d5c3a8',{density:6.5,viscosity:.42,conductivity:.95,electrical:1,glow:.45,phaseLow:'metal',meltingPoint:660}),
  m(16,'fuel','Топливо',STATE.LIQUID,'#d3a633',{density:.76,viscosity:.12,ignitionPoint:55,flammability:1,burnRate:.7,tags:['explosive']}),
  m(17,'alcohol','Спирт',STATE.LIQUID,'#b7d7dc',{density:.79,viscosity:.08,ignitionPoint:22,boilingPoint:78,flammability:1,burnRate:.55,transparency:.7,phaseHigh:'flammable-gas'}),
  m(18,'resin','Смола',STATE.LIQUID,'#8f4b25',{density:1.1,viscosity:.9,ignitionPoint:260,flammability:.55,burnRate:.15,phaseLow:'rubber'}),

  m(19,'air','Воздух',STATE.GAS,'#9fc2ca',{density:.1,transparency:.98,hidden:false}),
  m(20,'steam','Пар',STATE.GAS,'#d6e7e9',{density:.06,heatCapacity:2,conductivity:.15,phaseLow:'water',boilingPoint:99,transparency:.7}),
  m(21,'smoke','Дым',STATE.GAS,'#565b57',{density:.08,toxicity:.35,transparency:.35}),
  m(22,'oxygen','Кислород',STATE.GAS,'#8fc6df',{density:.11,transparency:.92}),
  m(23,'co2','Углекислый газ',STATE.GAS,'#b3aca4',{density:.16,transparency:.9}),
  m(24,'flammable-gas','Горючий газ',STATE.GAS,'#d6bf72',{density:.07,ignitionPoint:120,flammability:1,burnRate:.8,tags:['explosive']}),
  m(25,'toxic-gas','Токсичный газ',STATE.GAS,'#9cb45a',{density:.13,toxicity:1,transparency:.65}),
  m(26,'cold-gas','Холодный газ',STATE.GAS,'#9ed5e7',{density:.09,transparency:.7}),
  m(27,'plasma','Плазма',STATE.GAS,'#f2d0a5',{density:.02,conductivity:1,electrical:1,glow:1,temperature:2200}),

  m(28,'stone','Камень',STATE.SOLID,'#68665f',{density:2.6,strength:.82,brittleness:.32,conductivity:.35,meltingPoint:1200,phaseHigh:'lava'}),
  m(29,'glass','Стекло',STATE.SOLID,'#92b3b0',{density:2.5,strength:.62,brittleness:.95,transparency:.72,meltingPoint:1450,phaseHigh:'lava'}),
  m(30,'ice','Лёд',STATE.SOLID,'#a8d2df',{density:.92,strength:.45,brittleness:.65,meltingPoint:0,phaseHigh:'water',transparency:.55}),
  m(31,'wood','Дерево',STATE.SOLID,'#7e5436',{density:.7,strength:.52,brittleness:.35,ignitionPoint:300,flammability:.9,burnRate:.18}),
  m(32,'metal','Металл',STATE.SOLID,'#8a9295',{density:7.2,strength:.9,brittleness:.18,conductivity:.9,electrical:1,meltingPoint:1100,phaseHigh:'liquid-metal',corrosionResistance:.5}),
  m(33,'copper','Медь',STATE.SOLID,'#b76a3b',{density:8.9,strength:.7,brittleness:.12,conductivity:1,electrical:1,meltingPoint:1085,phaseHigh:'liquid-metal',corrosionResistance:.65}),
  m(34,'rubber','Резина',STATE.SOLID,'#3c3733',{density:1.1,strength:.35,brittleness:.05,electrical:0,conductivity:.04,ignitionPoint:320,flammability:.55,burnRate:.15}),
  m(35,'concrete','Бетон',STATE.SOLID,'#8c8a83',{density:2.4,strength:.86,brittleness:.6,conductivity:.28}),
  m(36,'ceramic','Керамика',STATE.SOLID,'#d0c1a4',{density:2.2,strength:.73,brittleness:.85,conductivity:.15,meltingPoint:1700}),
  m(37,'wax','Воск',STATE.SOLID,'#d8bd75',{density:.9,strength:.22,brittleness:.2,meltingPoint:62,phaseHigh:'resin',ignitionPoint:200,flammability:.8,burnRate:.2}),
  m(38,'explosive','Взрывчатое вещество',STATE.SOLID,'#a17a50',{density:1.5,strength:.4,brittleness:.25,ignitionPoint:190,flammability:1,burnRate:1,tags:['explosive']}),

  m(39,'plant','Растение',STATE.BIO,'#4e8a50',{density:.6,strength:.2,ignitionPoint:180,flammability:.75,burnRate:.16,growth:.8}),
  m(40,'seed','Семя',STATE.BIO,'#987447',{density:1.1,granularity:.6,growth:1}),
  m(41,'fungus','Грибок',STATE.BIO,'#a78c79',{density:.7,growth:.85,toxicity:.1}),
  m(42,'biofilm','Бактерия / биоплёнка',STATE.BIO,'#6b9a78',{density:.9,growth:1,toxicity:.25}),
  m(43,'organic','Органический материал',STATE.BIO,'#8f4f4c',{density:1.05,ignitionPoint:180,flammability:.6,burnRate:.18,growth:.1}),
  m(44,'parasite','Паразитическая масса',STATE.BIO,'#74455f',{density:1,growth:1,toxicity:.75,ignitionPoint:160,flammability:.55,burnRate:.2}),

  m(45,'fire','Пламя',STATE.ENERGY,'#f5a33f',{density:.01,glow:1,hidden:true}),
  m(46,'spark','Искра',STATE.ENERGY,'#fff0a8',{density:.01,glow:1,electrical:1,hidden:true}),
  m(47,'brine','Соляной раствор',STATE.LIQUID,'#6fa1b0',{density:1.18,viscosity:.14,electrical:.75,hidden:true}),
  m(48,'syrup','Сахарный раствор',STATE.LIQUID,'#9b7143',{density:1.25,viscosity:.42,hidden:true}),
  m(49,'rust','Ржавчина',STATE.POWDER,'#9b4f2c',{density:2.1,granularity:.5,hidden:true}),
  m(50,'neutral-solution','Нейтральный раствор',STATE.LIQUID,'#92aeb0',{density:1.05,viscosity:.15,hidden:true})
];

export const MATERIAL_BY_KEY = new Map(BASE_MATERIALS.map(item => [item.key, item]));
export const MATERIAL_BY_ID = new Map(BASE_MATERIALS.map(item => [item.id, item]));
export const CATEGORIES = [
  {id:'powder',name:'Сыпучие'}, {id:'liquid',name:'Жидкости'}, {id:'gas',name:'Газы'},
  {id:'solid',name:'Твёрдые'}, {id:'bio',name:'Живые'}
];
export const MATERIAL_VERSION = 1;
