// Hand-authored SVG vocabulary. Only the item name visible to a player is passed
// to artifactSVG: disguises must never reveal hidden server-side identities.
const glyph={
 scroll:'<path d="M7 4h12v15H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm0 0c-4 0-4 5 0 5h12M9 12h6M9 16h7"/>',
 'shield-check':'<path d="M12 2 3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4Zm-4 10 3 3 5-6"/>',
 tag:'<path d="M2 4h12l8 8-10 10L2 12V4Zm5 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>',
 bag:'<path d="M4 8h16l-1 13H5L4 8ZM9 9V6a3 3 0 0 1 6 0v3M4 13h16"/>',
 trade:'<path d="m2 12 5-5 6 4-4 4-7-3Zm20 0-5-5-6 4 4 4 7-3ZM7 15l4 4 3-1 3-3M11 11l3 3"/>',
 gavel:'<path d="m4 6 5-4 9 9-5 5-9-10ZM12 9l-4 4M14 14l-8 8M4 21h15"/>',
 people:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-3a6 6 0 0 1 12 0v3H2Zm13-8a5 5 0 0 1 7 5v3h-5"/>',
 journal:'<path d="M4 3h15v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h8M7 12h8M7 16h5"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 coin:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="M12 7v10m-3-8h5a2 2 0 0 1 0 4h-4a2 2 0 1 0 0 4h5"/>',
 gem:'<path d="M7 3h10l5 7-10 12L2 10 7 3Zm-5 7h20M7 3l5 7 5-7m-5 7v12"/>',
 parts:'<path d="M10 2h4l1 4 3 1 4-2 2 4-3 3v3l3 3-3 4-4-2-3 1-1 3H9l-1-4-3-1-3 2-2-4 3-3v-3L0 9l2-4 4 2 3-1 1-4Z" transform="translate(1 0) scale(.91)"/><circle cx="12" cy="12" r="4"/>',
 box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 5 9-5m-9 5v10M8 5l9 5"/>',
 star:'<path d="m12 2 3.1 6.4 7 1-5.1 5 1.3 7-6.3-3.3-6.3 3.3 1.3-7-5.1-5 7-1L12 2Z"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 leaf:'<path d="M21 3C9 3 4 9 4 16c0 4 5 6 9 3 4-3 6-9 8-16ZM4 21c3-6 8-9 13-12"/>',
 arrow:'<path d="m4 12 16 0m-7-7 7 7-7 7"/>',
 'volume-on':'<path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
 'volume-off':'<path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/>'
};
export function svgIcon(name,size=22){
 const path=glyph[name]||glyph.star;
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
// One source of truth for SVG artefacts, including clients importing this module.
export {artifactSVG} from './art/artifacts.js';
export function brandEmblem(){
 return '<svg viewBox="0 0 220 220" role="img" aria-label="Чёрная барахолка"><path d="M44 49Q105 10 176 49l-7 111q-59 38-116 0L44 49Z" fill="#d2a46c" stroke="#38271e" stroke-width="12"/><path d="M62 60h96l-5 82q-45 34-86 0L62 60Z" fill="#774333" stroke="#35231e" stroke-width="7"/><path d="m87 85 20-30 21 30-9 41H98L87 85Z" fill="#dca34f" stroke="#34241b" stroke-width="6"/><circle cx="96" cy="93" r="5" fill="#22160f"/><circle cx="119" cy="93" r="5" fill="#22160f"/><path d="M99 113q8 12 17 0" fill="none" stroke="#22160f" stroke-width="5"/><path d="m66 159-17 26m102-26 17 26" stroke="#e5c184" stroke-width="9" stroke-linecap="round"/><path d="m110 9 7 13 15-5-7 15 9 10-17-1-7 13-6-13-17 1 9-10-7-15 15 5 6-13Z" fill="#ecc06a" stroke="#34241b" stroke-width="4"/></svg>';
}