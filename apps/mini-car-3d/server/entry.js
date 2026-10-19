import RAPIER from './vendor/rapier-0.12-da5bcba9ab82/rapier.js';
function context(saved){let world=saved?RAPIER.World.restoreSnapshot(Uint8Array.from(atob(saved.physics),c=>c.charCodeAt(0))):new RAPIER.World({x:0,y:-12.8,z:0});const clients=new Map((saved?.clients||[]).map(([id,p])=>[id,{...p,ws:{readyState:1}}]));const props=saved?.props||[],dynamicPropHandles=new Set(props.filter(p=>p.dynamic).map(p=>p.bodyHandle));let tick=saved?.tick||0,clientsConnected=clients.size;const WebSocket={OPEN:1};
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quatFromEuler(yaw) {
  const half = yaw * 0.5;
  const s = Math.sin(half);
  const c = Math.cos(half);
  return { x: 0, y: s, z: 0, w: c };
}

function vectorArray(v) {
  return [v.x, v.y, v.z];
}

function quatArray(q) {
  return [q.x, q.y, q.z, q.w];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function makeGroundAndBounds() {
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(110, 0.1, 110)
      .setTranslation(0, -0.05, 0)
      .setFriction(1.15) // grippy ground
      .setRestitution(0.1), // low bounce
    groundBody
  );

  const wallThickness = 2;
  const wallHeight = 4;
  const half = 110;
  const positions = [
    { x: half + wallThickness, y: wallHeight / 2, z: 0 },
    { x: -half - wallThickness, y: wallHeight / 2, z: 0 },
    { x: 0, y: wallHeight / 2, z: half + wallThickness },
    { x: 0, y: wallHeight / 2, z: -half - wallThickness }
  ];
  positions.forEach((p, idx) => {
    const sizeX = idx < 2 ? wallThickness : half + wallThickness;
    const sizeZ = idx < 2 ? half + wallThickness : wallThickness;
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(sizeX, wallHeight / 2, sizeZ)
        .setTranslation(p.x, p.y, p.z)
        .setFriction(0.9)
        .setRestitution(0.2),
      wallBody
    );
  });
}

function createProps() {
  const rng = mulberry32(1337);
  const count = 18;
  for (let i = 0; i < count; i++) {
    const dynamic = rng() > 0.35;
    const shape = rng() > 0.6 ? 'cylinder' : 'box';
    const size = {
      x: 0.4 + rng() * 0.4,
      y: 0.35 + rng() * 0.35,
      z: 0.4 + rng() * 0.4
    };
    const initial = {
      p: [lerp(-15, 15, rng()), size.y + 0.1, lerp(-15, 15, rng())],
      q: quatArray(quatFromEuler(rng() * Math.PI * 2))
    };
    const id = `p${i}`;
    const bodyDesc = dynamic
      ? RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(initial.p[0], initial.p[1], initial.p[2])
          .setRotation({ x: initial.q[0], y: initial.q[1], z: initial.q[2], w: initial.q[3] })
          .setLinearDamping(1.2)
          .setAngularDamping(1.6)
          .setCcdEnabled(true)
      : RAPIER.RigidBodyDesc.fixed().setTranslation(initial.p[0], initial.p[1], initial.p[2]);
    const body = world.createRigidBody(bodyDesc);
    let colliderDesc;
    if (shape === 'cylinder') {
      colliderDesc = RAPIER.ColliderDesc.cylinder(size.y, size.x);
    } else if (shape === 'cone') {
      colliderDesc = RAPIER.ColliderDesc.cone(size.y, size.x);
    } else {
      colliderDesc = RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
    }
    const collider = world.createCollider(
      colliderDesc
        .setFriction(0.9)
        .setRestitution(0.28)
        .setDensity(dynamic ? 0.6 : 1.0),
      body
    );

    props.push({ id, shape, size, initial, dynamic, bodyHandle: body.handle, colliderHandle: collider.handle });
    if (dynamic) dynamicPropHandles.add(body.handle);
  }
}

