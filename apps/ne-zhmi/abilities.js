// Shared operator contract. A room always assigns the first N roles, 2 <= N <= 6.
export const ABILITIES=Object.freeze([
 {id:'jump',name:'ПРЫГ',operator:'Прыжок',key:'ПРОБЕЛ / W',icon:'↑',color:'#e7b06d',hold:false},
 {id:'reverse',name:'РАЗВОРОТ',operator:'Разворот',key:'R / ←',icon:'↶',color:'#91bbc6',hold:false},
 {id:'magnet',name:'МАГНИТ',operator:'Магнит',key:'M',icon:'⊂',color:'#bba4d4',hold:true},
 {id:'brake',name:'ТОРМОЗ',operator:'Тормоз',key:'B',icon:'Ⅱ',color:'#d5ab98',hold:true},
 {id:'push',name:'ТОЛЧОК',operator:'Толчок',key:'E',icon:'➜',color:'#a9bf84',hold:false},
 {id:'float',name:'ПОПЛАВОК',operator:'Поплавок',key:'F',icon:'◯',color:'#e0bd83',hold:true}
]);
export const MIN_OPERATORS=2;
export const MAX_OPERATORS=6;
export function operatorAbilities(count){
 const n=Math.max(MIN_OPERATORS,Math.min(MAX_OPERATORS,Math.floor(count)||MIN_OPERATORS));
 return ABILITIES.slice(0,n);
}
export const HOLD_ACTIONS=Object.freeze(['magnet','brake','float']);
