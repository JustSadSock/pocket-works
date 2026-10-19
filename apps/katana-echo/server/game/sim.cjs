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

module.exports = { GameRoom, TICK_RATE };