function resetPropIfOutOfBounds(prop) {
  if (!prop.dynamic) return;
  const body = world.getRigidBody(prop.bodyHandle);
  if (!body) return;
  const t = body.translation();
  if (Math.abs(t.x) > 200 || t.y < -20 || Math.abs(t.z) > 200) {
    body.setTranslation({ x: prop.initial.p[0], y: prop.initial.p[1], z: prop.initial.p[2] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setRotation({ x: prop.initial.q[0], y: prop.initial.q[1], z: prop.initial.q[2], w: prop.initial.q[3] }, true);
  }
}

function spawnPlayer(id, colorIdx = 0) {
  const spawnX = (clients.size % 4) * 4 - 4;
  const spawnZ = Math.floor(clients.size / 4) * 4 - 4;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, 0.6, spawnZ)
      .setRotation(quatFromEuler(0))
      .setLinearDamping(3.2)
      .setAngularDamping(7.0)
      .setCcdEnabled(true)
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.9, 0.4, 1.6)
      .setFriction(1.2)
      .setRestitution(0.3)
      .setDensity(0.7),
    body
  );
  collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  clients.set(id, {
    ws: null,
    colorId: colorIdx,
    bodyHandle: body.handle,
    colliderHandle: collider.handle,
    lastInput: { steer: 0, throttle: 0, brake: false },
    lastSeq: 0,
    lastSeen: Date.now()
  });
}

function removePlayer(id) {
  const entry = clients.get(id);
  if (!entry) return;
  if (entry.bodyHandle !== undefined) {
    const body = world.getRigidBody(entry.bodyHandle);
    if (body) {
      world.removeRigidBody(body);
    }
  }
  clients.delete(id);
  clientsConnected = clients.size;
}

function playerSnapshot(id) {
  const entry = clients.get(id);
  if (!entry) return null;
  const body = world.getRigidBody(entry.bodyHandle);
  if (!body) return null;
  const t = body.translation();
  const q = body.rotation();
  const lv = body.linvel();
  const av = body.angvel();
  return {
    id,
    p: vectorArray(t),
    q: quatArray(q),
    lv: vectorArray(lv),
    av: vectorArray(av)
  };
}

function propSnapshot(prop) {
  const body = world.getRigidBody(prop.bodyHandle);
  if (!body) return null;
  const t = body.translation();
  const q = body.rotation();
  const lv = body.linvel();
  const av = body.angvel();
  return {
    id: prop.id,
    p: vectorArray(t),
    q: quatArray(q),
    lv: vectorArray(lv),
    av: vectorArray(av)
  };
}

