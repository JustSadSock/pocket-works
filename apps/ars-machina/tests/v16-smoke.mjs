import assert from 'node:assert/strict';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function moment(rotor) {
  if (rotor.mountMode === 'rigid') return Infinity;
  const factor = rotor.type === 'flywheel' ? rotor.inertia ?? 4 : rotor.type === 'wheel' ? 1.4 : .8;
  return Math.max(40, rotor.radius * rotor.radius * factor);
}
function couple(a, b, sign, strength = .8, step = 1) {
  const ia = moment(a), ib = moment(b);
  const invA = Number.isFinite(ia) ? 1 / ia : 0;
  const invB = Number.isFinite(ib) ? 1 / ib : 0;
  const ja = -sign * a.radius, jb = b.radius;
  const denom = ja * ja * invA + jb * jb * invB;
  if (!denom) return;
  const error = b.omega * b.radius - sign * a.omega * a.radius;
  const lambda = -error / denom * clamp(strength * step, 0, 1);
  a.omega += invA * ja * lambda;
  b.omega += invB * jb * lambda;
}

{
  const driver = { type: 'gear', radius: 30, omega: 1, mountMode: 'free' };
  const output = { type: 'gear', radius: 90, omega: 0, mountMode: 'free' };
  for (let i = 0; i < 30; i += 1) couple(driver, output, 1, .7, .5);
  assert.ok(Math.abs(output.omega * 90 - driver.omega * 30) < 0.01, 'chain/belt tangential speed must converge');
  assert.ok(output.omega > 0, 'open chain must preserve direction');
}

{
  const fixed = { type: 'gear', radius: 32, omega: 0, mountMode: 'rigid' };
  const free = { type: 'gear', radius: 32, omega: 1.2, mountMode: 'free' };
  for (let i = 0; i < 24; i += 1) couple(fixed, free, -1, .9, .5);
  assert.ok(Math.abs(fixed.omega) < 1e-9, 'rigid shaft must not accept transmission torque');
  assert.ok(Math.abs(free.omega) < 0.01, 'free gear meshed with a locked gear must stop');
}

{
  const joints = [
    { id: 'j1', a: 'n', b: 'n', beamA: 'a', beamB: 'b', type: 'weld' },
    { id: 'j2', a: 'n', b: 'n', beamA: 'b', beamB: 'c', type: 'hinge' }
  ];
  joints[1].type = 'limit';
  joints[1].limitAngle = Math.PI / 3;
  assert.equal(joints[0].type, 'weld', 'editing one connection must not change another connection at the same point');
  assert.equal(joints[1].type, 'limit');
}

function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function solveDistance(nodes, links, iterations = 12) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let it = 0; it < iterations; it += 1) {
    for (const link of links) {
      const a = byId.get(link.a), b = byId.get(link.b);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
      const error = d - link.length;
      const k = 1 - Math.pow(1 - .92, 1 / iterations);
      const correction = clamp(error * k, -6.5, 6.5);
      const nx = dx / d, ny = dy / d;
      const ia = a.fixed ? 0 : 1 / (a.mass ?? 1), ib = b.fixed ? 0 : 1 / (b.mass ?? 1), total = ia + ib;
      if (!total) continue;
      a.x += nx * correction * ia / total; a.y += ny * correction * ia / total;
      b.x -= nx * correction * ib / total; b.y -= ny * correction * ib / total;
    }
  }
}

{
  const nodes = [
    { id: 'l', x: 0, y: 0, px: 0, py: 0, mass: 1 },
    { id: 'r', x: 318, y: 0, px: 318, py: 0, mass: 1 },
    { id: 'm', x: 167, y: 0, px: 167, py: 0, mass: .75 },
    { id: 'top', x: 168, y: -276, px: 168, py: -276, mass: 1 },
    { id: 'farL', x: -300, y: -168, px: -300, py: -168, mass: 1 },
    { id: 'farR', x: 480, y: -168, px: 480, py: -168, mass: 1 },
    { id: 'brace', x: 168, y: -230, px: 168, py: -230, mass: .75 }
  ];
  const links = [
    ['l','r'], ['m','top'], ['top','farL'], ['farL','farR'], ['farR','brace'], ['farL','brace'], ['l','top'], ['r','top']
  ].map(([a,b]) => ({ a, b, length: distance(nodes.find((n)=>n.id===a), nodes.find((n)=>n.id===b)) }));
  for (let frame = 0; frame < 900; frame += 1) {
    for (const n of nodes) {
      const vx = clamp((n.x - n.px) * .986, -9, 9), vy = clamp((n.y - n.py) * .986, -9, 9);
      n.px = n.x; n.py = n.y; n.x += vx; n.y += vy + .08;
    }
    solveDistance(nodes, links);
    for (const n of nodes) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), 'stable solver must remain finite');
      const speed = Math.hypot(n.x - n.px, n.y - n.py);
      if (speed > 14) { const s = 14 / speed; n.px = n.x - (n.x - n.px) * s; n.py = n.y - (n.y - n.py) * s; }
    }
  }
  const maxError = Math.max(...links.map((link) => {
    const a = nodes.find((n) => n.id === link.a), b = nodes.find((n) => n.id === link.b);
    return Math.abs(distance(a, b) - link.length) / link.length;
  }));
  assert.ok(maxError < .04, `beam error must stay bounded, got ${maxError}`);
}

console.log('ARS MACHINA 1.6 smoke tests passed');
