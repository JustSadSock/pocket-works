(()=>{'use strict';
const coreParts=['part-00.txt','part-01.txt','part-02.txt','part-03.txt','part-04.txt','part-05.txt'];
const patchName='patch-1.2.txt';
const root='./runtime/';
function fail(error){console.error(error);const panel=document.getElementById('fatal');const text=document.getElementById('fatalText');if(panel)panel.classList.remove('hidden');if(text)text.textContent='Не удалось загрузить ядро долины. '+String(error?.message||error||'Неизвестная ошибка');}
Promise.all([...coreParts,patchName].map(name=>fetch(root+name,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);return response.text()}))).then(chunks=>{
  const patch=chunks.pop();
  const core=chunks.join('');
  const closing=core.lastIndexOf('})();');
  if(closing<0)throw new Error('Не найдена граница игрового ядра');
  return(0,eval)(`${core.slice(0,closing)}\n${patch}\n${core.slice(closing)}`);
}).catch(fail);
})();
