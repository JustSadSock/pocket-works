function loop(now) {
  const dt=Math.min(.05,Math.max(0,(now-runtime.lastTime)/1000));runtime.lastTime=now;
  if(runtime.mode==='playing') update(dt);
  if(runtime.save) render();
  requestAnimationFrame(loop);
}

function formatTime(seconds){const total=Math.max(0,Math.floor(seconds));const h=Math.floor(total/3600);const m=Math.floor(total%3600/60);return h?`${h} ч ${m} мин`:`${m} мин`;}

async function boot() {
  if(!ctx){loadingText.textContent='Canvas недоступен. Эта реальность не поддерживает игру.';return;}
  resizeCanvas(); setupInput();
  const stages=[['Проверяем две стороны города…',28],['Расставляем Печати…',58],['Затачиваем Иглу…',82],['Шов натянут.',100]];
  for(const [text,value] of stages){loadingText.textContent=text;loadingBar.style.width=`${value}%`;await new Promise(r=>setTimeout(r,110));}
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  showTitle(); requestAnimationFrame(loop);
}

window.addEventListener('resize',resizeCanvas);
window.addEventListener('orientationchange',()=>setTimeout(resizeCanvas,100));
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){persistSave();if(runtime.mode==='playing'){runtime.pausedByVisibility=true;pauseGame();}}
});
window.addEventListener('pagehide',()=>persistSave());
window.addEventListener('error',(event)=>{console.error(event.error||event.message);if(runtime.mode==='loading')loadingText.textContent='Шов порвался при загрузке. Обнови приложение.';});

boot();
