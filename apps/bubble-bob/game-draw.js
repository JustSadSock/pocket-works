export function createRenderer(ctx, getFrame) {
  const TAU = Math.PI * 2;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const random = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
  let viewWidth = 390;
  let viewHeight = 844;
  let state;
  let player;
  let entities;
  let particles;
  let floaters;
  let backgroundBubbles;
  let flowerShapes;

  function draw() {
    ctx.save();
    const shakeX = state.shake > 0 ? random(-8, 8) * state.shake : 0;
    const shakeY = state.shake > 0 ? random(-5, 5) * state.shake : 0;
    ctx.translate(shakeX, shakeY);
    drawBackground();
    entities.forEach(drawEntity);
    particles.forEach(drawParticle);
    drawPlayer();
    floaters.forEach(drawFloater);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 90, 120, ${state.flash * .55})`;
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
    gradient.addColorStop(0, '#18a3d2');
    gradient.addColorStop(.52, '#087aae');
    gradient.addColorStop(1, '#075a88');
    ctx.fillStyle = gradient;
    ctx.fillRect(-12, -12, viewWidth + 24, viewHeight + 24);

    flowerShapes.forEach((flower) => drawFlower(viewWidth * flower.x, viewHeight * flower.y, flower.size, flower.rotation, flower.alpha));

    backgroundBubbles.forEach((bubble) => {
      ctx.strokeStyle = 'rgba(218,248,255,.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bubble.x % viewWidth, bubble.y, bubble.r, 0, TAU);
      ctx.stroke();
    });

    const floorY = viewHeight - Math.max(58, viewHeight * .07);
    const sand = ctx.createLinearGradient(0, floorY, 0, viewHeight);
    sand.addColorStop(0, '#e7cb78');
    sand.addColorStop(1, '#c79d51');
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(0, floorY + 8);
    for (let x = 0; x <= viewWidth + 30; x += 30) {
      ctx.quadraticCurveTo(x + 15, floorY - 8 + Math.sin(x * .07) * 4, x + 30, floorY + 6);
    }
    ctx.lineTo(viewWidth, viewHeight);
    ctx.lineTo(0, viewHeight);
    ctx.closePath();
    ctx.fill();

    drawPineappleHouse(viewWidth * .12, floorY + 4, 34);
    drawRockHouse(viewWidth * .86, floorY + 7, 28);
    drawSeaweed(viewWidth * .28, floorY + 17, 22, '#2e8a67');
    drawSeaweed(viewWidth * .72, floorY + 19, 28, '#267b6c');
  }

  function drawFlower(x, y, size, rotation, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = `rgba(231,251,255,${alpha})`;
    ctx.lineWidth = Math.max(3, size * .16);
    ctx.lineCap = 'round';
    for (let index = 0; index < 5; index += 1) {
      ctx.rotate(TAU / 5);
      ctx.beginPath();
      ctx.moveTo(size * .16, 0);
      ctx.quadraticCurveTo(size * .75, -size * .32, size, 0);
      ctx.quadraticCurveTo(size * .75, size * .32, size * .16, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPineappleHouse(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = .24;
    ctx.fillStyle = '#6f4d28';
    ctx.beginPath();
    ctx.ellipse(0, -size * .65, size * .56, size * .78, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#315f4c';
    for (let index = -2; index <= 2; index += 1) {
      ctx.save();
      ctx.rotate(index * .2);
      ctx.fillRect(-2, -size * 1.72, 4, size * .7);
      ctx.restore();
    }
    ctx.fillStyle = '#1e3542';
    ctx.fillRect(-size * .14, -size * .35, size * .28, size * .35);
    ctx.restore();
  }

  function drawRockHouse(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = .23;
    ctx.fillStyle = '#364b59';
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(-size * .72, -size * 1.35, 0, -size * 1.55);
    ctx.quadraticCurveTo(size * .78, -size * 1.25, size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#142b37';
    ctx.fillRect(-size * .18, -size * .43, size * .36, size * .43);
    ctx.restore();
  }

  function drawSeaweed(x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let index = -1; index <= 1; index += 1) {
      ctx.beginPath();
      ctx.moveTo(index * 5, 0);
      ctx.bezierCurveTo(index * 8 - 10, -size * .38, index * 8 + 12, -size * .72, index * 3, -size);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEntity(entity) {
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.rotate(entity.rotation);
    if (entity.type === 'patty') drawPatty(entity.radius);
    else if (entity.type === 'bubble') drawBubble(entity.radius);
    else if (entity.type === 'jelly') drawJelly(entity.radius, entity.phase);
    else drawSpatula(entity.radius);
    ctx.restore();
  }

  function drawPatty(radius) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#43251e';
    ctx.fillStyle = '#f0bd42';
    ctx.beginPath();
    ctx.ellipse(0, -radius * .46, radius, radius * .43, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6f3526';
    ctx.fillRect(-radius * .86, -radius * .29, radius * 1.72, radius * .44);
    ctx.fillStyle = '#57a64e';
    ctx.beginPath();
    ctx.moveTo(-radius * .95, radius * .06);
    ctx.lineTo(-radius * .45, radius * .3);
    ctx.lineTo(0, radius * .08);
    ctx.lineTo(radius * .48, radius * .3);
    ctx.lineTo(radius * .95, radius * .06);
    ctx.lineTo(radius * .82, radius * .34);
    ctx.lineTo(-radius * .82, radius * .34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0bd42';
    ctx.beginPath();
    ctx.ellipse(0, radius * .45, radius * .92, radius * .36, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    for (let index = 0; index < 5; index += 1) ctx.fillRect(-radius * .5 + index * radius * .25, -radius * .68 + (index % 2) * 3, 2.2, 1.4);
  }

  function drawBubble(radius) {
    const gradient = ctx.createRadialGradient(-radius * .28, -radius * .3, 1, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.82)');
    gradient.addColorStop(.18, 'rgba(214,248,255,.24)');
    gradient.addColorStop(1, 'rgba(180,235,255,.05)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(233,251,255,.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-radius * .28, -radius * .26, radius * .24, Math.PI * 1.05, Math.PI * 1.72);
    ctx.stroke();
  }

  function drawJelly(radius, phase) {
    ctx.rotate(Math.sin(phase) * .08);
    ctx.fillStyle = '#ff7ca9';
    ctx.strokeStyle = '#733a70';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, 0);
    ctx.quadraticCurveTo(radius * .78, radius * .62, radius * .42, radius * .48);
    ctx.quadraticCurveTo(0, radius * .68, -radius * .42, radius * .48);
    ctx.quadraticCurveTo(-radius * .78, radius * .62, -radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath();
    ctx.arc(-radius * .35, -radius * .25, radius * .24, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ff9bc0';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let index = -2; index <= 2; index += 1) {
      ctx.beginPath();
      ctx.moveTo(index * radius * .28, radius * .43);
      ctx.bezierCurveTo(index * radius * .3 + Math.sin(phase + index) * 5, radius * .85, index * radius * .18, radius * 1.05, index * radius * .28, radius * 1.3);
      ctx.stroke();
    }
  }

  function drawSpatula(radius) {
    ctx.fillStyle = '#ffd83d';
    ctx.strokeStyle = '#7f5a00';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-radius * .13, -radius * .2, radius * .26, radius * 1.4);
    ctx.strokeRect(-radius * .13, -radius * .2, radius * .26, radius * 1.4);
    ctx.beginPath();
    ctx.roundRect(-radius * .48, -radius * .95, radius * .96, radius * .78, radius * .12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#7f5a00';
    ctx.lineWidth = 2;
    for (let index = -1; index <= 1; index += 1) {
      ctx.beginPath();
      ctx.moveTo(index * radius * .2, -radius * .78);
      ctx.lineTo(index * radius * .2, -radius * .35);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const blink = player.invulnerableUntil > state.time && Math.floor(state.time * 14) % 2 === 0;
    if (blink) return;
    const shield = state.shieldUntil > state.time;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt);
    const squashX = 1 + player.squash;
    const squashY = 1 - player.squash * .58;
    ctx.scale(squashX, squashY);

    if (shield) {
      ctx.strokeStyle = `rgba(255,216,61,${.55 + Math.sin(state.time * 8) * .2})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, -6, 52 + Math.sin(state.time * 5) * 3, 0, TAU);
      ctx.stroke();
    }

    ctx.strokeStyle = '#073046';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-23, 27);
    ctx.lineTo(-32, 48);
    ctx.moveTo(23, 27);
    ctx.lineTo(32, 48);
    ctx.moveTo(-13, 35);
    ctx.lineTo(-16, 57);
    ctx.moveTo(13, 35);
    ctx.lineTo(16, 57);
    ctx.stroke();
    ctx.fillStyle = '#111820';
    ctx.fillRect(-23, 53, 14, 6);
    ctx.fillRect(9, 53, 14, 6);

    ctx.fillStyle = '#ffd83d';
    ctx.strokeStyle = '#073046';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-31, -45, 62, 73, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2bd2e';
    [[-22,-32,4],[20,-18,5],[-24,9,4],[15,13,3],[-4,-39,3]].forEach(([x,y,r]) => {
      ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
    });

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#073046';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-10,-19,10,13,0,0,TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(10,-19,10,13,0,0,TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#68c5ec';
    ctx.beginPath(); ctx.arc(-8,-18,4,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8,-18,4,0,TAU); ctx.fill();
    ctx.fillStyle = '#073046';
    ctx.beginPath(); ctx.arc(-8,-18,1.8,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8,-18,1.8,0,TAU); ctx.fill();

    ctx.strokeStyle = '#073046';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -4, 15, .16, Math.PI - .16);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-8, 4, 6, 8);
    ctx.fillRect(2, 4, 6, 8);
    ctx.strokeRect(-8, 4, 6, 8);
    ctx.strokeRect(2, 4, 6, 8);

    ctx.fillStyle = '#fff';
    ctx.fillRect(-31, 25, 62, 11);
    ctx.fillStyle = '#a86a42';
    ctx.fillRect(-31, 36, 62, 13);
    ctx.fillStyle = '#e9474f';
    ctx.beginPath();
    ctx.moveTo(-5, 26); ctx.lineTo(5, 26); ctx.lineTo(3, 39); ctx.lineTo(0, 44); ctx.lineTo(-3, 39); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#073046';
    ctx.strokeRect(-31, 25, 62, 24);

    ctx.restore();
  }

  function drawParticle(particle) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFloater(floater) {
    const alpha = clamp(floater.life / floater.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(floater.x, floater.y);
    ctx.rotate(-.04);
    ctx.font = '1000 20px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#052b3d';
    ctx.strokeText(floater.text, 0, 0);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, 0, 0);
    ctx.restore();
  }

  const originalDraw = draw;
  return {
    draw() {
      ({ viewWidth, viewHeight, state, player, entities, particles, floaters, backgroundBubbles, flowerShapes } = getFrame());
      originalDraw();
    }
  };
}
