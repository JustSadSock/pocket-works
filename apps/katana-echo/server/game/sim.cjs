const nanoid=()=>crypto.randomUUID().slice(0,8);
const { generateMap } = require('./map.cjs');
const { GHOST_MODES, createGhostState } = require('./modes.cjs');
const { EVENTS } = require('./protocol.cjs');

const TICK_RATE = 1000 / 60;
const SNAP_RATE = 1000 / 20;
const PLAYER_RADIUS = 0.6;

function createActorState(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 0,
    speed: 7,
    dashCooldown: 0,
    attacking: false,
    attackTimer: 0,
    attackPower: 0,
    charge: 0,
    shieldUp: false,
    shieldStrength: 3,
    shieldCooldown: 0,
    parryWindow: 0,
    stagger: 0
  };
}

class GameRoom {
  constructor(roomCode, mode, broadcast) {
    this.id = roomCode;
    this.mode = mode || GHOST_MODES.ECHO_TRAP;
    this.players = new Map();
    this.map = generateMap(roomCode);
    this.broadcast = broadcast;
    this.lastSnap = Date.now();
    this.lastUpdate = Date.now();
    this.clock=Date.now();this.roundResetAt=null;
  }

  addPlayer(ws, name) {
    const id = nanoid(8);
    const spawnX = this.players.size === 0 ? -4 : 4;
    const player = {
      id,
      name: name || 'Ronin',
      ws,
      alive: true,
      ready: false,
      ghostMode: this.mode,
      ghost: createGhostState(this.mode),
      ghostActor: { id: `${id}-g`, ownerId: id, isGhost: true, alive: false, state: createActorState(spawnX, 0) },
      triggers: { spawnGhost: false, toggleGhost: false },
      ghostInput: null,
      events: [],
      inputState: {
        seq: 0,
        dt: 0,
        keys: {},
        mouseAngle: 0,
        lmb: false,
        rmb: false,
        dash: false,
        ghostToggle: false
      },
      state: createActorState(spawnX, 0)
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) clearInterval(this.interval);
  }

  handleInput(id, payload) {
    const player = this.players.get(id);
    if (!player || !player.alive) return;
    player.inputState = { ...player.inputState, ...payload };
    if (payload.ghostToggle) {
      if (player.ghostMode === GHOST_MODES.ECHO_TRAP) player.triggers.spawnGhost = true;
      if (player.ghostMode === GHOST_MODES.CHANNEL_ECHO) player.triggers.toggleGhost = true;
    }
  }

  markReady(id) {
    const player = this.players.get(id);
    if (player) player.ready = true;
  }

  update() {
    const now = Date.now();
    const dt = Math.min(50, now - this.lastUpdate);
    this.lastUpdate = now;

    this.players.forEach((player) => this.updatePlayer(player, dt));
    this.updateGhostActors(dt);
    this.resolveCombat();
    if (now - this.lastSnap >= SNAP_RATE) {
      this.lastSnap = now;
      this.broadcastState();
    }
  }

  updatePlayer(player, dtMs) {
    if (!player.alive) return;
    this.recordGhostFrame(player, dtMs);
    this.applyInputToActor(player.state, player.inputState, dtMs);
  }

  recordGhostFrame(player, dtMs) {
    const timestamp = this.clock;
    const snapshot = {
      input: { ...player.inputState },
      state: { ...player.state },
      timestamp
    };
    const ghost = player.ghost;
    ghost.buffer.push(snapshot);
    const cutoff = timestamp - 5000;
    ghost.buffer = ghost.buffer.filter((f) => f.timestamp >= cutoff);
  }

