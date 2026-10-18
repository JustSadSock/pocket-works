(function(global){
  function stopReplay(){
    if(replayTimer){ clearTimeout(replayTimer); replayTimer=null; }
    aiReplay=[];
    waitOverlay.style.display='none';
    waitText.textContent=t('wait');
    skipReplayBtn.style.display='none';
    updateAll();
  }

  function replayAI(){
    let i=0;
    const run=()=>{
      if(i>=aiReplay.length){ stopReplay(); return; }
      const ev=aiReplay[i++];
      if(ev.type==='move'){
        animateMove(ev.unit,ev.from.r,ev.from.c,ev.to.r,ev.to.c);
        replayTimer=setTimeout(run,300);
      }else if(ev.type==='attack'){
        animateShake(ev.target);
        replayTimer=setTimeout(run,150);
      }else{
        replayTimer=setTimeout(run,250);
      }
      redraw();
    };
    run();
  }

  function applySnapshot(snap){
    if(!snap) return;
    units.length=0; snap.units.forEach(u=>units.push({...u}));
    buildings.length=0; snap.buildings.forEach(b=>buildings.push({...b}));
    state.currentPlayer = replaySide || snap.state.currentPlayer;
    state.turn=snap.state.turn;
    state.gold={...snap.state.gold};
    updateAll();
  }

  function handleReplayAction(act){
    if(!act) return;
    if(act.type==='move'){
      const u=units.find(x=>x.id===act.unit.id);
      if(u) animateMove(u,act.from.r,act.from.c,act.to.r,act.to.c,200/replaySpeed);
    }else if(act.type==='attack'){
      let tgt=units.find(x=>x.id=== (act.target.id || act.target));
      if(!tgt) tgt=buildings.find(b=>b.r===act.target.r && b.c===act.target.c);
      if(tgt) animateShake(tgt,100/replaySpeed);
    }
  }

  function startMatchReplay(){
    if(!replayEvents.length) return;
    replayIndex = 0;
    replaySpeed = 1;
    replayPaused = false;
    replayControls.classList.remove('collapsed');
    if(replayPauseBtn){
      updateReplayPauseBtn();
    }
    if(replayToggleBtn) replayToggleBtn.setAttribute('title', t('replayCollapse'));
    window.replayPaused = replayPaused;
    revealAll = true;
    replaySide = 1;
    currentReplaySnapshot = replayEvents[0].snapshot;
    applySnapshot(currentReplaySnapshot);
    if(replaySeek){
      replaySeek.max = replayEvents.length - 1;
      replaySeek.value = 0;
    }
    replayOverlay.style.display='flex';
    if(speedBtns.length){
      speedBtns.forEach(b=>b.classList.remove('speed-selected'));
      const def=document.querySelector('.speedBtn[data-speed="1"]');
      if(def) def.classList.add('speed-selected');
    }
    runReplayStep = function(){
      if(replayPaused || replayIndex >= replayEvents.length - 1){
        stopRecording();
        return;
      }
      replayIndex++;
      const ev = replayEvents[replayIndex];
      handleReplayAction(ev.action);
      const base = ev.action ? (ev.action.type==='move'?300:ev.action.type==='attack'?150:250) : 400;
      replayTimer = setTimeout(()=>{
        currentReplaySnapshot = ev.snapshot;
        applySnapshot(ev.snapshot);
        if(replaySeek) replaySeek.value = replayIndex;
        runReplayStep();
      }, base / replaySpeed);
    };
    runReplayStep();
  }

  // Explicit recording UX; unsupported browsers get a useful explanation.
  function recordNotice(text,error=false){
    let status=document.getElementById('fogRecordStatus');
    if(!status){
      status=document.createElement('span');status.id='fogRecordStatus';
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      saveReplayBtn?.insertAdjacentElement('afterend',status);
    }
    status.textContent=text;
    status.dataset.error=error?'true':'false';
  }
  function stopRecording(){
    if(videoRecorder&&videoRecorder.state!=='inactive'){
      try{videoRecorder.stop();}catch(error){recordNotice('Не удалось остановить запись.',true);}
      return true;
    }
    return false;
  }
  function recordReplayVideo(){
    if(stopRecording())return;
    if(!replayEvents?.length||!canvas){
      recordNotice('Нет записанного повтора.',true);return;
    }
    if(typeof canvas.captureStream!=='function'||typeof MediaRecorder==='undefined'){
      recordNotice('Запись видео не поддерживается этим браузером. Используй интерактивный повтор.',true);
      return;
    }
    const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const type=types.find(t=>typeof MediaRecorder.isTypeSupported==='function'
      ?MediaRecorder.isTypeSupported(t):t==='video/webm');
    if(!type){
      recordNotice('Нет поддерживаемого формата WebM для записи.',true);return;
    }
    let stream,recorder;
    try{
      stream=canvas.captureStream(30);
      recorder=new MediaRecorder(stream,{mimeType:type});
    }catch(error){
      stream?.getTracks?.().forEach(track=>track.stop());
      recordNotice('Браузер не разрешил захват игрового поля.',true);return;
    }
    videoRecorder=recorder;window.videoRecorder=recorder;
    recordedChunks=[];window.recordedChunks=recordedChunks;
    const release=()=>{
      stream.getTracks().forEach(track=>track.stop());
      if(saveReplayBtn)saveReplayBtn.textContent=saveReplayBtn.dataset.originalText||'Save video';
    };
    recorder.ondataavailable=e=>{if(e.data&&e.data.size)recordedChunks.push(e.data);};
    recorder.onerror=()=>{
      release();recordNotice('Запись была прервана браузером.',true);
    };
    recorder.onstop=()=>{
      release();
      if(!recordedChunks.length){
        recordNotice('Видео пустое. Повтори запись после начала воспроизведения.',true);return;
      }
      const blob=new Blob(recordedChunks,{type:recorder.mimeType||'video/webm'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='fog-of-conquest-replay.webm';
      document.body.append(link);link.click();link.remove();
      recordNotice('Повтор сохранён.');
      // Deferred revocation leaves the download time to initialize on mobile.
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      recordedChunks=[];window.recordedChunks=recordedChunks;
    };
    try{recorder.start(250);}
    catch(error){release();recordNotice('Не удалось начать запись.',true);return;}
    if(saveReplayBtn){
      saveReplayBtn.dataset.originalText=saveReplayBtn.dataset.originalText||saveReplayBtn.textContent;
      saveReplayBtn.textContent='■ Стоп';
    }
    recordNotice('Идёт запись повтора…');
    replayPaused=false;replaySpeed=1;
    speedBtns.forEach(b=>b.classList.remove('speed-selected'));
    const def=document.querySelector('.speedBtn[data-speed="1"]');
    if(def)def.classList.add('speed-selected');
    updateReplayPauseBtn();
    seekReplay(0);
  }

  function seekReplay(idx){
    if(!replayEvents.length) return;
    if(idx < 0) idx = 0;
    if(idx > replayEvents.length - 1) idx = replayEvents.length - 1;
    replayIndex = idx;
    if(replaySeek) replaySeek.value = replayIndex;
    currentReplaySnapshot = replayEvents[replayIndex].snapshot;
    applySnapshot(currentReplaySnapshot);
    if(!replayPaused && typeof runReplayStep === 'function'){
      if(replayTimer){ clearTimeout(replayTimer); replayTimer = null; }
      runReplayStep();
    }
  }
  function stopMatchReplay(){
    if(replayTimer){ clearTimeout(replayTimer); replayTimer=null; }
    if(videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
    replayOverlay.style.display='none';
    replayControls.classList.remove('collapsed');
    if(replayPauseBtn){
      updateReplayPauseBtn();
    }
    if(replayToggleBtn) replayToggleBtn.setAttribute('title', t('replayCollapse'));
    runReplayStep = null;
    replayPaused = false;
    window.replayPaused = replayPaused;
    replaySide = null;
    revealAll = false;
  }

  if(global){
    Object.assign(global, {
      stopReplay, replayAI, applySnapshot, handleReplayAction,
      startMatchReplay, recordReplayVideo, seekReplay, stopMatchReplay
    });
  }
})(typeof window!=="undefined" ? window : global);
