const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapAngle = (value) => {
  let angle = value % TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle < -Math.PI) angle += TAU;
  return angle;
};

const OBJECTS = [
  { id: 'door', type: 'door', angle: 0 * DEG, distance: 2.9, width: 1.15, height: 2.35, y: 0 },
  { id: 'chair', type: 'chair', angle: 34 * DEG, distance: 2.4, width: 1.0, height: 1.25, y: 0 },
  { id: 'window', type: 'window', angle: 76 * DEG, distance: 3.0, width: 1.5, height: 1.75, y: .62 },
  { id: 'dresser', type: 'dresser', angle: 110 * DEG, distance: 2.55, width: 1.55, height: 1.05, y: 0 },
  { id: 'clock', type: 'clock', angle: 145 * DEG, distance: 3.1, width: .7, height: .7, y: 1.45 },
  { id: 'lamp', type: 'lamp', angle: 178 * DEG, distance: 2.7, width: .62, height: 1.72, y: .28 },
  { id: 'mirror', type: 'mirror', angle: -145 * DEG, distance: 3.0, width: 1.02, height: 1.72, y: .58 },
  { id: 'radio', type: 'radio', angle: -106 * DEG, distance: 2.25, width: .9, height: .62, y: .72 },
  { id: 'portrait', type: 'portrait', angle: -62 * DEG, distance: 3.05, width: 1.02, height: 1.35, y: .94 },
  { id: 'basin', type: 'basin', angle: -24 * DEG, distance: 2.55, width: 1.18, height: .92, y: 0 }
];

const ENTITY_POSES = [
  { angle: 128 * DEG, distance: 3.35 },
  { angle: -118 * DEG, distance: 2.95 },
  { angle: 57 * DEG, distance: 2.7 },
  { angle: -34 * DEG, distance: 2.35 },
  { angle: 174 * DEG, distance: 1.92 }
];