  updateGhostActors(dtMs) {
    this.players.forEach((player) => {
      const ghostState = player.ghost;
      const actor = player.ghostActor;
      if (player.ghostMode === GHOST_MODES.ECHO_TRAP) {
        ghostState.cooldown = Math.max(0, ghostState.cooldown - dtMs);
        if (!actor.alive && player.triggers.spawnGhost && ghostState.cooldown === 0 && ghostState.buffer.length) {
          actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
          ghostState.playback = ghostState.buffer.map((f) => ({ ...f }));
          ghostState.cooldown = 8000;
          actor.alive = true;
        }
        if (actor.alive && ghostState.playback && ghostState.playback.length) {
          const frame = ghostState.playback.shift();
          player.ghostInput = frame.input;
          this.applyInputToActor(actor.state, frame.input, dtMs);
        } else {
          actor.alive = false;
          player.ghostInput = null;
        }
        player.triggers.spawnGhost = false;
      }

      if (player.ghostMode === GHOST_MODES.SHADOW_TAIL) {
        if (ghostState.buffer.length > 300) ghostState.buffer.shift();
        if (!actor.alive && ghostState.buffer.length > 250) {
          actor.alive = true;
          actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
        }
        if (actor.alive && ghostState.buffer.length) {
          const frame = ghostState.buffer.shift();
          player.ghostInput = frame.input;
          this.applyInputToActor(actor.state, frame.input, dtMs);
        }
      }

      if (player.ghostMode === GHOST_MODES.CHANNEL_ECHO) {
        if (ghostState.buffer.length > 300) ghostState.buffer.shift();
        if (player.triggers.toggleGhost && ghostState.energy > 0.05) {
          ghostState.active = !ghostState.active;
        }
        player.triggers.toggleGhost = false;
        if (ghostState.active) {
          ghostState.energy = Math.max(0, ghostState.energy - dtMs * 0.0005);
          if (ghostState.energy === 0) ghostState.active = false;
          if (!actor.alive && ghostState.buffer.length > 250) {
            actor.alive = true;
            actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
          }
          if (actor.alive && ghostState.buffer.length) {
            const frame = ghostState.buffer.shift();
            player.ghostInput = frame.input;
            this.applyInputToActor(actor.state, frame.input, dtMs);
          }
        } else {
          ghostState.energy = Math.min(1, ghostState.energy + dtMs * ghostState.regen * 0.001);
          player.ghostInput = null;
          actor.alive = false;
        }
      }
    });
  }

  applyInputToActor(state, input, dtMs) {
    const dt = Math.min(0.05, dtMs / 1000);
    const move = { x: 0, y: 0 };
    if (input.keys?.w) move.y -= 1;
    if (input.keys?.s) move.y += 1;
    if (input.keys?.a) move.x -= 1;
    if (input.keys?.d) move.x += 1;
    const len = Math.hypot(move.x, move.y) || 1;
    move.x /= len; move.y /= len;

    state.facing = Number.isFinite(input.mouseAngle) ? input.mouseAngle : state.facing;

    state.dashCooldown = Math.max(0, state.dashCooldown - dtMs);
    if (input.dash && state.dashCooldown === 0) {
      state.vx += Math.cos(state.facing) * 14;
      state.vy += Math.sin(state.facing) * 14;
      state.dashCooldown = 650;
    }

    const accel = state.stagger > 0 ? 6 : 20;
    state.vx += move.x * accel * dt;
    state.vy += move.y * accel * dt;
    state.vx *= 0.9;
    state.vy *= 0.9;

    const maxSpeed = state.speed || 7;
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      state.vx *= scale;
      state.vy *= scale;
    }

    state.x += state.vx * dt;
    state.y += state.vy * dt;
    this.constrainToBounds(state);

    state.shieldCooldown = Math.max(0, state.shieldCooldown - dtMs);
    state.parryWindow = Math.max(0, state.parryWindow - dtMs);
    if (state.stagger > 0) state.stagger = Math.max(0, state.stagger - dtMs);

    if (input.rmb && !state.shieldUp && state.shieldCooldown === 0) {
      state.shieldUp = true;
      state.parryWindow = 200;
      state.shieldStrength = 3;
    }
    if (!input.rmb && state.shieldUp) {
      state.shieldUp = false;
    }

