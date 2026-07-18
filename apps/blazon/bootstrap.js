(()=>{
  'use strict';
  const BUILD='5.4.1';
  const inputStyle=document.createElement('style');
  inputStyle.textContent=`
    .menu-landscape,.menu-standard,.menu-copy,.symbol-library{pointer-events:none!important}
    .menu-actions,.topbar,.menu-screen footer{position:relative!important;z-index:100!important;pointer-events:auto!important}
    .menu-actions button,.topbar button,.topbar a{pointer-events:auto!important;touch-action:manipulation!important}
    dialog:not([open]),.workshop-mode:not(.is-open),.app-update-prompt:not(.is-visible){pointer-events:none!important}
  `;
  document.head.append(inputStyle);

  const controls=[...document.querySelectorAll('.menu-actions button,.topbar button,.topbar a')];
  const footer=document.querySelector('.menu-screen footer');
  if(footer)footer.textContent=`v${BUILD} · запуск ядра`;
  document.documentElement.dataset.blazonBuild=BUILD;
  controls.forEach(control=>control.setAttribute('aria-busy','true'));

  let failed=false;
  function fatal(error){
    if(failed)return;
    failed=true;
    console.error('[БЛАЗОН] startup failed',error);
    controls.forEach(control=>control.removeAttribute('aria-busy'));
    const panel=document.createElement('section');
    panel.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#171b17;color:#eadcb5;text-align:center;font:16px/1.45 system-ui';
    panel.innerHTML='<div style="max-width:420px"><h1 style="font:700 34px Georgia,serif;margin:0 0 12px">Ядро не запустилось</h1><p style="opacity:.8">Исполняемые файлы не совпали. Сохранённый поход останется на устройстве.</p><button type="button" style="margin-top:18px;padding:14px 20px;border:1px solid #c79b42;background:#9a3438;color:#fff;font:700 15px system-ui">Восстановить релиз</button></div>';
    panel.querySelector('button').addEventListener('click',async()=>{
      const registrations='serviceWorker'in navigator?await navigator.serviceWorker.getRegistrations():[];
      await Promise.all(registrations.filter(registration=>registration.scope.includes('/apps/blazon/')).map(registration=>registration.unregister()));
      if('caches'in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(key=>key.startsWith('blazon-')).map(key=>caches.delete(key)));
      }
      const target=new URL('./',location.href);
      target.searchParams.set('pw_release',BUILD);
      target.searchParams.set('recovered',Date.now().toString(36));
      location.replace(target.href);
    });
    document.body.append(panel);
  }

  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('startup timeout')),15000));
  Promise.race([import(`./app.js?pw_release=${BUILD}`),timeout]).then(()=>{
    requestAnimationFrame(()=>setTimeout(()=>{
      controls.forEach(control=>control.removeAttribute('aria-busy'));
      document.documentElement.dataset.blazonReady=BUILD;
      globalThis.__POCKET_WORKS_RELEASE__?.markReady?.();
      if(footer)footer.textContent=`v${BUILD} · меню готово`;
      window.dispatchEvent(new CustomEvent('blazon:ready',{detail:{version:BUILD}}));

      const enhancements=[
        'critical-readability.js',
        'progression-art.js',
        'progression-runtime.js',
        'armorial-composition-runtime.js',
        'release-indicator.js'
      ];
      (async()=>{
        for(const path of enhancements){
          try{await import(`./${path}?pw_release=${BUILD}`)}
          catch(error){console.warn(`[БЛАЗОН] optional ${path}`,error)}
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
      })();
    },0));
  }).catch(fatal);
})();
