/* Theme belongs to Blockies only. Inherit OS preference until overridden. */
(() => {
  const KEY='pocket-works:blockies:theme';
  const valid=new Set(['light','dark','auto']);
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  let preference='auto';
  try{const saved=localStorage.getItem(KEY);if(valid.has(saved))preference=saved;}catch{}
  const resolved=()=>preference==='auto'?(media.matches?'dark':'light'):preference;
  function apply(){
    const theme=resolved();
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111b20':'#f4f1e9');
    const button=document.getElementById('theme-toggle');
    if(button){
      button.querySelector('.theme-glyph').textContent=theme==='dark'?'☀':'☾';
      button.setAttribute('aria-label',theme==='dark'?'Включить дневную тему':'Включить ночную тему');
      button.title=button.getAttribute('aria-label');
      button.setAttribute('aria-pressed',String(theme==='dark'));
    }
    const choice=document.getElementById('theme-choice');
    if(choice)choice.value=preference;
  }
  function set(value){
    if(!valid.has(value))return;
    preference=value;
    try{localStorage.setItem(KEY,value);}catch{}
    apply();
  }
  document.getElementById('theme-toggle')?.addEventListener('click',()=>set(resolved()==='dark'?'light':'dark'));
  document.getElementById('theme-choice')?.addEventListener('change',event=>set(event.target.value));
  document.getElementById('reset-settings-btn')?.addEventListener('click',()=>{
    // Visual preference resets only if game confirms its settings reset.
    // Do not silently reset the theme when the user cancels a game-setting change.
    requestAnimationFrame(apply);
  });
  media.addEventListener?.('change',()=>{if(preference==='auto')apply();});
  window.addEventListener('storage',event=>{if(event.key===KEY){preference=valid.has(event.newValue)?event.newValue:'auto';apply();}});
  apply();
})();
