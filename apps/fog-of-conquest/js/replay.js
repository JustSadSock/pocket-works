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

  function handleNetEvent(ev){
    if(!ev) return;
    replayEvents.push(ev);
    applySnapshot(ev.snapshot);
    handleReplayAction(ev.action);
  }

  function handleNetMessage(data){
    if(data && data.event) handleNetEvent(data.event);
  }

  function attachConnection(conn){
    gameConn = conn;
    onlineGame = !!conn;
    window.gameConn = gameConn;
    window.onlineGame = onlineGame;
    if(conn) conn.on('message', handleNetMessage);
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
        if(videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
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

  function recordReplayVideo(){
    if(videoRecorder && videoRecorder.state !== 'inactive'){
      videoRecorder.stop();
      return;
    }
    const stream = canvas.captureStream();
    recordedChunks = [];
    try{
      videoRecorder = new MediaRecorder(stream);
    }catch(e){
      return;
    }
    videoRecorder.ondataavailable = e => {
      if(e.data && e.data.size) recordedChunks.push(e.data);
    };
  videoRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, {type:'video/webm'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'replay.webm';
      a.click();
    };
  videoRecorder.start();
    replayPaused = false;
    replaySpeed = 1;
    speedBtns.forEach(b=>b.classList.remove('speed-selected'));
    const def=document.querySelector('.speedBtn[data-speed="1"]');
    if(def) def.classList.add('speed-selected');
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
      handleNetEvent, handleNetMessage, attachConnection,
      startMatchReplay, recordReplayVideo, seekReplay, stopMatchReplay
    });
  }
})(typeof window!=="undefined" ? window : global);
