(async()=>{
  const parts=['./chunks/app-01.txt','./chunks/app-02.txt','./chunks/app-03.txt','./chunks/app-04.txt','./chunks/app-05.txt','./chunks/app-06.txt'];
  try{
    const responses=await Promise.all(parts.map(path=>fetch(path,{cache:'no-cache'})));
    const failed=responses.find(response=>!response.ok);
    if(failed)throw new Error(`Runtime chunk ${failed.status}`);
    const source=(await Promise.all(responses.map(response=>response.text()))).join('');
    (0,eval)(source);
  }catch(error){
    console.error('REDLINE VECTOR failed to load',error);
    const label=document.getElementById('loadLabel');
    const bar=document.getElementById('loadBar');
    if(label)label.textContent='RUNTIME LOAD FAILED · RELOAD';
    if(bar){bar.style.width='100%';bar.style.background='#ff2c67';}
  }
})();
