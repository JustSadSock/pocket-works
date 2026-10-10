import {TINCTURES,CHARGES,DIVISIONS} from './data.js';
let serial=0;
const SHIELD='M50 5 C67 8 80 12 93 17 L93 65 C92 89 75 108 50 122 C25 108 8 89 7 65 L7 17 C20 12 33 8 50 5Z';
const ink='#302631';
const motifs={
lion:`<path d="M25 79 18 89 9 89 11 98 31 97 40 86 54 92 54 99 76 98 73 88 63 85 64 70 76 57 75 47 67 50 64 36 56 32 61 22 55 12 44 17 33 12 24 19 27 30 19 37 25 43 20 50 26 56 20 68Z"/><path d="M65 53 Q94 69 89 34 Q84 22 94 20" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><path d="M12 42 0 48 14 53" />`,
wolf:`<path d="M9 32 18 18 20 6 32 16 45 13 52 25 70 33 81 28 92 37 88 49 79 51 74 78 84 91 84 99 64 99 64 91 57 75 42 77 37 92 43 99 18 99 18 88 25 72 14 59 4 53 1 43Z"/><path d="M21 47 15 52 23 54Z" fill="#2c2630"/><circle cx="22" cy="35" r="3" fill="#2c2630"/>`,
stag:`<path d="M33 47 43 54 58 54 66 44 71 50 65 61 70 75 80 91 81 100 63 100 58 88 49 78 41 89 38 100 19 100 23 87 31 66 23 59 14 57 8 49 19 47 25 38 34 40Z"/><path d="M32 42 24 17 7 10 M25 26 9 26 M31 36 42 6 M34 26 48 16 M61 43 74 12 92 7 M70 25 84 25 M74 15 69 6" stroke="currentColor" stroke-width="7" stroke-linecap="square" fill="none"/><circle cx="20" cy="50" r="2.5" fill="#322630"/>`,
rose:`<g transform="translate(50 52)"><path d="M0-46 Q24-38 17-18 Q41-38 46-8 Q36 13 19 13 Q33 30 5 43 Q-14 39-18 18 Q-37 30-45 0 Q-41-19-19-20 Q-20-40 0-46Z"/><path d="M0-26Q16-17 12-4Q25 8 7 18Q-5 25-13 12Q-26 2-14-11Z" fill="#433039" opacity=".7"/><circle r="6" fill="currentColor"/></g><path d="M50 93 50 111M50 101Q30 93 26 78M50 102Q69 88 76 83" fill="none" stroke="currentColor" stroke-width="6"/>`,
eagle:`<path d="M50 29 40 19 38 7 50 12 62 7 60 19 50 29Z"/><path d="M47 37 35 27 19 18 2 18 11 37 0 46 14 52 5 63 24 68 15 78 35 80 41 69 42 93 29 104 37 107 50 99 63 107 71 104 58 93 59 69 65 80 85 78 76 68 95 63 86 52 100 46 89 37 98 18 81 18 65 27 53 37Z"/><path d="M50 54V99" stroke="#362a30" stroke-width="5"/>`,
tower:`<path d="M15 96V28H23V17H38V28H43V17H57V28H62V17H77V28H85V96Z"/><path d="M11 96H89V106H11Z"/><path d="M37 96V73Q50 54 63 73V96Z" fill="#382b37"/><path d="M24 42H35V56H24ZM65 42H76V56H65Z" fill="#382b37"/><path d="M50 22V58" stroke="#382b37" stroke-width="3"/>`,
sun:`<path d="M50 2 59 22 76 7 76 30 98 25 85 44 100 56 77 63 91 83 67 78 63 99 49 82 32 99 31 77 8 86 20 64 1 51 22 44 7 25 29 30 27 8 43 22Z"/><circle cx="50" cy="51" r="22" fill="#41303a"/><circle cx="50" cy="51" r="18" fill="currentColor"/><path d="M42 48h3m10 0h3M43 58Q50 65 57 58" stroke="#41303a" fill="none" stroke-width="3" stroke-linecap="round"/>`,
cross:`<path d="M39 4H61V37H95V61H61V105H39V61H5V37H39Z"/><path d="M24 49H76M50 16V96" stroke="#29212b" stroke-width="2" opacity=".35"/>`,
key:`<path d="M50 7C31 7 23 22 23 36C23 53 32 60 42 64L42 105H58V92H71V81H58V64C69 60 77 51 77 36C77 19 65 7 50 7ZM50 24a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z" fill-rule="evenodd"/>`,
fleur:`<path d="M50 5Q27 28 42 49Q22 16 8 42Q4 66 34 62L42 54 42 79H27V91H73V79H58V54L66 62Q96 66 92 42Q78 16 58 49Q73 28 50 5Z"/><path d="M36 69H64M50 52V89" fill="none" stroke="#2d2732" stroke-width="3"/>`
};
export function isValidArms(a){
 if(!a||!Object.hasOwn(DIVISIONS,a.division)||!Object.hasOwn(CHARGES,a.charge)||!Object.hasOwn(TINCTURES,a.field)||!Object.hasOwn(TINCTURES,a.chargeTone))return {ok:false,reason:'Неизвестный элемент герба.'};
 if(TINCTURES[a.field].type===TINCTURES[a.chargeTone].type)return {ok:false,reason:'Нельзя накладывать металл на металл или финифть на финифть.'};
 return {ok:true,reason:'Герб соответствует основному правилу тинктур.'};
}
export function armsDescription(a){
 if(!isValidArms(a).ok)return 'Недопустимое сочетание тинктур';
 return `Поле: ${TINCTURES[a.field].name}. ${CHARGES[a.charge]} — ${TINCTURES[a.chargeTone].name}. ${DIVISIONS[a.division].toLowerCase()}.`;
}
export function signature(a){return [a.field,a.chargeTone,a.charge,a.division].join(':')}
export function shieldSvg(a){
 const safe=isValidArms(a).ok?a:{field:'azure',charge:'lion',chargeTone:'or',division:'plain'};
 const key='arms'+(++serial);
 const base=TINCTURES[safe.field].hex,charge=TINCTURES[safe.chargeTone].hex;
 const secondary=TINCTURES[safe.field].type==='color'?'#d6b062':'#354f75';
 let division='';
 if(safe.division==='pale')division=`<path d="M50 0H100V128H50Z" fill="${secondary}"/>`;
 if(safe.division==='fess')division=`<path d="M0 62H100V128H0Z" fill="${secondary}"/>`;
 if(safe.division==='bend')division=`<path d="M0 0H30L100 95V128H75L0 28Z" fill="${secondary}"/>`;
 if(safe.division==='quarter')division=`<path d="M50 0H100V64H50ZM0 64H50V128H0Z" fill="${secondary}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 128" role="img" aria-label="Геральдический щит. ${armsDescription(safe)}"><defs><clipPath id="${key}"><path d="${SHIELD}"/></clipPath></defs><path d="${SHIELD}" fill="#221b29" stroke="#bc9360" stroke-width="5"/><g clip-path="url(#${key})"><rect width="100" height="128" fill="${base}"/>${division}<path d="M10 15H90V67C90 85 72 106 50 119C28 106 10 85 10 67Z" fill="none" stroke="#ffffff" stroke-opacity=".11" stroke-width="1"/><g transform="translate(22 30) scale(.56 .66)" fill="${charge}" stroke="#352630" stroke-width="1.5" stroke-linejoin="round" color="${charge}">${motifs[safe.charge]}</g></g><path d="${SHIELD}" fill="none" stroke="#e5c483" stroke-width="3"/><path d="M50 10C65 13 77 16 87 20" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/></svg>`;
}
