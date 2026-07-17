(()=>{'use strict';
const parts=['part-00.txt','part-01.txt','part-02.txt','part-03.txt','part-04.txt','part-05.txt'];
const root='./runtime/';
function fail(error){console.error(error);const panel=document.getElementById('fatal');const text=document.getElementById('fatalText');if(panel)panel.classList.remove('hidden');if(text)text.textContent='Не удалось загрузить ядро долины. '+String(error?.message||error||'Неизвестная ошибка');}
Promise.all(parts.map(name=>fetch(root+name,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);return response.text()}))).then(chunks=>(0,eval)(chunks.join(''))).catch(fail);
})();
