let ctx;
let state;
let PALETTES;

export function configureSubjects(options) { ({ ctx, state, PALETTES } = options); }

function palette() { return PALETTES[state.palette] || PALETTES.york; }
function ink() { return palette().ink; }

export function itemBounds(item) {
  if (item.type === 'figure') return { x: -135, y: -228, w: 270, h: 468 };
  if (item.kind === 'tower' || item.kind === 'tree') return { x: -110, y: -165, w: 220, h: 330 };
  if (item.kind === 'beast') return { x: -150, y: -105, w: 300, h: 210 };
  return { x: -120, y: -120, w: 240, h: 240 };
}

function setupStroke() {
  ctx.strokeStyle = ink();
  ctx.lineWidth = state.lineWeight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function drawFigure(item) {
  setupStroke();
  const p = palette();
  const robe = item.color || p.colors[0];
  const accent = p.colors[2];
  const skin = p.skin;
  const hair = p.hair;

  if (item.kind === 'knight') drawKnightBody(robe, accent);
  else if (item.kind === 'monk') drawMonkBody(robe);
  else drawRobeBody(robe, accent, item.kind === 'queen' || item.kind === 'king');

  if (['halo', 'veil', 'hood'].includes(item.headwear)) drawHeadwear(item.headwear, accent, robe);
  drawHead(item, skin, hair);
  drawArmAndHeld(item, skin, accent);
  if (!['halo', 'veil', 'hood'].includes(item.headwear)) drawHeadwear(item.headwear, accent, robe);
}

function drawRobeBody(robe, accent, ornate = false) {
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-42, -73);
  ctx.bezierCurveTo(-83, -26, -91, 88, -119, 205);
  ctx.bezierCurveTo(-50, 225, 39, 224, 121, 204);
  ctx.bezierCurveTo(88, 91, 73, 2, 47, -72);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.moveTo(42, -70); ctx.lineTo(69, -48); ctx.lineTo(103, 195); ctx.lineTo(75, 208); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (ornate) {
    ctx.strokeStyle = '#e4b83a';
    ctx.lineWidth = Math.max(3, state.lineWeight * .7);
    for (let y = -28; y < 166; y += 42) {
      ctx.beginPath();
      ctx.moveTo(59, y); ctx.bezierCurveTo(88, y + 10, 55, y + 24, 83, y + 33);
      ctx.stroke();
    }
    setupStroke();
  }
  ctx.fillStyle = '#493326';
  ctx.beginPath(); ctx.ellipse(-54, 214, 38, 10, -.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawKnightBody(robe, accent) {
  ctx.fillStyle = '#8c938e';
  ctx.beginPath(); ctx.moveTo(-56,-78); ctx.lineTo(58,-78); ctx.lineTo(83,75); ctx.lineTo(62,188); ctx.lineTo(-62,188); ctx.lineTo(-83,76); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = robe;
  ctx.beginPath(); ctx.moveTo(-60,-40); ctx.lineTo(60,-40); ctx.lineTo(69,92); ctx.lineTo(-69,92); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.moveTo(-16,-38); ctx.lineTo(16,-38); ctx.lineTo(16,87); ctx.lineTo(-16,87); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#493326';
  ctx.beginPath(); ctx.ellipse(-42,197,36,10,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(42,197,36,10,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
}

function drawMonkBody(robe) {
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-55,-72); ctx.bezierCurveTo(-85, 15, -96, 117, -111, 207); ctx.lineTo(106,207); ctx.bezierCurveTo(91,112,82,13,51,-72); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#c8aa72'; ctx.lineWidth = Math.max(3, state.lineWeight * .6);
  ctx.beginPath(); ctx.moveTo(-73, 20); ctx.lineTo(72, 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-22, 17); ctx.bezierCurveTo(-40,54,-13,77,-28,101); ctx.stroke();
  setupStroke();
}

function drawHead(item, skin, hair) {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-28,-165); ctx.bezierCurveTo(-7,-193,39,-187,52,-157); ctx.lineTo(75,-145); ctx.lineTo(52,-134); ctx.bezierCurveTo(45,-103,10,-92,-18,-108); ctx.bezierCurveTo(-40,-121,-43,-145,-28,-165); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink();
  ctx.beginPath(); ctx.arc(40,-153,3.6,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(67,-145); ctx.quadraticCurveTo(55,-139,43,-142); ctx.stroke();
  if (item.headwear !== 'hood' && item.headwear !== 'helm') {
    ctx.strokeStyle = hair; ctx.lineWidth = Math.max(4, state.lineWeight * .8);
    for (let i=0;i<5;i+=1) {
      ctx.beginPath();
      ctx.moveTo(-23 + i*4,-173 + i*2); ctx.bezierCurveTo(-63,-138,-40 + i*2,-99,-70 + i*6,-69); ctx.stroke();
    }
    setupStroke();
  }
}

function drawHeadwear(kind, accent, robe) {
  if (kind === 'none') return;
  if (kind === 'crown') {
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(-31,-181); ctx.lineTo(-19,-218); ctx.lineTo(2,-192); ctx.lineTo(20,-221); ctx.lineTo(38,-191); ctx.lineTo(61,-214); ctx.lineTo(55,-178); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30,-181); ctx.lineTo(55,-178); ctx.lineTo(52,-166); ctx.lineTo(-27,-168); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'halo') {
    ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(12,-148,56,0,Math.PI*2); ctx.stroke(); ctx.restore();
  } else if (kind === 'hood') {
    ctx.fillStyle = robe;
    ctx.beginPath(); ctx.moveTo(-44,-171); ctx.bezierCurveTo(-55,-211,25,-219,58,-179); ctx.lineTo(45,-102); ctx.bezierCurveTo(10,-89,-32,-102,-43,-132); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'helm') {
    ctx.fillStyle = '#8f9692';
    ctx.beginPath(); ctx.arc(12,-151,55,Math.PI*.92,Math.PI*2.05); ctx.lineTo(60,-125); ctx.lineTo(-35,-121); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40,-172); ctx.lineTo(71,-160); ctx.lineTo(42,-149); ctx.stroke();
  } else if (kind === 'veil') {
    ctx.fillStyle = '#e2d5ac';
    ctx.beginPath(); ctx.moveTo(-27,-187); ctx.bezierCurveTo(-62,-152,-57,-93,-84,-55); ctx.lineTo(-18,-64); ctx.bezierCurveTo(-8,-115,17,-145,48,-171); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'cap') {
    ctx.fillStyle = robe;
    ctx.beginPath(); ctx.moveTo(-37,-178); ctx.bezierCurveTo(-8,-214,47,-200,61,-169); ctx.bezierCurveTo(30,-177,-5,-169,-37,-178); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-15,-185); ctx.bezierCurveTo(-40,-202,-57,-194,-62,-176); ctx.stroke();
  }
}

