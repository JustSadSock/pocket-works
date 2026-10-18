(function(global){
  function connectLobby(room, action='create', opts={}){
    const url = (location.protocol==='https:'?'wss':'ws')+'://'+location.host;
    const conn = global.connect(url, opts);
    conn.on('connected', () => {
      if(room) conn.send({action, room});
    });
    return conn;
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = { connectLobby };
  }
  if(global){
    global.connectLobby = connectLobby;
  }
})(typeof window!=='undefined'?window:global);
