/* Appearance is a user preference, never a game or room setting.
   Classic is the first-run default and exactly the pre-scenography cascade. */
(function(){
 'use strict';
 const KEY='pocket-works:zamazka:appearance';
 const root=document.documentElement;
 const nextSheet=document.getElementById('zamazka-experimental-style');
 const homeSheet=document.getElementById('zamazka-afterhours-home');
 const theme=document.querySelector('meta[name="theme-color"]');
 function normalized(value){return value==='new'?'new':'classic'}
 function stored(){try{return normalized(localStorage.getItem(KEY))}catch{return 'classic'}}
 function apply(value,persist=false){
  const mode=normalized(value);
  root.dataset.zamazkaAppearance=mode;
  if(nextSheet)nextSheet.media=mode==='new'?'all':'not all';
  if(homeSheet)homeSheet.media=mode==='new'?'all':'not all';
  if(theme)theme.content=mode==='new'?'#222322':'#201b18';
  if(persist)try{localStorage.setItem(KEY,mode)}catch{}
  return mode;
 }
 const api=Object.freeze({key:KEY,get:()=>normalized(root.dataset.zamazkaAppearance),stored,apply});
 window.ZamazkaAppearance=api;
 apply(stored());
})();