function drawArmAndHeld(item, skin, accent) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(40,-51); ctx.bezierCurveTo(79,-37,98,0,91,38); ctx.lineTo(61,30); ctx.bezierCurveTo(59,8,47,-8,24,-18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(91,39,20,13,.18,0,Math.PI*2); ctx.fill(); ctx.stroke();
  drawHeld(item.held, 105, 36, accent);
  ctx.beginPath();
  ctx.moveTo(29,4); ctx.bezierCurveTo(9,21,2,52,-22,71); ctx.lineTo(-9,84); ctx.bezierCurveTo(21,63,34,40,49,21); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-17,80,19,11,-.45,0,Math.PI*2); ctx.fill(); ctx.stroke();
}

function drawHeld(kind, x, y, accent) {
  if (kind === 'none') return;
  ctx.save(); ctx.translate(x,y);
  if (kind === 'sword') {
    ctx.fillStyle = '#ded6bd';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(190,-42); ctx.lineTo(8,15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = ink(); ctx.lineWidth = state.lineWeight; ctx.beginPath(); ctx.moveTo(-9,-16); ctx.lineTo(15,24); ctx.stroke();
    ctx.fillStyle = '#6b432c'; ctx.fillRect(-17,15,16,52); ctx.strokeRect(-17,15,16,52);
  } else if (kind === 'book') {
    ctx.fillStyle = '#9e3a2e'; ctx.fillRect(-8,-20,58,43); ctx.strokeRect(-8,-20,58,43);
    ctx.strokeStyle = '#d6b24a'; ctx.beginPath(); ctx.moveTo(21,-19); ctx.lineTo(21,23); ctx.stroke();
  } else if (kind === 'staff') {
    ctx.strokeStyle = '#6c442d'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(9,-58); ctx.lineTo(18,194); ctx.stroke();
    ctx.beginPath(); ctx.arc(10,-53,24,Math.PI*.5,Math.PI*1.8); ctx.stroke();
  } else if (kind === 'orb') {
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(18,0,24,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18,-24); ctx.lineTo(18,-47); ctx.moveTo(8,-38); ctx.lineTo(28,-38); ctx.stroke();
  } else if (kind === 'chalice') {
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(-2,-22); ctx.lineTo(44,-22); ctx.bezierCurveTo(42,10,32,21,21,21); ctx.bezierCurveTo(9,21,0,9,-2,-22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21,21); ctx.lineTo(21,49); ctx.moveTo(4,49); ctx.lineTo(38,49); ctx.stroke();
  }
  ctx.restore();
}

export function drawObject(item) {
  setupStroke();
  const p = palette();
  const main = item.color || p.colors[2];
  const second = p.colors[0];
  switch (item.kind) {
    case 'amphora': drawAmphora(main); break;
    case 'chalice': drawChalice(main); break;
    case 'crown': drawCrown(main); break;
    case 'book': drawBook(main, second); break;
    case 'shield': drawShield(main); break;
    case 'tower': drawTower(main); break;
    case 'tree': drawTree(main); break;
    case 'sun': drawSun(main); break;
    case 'beast': drawBeast(main); break;
    case 'altar': drawAltar(main); break;
    case 'sword': drawLooseSword(main); break;
    case 'moon': drawMoon(main); break;
  }
}

function drawAmphora(main) {
  ctx.fillStyle = '#d8aa59';
  ctx.beginPath(); ctx.moveTo(-50,-84); ctx.lineTo(46,-84); ctx.bezierCurveTo(26,-56,76,-27,75,39); ctx.bezierCurveTo(73,92,34,115,0,115); ctx.bezierCurveTo(-42,115,-76,84,-73,34); ctx.bezierCurveTo(-70,-22,-20,-58,-50,-84); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-48,-83); ctx.lineTo(46,-83); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-56,-55); ctx.bezierCurveTo(-111,-59,-108,43,-72,55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(53,-52); ctx.bezierCurveTo(106,-52,104,40,73,52); ctx.stroke();
  ctx.strokeStyle = main; ctx.lineWidth = Math.max(5,state.lineWeight*.9); ctx.beginPath(); ctx.moveTo(-50,-60); ctx.bezierCurveTo(-18,-49,17,-49,50,-60); ctx.stroke(); setupStroke();
}