function seededRandom(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

export class RoomScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.reducedMotion = false;
    this.seed = 0x0f0f2026;
    this.random = seededRandom(this.seed);
    this.dust = [];
    this.scratches = [];
    this.flash = 0;
    this.time = 0;
    this.lastState = null;
    this.resize();
    this.buildParticles();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  setSeed(seed) {
    this.seed = seed >>> 0 || 1;
    this.random = seededRandom(this.seed);
    this.buildParticles();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    const nextWidth = Math.round(this.width * this.dpr);
    const nextHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  buildParticles() {
    this.dust = Array.from({ length: 62 }, () => ({
      x: this.random(),
      y: this.random(),
      z: .25 + this.random() * .75,
      phase: this.random() * TAU,
      drift: .1 + this.random() * .35
    }));
    this.scratches = Array.from({ length: 17 }, () => ({
      x: this.random(),
      y: this.random(),
      h: .03 + this.random() * .22,
      alpha: .015 + this.random() * .04
    }));
  }

  getVisibleObject(yaw, pitch = 0) {
    const fov = 68 * DEG;
    let best = null;
    for (const object of OBJECTS) {
      const diff = wrapAngle(object.angle - yaw);
      if (Math.abs(diff) > fov * .56) continue;
      const centerBias = 1 - Math.abs(diff) / (fov * .56);
      const verticalCenter = .5 - object.y * .1 + pitch * .15;
      const verticalBias = clamp(1 - Math.abs(verticalCenter - .5) * 2.1, 0, 1);
      const quality = centerBias * .86 + verticalBias * .14;
      if (!best || quality > best.quality) best = { ...object, diff, quality };
    }
    return best;
  }

  render(state) {
    this.lastState = state;
    this.time = state.time || 0;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const threat = clamp(state.threat || 0, 0, 100);
    const jitter = this.reducedMotion ? 0 : threat > 72 ? Math.sin(this.time * .043) * (threat - 70) * .015 : 0;
    ctx.translate(jitter, 0);

    const horizon = h * (.48 + clamp(state.pitch || 0, -.45, .45) * .21);
    const roll = clamp(state.roll || 0, -.16, .16);
    ctx.translate(w / 2, horizon);
    ctx.rotate(roll);
    ctx.translate(-w / 2, -horizon);

    this.drawRoomBase(ctx, state, horizon);
    this.drawWallSeams(ctx, state, horizon);
    this.drawObjects(ctx, state, horizon);
    this.drawEntity(ctx, state, horizon);
    this.drawDust(ctx, state, horizon);
    this.drawLight(ctx, state, horizon);
    this.drawLensArtifacts(ctx, state);

    ctx.restore();
  }

  captureDataUrl() {
    try {
      return this.canvas.toDataURL('image/jpeg', .84);
    } catch {
      return this.canvas.toDataURL();
    }
  }

  drawRoomBase(ctx, state, horizon) {
    const w = this.width;
    const h = this.height;
    const threat = clamp(state.threat || 0, 0, 100);

    const ceiling = ctx.createLinearGradient(0, 0, 0, horizon);
    ceiling.addColorStop(0, '#050604');
    ceiling.addColorStop(.56, threat > 72 ? '#11100d' : '#10120e');
    ceiling.addColorStop(1, '#1b1c17');
    ctx.fillStyle = ceiling;
    ctx.fillRect(0, 0, w, horizon + 1);

    const wall = ctx.createLinearGradient(0, horizon * .28, 0, h * .79);
    wall.addColorStop(0, '#151712');
    wall.addColorStop(.46, '#24251e');
    wall.addColorStop(1, '#11120f');
    ctx.fillStyle = wall;
    ctx.fillRect(0, horizon * .25, w, h * .58);

    ctx.globalAlpha = .26;
    for (let y = horizon * .38; y < h * .77; y += 28) {
      ctx.fillStyle = y % 56 < 2 ? '#4b493c' : '#11120f';
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;

    const floorTop = h * .72;
    const floor = ctx.createLinearGradient(0, floorTop, 0, h);
    floor.addColorStop(0, '#151510');
    floor.addColorStop(1, '#050604');
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorTop, w, h - floorTop);

    const yaw = state.yaw || 0;
    ctx.save();
    ctx.globalAlpha = .23;
    ctx.strokeStyle = '#77705e';
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 1) {
      const offset = i * w * .15 - ((yaw / TAU) * w * 2.4 % (w * .15));
      ctx.beginPath();
      ctx.moveTo(w / 2 + offset * .16, floorTop);
      ctx.lineTo(w / 2 + offset, h);
      ctx.stroke();
    }
    for (let i = 1; i <= 7; i += 1) {
      const t = i / 7;
      const y = floorTop + (h - floorTop) * t * t;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    const mutation = state.mutation || 0;
    if (mutation > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(70, 48, 38, ${.12 + mutation * .05})`;
      ctx.lineWidth = 1.2;
      const tearX = w * (.18 + (mutation % 3) * .27);
      ctx.beginPath();
      ctx.moveTo(tearX, h * .2);
      for (let i = 1; i < 9; i += 1) {
        ctx.lineTo(tearX + Math.sin(i * 2.7 + mutation) * (7 + mutation * 2), h * (.2 + i * .055));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawWallSeams(ctx, state, horizon) {
    const w = this.width;
    const h = this.height;
    const focal = w * .82;
    const yaw = state.yaw || 0;
    ctx.save();
    ctx.strokeStyle = 'rgba(122,116,96,.21)';
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 1) {
      const angle = i * 45 * DEG;
      const diff = wrapAngle(angle - yaw);
      if (Math.abs(diff) > 1.1) continue;
      const x = w / 2 + Math.tan(diff) * focal;
      ctx.beginPath();
      ctx.moveTo(x, horizon * .38);
      ctx.lineTo(x, h * .75);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawObjects(ctx, state, horizon) {
    const visible = OBJECTS
      .map((object) => ({ ...object, diff: wrapAngle(object.angle - (state.yaw || 0)) }))
      .filter((object) => Math.abs(object.diff) < 62 * DEG)
      .sort((a, b) => b.distance - a.distance);

    for (const object of visible) this.drawObject(ctx, object, state, horizon);
  }

  projectObject(object, state, horizon) {
    const w = this.width;
    const focal = w * .86;
    const x = w / 2 + Math.tan(object.diff) * focal;
    const perspective = clamp((focal / (object.distance * 420)), .34, 1.25);
    const baseY = this.height * .74 - object.y * 165 * perspective + (state.pitch || 0) * this.height * .12;
    const width = object.width * 160 * perspective;
    const height = object.height * 160 * perspective;
    return { x, y: baseY, width, height, scale: perspective };
  }

  drawObject(ctx, object, state, horizon) {
    const p = this.projectObject(object, state, horizon);
    if (p.x + p.width < -20 || p.x - p.width > this.width + 20) return;
    const isActive = state.activeTarget === object.id;
    const captured = Array.isArray(state.captured) && state.captured.includes(object.id);
    const anomaly = isActive ? state.anomalyLevel || 1 : 0;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale, p.scale);
    ctx.globalAlpha = captured ? .78 : 1;

    const shadowWidth = object.width * 138;
    ctx.fillStyle = `rgba(0,0,0,${.22 + object.distance * .035})`;
    ctx.beginPath();
    ctx.ellipse(0, 7, shadowWidth * .58, 14 + object.height * 3, 0, 0, TAU);
    ctx.fill();

    switch (object.type) {
      case 'door': this.drawDoor(ctx, anomaly, state); break;
      case 'chair': this.drawChair(ctx, anomaly); break;
      case 'window': this.drawWindow(ctx, anomaly, state); break;
      case 'dresser': this.drawDresser(ctx, state); break;
      case 'clock': this.drawClock(ctx, anomaly, state); break;
      case 'lamp': this.drawLamp(ctx, anomaly, state); break;
      case 'mirror': this.drawMirror(ctx, anomaly, state); break;
      case 'radio': this.drawRadio(ctx, anomaly, state); break;
      case 'portrait': this.drawPortrait(ctx, anomaly, state); break;
      case 'basin': this.drawBasin(ctx, state); break;
      default: break;
    }

    if (captured) {
      ctx.strokeStyle = 'rgba(172,138,84,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-36, -34);
      ctx.lineTo(34, 26);
      ctx.moveTo(32, -36);
      ctx.lineTo(-26, 32);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDoor(ctx, anomaly, state) {
    const open = anomaly > 0 || state.finalDoorOpen;
    ctx.fillStyle = '#0b0c09';
    ctx.fillRect(-72, -320, 144, 320);
    ctx.strokeStyle = '#4b493d';
    ctx.lineWidth = 10;
    ctx.strokeRect(-78, -328, 156, 330);
    ctx.fillStyle = open ? '#050605' : '#29291f';
    if (open) {
      ctx.beginPath();
      ctx.moveTo(-63, -312);
      ctx.lineTo(52, -289);
      ctx.lineTo(52, -2);
      ctx.lineTo(-63, -2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#11120f';
      ctx.beginPath();
      ctx.moveTo(52, -289);
      ctx.lineTo(74, -318);
      ctx.lineTo(74, 0);
      ctx.lineTo(52, -2);
      ctx.fill();
      if (state.finalDoorOpen) {
        ctx.fillStyle = 'rgba(179,152,100,.13)';
        ctx.beginPath();
        ctx.moveTo(-50,-300); ctx.lineTo(46,-279); ctx.lineTo(34,-18); ctx.lineTo(-48,-18); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillRect(-63, -314, 126, 314);
      ctx.strokeStyle = '#171812';
      ctx.lineWidth = 3;
      ctx.strokeRect(-48, -292, 96, 120);
      ctx.strokeRect(-48, -150, 96, 120);
      ctx.fillStyle = '#8c764b';
      ctx.beginPath(); ctx.arc(43, -148, 7, 0, TAU); ctx.fill();
    }
    if (anomaly > 0 && !state.finalDoorOpen) {
      ctx.fillStyle = 'rgba(8,9,7,.85)';
      ctx.beginPath();
      ctx.ellipse(-8, -170, 24, 72, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(206,194,168,.16)';
      ctx.fillRect(-22,-204,6,3);
      ctx.fillRect(7,-204,6,3);
    }
  }

  drawChair(ctx, anomaly) {
    ctx.strokeStyle = '#4a4133';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-52, -122); ctx.lineTo(-58, 0);
    ctx.moveTo(52, -122); ctx.lineTo(anomaly ? 86 : 58, 0);
    ctx.moveTo(-50, -122); ctx.lineTo(-48, -226);
    ctx.moveTo(50, -122); ctx.lineTo(52, -226);
    ctx.stroke();
    ctx.fillStyle = '#383226';
    ctx.fillRect(-62, -145, 124, 34);
    ctx.fillStyle = '#2a281f';
    ctx.fillRect(-51, -218, 102, 64);
    ctx.strokeStyle = '#5e5544';
    ctx.lineWidth = 4;
    ctx.strokeRect(-51, -218, 102, 64);
    if (anomaly) {
      ctx.fillStyle = 'rgba(0,0,0,.52)';
      ctx.beginPath();
      ctx.ellipse(16, -102, 62, 18, -.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(146,92,67,.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(79,-8); ctx.lineTo(101,10); ctx.stroke();
    }
  }

  drawWindow(ctx, anomaly, state) {
    ctx.fillStyle = '#070a09';
    ctx.fillRect(-120, -250, 240, 210);
    ctx.strokeStyle = '#555445';
    ctx.lineWidth = 10;
    ctx.strokeRect(-126, -256, 252, 222);
    ctx.strokeStyle = '#30342f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -250); ctx.lineTo(0, -40);
    ctx.moveTo(-120, -146); ctx.lineTo(120, -146);
    ctx.stroke();
    const moon = ctx.createRadialGradient(56,-190,2,56,-190,42);
    moon.addColorStop(0,'rgba(218,216,190,.55)');
    moon.addColorStop(1,'rgba(122,132,116,0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0,-250,120,104);
    ctx.fillStyle = '#2d2b24';
    ctx.beginPath(); ctx.moveTo(-142,-268); ctx.lineTo(-86,-236); ctx.lineTo(-82,-26); ctx.lineTo(-150,-2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(142,-268); ctx.lineTo(86,-236); ctx.lineTo(82,-26); ctx.lineTo(150,-2); ctx.closePath(); ctx.fill();
    if (anomaly) {
      ctx.strokeStyle = 'rgba(174,161,132,.58)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-38, -150, 26, .2, Math.PI*1.7);
      ctx.moveTo(-38,-124); ctx.lineTo(-52,-84);
      ctx.moveTo(-38,-124); ctx.lineTo(-23,-86);
      ctx.moveTo(-48,-144); ctx.lineTo(-71,-121);
      ctx.moveTo(-28,-145); ctx.lineTo(-6,-123);
      ctx.stroke();
      for (let i=0;i<5;i+=1){ctx.beginPath();ctx.moveTo(-50+i*6,-172);ctx.lineTo(-54+i*7,-194);ctx.stroke();}
    }
    if ((state.mutation || 0) > 2) {
      ctx.strokeStyle='rgba(196,189,165,.22)';
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-20,-244);ctx.lineTo(-8,-185);ctx.lineTo(-31,-133);ctx.lineTo(-11,-50);ctx.stroke();
    }
  }

  drawDresser(ctx, state) {
    ctx.fillStyle = '#302b22';
    ctx.fillRect(-122, -122, 244, 122);
    ctx.strokeStyle = '#5a5040';
    ctx.lineWidth = 5;
    ctx.strokeRect(-122, -122, 244, 122);
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeRect(-108, -108 + i * 36, 216, 31);
      ctx.fillStyle = '#8c754a';
      ctx.beginPath(); ctx.arc(0, -92 + i * 36, 4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle='#171812';
    ctx.fillRect(-90,-154,64,28);
    ctx.fillStyle='#4c4638';
    ctx.fillRect(32,-170,56,45);
    if ((state.mutation || 0) > 1) {
      ctx.fillStyle='rgba(0,0,0,.55)';
      ctx.fillRect(-108,-72,216,31);
    }
  }

  drawClock(ctx, anomaly, state) {
    ctx.fillStyle = '#181914';
    ctx.beginPath(); ctx.arc(0, -96, 55, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b634f';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = '#aba28c';
    ctx.beginPath(); ctx.arc(0, -96, 43, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#302d25';
    ctx.lineWidth = 2;
    const marks = anomaly ? 13 : 12;
    for (let i = 0; i < marks; i += 1) {
      const a = i / marks * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*33, -96 + Math.sin(a)*33);
      ctx.lineTo(Math.cos(a)*39, -96 + Math.sin(a)*39);
      ctx.stroke();
    }
    const t = (state.time || 0) * .0002;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0,-96); ctx.lineTo(Math.sin(t)*20,-96-Math.cos(t)*20); ctx.stroke();
    ctx.lineWidth = 2;
    const direction = anomaly ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(0,-96); ctx.lineTo(Math.sin(t*7*direction)*31,-96-Math.cos(t*7*direction)*31); ctx.stroke();
    if (anomaly) {
      ctx.fillStyle='#6f3d32';
      ctx.beginPath();ctx.arc(0,-96,4,0,TAU);ctx.fill();
    }
  }

  drawLamp(ctx, anomaly, state) {
    ctx.strokeStyle = '#34352e';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, -246); ctx.lineTo(0, -82); ctx.stroke();
    ctx.fillStyle = '#24251f';
    ctx.beginPath();ctx.moveTo(-48,-90);ctx.lineTo(48,-90);ctx.lineTo(28,-32);ctx.lineTo(-28,-32);ctx.closePath();ctx.fill();
    ctx.fillStyle = anomaly ? '#3e261f' : '#877d60';
    ctx.beginPath();ctx.ellipse(0,-24,13,20,0,0,TAU);ctx.fill();
    if (anomaly) {
      ctx.fillStyle='#090a08';
      ctx.beginPath();ctx.ellipse(0,-24,5,10,0,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(202,178,126,.5)';ctx.fillRect(-1,-31,2,14);
    } else {
      const glow=ctx.createRadialGradient(0,-24,2,0,-24,80);
      glow.addColorStop(0,'rgba(184,158,101,.23)');glow.addColorStop(1,'rgba(184,158,101,0)');ctx.fillStyle=glow;ctx.fillRect(-90,-114,180,180);
    }
    if ((state.mutation||0)>3){ctx.strokeStyle='rgba(120,73,56,.38)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-4,-82);ctx.lineTo(7,-55);ctx.stroke();}
  }

  drawMirror(ctx, anomaly, state) {
    ctx.fillStyle='#1a1c18';
    ctx.fillRect(-69,-250,138,220);
    ctx.strokeStyle='#625a49';ctx.lineWidth=11;ctx.strokeRect(-76,-258,152,236);
    const reflection=ctx.createLinearGradient(-60,-244,60,-30);
    reflection.addColorStop(0,'#38403a');reflection.addColorStop(.55,'#1b201e');reflection.addColorStop(1,'#080a09');ctx.fillStyle=reflection;ctx.fillRect(-62,-244,124,208);
    ctx.globalAlpha=.18;ctx.fillStyle='#c3baa4';ctx.fillRect(-44,-226,14,144);ctx.globalAlpha=1;
    if (anomaly) {
      ctx.fillStyle='rgba(5,6,5,.84)';
      ctx.beginPath();ctx.ellipse(16,-150,25,64,0,0,TAU);ctx.fill();
      ctx.beginPath();ctx.moveTo(-3,-117);ctx.lineTo(-28,-34);ctx.lineTo(2,-34);ctx.lineTo(16,-112);ctx.fill();
      ctx.beginPath();ctx.moveTo(35,-117);ctx.lineTo(61,-34);ctx.lineTo(31,-34);ctx.lineTo(16,-112);ctx.fill();
      ctx.fillStyle='rgba(208,198,171,.24)';ctx.fillRect(6,-163,4,3);ctx.fillRect(22,-163,4,3);
    }
    if ((state.threat||0)>64){ctx.strokeStyle='rgba(139,87,66,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-56,-228);ctx.lineTo(-21,-160);ctx.lineTo(-47,-95);ctx.lineTo(-8,-42);ctx.stroke();}
  }

  drawRadio(ctx, anomaly, state) {
    ctx.fillStyle='#27251e';ctx.fillRect(-75,-88,150,88);
    ctx.strokeStyle='#5d5545';ctx.lineWidth=5;ctx.strokeRect(-75,-88,150,88);
    ctx.fillStyle='#13140f';ctx.fillRect(-61,-71,82,46);
    ctx.strokeStyle='#77705d';ctx.lineWidth=2;
    for(let y=-65;y<-28;y+=7){ctx.beginPath();ctx.moveTo(-57,y);ctx.lineTo(17,y);ctx.stroke();}
    ctx.fillStyle='#9a8151';ctx.beginPath();ctx.arc(48,-50,13,0,TAU);ctx.fill();
    ctx.fillStyle='#0c0d0a';ctx.beginPath();ctx.arc(48,-50,5,0,TAU);ctx.fill();
    ctx.strokeStyle='#554d3d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-50,-88);ctx.quadraticCurveTo(0,-138,50,-88);ctx.stroke();
    if(anomaly){
      ctx.fillStyle='#7a3d31';ctx.beginPath();ctx.ellipse(-20,-49,18,8,0,0,TAU);ctx.fill();
      ctx.fillStyle='#090a08';ctx.beginPath();ctx.arc(-20,-49,5,0,TAU);ctx.fill();
      const pulse=.5+.5*Math.sin((state.time||0)*.008);ctx.strokeStyle=`rgba(168,119,82,${.2+pulse*.35})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(-20,-49,24+pulse*7,0,TAU);ctx.stroke();
    }
  }

  drawPortrait(ctx, anomaly, state) {
    ctx.fillStyle='#201f19';ctx.fillRect(-75,-208,150,184);
    ctx.strokeStyle='#6f6049';ctx.lineWidth=12;ctx.strokeRect(-82,-216,164,200);
    ctx.fillStyle='#6f6a59';ctx.beginPath();ctx.ellipse(0,-120,40,56,0,0,TAU);ctx.fill();
    ctx.fillStyle='#8c806a';ctx.beginPath();ctx.moveTo(-33,-150);ctx.quadraticCurveTo(0,-198,36,-150);ctx.lineTo(28,-174);ctx.quadraticCurveTo(0,-208,-31,-174);ctx.fill();
    ctx.fillStyle='#3c392f';ctx.beginPath();ctx.moveTo(-54,-24);ctx.lineTo(-38,-86);ctx.quadraticCurveTo(0,-104,39,-86);ctx.lineTo(55,-24);ctx.fill();
    if(anomaly){
      ctx.fillStyle='#090a08';ctx.beginPath();ctx.ellipse(-15,-126,11,7,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(15,-126,11,7,0,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(182,165,130,.25)';ctx.fillRect(-18,-128,6,2);ctx.fillRect(12,-128,6,2);
      if((state.threat||0)>45){ctx.strokeStyle='rgba(117,63,50,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,-119);ctx.lineTo(-18,-90);ctx.moveTo(15,-119);ctx.lineTo(19,-92);ctx.stroke();}
    }else{
      ctx.fillStyle='#2e2d26';ctx.beginPath();ctx.arc(-15,-126,4,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(15,-126,4,0,TAU);ctx.fill();
    }
    ctx.strokeStyle='#3b372d';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-102,10,.1,Math.PI-.1);ctx.stroke();
  }

  drawBasin(ctx, state) {
    ctx.fillStyle='#292923';ctx.fillRect(-78,-126,156,126);
    ctx.strokeStyle='#555247';ctx.lineWidth=5;ctx.strokeRect(-78,-126,156,126);
    ctx.fillStyle='#6a685c';ctx.beginPath();ctx.ellipse(0,-114,68,22,0,0,TAU);ctx.fill();
    ctx.fillStyle='#131512';ctx.beginPath();ctx.ellipse(0,-114,54,14,0,0,TAU);ctx.fill();
    ctx.strokeStyle='#777264';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,-129);ctx.lineTo(0,-166);ctx.quadraticCurveTo(0,-188,28,-188);ctx.lineTo(28,-170);ctx.stroke();
    if((state.mutation||0)>2){ctx.fillStyle='rgba(111,63,50,.28)';ctx.beginPath();ctx.ellipse(0,-114,38,9,0,0,TAU);ctx.fill();}
  }

  drawEntity(ctx, state, horizon) {
    const threat = clamp(state.threat || 0, 0, 100);
    if (threat < 28 || state.entityHidden) return;
    const index = clamp(Math.floor((threat - 20) / 17), 0, ENTITY_POSES.length - 1);
    const pose = ENTITY_POSES[index];
    const diff = wrapAngle(pose.angle - (state.yaw || 0));
    if (Math.abs(diff) > 64 * DEG) return;
    const w = this.width;
    const focal = w * .86;
    const x = w / 2 + Math.tan(diff) * focal;
    const scale = clamp(focal / (pose.distance * 360), .45, 1.4);
    const y = this.height * .74;
    const centered = Math.abs(diff) < 9 * DEG;
    const flicker = this.reducedMotion ? 1 : .72 + Math.sin(this.time * .019) * .11 + Math.sin(this.time * .047) * .09;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = centered ? .18 : clamp((threat - 22) / 76, .08, .72) * flicker;
    ctx.fillStyle = '#020302';
    ctx.beginPath();ctx.ellipse(0,-164,34,68,0,0,TAU);ctx.fill();
    ctx.beginPath();ctx.moveTo(-31,-125);ctx.lineTo(-68,0);ctx.lineTo(-18,0);ctx.lineTo(0,-102);ctx.lineTo(20,0);ctx.lineTo(68,0);ctx.lineTo(30,-125);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(200,190,166,.2)';ctx.fillRect(-14,-173,5,3);ctx.fillRect(9,-173,5,3);
    ctx.restore();
  }

  drawDust(ctx, state, horizon) {
    const w = this.width;
    const h = this.height;
    const t = this.time * .0001;
    ctx.save();
    for (const particle of this.dust) {
      const sway = this.reducedMotion ? 0 : Math.sin(t * particle.drift * 8 + particle.phase) * 7 * particle.z;
      const x = ((particle.x * w + sway + (state.yaw || 0) * 41 * particle.z) % w + w) % w;
      const y = particle.y * h + Math.sin(t * 5 + particle.phase) * 4;
      const alpha = .035 + particle.z * .065;
      ctx.fillStyle = `rgba(224,214,190,${alpha})`;
      ctx.fillRect(x, y, particle.z * 1.4, particle.z * 1.4);
    }
    ctx.restore();
  }

  drawLight(ctx, state, horizon) {
    const w = this.width;
    const h = this.height;
    const threat = clamp(state.threat || 0, 0, 100);
    const lightX = w * (.5 - clamp(state.roll || 0, -.16, .16) * .9);
    const lightY = h * (.47 - clamp(state.pitch || 0, -.5, .5) * .2);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const darkness = ctx.createRadialGradient(lightX, lightY, h * .07, lightX, lightY, Math.max(w, h) * .72);
    darkness.addColorStop(0, 'rgba(255,255,255,0)');
    darkness.addColorStop(.35, `rgba(26,24,18,${.12 + threat * .0012})`);
    darkness.addColorStop(.72, 'rgba(3,4,3,.66)');
    darkness.addColorStop(1, 'rgba(0,0,0,.96)');
    ctx.fillStyle = darkness;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation='screen';
    const beam=ctx.createRadialGradient(lightX,lightY,0,lightX,lightY,h*.42);
    beam.addColorStop(0,'rgba(181,158,111,.11)');
    beam.addColorStop(.45,'rgba(146,125,87,.035)');
    beam.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=beam;ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  drawLensArtifacts(ctx, state) {
    const w = this.width;
    const h = this.height;
    const threat = clamp(state.threat || 0, 0, 100);
    ctx.save();
    ctx.globalAlpha = .13 + threat * .001;
    ctx.fillStyle = '#000';
    const vignette = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.28,w/2,h/2,Math.max(w,h)*.75);
    vignette.addColorStop(0,'rgba(0,0,0,0)');
    vignette.addColorStop(1,'rgba(0,0,0,.86)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    ctx.restore();

    ctx.save();
    for (const scratch of this.scratches) {
      ctx.strokeStyle=`rgba(232,224,205,${scratch.alpha})`;
      ctx.lineWidth=.7;
      ctx.beginPath();
      ctx.moveTo(scratch.x*w,scratch.y*h);
      ctx.lineTo(scratch.x*w + Math.sin(scratch.x*17)*3,scratch.y*h+scratch.h*h);
      ctx.stroke();
    }
    if (threat > 68 && !this.reducedMotion) {
      const slices = 2 + Math.floor((threat - 68) / 11);
      for (let i=0;i<slices;i+=1) {
        const y = ((this.time * .07 + i * 137) % h);
        const shift = Math.sin(this.time * .021 + i) * (threat - 64) * .11;
        try {
          const strip = ctx.getImageData(0, Math.floor(y), Math.floor(w), 2);
          ctx.putImageData(strip, Math.floor(shift), Math.floor(y));
        } catch {}
      }
    }
    ctx.restore();
  }
}

export const ANOMALIES = [
  { id: 'portrait', clue: 'НАЙДИ ТО, ЧТО СМОТРИТ БЕЗ ГЛАЗ', success: 'ОНА УЗНАЛА ТЕБЯ' },
  { id: 'clock', clue: 'НАЙДИ ЧАС, КОТОРОГО НЕ БЫВАЕТ', success: 'ВРЕМЯ ЗДЕСЬ ИДЁТ НАЗАД' },
  { id: 'mirror', clue: 'СНИМИ ОТРАЖЕНИЕ БЕЗ ХОЗЯИНА', success: 'ОНО СТОЯЛО ЗА ТОБОЙ' },
  { id: 'window', clue: 'НАЙДИ СЛЕД СНАРУЖИ, КОГДА СНАРУЖИ НЕТ', success: 'СТЕКЛО БЫЛО ТЁПЛЫМ' },
  { id: 'radio', clue: 'НАЙДИ ПРИЁМНИК, КОТОРЫЙ СЛУШАЕТ', success: 'ШУМ ОТВЕТИЛ ТВОИМ ГОЛОСОМ' },
  { id: 'chair', clue: 'НАЙДИ МЕБЕЛЬ, КОТОРАЯ УЖЕ ВСТАЛА', success: 'СТУЛ ОТОДВИНУЛСЯ САМ' },
  { id: 'lamp', clue: 'НАЙДИ СВЕТ, В КОТОРОМ НЕТ СВЕТА', success: 'В НИТИ БЫЛ ЗРАЧОК' }
];

export const FINAL_ANOMALY = {
  id: 'door',
  clue: 'ПОСЛЕДНИЙ КАДР — ВЫХОД, КОТОРОГО РАНЬШЕ НЕ БЫЛО',
  success: 'ДВЕРЬ ОТКРЫЛАСЬ НА ТВОЕЙ СТОРОНЕ'
};
