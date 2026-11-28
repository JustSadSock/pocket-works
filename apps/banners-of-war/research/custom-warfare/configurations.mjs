import {PRESETS} from '../../custom-battle.js';
const army=(preset,size=1,quality='regular')=>({roster:[...PRESETS[preset]],size,quality,preset});
export const configurations=[
 {id:'equal',seed:'Ashford muster',landscape:'plain',objective:'time',armies:[army('compact'),army('compact')],fog:false},
 {id:'quality',seed:'Veterans at the ford',landscape:'valley',objective:'territory',armies:[army('compact',1,'veteran'),army('levy',.75,'levy')],fog:false},
 {id:'mixed',seed:'Ridge of banners',landscape:'ridge',objective:'time',armies:[army('mounted'),army('infantry')],fog:true},
 {id:'defence',seed:'Marsh watch',landscape:'marsh',objective:'defend',armies:[army('infantry',.75),army('mounted')],fog:false}
].map(c=>({...c,seconds:360,difficulty:'commander',style:'adaptive',observer:false,campaign:false}));
