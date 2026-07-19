export const HERALDIC_SCHOOLS = {
  imperial: { id:'imperial', name:'Имперская школа', short:'Имперская', shield:'iberian', summary:'Осевая симметрия, тяжёлые навершия и властная центральная фигура.', mantle:'imperial', composition:'axial', standard:'gonfalon', finial:'sun-crown' },
  civic: { id:'civic', name:'Городская школа', short:'Городская', shield:'french', summary:'Строгая геометрия, ясный ординарий и ритм повторяющихся знаков.', mantle:'civic', composition:'tiered', standard:'communal', finial:'mural' },
  knightly: { id:'knightly', name:'Рыцарская школа', short:'Рыцарская', shield:'heater', summary:'Крупная фигура, турнирный акцент и одна выразительная вторичная эмблема.', mantle:'knightly', composition:'heroic', standard:'swallowtail', finial:'spear' },
  northern: { id:'northern', name:'Северная школа', short:'Северная', shield:'kite', summary:'Узкий длинный щит, суровые пустоты и знаки на нижних флангах.', mantle:'northern', composition:'vertical', standard:'pennon', finial:'raven' }
};
export const SCHOOL_ORDER = Object.keys(HERALDIC_SCHOOLS);
export const FIELD_PALETTES = {
  gules:{field:'#842631',metal:'#dfc574',main:'#f0e4c7',accent:'#203d5d',ink:'#201610',material:'ruby'},
  azure:{field:'#214c73',metal:'#e2d7bf',main:'#d5ad4c',accent:'#81262f',ink:'#181817',material:'sapphire'},
  argent:{field:'#ddd6c7',metal:'#842631',main:'#263e5c',accent:'#b78f3b',ink:'#1b1815',material:'silver'},
  sable:{field:'#202723',metal:'#d0aa4e',main:'#e9ddc5',accent:'#81262f',ink:'#101411',material:'iron'}
};
const SHIELD_PATHS={
  iberian:'M18 38Q18 31 26 31H94Q102 31 102 38V101C102 128 87 149 60 164C33 149 18 128 18 101Z',
  french:'M15 38H105V104C105 131 88 150 60 164C32 150 15 131 15 104Z',
  heater:'M18 35H102V92C102 124 83 148 60 164C37 148 18 124 18 92Z',
  kite:'M24 33H96V91C96 124 78 153 60 174C42 153 24 124 24 91Z'
};
const INNER_PATHS={
  iberian:'M24 43Q24 38 30 38H90Q96 38 96 43V100C96 123 83 141 60 154C37 141 24 123 24 100Z',
  french:'M21 44H99V102C99 125 85 141 60 154C35 141 21 125 21 102Z',
  heater:'M24 42H96V91C96 118 80 138 60 153C40 138 24 118 24 91Z',
  kite:'M30 40H90V91C90 118 76 143 60 162C44 143 30 118 30 91Z'
};
const BASE_MAIN_LAYOUTS={pale:{x:29,y:67,scale:.52},fess:{x:31,y:88,scale:.49},bend:{x:36,y:72,scale:.51},chevron:{x:30,y:45,scale:.52}};
const SCHOOL_MAIN_ADJUSTMENTS={imperial:{x:0,y:0,scale:1,rotate:0},civic:{x:0,y:1,scale:.96,rotate:0},knightly:{x:-2,y:-2,scale:1.08,rotate:-3},northern:{x:1,y:2,scale:.96,rotate:0}};
const MAIN_PROFILES={lion:{scale:1.02,rotate:0,animate:true},boar:{scale:.96,rotate:0,animate:true},tower:{scale:.92,rotate:0,animate:false},stag:{scale:.97,rotate:0,animate:true}};
const EVOLUTION_POSES={'lion-bifurcated':{scale:.98,rotate:-1},'lion-crowned':{scale:.94,y:-2},'lion-regardant':{flip:true,scale:.95},'boar-armed':{scale:.98},'boar-coupled':{scale:.88,y:2},'boar-blooded':{scale:.97,rotate:1},'tower-gate':{scale:.96},'tower-triple':{scale:.84,y:4},'tower-burning':{scale:.92,y:-2},'stag-courant':{scale:.97,rotate:-2},'stag-crowned':{scale:.91,y:-3},'stag-regardant':{flip:true,scale:.94}};
const SECONDARY_SCALE={eagle:.175,rose:.19,key:.17,sun:.19};
function hashString(value){let hash=2166136261;for(const ch of String(value||'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
function baseMainId(doctrine={}){const value=doctrine.mainEvolution||doctrine.main||null;return String(value||'').split('-')[0]||null;}
function secondaryFactor(id){return SECONDARY_SCALE[id]||.18;}
export function schoolForDoctrine(doctrine={}){if(doctrine.school&&HERALDIC_SCHOOLS[doctrine.school])return doctrine.school;const key=`${doctrine.field||''}:${doctrine.ordinary||''}:${doctrine.main||''}`;return SCHOOL_ORDER[hashString(key)%SCHOOL_ORDER.length];}
export function paletteForDoctrine(doctrine={}){const base=FIELD_PALETTES[doctrine.field]||FIELD_PALETTES.gules,school=schoolForDoctrine(doctrine),shift=hashString(`${doctrine.main||''}:${doctrine.secondary||''}:${school}`)%3;if(shift===0)return{...base};if(shift===1)return{...base,main:base.metal,metal:base.main};return{...base,accent:base.main,main:base.accent};}
export function shieldGeometry(doctrine={}){const school=HERALDIC_SCHOOLS[schoolForDoctrine(doctrine)];return{id:school.shield,path:SHIELD_PATHS[school.shield],inner:INNER_PATHS[school.shield]};}
function mainPlacement(doctrine,school,compact){const ordinary=BASE_MAIN_LAYOUTS[doctrine.ordinary]?doctrine.ordinary:'pale';const base={...BASE_MAIN_LAYOUTS[ordinary]},adjust=SCHOOL_MAIN_ADJUSTMENTS[school],main=baseMainId(doctrine),profile=MAIN_PROFILES[main]||MAIN_PROFILES.lion;base.x+=adjust.x;base.y+=adjust.y;base.scale*=adjust.scale*profile.scale*(compact?.94:1);base.rotate=profile.animate?adjust.rotate:0;base.flip=false;if(school==='knightly'&&profile.animate&&hashString(`${main}:${ordinary}:${doctrine.field}`)%2===1)base.flip=true;if(main==='tower'){base.rotate=0;base.flip=false;if(ordinary==='bend')base.x=35;if(ordinary==='chevron')base.y=53;}if(main==='boar'&&ordinary==='fess')base.y+=2;if(main==='stag'&&ordinary==='chevron')base.y-=2;const evo=EVOLUTION_POSES[doctrine.mainEvolution];if(evo){base.scale*=evo.scale||1;base.rotate+=profile.animate?(evo.rotate||0):0;base.y+=evo.y||0;if(evo.flip&&profile.animate)base.flip=!base.flip;}base.rotate=Math.max(-4,Math.min(4,base.rotate||0));return base;}
function ordinarySecondaryPattern(ordinary,school){if(ordinary==='pale'){if(school==='civic')return[{x:18,y:48},{x:49,y:44},{x:80,y:48}];if(school==='knightly')return[{x:75,y:45,large:true}];if(school==='northern')return[{x:28,y:112},{x:72,y:112,flip:true}];return[{x:18,y:50},{x:79,y:50,flip:true}];}if(ordinary==='fess'){if(school==='civic')return[{x:20,y:43},{x:49,y:41},{x:78,y:43}];if(school==='knightly')return[{x:74,y:45,large:true}];if(school==='northern')return[{x:29,y:45},{x:71,y:45,flip:true}];return[{x:22,y:45},{x:76,y:45,flip:true}];}if(ordinary==='bend'){if(school==='civic')return[{x:20,y:43},{x:47,y:48},{x:74,y:53}];if(school==='knightly')return[{x:20,y:43,large:true}];if(school==='northern')return[{x:27,y:43},{x:69,y:56,flip:true}];return[{x:20,y:45},{x:77,y:48,flip:true}];}if(school==='civic')return[{x:20,y:113},{x:49,y:119},{x:78,y:113}];if(school==='knightly')return[{x:76,y:112,large:true}];if(school==='northern')return[{x:29,y:114},{x:71,y:114,flip:true}];return[{x:22,y:112},{x:76,y:112,flip:true}];}
function secondaryPlacements(doctrine,school,compact){if(!doctrine.secondary)return[];const baseScale=secondaryFactor(doctrine.secondary)*(compact?.92:1),pattern=ordinarySecondaryPattern(doctrine.ordinary||'pale',school);return pattern.map(item=>({x:item.x,y:item.y,scale:baseScale*(item.large?1.28:1),flip:Boolean(item.flip),rotate:0}));}
export function compositionForDoctrine(doctrine={},compact=false){const school=schoolForDoctrine(doctrine),mainId=doctrine.main||null,secondaryId=doctrine.secondary||null;return{school,main:mainId?mainPlacement(doctrine,school,compact):null,secondary:secondaryId?secondaryPlacements(doctrine,school,compact):[],poseSeed:hashString(`${mainId}:${doctrine.field}:${school}`)%4,ordinary:doctrine.ordinary||'pale',mainBase:baseMainId(doctrine)};}
export function heraldicIdentity(doctrine={}){const schoolId=schoolForDoctrine(doctrine),school=HERALDIC_SCHOOLS[schoolId];return{school,palette:paletteForDoctrine(doctrine),shield:shieldGeometry(doctrine),composition:compositionForDoctrine(doctrine)};}
export function liveryForDoctrine(doctrine={}){const identity=heraldicIdentity(doctrine),payload={primary:identity.palette.field,metal:identity.palette.metal,accent:identity.palette.accent,emblem:identity.palette.main,ink:identity.palette.ink,school:identity.school.id,standard:identity.school.standard,finial:identity.school.finial,shield:identity.shield.id,main:baseMainId(doctrine),secondary:doctrine.secondary||null,ordinary:doctrine.ordinary||'pale'};const expose=()=>{try{globalThis.__blazonActiveLivery=payload;}catch{};return payload;};const livery={metal:payload.metal,accent:payload.accent,emblem:payload.emblem,ink:payload.ink,school:payload.school,standard:payload.standard,finial:payload.finial,shield:payload.shield,main:payload.main,secondary:payload.secondary,ordinary:payload.ordinary};Object.defineProperty(livery,'primary',{enumerable:true,get(){return expose().primary;}});return livery;}