function drawChalice(main) {
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(-62,-72); ctx.lineTo(62,-72); ctx.bezierCurveTo(55,-12,30,21,0,21); ctx.bezierCurveTo(-31,21,-55,-13,-62,-72); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,21); ctx.lineTo(0,76); ctx.moveTo(-38,79); ctx.quadraticCurveTo(0,61,38,79); ctx.stroke();
}

function drawCrown(main) {
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(-82,48); ctx.lineTo(-67,-48); ctx.lineTo(-30,-3); ctx.lineTo(0,-70); ctx.lineTo(34,-4); ctx.lineTo(73,-50); ctx.lineTo(84,48); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8f2f27';
  for (const x of [-52,0,52]) { ctx.beginPath(); ctx.arc(x,29,8,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-82,48); ctx.lineTo(84,48); ctx.lineTo(78,72); ctx.lineTo(-76,72); ctx.closePath(); ctx.fillStyle = main; ctx.fill(); ctx.stroke();
}

function drawBook(main, second) {
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(-92,-60); ctx.lineTo(-7,-47); ctx.lineTo(-7,67); ctx.lineTo(-92,52); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = second;
  ctx.beginPath(); ctx.moveTo(7,-47); ctx.lineTo(92,-60); ctx.lineTo(92,52); ctx.lineTo(7,67); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-51); ctx.lineTo(0,69); ctx.stroke();
  ctx.strokeStyle = '#ead99f'; ctx.lineWidth = 4;
  for (const y of [-22,2,26]) { ctx.beginPath(); ctx.moveTo(-72,y); ctx.lineTo(-25,y+6); ctx.moveTo(25,y+6); ctx.lineTo(72,y); ctx.stroke(); }
  setupStroke();
}

