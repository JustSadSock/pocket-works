// Historical equipment profiles are explicit modelling assumptions, not national modifiers.
// Base type remains stable for doctrine, command and UI compatibility.
export const historicalProfiles={
 fyrd:{base:"militia",organization:"levy",weapon:"spear",shield:"round",helmet:"nasal",protection:"textile",experience:"mixed",physics:{armor:.12,discipline:.65,reach:2.1,skill:.72}},
 huscarl:{base:"sword",organization:"retinue",weapon:"axe",shield:"round",helmet:"nasal",protection:"mail",experience:"veteran",physics:{armor:.36,discipline:1.12,reach:1.5,skill:1.18}},
 earlySpear:{base:"spear",organization:"retinue",weapon:"spear",shield:"round",helmet:"nasal",protection:"mail",experience:"mixed",physics:{armor:.24,reach:2.5}},
 earlyRider:{base:"knight",organization:"retinue",weapon:"lance",shield:"round",helmet:"nasal",protection:"mail",experience:"trained",physics:{armor:.38,reach:2.2,speed:4.95}},
 normanRider:{base:"knight",organization:"feudal",weapon:"lance",shield:"kite",helmet:"nasal",protection:"mail",experience:"trained",physics:{armor:.43,reach:2.5,speed:4.8}},
 normanFoot:{base:"spear",organization:"feudal",weapon:"spear",shield:"kite",helmet:"nasal",protection:"mail",experience:"mixed",physics:{armor:.28,reach:2.5}},
 shortBow:{base:"archer",organization:"contingent",weapon:"bow",shield:"none",helmet:"cap",protection:"textile",experience:"mixed",physics:{range:135,ammo:22,reload:5}},
 horseBow:{base:"horseArcher",organization:"retinue",weapon:"compositeBow",shield:"round",helmet:"cap",protection:"textile",experience:"trained",physics:{range:145,ammo:26,reload:5.5,armor:.14}},
 lightRider:{base:"lightHorse",organization:"contingent",weapon:"spear",shield:"round",helmet:"nasal",protection:"mail",experience:"mixed",physics:{armor:.23,speed:5.6,reach:2}},
 communalSpear:{base:"spear",organization:"communal",weapon:"spear",shield:"round",helmet:"kettle",protection:"textile",experience:"mixed",physics:{armor:.18,discipline:.83,reach:2.7}},
 schiltron:{base:"pike",organization:"dense-infantry",weapon:"pike",shield:"none",helmet:"kettle",protection:"textile",experience:"trained",physics:{armor:.19,reach:3.7,discipline:1.13,speed:1.3}},
 feudalKnight:{base:"knight",organization:"banner",weapon:"lance",shield:"heater",helmet:"greathelm",protection:"mail",experience:"trained",caparison:true,physics:{armor:.49,reach:2.6,speed:4.7}},
 crossbowman:{base:"crossbow",organization:"contingent",weapon:"crossbow",shield:"none",helmet:"kettle",protection:"textile",experience:"trained",physics:{armor:.18,range:150,ammo:20}},
 longbowman:{base:"archer",organization:"retinue",weapon:"longbow",shield:"none",helmet:"kettle",protection:"textile",experience:"trained",physics:{range:185,ammo:24,reload:4.8,skill:.98}},
 plateFoot:{base:"sword",organization:"retinue",weapon:"poleaxe",shield:"none",helmet:"bascinet",protection:"plate",experience:"trained",physics:{armor:.63,reach:1.65,speed:1.35,discipline:1.03}},
 plateRider:{base:"knight",organization:"banner",weapon:"lance",shield:"heater",helmet:"bascinet",protection:"plate",experience:"trained",caparison:true,physics:{armor:.64,reach:2.65,speed:4.55}},
 lateLight:{base:"lightHorse",organization:"banner",weapon:"spear",shield:"round",helmet:"bascinet",protection:"mail",experience:"trained",physics:{armor:.27,speed:5.5,reach:2.2}},
 lateHorseBow:{base:"horseArcher",organization:"contingent",weapon:"compositeBow",shield:"round",helmet:"cap",protection:"textile",experience:"trained",physics:{range:145,ammo:24,reload:5.5}}
};
export function profileFor(id,side,type,name){
 if(type==="guard")return null;
 if(id==="hastings")return type==="knight"?"normanRider":type==="archer"?"shortBow":side===0?(type==="sword"?"huscarl":type==="militia"?"fyrd":null):type==="spear"?"normanFoot":null;
 if(id==="lechfeld")return ({knight:"earlyRider",horseArcher:"horseBow",lightHorse:"lightRider",spear:"earlySpear",archer:"shortBow",militia:"fyrd"})[type]||null;
 if(id==="bannockburn")return ({pike:"schiltron",spear:"communalSpear",archer:"shortBow",knight:"feudalKnight",lightHorse:"lightRider"})[type]||null;
 if(id==="bouvines")return ({spear:"communalSpear",knight:"feudalKnight",crossbow:"crossbowman",lightHorse:"lightRider"})[type]||null;
 if(id==="agincourt"||id==="grunwald")return ({sword:"plateFoot",knight:"plateRider",archer:id==="agincourt"&&side===0?"longbowman":"shortBow",crossbow:"crossbowman",lightHorse:"lateLight",horseArcher:"lateHorseBow",spear:"communalSpear"})[type]||null;
 return null
}
const resolved=new WeakMap();
export function troopSpec(types,u){let base=types[u.type],p=historicalProfiles[u.profile];if(u.customSpec)return {...base,...(p?.base===u.type?p.physics:{}),...u.customSpec,name:u.historicalName||p?.name||base.name};if(!p||p.base!==u.type)return base;let map=resolved.get(types);if(!map){map=new Map();resolved.set(types,map)}if(!map.has(u.profile))map.set(u.profile,Object.freeze({...base,...p.physics,name:p.name||base.name}));return map.get(u.profile)}

