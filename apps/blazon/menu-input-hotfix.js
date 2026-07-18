(()=>{
  const FLAG=Symbol.for('blazon.menu-input-hotfix.v1');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;
  const style=document.createElement('style');
  style.textContent=`
    .menu-landscape,.menu-standard,.menu-copy,.symbol-library{pointer-events:none!important}
    .menu-actions,.topbar,.menu-screen footer{position:relative;z-index:20;pointer-events:auto!important}
    .menu-actions button,.topbar button,.topbar a{pointer-events:auto!important;touch-action:manipulation}
  `;
  document.head.append(style);
})();