function drawShield(main) {
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(0,-102); ctx.bezierCurveTo(55,-93,83,-78,88,-58); ctx.lineTo(66,28); ctx.bezierCurveTo(48,72,18,94,0,105); ctx.bezierCurveTo(-20,92,-51,69,-68,28); ctx.lineTo(-88,-58); ctx.bezierCurveTo(-78,-79,-50,-94,0,-102); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#d8b039'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(0,-90); ctx.lineTo(0,85); ctx.moveTo(-69,-17); ctx.lineTo(70,-17); ctx.stroke(); setupStroke();
}

function drawTower(main) {
  ctx.fillStyle = '#c7ab72';
  ctx.beginPath(); ctx.moveTo(-76,-92); ctx.lineTo(-76,-135); ctx.lineTo(-42,-135); ctx.lineTo(-42,-104); ctx.lineTo(-10,-104); ctx.lineTo(-10,-135); ctx.lineTo(23,-135); ctx.lineTo(23,-103); ctx.lineTo(56,-103); ctx.lineTo(56,-135); ctx.lineTo(82,-135); ctx.lineTo(82,131); ctx.lineTo(-76,131); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.arc(3,60,31,Math.PI,0); ctx.lineTo(34,131); ctx.lineTo(-28,131); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3e2a1f';
  for (const x of [-43,39]) { ctx.fillRect(x-12,-55,24,42); ctx.strokeRect(x-12,-55,24,42); }
}

function drawTree(main) {
  ctx.strokeStyle = '#6a4329'; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(0,115); ctx.bezierCurveTo(-5,56,8,16,0,-49); ctx.stroke();
  ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0,-35); ctx.lineTo(-53,-84); ctx.moveTo(1,-52); ctx.lineTo(51,-102); ctx.stroke();
  ctx.fillStyle = main;
  for (const [x,y,r] of [[-48,-95,42],[18,-118,52],[61,-75,38],[-2,-72,45]]) { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
}

function drawSun(main) {
  ctx.fillStyle = main;
  starPath(0,0,104,12,.55); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e3bd4b'; ctx.beginPath(); ctx.arc(0,0,57,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-18,-8,4,0,Math.PI*2); ctx.arc(18,-8,4,0,Math.PI*2); ctx.fillStyle = ink(); ctx.fill();
  ctx.beginPath(); ctx.arc(0,10,17,.15,Math.PI-.15); ctx.stroke();
}

function drawBeast(main) {
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(-104,12); ctx.bezierCurveTo(-61,-57,43,-57,95,-5); ctx.bezierCurveTo(119,20,105,65,70,70); ctx.lineTo(22,42); ctx.lineTo(-43,77); ctx.lineTo(-84,58); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(77,-17); ctx.lineTo(116,-52); ctx.lineTo(109,-8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-70,57); ctx.lineTo(-78,101); ctx.moveTo(42,61); ctx.lineTo(36,104); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-103,12); ctx.bezierCurveTo(-143,-7,-152,-55,-120,-73); ctx.stroke();
  ctx.fillStyle = ink(); ctx.beginPath(); ctx.arc(78,-12,5,0,Math.PI*2); ctx.fill();
}

function drawAltar(main) {
  ctx.fillStyle = '#c9ad76'; ctx.fillRect(-96,-34,192,114); ctx.strokeRect(-96,-34,192,114);
  ctx.fillStyle = main; ctx.fillRect(-110,-55,220,30); ctx.strokeRect(-110,-55,220,30);
  ctx.beginPath(); ctx.moveTo(-65,80); ctx.lineTo(-75,118); ctx.moveTo(65,80); ctx.lineTo(75,118); ctx.stroke();
}