    if (input.lmb) {
      state.charge = Math.min(2200, state.charge + dtMs);
    } else if (state.charge > 0) {
      state.attacking = true;
      state.attackTimer = 230;
      state.attackPower = state.charge;
      state.charge = 0;
    }

    if (state.attacking) {
      state.attackTimer -= dtMs;
      if (state.attackTimer <= 0) {
        state.attacking = false;
        state.attackPower = 0;
      }
    }
  }

  resolveCombat() {
    const entities = [];
    this.players.forEach((p) => {
      if (p.alive) entities.push(p);
      if (p.ghostActor.alive) entities.push(p.ghostActor);
    });
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        this.resolvePair(entities[i], entities[j]);
      }
    }
  }

  resolvePair(a, b) {
    const dist = Math.hypot(a.state.x - b.state.x, a.state.y - b.state.y);
    const rangeA = 1.3 + (a.state.attackPower || 0) / 2200;
    const rangeB = 1.3 + (b.state.attackPower || 0) / 2200;
    const aSwing = a.state.attacking && dist <= rangeA + PLAYER_RADIUS;
    const bSwing = b.state.attacking && dist <= rangeB + PLAYER_RADIUS;

    if (aSwing && bSwing) {
      this.emitEvent(EVENTS.CLASH, [a, b]);
      a.state.attacking = false; b.state.attacking = false;
      a.state.vx -= Math.cos(a.state.facing) * 2;
      b.state.vx -= Math.cos(b.state.facing) * 2;
      return;
    }

    if (aSwing) this.tryHit(a, b);
    if (bSwing) this.tryHit(b, a);
  }

  tryHit(attacker, defender) {
    if (!defender.alive || !attacker.state.attacking) return;
    const dist = Math.hypot(attacker.state.x - defender.state.x, attacker.state.y - defender.state.y);
    if (dist > 2.1) return;

    if (defender.state.shieldUp) {
      if (defender.state.parryWindow > 0) {
        attacker.state.stagger = 400;
        if (!defender.isGhost) defender.events.push({ type: EVENTS.PARRY, target: attacker.id });
        defender.state.shieldUp = false;
        return;
      }
      defender.state.shieldStrength -= attacker.state.attackPower > 2000 ? 2 : 1;
      if (defender.state.shieldStrength <= 0) {
        defender.state.shieldUp = false;
        defender.state.shieldCooldown = 2000;
      }
      attacker.state.attacking = false;
      return;
    }

    if (defender.isGhost) {
      defender.alive = false;
      return;
    }
    this.killPlayer(defender, attacker);
  }

  killPlayer(player, killer) {
    if (!player.alive) return;
    player.alive = false;
    player.events.push({ type: EVENTS.KILL, target: player.id, by: killer?.id });
    if (this.isRoundOver()) {
      this.broadcast({ type: EVENTS.ROUND_END, room: this.id });
      this.resetRound();
    }
  }

  isRoundOver() {
    const living = Array.from(this.players.values()).filter((p) => p.alive);
    return living.length <= 1;
  }

  resetRound(){if(!this.roundResetAt)this.roundResetAt=this.clock+600;}
  step(dtMs){
    this.clock+=dtMs;
    if(this.roundResetAt){if(this.clock>=this.roundResetAt){this.roundResetAt=null;let i=0;for(const p of this.players.values()){p.alive=true;p.state=createActorState(i++===0?-4:4,0);p.ghost=createGhostState(p.ghostMode);p.ghostActor.alive=false;p.ghostInput=null;}this.broadcast({type:EVENTS.ROUND_START,room:this.id});}return;}
    for(const p of this.players.values())this.updatePlayer(p,dtMs);this.updateGhostActors(dtMs);this.resolveCombat();
  }

  broadcastState() {
    const payload = {
      room: this.id,
      map: this.map,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        ghostMode: p.ghostMode,
        state: p.state,
        ghost: p.ghost,
        ghostInput: p.ghostInput,
        ghostActor: p.ghostActor,
        events: p.events.splice(0)
      }))
    };
    this.broadcast({ type: 'state', data: payload });
  }

  emitEvent(type, targets) {
    targets.forEach((p) => p.events && p.events.push({ type }));
  }

  constrainToBounds(state) {
    const halfW = this.map.bounds.w / 2 - PLAYER_RADIUS;
    const halfH = this.map.bounds.h / 2 - PLAYER_RADIUS;
    state.x = Math.min(halfW, Math.max(-halfW, state.x));
    state.y = Math.min(halfH, Math.max(-halfH, state.y));
  }
}


