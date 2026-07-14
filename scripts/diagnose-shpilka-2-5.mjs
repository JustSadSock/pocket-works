import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const result = spawnSync(process.execPath, ['scripts/audit-shpilka-2-5-final.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
let category = 'UNKNOWN';
const categories = [
  ['four distinct roles', 'ROLES'],
  ['sprinter straight pace', 'SPRINTER'],
  ['technician corner pace', 'TECHNICIAN'],
  ['attacker aggression', 'AGGRESSION'],
  ['mistakes do not alter', 'MISTAKES'],
  ['late braking', 'LATE-BRAKE'],
  ['clean rhythm', 'CLEAN-RHYTHM'],
  ['clean grip', 'CLEAN-GRIP'],
  ['rear classified', 'REAR-IMPACT'],
  ['frontal classified', 'FRONTAL-IMPACT'],
  ['side classified', 'SIDE-IMPACT'],
  ['sustained contact', 'CONTACT'],
  ['injected energy', 'ENERGY'],
  ['race simulation', 'SIMULATION'],
  ['rivals made no progress', 'AI-PROGRESS'],
  ['sector text', 'SECTORS'],
  ['SyntaxError', 'SYNTAX'],
  ['ReferenceError', 'REFERENCE'],
  ['TypeError', 'TYPE']
];
for (const [needle, label] of categories) {
  if (output.includes(needle)) { category = label; break; }
}
if (result.status === 0) category = 'PASS';
await mkdir('dist-site', { recursive: true });
const escaped = output.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
await writeFile(`dist-site/AUDIT-${category}.html`, `<!doctype html><meta charset="utf-8"><pre>${escaped}</pre>`);
console.log(`ШПИЛЬКА diagnostic: ${category}`);
