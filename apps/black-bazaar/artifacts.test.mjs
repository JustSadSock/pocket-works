import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {artifactKind,artifactSVG} from './art/artifacts.js';

const games=[
 ['Золотая жаба','frog'],['Жадная копилка','pig'],['Паук-механик','spider'],
 ['Корона должника','crown'],['Сундук-мимик','mimic'],['Кот неудачи','cat'],
 ['Зеркало зависти','mirror'],['Медная шестерня','gear'],['Око рынка','lens'],
 ['Гриб прибыли','mushroom'],['Песочные часы','hourglass'],['Амулет расчёта','amulet']
];
test('Twelve individually drawn SVG silhouettes and full closing tags',()=>{
 assert.equal(new Set(games.map(x=>x[1])).size,12);
 for(const [name,expected] of games){
  assert.equal(artifactKind(name),expected);
  const svg=artifactSVG(name,'редкий');
  assert.match(svg,/^<svg /);
  assert.match(svg,/<\/svg>$/);
  assert.ok(svg.length>300);
  assert.doesNotMatch(svg,/(?:javascript:|onload=|<script)/i);
 }
});
test('A renamed item must NOT reveal original variant or properties through artwork',()=>{
 for(const alias of ['Тёмная реликвия','Дар неизвестного','Забытый сувенир','Талисман достатка']){
  assert.equal(artifactKind(alias),'unknown');
  assert.match(artifactSVG(alias),/item-svg-unknown/);
  for(const [original] of games)assert.notEqual(artifactSVG(alias),artifactSVG(original));
 }
});
test('Inspectable contexts keep their live PocketNet actions',()=>{
 const ui=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 for(const form of ['detail-post','detail-bid','detail-black-bid','detail-repack'])
  assert.ok(ui.includes('data-form="'+form+'"'));
 for(const action of ['inspect','black-inspect','broker-buy','detail-pawn','detail-salvage','detail-trade','open-item'])
  assert.ok(ui.includes('data-action="'+action+'"'));
 assert.match(ui,/if\(focus&&name==='detail'&&detail&&state\?\.you\)/);
 assert.match(ui,/function artifactDetailBlock\(you\)/);
 assert.match(ui,/const privateItem=mine\?/);
 assert.match(ui,/if\(type==='detail-bid'\)return request\(\{type:'bid'/);
 assert.match(ui,/if\(type==='detail-black-bid'\)return request\(\{type:'black_bid'/);
});

test('All artifact motifs have transparent, independent silhouettes',()=>{
 for(const [name] of games){const art=artifactSVG(name,'редкий');
  assert.doesNotMatch(art,/cx="92" cy="166" rx="70"/);
  assert.doesNotMatch(art,/<rect[^>]*width="180"[^>]*height="180"/);
  assert.match(art,/viewBox="0 0 180 180"/);
 }
});