/* Katana Echo v0.2: authoritative combat, collision and responsive movement.
   Kept alongside the existing simulation for older serialized rooms. */
function improveKatanaCombat(GameRoom) {
  const proto = GameRoom.prototype;
  const originalStep = proto.step;
  const originalKill = proto.killPlayer;
  const originalHandle = proto.handleInput;
  const originalUpdatePlayer = proto.updatePlayer;
  const originalAddPlayer = proto.addPlayer;
  const RADIUS = 0.48;
  const owner = e => e.isGhost ? e.ownerId : e.id;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const faceDot = (a,b) => {
    const d=Math.max(0.00001,distance(a,b));
    return ((b.x-a.x)*Math.cos(a.facing)+(b.y-a.y)*Math.sin(a.facing))/d;
  };
  const betweenWalls = (map,a,b) => {
    for(const w of map.walls||[]){
      const left=w.x-w.w/2-.035,right=w.x+w.w/2+.035,top=w.y-w.h/2-.035,bottom=w.y+w.h/2+.035;
      let t0=0,t1=1;
      const dx=b.x-a.x,dy=b.y-a.y;
      for(const [p,q] of [[-dx,a.x-left],[dx,right-a.x],[-dy,a.y-top],[dy,bottom-a.y]]){
        if(Math.abs(p)<1e-9){if(q<0){t0=2;break;}continue;}
        const t=q/p;
        if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
      }
      if(t0<=t1&&t0<=1&&t1>=0)return true;
    }
    return false;
  };
  proto.addPlayer=function(ws,name){
    const p=originalAddPlayer.call(this,ws,name);
    if(this.players.size>1){p.state.facing=Math.PI;p.inputState.mouseAngle=Math.PI;}
    return p;
  };
  // A pressed-and-released button may arrive between simulation ticks.
  // Preserve its edge on the authoritative state instead of dropping the action.
  proto.handleInput=function(id,payload){
    const p=this.players.get(id);
    if(!p||!p.alive)return;
    const stream=Number(payload?.stream)||0;
    if(stream>0&&Number.isSafeInteger(stream)){
      if(stream<(p.inputStream||0))return;
      if(stream>(p.inputStream||0)){p.inputStream=stream;p.lastSequence=0;}
    }else if(p.inputStream)return;
    const sequence=Number(payload?.seq)||0;
    if(sequence&&sequence<=(p.lastSequence||0))return;
    if(sequence)p.lastSequence=sequence;
    const old=p.inputState||{};
    if(payload?.lmb&&!old.lmb&&!p.state.attacking){
      p.state.charge=Math.max(p.state.charge,95);
    }
    if(payload?.rmb&&!old.rmb&&p.state.shieldCooldown<=0&&!p.state.attacking){
      p.state.shieldUp=true;
      p.state.parryWindow=170;
      p.state.shieldStrength=3;
      p.state.shieldTap=165;
    }
    if(payload?.dash&&!old.dash)p.pendingDash=true;
    originalHandle.call(this,id,payload);
  };
  proto.updatePlayer=function(p,ms){
    if(!p.alive)return;
    if(p.pendingDash&&!p.inputState.dash)p.inputState={...p.inputState,dash:true};
    originalUpdatePlayer.call(this,p,ms);
    if(p.pendingDash){p.pendingDash=false;p.inputState.dash=false;}
  };
  proto.step=function(ms){
    if(this.players.size<2){this.clock+=ms;return;}
    const wasReset=!!this.roundResetAt;
    originalStep.call(this,ms);
    if(wasReset&&!this.roundResetAt){
      let i=0;
      for(const p of this.players.values()){
        const facing=i++===0?0:Math.PI;
        p.state.facing=facing;p.inputState={keys:{},lmb:false,rmb:false,dash:false,ghostToggle:false,mouseAngle:facing};
        p.triggers={spawnGhost:false,toggleGhost:false};p.pendingDash=false;
      }
    }
    if(!Number.isSafeInteger(this.eventSerial))this.eventSerial=0;
    for(const p of this.players.values()){
      for(const event of p.events){
        if(!Number.isSafeInteger(event.id))event.id=++this.eventSerial;
      }
    }
  };
  proto.constrainToBounds=function(s){
    const bounds=this.map?.bounds||{w:22,h:14};
    s.x=Math.max(-bounds.w/2+RADIUS,Math.min(bounds.w/2-RADIUS,s.x));
    s.y=Math.max(-bounds.h/2+RADIUS,Math.min(bounds.h/2-RADIUS,s.y));
    for(let pass=0;pass<3;pass++){
      let hit=false;
      for(const w of this.map?.walls||[]){
        const lx=w.x-w.w/2,rx=w.x+w.w/2,ty=w.y-w.h/2,by=w.y+w.h/2;
        const nx=Math.max(lx,Math.min(rx,s.x)),ny=Math.max(ty,Math.min(by,s.y));
        const dx=s.x-nx,dy=s.y-ny,d2=dx*dx+dy*dy;
        if(d2>=RADIUS*RADIUS)continue;
        hit=true;
        if(d2>1e-8){const k=(RADIUS-Math.sqrt(d2))/Math.sqrt(d2);s.x+=dx*k;s.y+=dy*k;}
        else {
          const edges=[[Math.abs(s.x-lx),lx-RADIUS,'x'],[Math.abs(rx-s.x),rx+RADIUS,'x'],[Math.abs(s.y-ty),ty-RADIUS,'y'],[Math.abs(by-s.y),by+RADIUS,'y']];
          edges.sort((a,b)=>a[0]-b[0]);s[edges[0][2]]=edges[0][1];
        }
        s.vx*=.55;s.vy*=.55;
      }
      s.x=Math.max(-bounds.w/2+RADIUS,Math.min(bounds.w/2-RADIUS,s.x));
      s.y=Math.max(-bounds.h/2+RADIUS,Math.min(bounds.h/2-RADIUS,s.y));
      if(!hit)break;
    }
  };
  proto.applyInputToActor=function(s,input,ms){
    const dt=Math.min(.05,Math.max(0,ms)/1000), k=input.keys||{};
    let mx=Number(!!k.d)-Number(!!k.a),my=Number(!!k.s)-Number(!!k.w);
    const mag=Math.hypot(mx,my);if(mag){mx/=mag;my/=mag;}
    if(Number.isFinite(input.mouseAngle))s.facing=Math.atan2(Math.sin(input.mouseAngle),Math.cos(input.mouseAngle));
    s.dashCooldown=Math.max(0,s.dashCooldown-ms);
    s.shieldCooldown=Math.max(0,s.shieldCooldown-ms);
    s.parryWindow=Math.max(0,s.parryWindow-ms);
    s.stagger=Math.max(0,s.stagger-ms);
    if(input.dash&&s.dashCooldown<=0&&s.stagger<=0){
      const dx=mag?mx:Math.cos(s.facing),dy=mag?my:Math.sin(s.facing);
      s.vx=dx*15;s.vy=dy*15;s.dashCooldown=750;
    }
    const dashing=s.dashCooldown>565;
    s.vx+=mx*(s.stagger?12:57)*dt;
    s.vy+=my*(s.stagger?12:57)*dt;
    const friction=Math.pow(dashing?.975:.85,dt*60);
    s.vx*=friction;s.vy*=friction;
    const speed=Math.hypot(s.vx,s.vy),max=dashing?15:(s.speed||7);
    if(speed>max){s.vx*=max/speed;s.vy*=max/speed;}
    s.x+=s.vx*dt;s.y+=s.vy*dt;
    this.constrainToBounds(s);
    if(input.rmb&&!s.shieldUp&&s.shieldCooldown<=0&&!s.attacking){
      s.shieldUp=true;s.parryWindow=170;s.shieldStrength=3;
    }
    s.shieldTap=Math.max(0,(s.shieldTap||0)-ms);
    if(!input.rmb&&s.shieldUp&&s.shieldTap<=0){s.shieldUp=false;s.parryWindow=0;}
    if(input.lmb&&!s.shieldUp&&!s.attacking)s.charge=Math.min(1800,Math.max(80,s.charge+ms));
    else if(!input.lmb&&s.charge>0){
      if(!s.shieldUp&&!s.attacking){
        s.attacking=true;s.attackTimer=200;s.attackPower=s.charge;
      }
      s.charge=0;
    }
    if(s.attacking){s.attackTimer-=ms;if(s.attackTimer<=0){s.attacking=false;s.attackPower=0;}}
  };
  proto.resolvePair=function(a,b){
    if(owner(a)===owner(b))return;
    const canHit=(from,to)=>{
      const s=from.state,t=to.state;
      const range=1.5+Math.min(1800,s.attackPower||0)/2400;
      return from.alive&&to.alive&&s.attacking&&distance(s,t)<=range+RADIUS
        &&faceDot(s,t)>.40&&!betweenWalls(this.map,s,t);
    };
    const ah=canHit(a,b),bh=canHit(b,a);
    if(ah&&bh){this.emitEvent('clash',[a,b]);a.state.attacking=false;b.state.attacking=false;
      a.state.stagger=Math.max(a.state.stagger,170);b.state.stagger=Math.max(b.state.stagger,170);return;}
    if(ah)this.tryHit(a,b);
    else if(bh)this.tryHit(b,a);
  };
  proto.tryHit=function(a,b){
    if(owner(a)===owner(b)||!a.alive||!b.alive||!a.state.attacking)return;
    const s=a.state,t=b.state;
    const range=1.5+Math.min(1800,s.attackPower||0)/2400;
    if(distance(s,t)>range+RADIUS||faceDot(s,t)<=.40||betweenWalls(this.map,s,t))return;
    s.attacking=false;
    if(t.shieldUp&&faceDot(t,s)>.15){
      if(t.parryWindow>0){
        s.stagger=460;t.shieldUp=false;t.shieldCooldown=320;t.parryWindow=0;
        if(b.events)b.events.push({type:'parry',target:a.id});
        if(a.events)a.events.push({type:'parried',target:b.id});
      }else{
        t.shieldStrength-=s.attackPower>=1200?2:1;
        if(t.shieldStrength<=0){t.shieldUp=false;t.shieldCooldown=1400;}
        if(b.events)b.events.push({type:'block',target:a.id});
      }
      return;
    }
    if(b.isGhost){b.alive=false;if(a.events)a.events.push({type:'ghostBreak',target:b.id});return;}
    this.killPlayer(b,a);
  };
  proto.killPlayer=function(player,killer){
    if(!player.alive)return;
    const id=owner(killer||{id:''});
    const champion=this.players.get(id);
    if(champion&&champion.id!==player.id)champion.score=(champion.score||0)+1;
    originalKill.call(this,player,killer);
  };
}
improveKatanaCombat(GameRoom);

module.exports = { GameRoom, TICK_RATE };

