import type { FighterId } from './core';
export type Pose = 'idle0' | 'idle1' | 'walk0' | 'walk1' | 'jump' | 'windup' | 'punch' | 'kick' | 'block' | 'hit' | 'special' | 'win' | 'down';
export const POSES: Pose[] = ['idle0', 'idle1', 'walk0', 'walk1', 'jump', 'windup', 'punch', 'kick', 'block', 'hit', 'special', 'win', 'down'];
const ink = '#17212c';
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function poly(c: CanvasRenderingContext2D, color: string, points: number[][]) {
  c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill();
}
function limb(c: CanvasRenderingContext2D, points: number[][], color: string, width: number) {
  c.lineCap = 'square'; c.lineJoin = 'miter'; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = ink; c.lineWidth = width + 4; c.stroke(); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
// Hand-authored pose silhouettes, with an identical foot anchor in every frame.
export function fighterFrame(id: FighterId, pose: Pose): HTMLCanvasElement {
  const out = canvas(96, 96), c = out.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const rook = id === 'rook', jacket = rook ? '#d5673e' : '#459c8f', light = rook ? '#f59e61' : '#94d6ba';
  const dark = rook ? '#793c38' : '#28605e', skin = rook ? '#dbae83' : '#e8c5ad', skinLight = '#f5ddbc';
  const pants = rook ? '#354a5a' : '#343a4c', pantsLight = rook ? '#607081' : '#68627c';
  let shift = pose === 'idle1' ? 1 : 0;
  if (pose === 'down') { c.translate(44, 85); c.rotate(-Math.PI / 2); c.translate(-48, -77); }
  else if (pose === 'hit') c.translate(-3, 0);
  else c.translate(0, shift);
  let rear = [[44, 63], [36, 75], [30, 87]], front = [[51, 63], [55, 75], [62, 87]];
  if (pose === 'walk0') { rear = [[44, 63], [42, 77], [48, 86]]; front = [[51, 63], [57, 75], [66, 87]]; }
  if (pose === 'walk1') { rear = [[44, 63], [33, 74], [28, 86]]; front = [[51, 63], [49, 77], [45, 86]]; }
  if (pose === 'jump') { rear = [[44, 63], [34, 69], [37, 77]]; front = [[51, 63], [62, 70], [54, 79]]; }
  if (pose === 'kick') { rear = [[44, 63], [41, 76], [35, 87]]; front = [[51, 62], [65, 55], [84, 52]]; }
  limb(c, rear, pants, rook ? 9 : 7); limb(c, [[rear[0][0] + 2, rear[0][1]], [rear[1][0] + 2, rear[1][1]]], pantsLight, 2);
  rect(c, ink, rear[2][0] - 5, rear[2][1] - 3, 13, 6); rect(c, '#8a857d', rear[2][0] - 4, rear[2][1] + 1, 11, 2);
  limb(c, front, pants, rook ? 10 : 7); limb(c, [[front[0][0] + 2, front[0][1]], [front[1][0] + 2, front[1][1]]], pantsLight, 2);
  rect(c, ink, front[2][0] - 4, front[2][1] - 3, 14, 6); rect(c, '#b9b4a0', front[2][0] - 3, front[2][1] + 1, 12, 2);
  let backArm = [[39, 43], [32, 54], [42, 52]], arm = [[55, 43], [65, 48], [66, 36]];
  if (pose === 'punch') arm = [[55, 43], [67, 40], [84, 40]];
  if (pose === 'windup') arm = [[55, 43], [53, 50], [44, 44]];
  if (pose === 'block') { arm = [[55, 43], [62, 35], [60, 27]]; backArm = [[39, 43], [51, 36], [53, 29]]; }
  if (pose === 'special') { arm = [[55, 43], [70, 46], [79, 43]]; backArm = [[39, 43], [51, 51], [67, 45]]; }
  if (pose === 'win') { arm = [[55, 43], [64, 30], [62, 16]]; backArm = [[39, 43], [29, 32], [31, 18]]; }
  if (pose === 'hit') { arm = [[55, 43], [61, 53], [67, 55]]; backArm = [[39, 43], [29, 47], [25, 41]]; }
  limb(c, backArm, dark, rook ? 9 : 6);
  rect(c, ink, backArm[2][0] - 4, backArm[2][1] - 4, 8, 8); rect(c, skin, backArm[2][0] - 3, backArm[2][1] - 3, 6, 6);
  poly(c, ink, [[38, 35], [54, 35], [60, 42], [56, 62], [53, 67], [39, 67], [35, 57], [34, 44]]);
  poly(c, jacket, [[39, 37], [53, 37], [57, 43], [53, 63], [40, 64], [38, 55], [37, 44]]);
  poly(c, light, [[39, 38], [44, 39], [42, 57], [39, 54], [38, 45]]);
  poly(c, dark, [[48, 42], [56, 42], [53, 62], [48, 63]]);
  rect(c, '#e6d4a7', 44, 41, 4, 20); rect(c, '#404757', 45, 46, 2, 11);
  rect(c, '#e0b56c', 39, 62, 15, 3); rect(c, '#f9dfad', 47, 62, 4, 3);
  rect(c, light, 51, 44, 3, 4); rect(c, ink, 51, 48, 3, 1);
  limb(c, arm, jacket, rook ? 10 : 6); limb(c, [[arm[0][0], arm[0][1] - 2], [arm[1][0], arm[1][1] - 2]], light, 2);
  rect(c, ink, arm[2][0] - 5, arm[2][1] - 5, 10, 9); rect(c, skin, arm[2][0] - 4, arm[2][1] - 4, 8, 7);
  rect(c, skinLight, arm[2][0], arm[2][1] - 3, 3, 2); rect(c, '#ded7bd', arm[2][0] - 5, arm[2][1] + 2, 8, 2);
  rect(c, ink, 43, 30, 9, 9); rect(c, skin, 44, 31, 7, 7);
  poly(c, ink, [[41, 17], [53, 17], [58, 23], [58, 30], [54, 36], [45, 35], [40, 29]]);
  poly(c, skin, [[43, 20], [53, 20], [55, 25], [59, 27], [55, 29], [54, 33], [46, 33], [43, 28]]);
  rect(c, skinLight, 51, 22, 3, 3); rect(c, ink, 53, 26, 3, 2); rect(c, '#9b5e50', 52, 31, 3, 1);
  if (rook) {
    poly(c, '#453e3d', [[40, 20], [42, 16], [51, 15], [55, 18], [56, 22], [46, 21], [43, 25], [41, 27]]);
    rect(c, '#776457', 43, 17, 8, 2); rect(c, '#574740', 46, 30, 5, 4);
    rect(c, '#e6b966', 41, 23, 14, 2); rect(c, dark, 39, 25, 5, 2);
  } else {
    poly(c, '#deded4', [[40, 22], [40, 17], [46, 14], [54, 16], [58, 22], [53, 21], [49, 25], [45, 22], [42, 28]]);
    rect(c, '#8f9b9d', 42, 17, 7, 2);
    poly(c, dark, [[41, 32], [52, 34], [56, 37], [45, 40], [38, 37]]);
    poly(c, light, [[40, 34], [51, 35], [52, 37], [41, 38]]);
    poly(c, jacket, [[40, 36], [35, 41], [25 - shift * 2, 39], [20, 44], [35, 46], [41, 39]]);
  }
  return out;
}
export function arena(): HTMLCanvasElement {
  const out = canvas(480, 270), c = out.getContext('2d')!;
  rect(c, '#253b49', 0, 0, 480, 270);
  rect(c, '#304957', 0, 63, 480, 70); rect(c, '#385667', 0, 115, 480, 38);
  // Moon, haze, distant islands and city.
  rect(c, '#c9d4be', 354, 29, 23, 23); rect(c, '#dce0c5', 357, 26, 17, 29);
  rect(c, '#304957', 365, 27, 12, 9); rect(c, '#688180', 28, 62, 78, 2); rect(c, '#536c74', 82, 50, 45, 2);
  poly(c, '#293f4c', [[0, 115], [42, 96], [68, 108], [108, 78], [157, 108], [201, 92], [252, 117], [295, 104], [347, 110], [398, 84], [480, 116], [480, 148], [0, 148]]);
  for (let i = 0; i < 28; i++) {
    const x = i * 19 - 4, h = 10 + (i * 17 % 23);
    rect(c, '#203540', x, 140 - h, 13, h);
    for (let j = 0; j < h / 5 - 1; j++) if ((i + j) % 3 === 0) rect(c, '#9b9c7e', x + 4, 142 - h + j * 5, 2, 2);
  }
  // Steel cranes frame the skyline without crossing the fight silhouettes.
  limb(c, [[57, 145], [57, 71], [64, 71], [64, 145]], '#35434d', 3);
  limb(c, [[27, 73], [108, 51], [114, 55], [64, 82], [27, 73]], '#35434d', 2);
  limb(c, [[61, 75], [64, 37], [108, 52]], '#53626a', 1);
  limb(c, [[102, 57], [102, 99]], '#697271', 1); rect(c, '#a89d7a', 99, 98, 6, 4);
  limb(c, [[420, 145], [420, 86], [384, 65], [450, 82]], '#344752', 3);
  limb(c, [[389, 68], [389, 117]], '#617578', 1);
  // Water reflections.
  rect(c, '#264c58', 0, 146, 480, 36);
  for (let i = 0; i < 76; i++) {
    const x = (i * 67) % 480, y = 148 + (i * 13) % 33;
    rect(c, i % 4 === 0 ? '#82978c' : '#3f6972', x, y, 3 + i % 17, 1);
  }
  rect(c, '#758d82', 349, 148, 23, 1); rect(c, '#526f71', 343, 153, 36, 1);
  // Dock warehouse left and freight containers right.
  poly(c, '#263039', [[0, 93], [14, 91], [46, 112], [46, 175], [0, 175]]);
  rect(c, '#465253', 0, 113, 43, 54); rect(c, '#323c43', 6, 119, 26, 45);
  for (let i = 0; i < 9; i++) rect(c, '#56605a', 7, 120 + i * 5, 24, 1);
  rect(c, '#d2aa6c', 0, 108, 45, 2); rect(c, '#92815d', 8, 112, 7, 2);
  rect(c, '#425658', 425, 133, 55, 37); rect(c, '#33474d', 419, 169, 61, 11);
  for (let i = 0; i < 8; i++) rect(c, '#67766a', 429 + i * 7, 137, 2, 29);
  rect(c, '#c5b995', 440, 145, 26, 8); rect(c, '#526563', 443, 148, 19, 2);
  // Low railing and bollards.
  rect(c, '#1e3036', 0, 178, 480, 5); rect(c, '#77877a', 0, 177, 480, 1);
  for (let x = 72; x < 430; x += 83) { rect(c, '#233940', x, 158, 3, 27); rect(c, '#72897e', x, 157, 3, 1); }
  rect(c, '#33434b', 48, 165, 369, 2);
  // Amber practical lamps.
  for (const x of [77, 402]) {
    rect(c, '#1d3038', x, 91, 4, 95); rect(c, '#697568', x, 92, 1, 89);
    rect(c, '#202d32', x - 6, 89, 16, 4); rect(c, '#eab16a', x - 4, 93, 12, 3);
    rect(c, '#67746a', x - 6, 97, 16, 2); rect(c, '#4e605b', x - 9, 99, 22, 2);
  }
  // Perspective deck: all details are seeded integer coordinates.
  rect(c, '#6b685c', 0, 184, 480, 86); rect(c, '#aaa082', 0, 185, 480, 2);
  for (const y of [196, 212, 234, 262]) { rect(c, '#454b47', 0, y, 480, 2); rect(c, '#827d68', 0, y + 2, 480, 1); }
  for (let x = -300; x < 780; x += 49) limb(c, [[240 + (x - 240) * .68, 187], [x, 270]], '#53554d', 1);
  for (let i = 0; i < 100; i++) rect(c, i % 2 ? '#8d846a' : '#58594f', i * 71 % 480, 190 + i * 31 % 78, 2 + i % 9, 1);
  // Foreground framing, hazard paint and mooring rope.
  rect(c, '#253638', 0, 247, 25, 23); rect(c, '#859381', 1, 245, 19, 3);
  rect(c, '#253638', 451, 245, 29, 25); rect(c, '#859381', 457, 243, 20, 3);
  for (let i = 0; i < 5; i++) { rect(c, '#c8ac69', i * 8, 234, 4, 3); rect(c, '#c8ac69', 442 + i * 8, 233, 4, 3); }
  poly(c, '#b49b6d', [[0, 258], [36, 255], [74, 261], [96, 258], [96, 260], [74, 264], [36, 258], [0, 261]]);
  return out;
}
