(function(global){
  function createEmitter(){
    const events = {};
    return {
      on(event, fn){
        (events[event]||(events[event]=[])).push(fn);
      },
      off(event, fn){
        if(events[event]) events[event]=events[event].filter(f=>f!==fn);
      },
      emit(event, ...args){
        (events[event]||[]).forEach(fn=>fn(...args));
      }
    };
  }

  function connect(serverUrl, opts={}){
    let { reconnect=true, reconnectInterval=1000, pingInterval=15000 } = opts;
    let ws;
    const emitter = createEmitter();
    let pingTimer;

    function setup(){
      ws = new global.WebSocket(serverUrl);
      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
    }

    function onOpen(){
      emitter.emit('connected');
      if(pingInterval>0){
        clearInterval(pingTimer);
        pingTimer = global.setInterval(()=>{
          try{ ws.send('ping'); }catch(e){}
        }, pingInterval);
      }
    }

    function onMessage(e){
      if(e.data==='pong') return;
      let data = e.data;
      try{ data = JSON.parse(e.data); }catch(err){}
      emitter.emit('message', data);
    }

    function onError(err){ emitter.emit('error', err); }

    function onClose(){
      clearInterval(pingTimer);
      emitter.emit('disconnect');
      if(reconnect){
        global.setTimeout(setup, reconnectInterval);
      }
    }

    setup();

    const api = {
      on: (ev, fn) => { emitter.on(ev, fn); return api; },
      off: (ev, fn) => { emitter.off(ev, fn); return api; },
      send: obj => ws.send(JSON.stringify(obj)),
      sendRaw: data => ws.send(data),
      close: () => { reconnect=false; ws.close(); },
      get socket(){ return ws; }
    };
    return api;
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = { connect };
  }
  if(global){
    global.connect = connect;
  }
})(typeof window !== 'undefined' ? window : global);
