import {setDressScene,clearDressScene} from './scenography.js';

export const VISUAL_STYLE_KEY='pocket-works:zamazka:visual-style';
export const CLASSIC='classic',ATELIER='atelier';
export function storedVisualStyle(){
 try{return localStorage.getItem(VISUAL_STYLE_KEY)===ATELIER?ATELIER:CLASSIC}
 catch{return CLASSIC}
}
export function activeVisualStyle(){
 return document.documentElement.dataset.zamazkaTheme===ATELIER?ATELIER:CLASSIC;
}
export function applyVisualStyle(style,{screen=document.querySelector('#screen'),redress=true}={}){
 const mode=style===ATELIER?ATELIER:CLASSIC;
 document.documentElement.dataset.zamazkaTheme=mode;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
   mode===ATELIER?'#252724':'#201b18');
 if(redress){
  const stage=screen?.firstElementChild;
  if(stage&&stage!==screen.querySelector('.exhibition-exit-layer')){
   const scene=stage.dataset.visualScene||'home';
   if(mode===ATELIER)setDressScene(stage,scene);
   else clearDressScene(stage);
  }
 }
 return mode;
}
export function persistVisualStyle(style){
 const mode=style===ATELIER?ATELIER:CLASSIC;
 try{localStorage.setItem(VISUAL_STYLE_KEY,mode)}catch{}
 return mode;
}