// Explicit model values, not reconstructed measurements. Lengths in metres, mass in kg.
const arms=(length,space,ranks,shield,mass,sidearm)=>({length,space,ranks,shield,mass,sidearm});
export const antiquityProfiles={
 hoplite:{base:"spear",name:"Гоплиты",weapon:"dory",shield:"round",helmet:"attic",protection:"bronze",organization:"lochos",physics:{reach:2.4,armor:.28,speed:1.45,discipline:1,arms:arms(2.4,1.05,2,.68,17, .75)}},
 sarissa:{base:"pike",name:"Сариссофоры",weapon:"sarissa",shield:"smallRound",helmet:"phrygian",protection:"textile",organization:"taxis",physics:{reach:4.5,armor:.18,speed:1.32,discipline:1.12,arms:arms(4.5,1.02,4.5,.25,15,.65)}},
 hypaspist:{base:"spear",name:"Гипасписты",weapon:"spear",shield:"round",helmet:"phrygian",protection:"textile",organization:"guardFoot",physics:{reach:2.4,armor:.28,skill:1.12,speed:1.55,arms:arms(2.4,1.15,2,.54,13,.75)}},
 peltast:{base:"archer",name:"Пельтасты",weapon:"javelin",shield:"smallRound",helmet:"cap",protection:"textile",organization:"lightFoot",physics:{range:42,ammo:5,reload:7,reach:1.1,speed:1.85,armor:.09,arms:arms(1.1,1.5,1,.3,6,.7)}},
 javelin:{base:"archer",name:"Метатели дротиков",weapon:"javelin",shield:"smallRound",helmet:"cap",protection:"textile",organization:"lightFoot",physics:{range:38,ammo:4,reload:6,reach:1,speed:1.95,armor:.07,arms:arms(1,1.5,1,.25,5,.65)}},
 slinger:{base:"archer",name:"Пращники",weapon:"sling",shield:"none",helmet:"cap",protection:"textile",organization:"lightFoot",physics:{range:145,ammo:28,reload:6,reach:.7,speed:1.85,armor:.05,arms:arms(.7,1.7,1,0,4,.6)}},
 cretan:{base:"archer",name:"Критские лучники",weapon:"bow",shield:"smallRound",helmet:"cap",protection:"textile",organization:"lightFoot",physics:{range:150,ammo:24,reload:5,reach:.8,armor:.09,arms:arms(.8,1.5,1,.15,6,.65)}},
 thessalian:{base:"knight",name:"Фессалийские всадники",weapon:"lance",shield:"none",helmet:"boeotian",protection:"textile",organization:"squadron",physics:{reach:2.4,armor:.22,speed:5.1,arms:arms(2.4,1.7,1,0,9,.8)}},
 companion:{base:"knight",name:"Гетайры",weapon:"xyston",shield:"none",helmet:"boeotian",protection:"bronze",organization:"ile",physics:{reach:3.1,armor:.30,speed:4.9,skill:1.25,arms:arms(3.1,1.8,1,0,12,.8)}},
 persianFoot:{base:"spear",name:"Персидская пехота",weapon:"spear",shield:"wicker",helmet:"cap",protection:"textile",organization:"contingent",physics:{reach:2,armor:.13,speed:1.6,arms:arms(2,1.35,1.5,.38,8,.75)}},
 persianHorse:{base:"knight",name:"Персидская конница",weapon:"spear",shield:"smallRound",helmet:"cap",protection:"scale",organization:"contingent",physics:{reach:2.2,armor:.29,speed:5.1,arms:arms(2.2,1.8,1,.18,10,.7)}},
 saka:{base:"horseArcher",name:"Конные стрелки",weapon:"compositeBow",shield:"none",helmet:"cap",protection:"textile",organization:"contingent",physics:{range:130,ammo:25,reload:5.5,armor:.12,arms:arms(.8,1.8,1,0,7,.65)}},
 hastati:{base:"sword",name:"Гастаты",weapon:"gladius",shield:"scutum",helmet:"montefortino",protection:"bronze",organization:"maniple",physics:{reach:.95,armor:.23,speed:1.62,arms:arms(.95,1.45,1,.65,12,.8)}},
 principes:{base:"sword",name:"Принципы",weapon:"gladius",shield:"scutum",helmet:"montefortino",protection:"mail",organization:"maniple",physics:{reach:.95,armor:.33,speed:1.53,skill:1.18,arms:arms(.95,1.45,1,.65,17,.8)}},
 triarii:{base:"spear",name:"Триарии",weapon:"hasta",shield:"scutum",helmet:"montefortino",protection:"mail",organization:"maniple",physics:{reach:2.3,armor:.36,speed:1.4,discipline:1.15,arms:arms(2.3,1.3,2,.65,17,.8)}},
 velites:{base:"archer",name:"Велиты",weapon:"javelin",shield:"round",helmet:"cap",protection:"textile",organization:"lightFoot",physics:{range:38,ammo:5,reload:6,armor:.07,speed:1.95,arms:arms(1,1.55,1,.3,6,.7)}},
 romanHorse:{base:"lightHorse",name:"Римская и союзная конница",weapon:"spear",shield:"round",helmet:"montefortino",protection:"mail",organization:"turma",physics:{reach:2,armor:.23,speed:5.1,arms:arms(2,1.8,1,.28,12,.7)}},
 libyan:{base:"spear",name:"Ливийская тяжёлая пехота",weapon:"spear",shield:"round",helmet:"attic",protection:"mail",organization:"contingent",physics:{reach:2.2,armor:.30,skill:1.18,discipline:1.12,arms:arms(2.2,1.2,2,.55,15,.8)}},
 iberian:{base:"sword",name:"Иберийская пехота",weapon:"sword",shield:"smallRound",helmet:"cap",protection:"textile",organization:"contingent",physics:{reach:1.05,armor:.15,speed:1.75,arms:arms(1.05,1.4,1,.3,8,.8)}},
 gallic:{base:"sword",name:"Галльская пехота",weapon:"longSword",shield:"oval",helmet:"cap",protection:"textile",organization:"contingent",physics:{reach:1.2,armor:.12,speed:1.7,arms:arms(1.2,1.6,1,.47,9,.8)}},
 numidian:{base:"horseArcher",name:"Нумидийские всадники",weapon:"javelin",shield:"round",helmet:"cap",protection:"textile",organization:"contingent",physics:{range:36,ammo:6,reload:6,armor:.04,speed:5.9,arms:arms(.95,1.8,1,.2,4,.65)}},
 punicHorse:{base:"knight",name:"Иберо-галльская конница",weapon:"spear",shield:"oval",helmet:"cap",protection:"mail",organization:"contingent",physics:{reach:2,armor:.24,speed:5,arms:arms(2,1.8,1,.25,10,.8)}},
 elephant:{base:"knight",name:"Боевые слоны",weapon:"spear",shield:"none",helmet:"cap",protection:"textile",organization:"elephantDetachment",physics:{reach:2.8,armor:.20,speed:3.1,skill:.92,discipline:.72,morale:88,attack:2.1,mount:"elephant",crew:3,teamGap:5.5,depthGap:7,bodyMass:11,turnRate:.18,arms:arms(2.8,3,1,0,11,.8)}},
 chariot:{base:"lightHorse",name:"Серпоносные колесницы",weapon:"spear",shield:"none",helmet:"cap",protection:"scale",organization:"chariotDetachment",physics:{reach:2.1,armor:.17,speed:5.4,skill:.85,discipline:.75,morale:80,attack:1.75,mount:"chariot",crew:2,teamGap:4.5,depthGap:6,bodyMass:5,turnRate:.23,arms:arms(2.1,3,1,0,8,.65)}},
 lateSarissa:{base:"pike",name:"Антигонидские фалангиты",weapon:"sarissa",shield:"smallRound",helmet:"phrygian",protection:"textile",organization:"taxis",physics:{reach:4.8,armor:.23,speed:1.27,discipline:1.1,arms:arms(4.8,1.02,5,.25,17,.65)}},
 ancientGuard:{base:"guard",name:"Командир и свита",weapon:"spear",shield:"round",helmet:"attic",protection:"bronze",organization:"command",physics:{reach:2,armor:.28,speed:3.6,arms:arms(2,1.8,1,.3,12,.7)}}
};
Object.assign(historicalProfiles,antiquityProfiles);
// Directional weapon geometry: rear ranks contribute only if their weapons actually project past front.
// No national modifier and no assumed literal mass shove of a hoplite formation.
export function weaponGeometry(spec,u,g,front,localC,land=1){
 const a=spec.arms;if(!a)return null;let alignment=Math.max(0,Math.cos(front)),integrity=Math.max(0,Math.min(1,localC/100))*Math.max(0,Math.min(1,u.cohesion/100)),dense=Math.max(0,Math.min(1,a.space/g.gap)),rows=Math.min(u.n/g.cols,a.ranks,1+Math.max(0,(a.length-.65)/g.gap)),cooperation=integrity*alignment*dense*(u.reshape>0?.35:1)*Math.max(.35,land);
 let ranks=1+Math.max(0,rows-1)*cooperation,usableReach=a.sidearm+(a.length-a.sidearm)*alignment*(a.ranks>2?Math.max(.15,cooperation):1),room=a.length<1.5?Math.min(1,g.gap/a.space):1,efficiency=(.55+.45*room)*(a.ranks>2?.55+.45*cooperation:1);
 return {ranks,reach:usableReach,efficiency,shield:a.shield*alignment*integrity*(u.form==="shield"||u.form==="spears"?1:.72),mass:a.mass};
}
