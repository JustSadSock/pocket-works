(()=>{'use strict';
const coreParts=['part-00.txt','part-01.txt','part-02.txt','part-03.txt','part-04.txt','part-05.txt'];
const patchNames=['patch-1.2.txt','patch-1.3-a.txt','patch-1.3-b.txt','patch-1.3-c.txt','patch-1.4-a.txt','patch-1.4-b.txt','patch-1.4-c.txt'];
const root='./runtime/';
const manager=document.querySelector('script[data-update-manager]');
if(manager)manager.dataset.appVersion='1.4.0';
for(const href of ['./polish-1.3.css','./polish-1.4.css'])if(!document.querySelector(`link[href="${href}"]`)){
  const style=document.createElement('link');style.rel='stylesheet';style.href=href;document.head.appendChild(style);
}
function fail(error){console.error(error);const panel=document.getElementById('fatal');const text=document.getElementById('fatalText');if(panel)panel.classList.remove('hidden');if(text)text.textContent='Не удалось загрузить ядро долины. '+String(error?.message||error||'Неизвестная ошибка');}
Promise.all([...coreParts,...patchNames].map(name=>fetch(root+name,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);return response.text()}))).then(chunks=>{
  const patches=chunks.splice(coreParts.length);
  const core=chunks.join('');
  const closing=core.lastIndexOf('})();');
  if(closing<0)throw new Error('Не найдена граница игрового ядра');
  return(0,eval)(`${core.slice(0,closing)}\n${patches.join('\n')}\n${core.slice(closing)}`);
}).catch(fail);
})();
