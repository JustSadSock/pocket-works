// Illustrated rune seals. The forty marks have distinct semantic engravings;
// the frame is shared so the spell grammar remains visually legible.
const PATHS=Object.freeze({
 on_cast:'M15 32H49 M39 22L49 32 39 42 M21 20V44',
 on_hit:'M32 13V51 M13 32H51 M21 21L43 43 M43 21L21 43',
 on_hurt:'M16 18L28 27 23 35 36 47 48 34 M31 17L27 28',
 on_guard:'M32 12L47 19V32Q45 46 32 52Q19 46 17 32V19Z',
 on_dash:'M14 42L36 18M28 18H36V26 M26 37L40 23M42 36L50 28',
 on_break:'M32 10L45 17 48 32 39 48 32 53 23 47 16 32 19 17Z M36 20L28 31 35 37 25 49',
 on_bounce:'M16 44L39 21 48 29 M39 21H47V13 M19 23L28 31',
 on_heal:'M32 14V50M14 32H50 M22 22L42 42M42 22L22 42',
 on_close:'M13 32L23 22M13 32L23 42 M51 32L41 22M51 32L41 42 M25 26L32 32 39 26',
 on_clock:'M32 13A19 19 0 1 1 31.9 13 M32 19V33L42 39',
 on_overload:'M33 12L24 32 34 32 26 52 45 27 34 27 39 12Z',
 on_expire:'M15 20L23 27M25 16L34 26 M46 18L39 28M17 42L26 35M43 36L50 44M29 43L33 52',
 ball:'M32 15A17 17 0 1 1 31.9 15M32 23A9 9 0 1 0 32.1 23 M32 10V16 M54 32H48',
 heal:'M25 15H39V25H49V39H39V49H25V39H15V25H25Z',
 armor:'M32 11L49 19V33Q47 47 32 54Q17 47 15 33V19Z M25 27H39M25 35H39',
 blast:'M32 10V22M32 42V54M10 32H22M42 32H54M17 17L25 25M39 39L47 47 M47 17L39 25M25 39L17 47',
 blink:'M13 39L31 18 26 30 42 26 26 49 31 36Z',
 clone:'M15 19H35V39H15Z M29 27H49V47H29Z M22 24L26 24',
 mine:'M32 14L38 23 49 25 42 35 44 47 32 41 20 47 22 35 15 25 26 23Z M32 23V34',
 wall:'M13 20H51V46H13Z M13 33H51M25 20V33M41 33V46',
 push:'M15 25H35 M29 19L35 25 29 31 M15 39H48M41 32L48 39 41 46',
 slow:'M32 14A18 18 0 1 1 31.9 14M32 19V33L23 40',
 haste:'M20 47L37 17 29 32H46L24 51 30 38H18Z',
 cool:'M31 12V52M14 32H50M19 19L45 45 M45 19L19 45 M22 12L31 20 40 12',
 double:'M18 17V47 M27 21V43M37 17V47M46 21V43',
 triple:'M14 19V45 M23 19V45 M32 19V45 M41 19V45 M50 19V45',
 strong:'M32 10L42 28H53L35 39 32 53 27 39 11 28H23Z',
 far:'M13 32H51 M39 20L51 32 39 44 M23 23L14 32 23 41',
 bounce:'M13 43L30 23 42 35M42 35V22M42 35H29 M22 45L31 36',
 drain:'M15 23Q32 48 49 23M22 18V27M42 18V27 M32 33V50 M27 43L32 50 37 43',
 lasting:'M19 17H45L35 32 45 47H19L29 32Z M22 21H42M22 43H42',
 wide:'M32 17V47 M17 32H47 M22 22L42 42M42 22L22 42 M12 12L18 12M46 52H52',
 cheap:'M16 32L25 41 48 18M17 20H26M40 45H49',
 quick:'M20 12L35 12 27 27 43 27 22 52 28 36 17 36Z',
 reverse:'M48 20H19L29 11 M19 20L29 29 M16 44H45L35 35M45 44L35 53',
 fastshot:'M14 24H33M12 33H43 M14 42H33 M37 19L50 33 37 47',
 as_fire:'M33 12Q45 25 40 33Q52 27 48 41Q45 53 32 52Q18 53 17 42Q15 32 31 20Q32 29 33 34Q42 26 33 12Z',
 as_storm:'M34 10L17 36H30L26 54 49 27H35L42 10Z',
 as_stone:'M20 18L32 13 44 18 50 36 39 50H25L14 36Z M22 29L32 21 42 29M25 40H40'
});
const COLORS={when:['#b8753f','#ffd7a1','#e6ae67'],do:['#326e69','#c2efe0','#85cfbd'],how:['#665285','#eedafd','#bda5e3']};
const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))node.setAttribute(k,String(v));return node}
export function runeSeal(r){
 const colors=COLORS[r.type]||COLORS.do;
 const svg=svgNode('svg',{viewBox:'0 0 64 64',class:'rune-seal-art','aria-hidden':'true',focusable:'false'});
 const shell=svgNode('path',{d:'M32 3L52 13 61 32 52 51 32 61 12 51 3 32 12 13Z',fill:'#1c2927',stroke:colors[0],'stroke-width':2.8,'stroke-linejoin':'bevel'});
 const bevel=svgNode('path',{d:'M32 9L47 17 54 32 47 47 32 55 17 47 10 32 17 17Z',fill:colors[0],'fill-opacity':'.22',stroke:colors[2],'stroke-width':'1.2'});
 const outer=svgNode('path',{d:'M32 13L44 20 50 32 44 44 32 51 20 44 14 32 20 20Z',fill:'#152826','fill-opacity':'.7',stroke:colors[1],'stroke-opacity':'.32'});
 const glyph=svgNode('path',{d:PATHS[r.id]||PATHS.ball,fill:'none',stroke:colors[1],'stroke-width':r.type==='how'?3.3:3,'stroke-linecap':'square','stroke-linejoin':'miter'});
 const shine=svgNode('path',{d:'M13 16L31 7 49 16',fill:'none',stroke:'#fff2ca','stroke-opacity':'.32','stroke-width':1.3});
 const point=svgNode('path',{d:'M29 5H35 M29 59H35 M5 29V35 M59 29V35',fill:'none',stroke:colors[2],'stroke-width':1.6});
 svg.append(shell,bevel,outer,shine,glyph,point);return svg;
}
export const ALL_SEAL_IDS=Object.keys(PATHS);
