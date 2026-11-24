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
export function troopSpec(types,u){let base=types[u.type],p=historicalProfiles[u.profile];if(!p||p.base!==u.type)return base;let map=resolved.get(types);if(!map){map=new Map();resolved.set(types,map)}if(!map.has(u.profile))map.set(u.profile,Object.freeze({...base,...p.physics}));return map.get(u.profile)}