function drawLooseSword(main) {
  ctx.save(); ctx.rotate(-.32);
  ctx.fillStyle = '#ddd6bd'; ctx.beginPath(); ctx.moveTo(-12,-108); ctx.lineTo(12,-108); ctx.lineTo(7,66); ctx.lineTo(0,100); ctx.lineTo(-7,66); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = main; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-42,60); ctx.lineTo(42,60); ctx.stroke();
  ctx.strokeStyle = '#65422c'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(0,66); ctx.lineTo(0,111); ctx.stroke(); ctx.restore(); setupStroke();
}

function drawMoon(main) {
  ctx.fillStyle = main; ctx.beginPath(); ctx.arc(0,0,92,-Math.PI*.55,Math.PI*.55); ctx.bezierCurveTo(37,59,38,-58,0,-84); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink(); ctx.beginPath(); ctx.arc(42,-13,5,0,Math.PI*2); ctx.fill();
}

function starPath(cx, cy, outer, points, innerRatio = .45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? outer * innerRatio : outer;
    const a = -Math.PI / 2 + i * Math.PI / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function svgFor(kind, type) {
  if (type === 'figure') {
    const crown = kind === 'queen' || kind === 'king' ? '<path d="M18 12l5-8 5 7 6-7 5 8"/>' : '';
    return `<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="30" cy="14" r="8"/>${crown}<path d="M22 22c-7 8-8 17-10 28h33c-3-12-4-21-11-28z"/><path d="M23 29l-10 8m21-8 10 8"/></svg>`;
  }
  const icons = {
    amphora: '<path d="M20 9h16m-13 2c3 7-9 9-9 23 0 9 6 15 14 15s14-6 14-15c0-14-12-16-9-23M14 21c-8 0-8 16 0 18m28-18c8 0 8 16 0 18"/>',
    chalice: '<path d="M14 10h28c-1 14-6 20-14 20S15 24 14 10zm14 20v12m-9 4h18"/>',
    crown: '<path d="M10 38l3-25 10 12 6-17 8 16 8-12 2 26zM10 38h37v8H10z"/>',
    book: '<path d="M7 12c9-3 16 0 21 5v31c-5-5-12-8-21-5zm42 0c-9-3-16 0-21 5v31c5-5 12-8 21-5z"/>',
    shield: '<path d="M28 5c9 1 16 4 20 8l-5 21c-3 9-10 14-15 17-5-3-12-8-15-17L8 13c4-4 11-7 20-8zm0 3v39M11 26h34"/>',
    tower: '<path d="M12 48V12h7V7h7v5h7V7h7v5h6v36zM23 48V34c0-6 10-6 10 0v14"/>',
    tree: '<path d="M28 50V28m0 3L17 20m11 4 11-13"/><circle cx="17" cy="18" r="9"/><circle cx="35" cy="13" r="11"/><circle cx="40" cy="25" r="9"/>',
    sun: '<circle cx="28" cy="28" r="10"/><path d="M28 4v10m0 28v10M4 28h10m28 0h10M11 11l7 7m20 20 7 7m0-34-7 7M18 38l-7 7"/>',
    beast: '<path d="M8 34c8-18 30-18 40-4 5 8 0 15-8 14l-9-6-12 7-8-5zm37-7 8-9-1 12M15 41l-2 10m25-9 1 9"/>',
    altar: '<path d="M9 21h38v8H9zm5 8h28v17H14zm4 17-2 6m22-6 2 6"/>',
    sword: '<path d="M30 5l3 30-5 11-5-11 3-30zm-14 29h24M28 46v8"/>',
    moon: '<path d="M39 8c-19 4-19 36 0 40-9 8-27 2-29-14C8 20 22 8 39 8z"/>'
  };
  return `<svg viewBox="0 0 56 56" aria-hidden="true">${icons[kind] || ''}</svg>`;
}