function applyInputs(dt) {
  if (!world) return;
  for (const [id, client] of clients.entries()) {
    if (!client.ws || client.ws.readyState !== WebSocket.OPEN) continue;
    const body = world.getRigidBody(client.bodyHandle);
    if (!body) continue;
    const input = client.lastInput;
    const transform = body.rotation();
    const fwd = {
      x: 2 * (transform.x * transform.z + transform.w * transform.y),
      y: 2 * (transform.y * transform.z - transform.w * transform.x),
      z: 1 - 2 * (transform.x * transform.x + transform.y * transform.y)
    };
    const right = {
      x: 1 - 2 * (transform.y * transform.y + transform.z * transform.z),
      y: 2 * (transform.x * transform.y + transform.w * transform.z),
      z: 2 * (transform.x * transform.z - transform.w * transform.y)
    };

    const engineForce = 180;
    const steerStrength = 30;
    const brakeStrength = 14;
    const sideGrip = 7.6; // higher = less lateral drift
    const maxYaw = 2.7;

    const throttle = clamp(input.throttle || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    const braking = Boolean(input.brake);

    body.applyImpulse({ x: fwd.x * engineForce * throttle * dt, y: fwd.y * engineForce * throttle * dt, z: fwd.z * engineForce * throttle * dt }, true);
    const speed = body.linvel();
    const speedMag = Math.hypot(speed.x, speed.y, speed.z);
    const steerScale = 1 - Math.min(speedMag / 12, 1) * 0.7;
    body.applyTorqueImpulse({ x: 0, y: steerStrength * steer * steerScale * dt, z: 0 }, true);

    if (braking) {
      const lv = body.linvel();
      body.applyImpulse({ x: -lv.x * brakeStrength * dt, y: 0, z: -lv.z * brakeStrength * dt }, true);
    }

    // Simple sideways friction to keep toy feel stable
    const lv = body.linvel();
    const lateral = lv.x * right.x + lv.y * right.y + lv.z * right.z;
    const sideImpulse = { x: -right.x * lateral * sideGrip * dt, y: -right.y * lateral * sideGrip * 0.4 * dt, z: -right.z * lateral * sideGrip * dt };
    const sideLen = Math.hypot(sideImpulse.x, sideImpulse.y, sideImpulse.z);
    const maxSide = sideGrip * dt * 8;
    const scale = sideLen > maxSide ? maxSide / sideLen : 1;
    body.applyImpulse({ x: sideImpulse.x * scale, y: sideImpulse.y * scale, z: sideImpulse.z * scale }, true);

    // Downforce + yaw clamp
    const downForce = Math.min(speedMag * 0.35, 8);
    body.applyImpulse({ x: 0, y: -downForce * dt, z: 0 }, true);
    const ang = body.angvel();
    if (Math.abs(ang.y) > maxYaw) {
      body.setAngvel({ x: ang.x * 0.6, y: Math.sign(ang.y) * maxYaw, z: ang.z * 0.6 }, true);
    }
  }
}

function buildSnapshot(targetId = null) {
  const payload = {
    type: 'snapshot',
    tick,
    serverTime: Date.now(),
    ack: targetId ? { id: targetId, lastSeq: clients.get(targetId)?.lastSeq || 0 } : undefined,
    players: [],
    props: []
  };

  for (const id of clients.keys()) {
    const snap = playerSnapshot(id);
    if (snap) payload.players.push(snap);
  }

  for (const prop of props) {
    if (!prop.dynamic) continue;
    const snap = propSnapshot(prop);
    if (snap) payload.props.push(snap);
  }

  return payload;
}


if(!saved){makeGroundAndBounds();createProps();}
function pack(){const snapshot=buildSnapshot();let binary='';for(const b of world.takeSnapshot())binary+=String.fromCharCode(b);const state={physics:btoa(binary),clients:[...clients].map(([id,p])=>[id,{...p,ws:null}]),props,tick,lastTick:Date.now(),accumulator,snapshot,definitions:props.map(({id,shape,size,initial,dynamic})=>({id,shape,size,initial,dynamic}))};world.free();return {state,events:[{type:'state',payload:{}}]};}
let accumulator=saved?.accumulator||0;function step(){for(const p of clients.values())if(Date.now()-p.lastSeen>500)p.lastInput={steer:0,throttle:0,brake:false};const elapsed=Math.min(.25,Math.max(0,(Date.now()-(saved?.lastTick||Date.now()))/1000));accumulator=Math.min(.25,accumulator+elapsed);while(accumulator>=1/60){const dt=1/60;accumulator-=dt;world.timestep=dt;applyInputs(dt);world.step();tick++;for(const prop of props)resetPropIfOutOfBounds(prop);}}
return {clients,pack,step,add(id){if(!clients.has(id)){if(clients.size>=8){world.free();throw Error('Комната заполнена');}spawnPlayer(id,clients.size);clients.get(id).ws={readyState:1};}},remove:removePlayer};}
export default {protocolVersion:1,
createRoom({player}){const c=context(null);c.add(player.id);return c.pack();},
onJoin({state,player}){const c=context(state);c.step();c.add(player.id);return c.pack();},
onLeave({state,player}){const c=context(state);c.step();c.remove(player.id);return c.pack();},
onMessage({state,player,payload}){if(payload?.type!=='input'||!Number.isFinite(payload.steer)||!Number.isFinite(payload.throttle))throw Error('Некорректное управление');const c=context(state);c.step();const p=c.clients.get(player.id);if(p){p.lastInput={steer:Math.max(-1,Math.min(1,payload.steer)),throttle:Math.max(-1,Math.min(1,payload.throttle)),brake:!!payload.brake};p.lastSeq=Number.isSafeInteger(payload.seq)?payload.seq:0;p.lastSeen=Date.now();}return c.pack();},
viewForPlayer({state,player}){return {phase:'playing',definitions:state.definitions,snapshot:{...state.snapshot,ack:{id:player.id,lastSeq:state.clients.find(([id])=>id===player.id)?.[1].lastSeq||0}}};}};


