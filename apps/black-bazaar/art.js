// Hand-authored SVG vocabulary. Only the item name visible to a player is passed
// to artifactSVG: disguises must never reveal hidden server-side identities.
const glyph={
 scroll:'<path d="M7 4h12v15H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm0 0c-4 0-4 5 0 5h12M9 12h6M9 16h7"/>',
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
 arrow:'<path d="m4 12 16 0m-7-7 7 7-7 7"/>'
};
export function svgIcon(name,size=22){
 const path=glyph[name]||glyph.star;
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
const INK='#38241d',EDGE='stroke="'+INK+'" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
const shapes=[
 [/жаб/i,'<ellipse cx="70" cy="87" rx="43" ry="32" fill="#b49745" '+EDGE+'/><circle cx="45" cy="57" r="15" fill="#bf9b42" '+EDGE+'/><circle cx="95" cy="57" r="15" fill="#bf9b42" '+EDGE+'/><circle cx="45" cy="57" r="6" fill="#321e17"/><circle cx="95" cy="57" r="6" fill="#321e17"/><path d="M55 91q15 12 30 0" fill="none" '+EDGE+'/>'],
 [/копил/i,'<ellipse cx="69" cy="84" rx="45" ry="31" fill="#c97d60" '+EDGE+'/><circle cx="108" cy="82" r="14" fill="#e8a47b" '+EDGE+'/><path d="M32 105v12m55-9v9M50 55q12-19 25-8l7 9M60 65h22" fill="none" '+EDGE+'/><circle cx="94" cy="73" r="4" fill="#241a15"/>'],
 [/паук/i,'<ellipse cx="70" cy="84" rx="30" ry="33" fill="#7d7d67" '+EDGE+'/><path d="M42 68 20 52 9 65m33 23L18 91 9 111m89-44 22-15 11 13m-33 23 24 3 9 20" fill="none" '+EDGE+'/><circle cx="59" cy="76" r="5" fill="#efbf6d"/><circle cx="81" cy="76" r="5" fill="#efbf6d"/><path d="M65 50v68m-10-45h30" '+EDGE+' fill="none"/>'],
 [/корон/i,'<path d="m20 48 18 22 26-32 26 32 29-22-9 58H29L20 48Z" fill="#d8a14d" '+EDGE+'/><path d="M28 91h82m-64-5 8-7 8 7-8 7-8-7Zm30-7 8 7-8 7-8-7Z" fill="#b85343" '+EDGE+'/>'],
 [/сундук|мимик/i,'<path d="M24 67q0-25 46-25t46 25v51H24V67Z" fill="#915633" '+EDGE+'/><path d="M24 71h92v18H24V71Z" fill="#ce9b56" '+EDGE+'/><path d="m32 89 9 12 12-12 11 12 12-12 11 12 12-12 9 12" fill="#fff2d3" '+EDGE+'/><circle cx="52" cy="58" r="5" fill="#241a15"/><circle cx="87" cy="58" r="5" fill="#241a15"/>'],
 [/кот/i,'<path d="M29 68 26 35l30 17 14-4 14 4 30-17-3 33q17 39-18 48H48Q13 107 29 68Z" fill="#4f4545" '+EDGE+'/><ellipse cx="51" cy="80" rx="11" ry="14" fill="#ebbb69" '+EDGE+'/><ellipse cx="91" cy="80" rx="11" ry="14" fill="#ebbb69" '+EDGE+'/><path d="m63 103 8 6 8-6M51 80h1m39 0h1" '+EDGE+' fill="none"/>'],
 [/зеркал/i,'<path d="M70 21c39 0 45 20 40 45-3 20-22 38-40 38S33 86 30 66c-5-25 1-45 40-45Z" fill="#b77b46" '+EDGE+'/><path d="M70 31c30 0 35 17 30 35S82 94 70 94 45 84 40 66 40 31 70 31Z" fill="#7aada7" '+EDGE+'/><path d="M67 103v23m-17 0h40" fill="none" '+EDGE+'/><path d="m52 64 29-24" stroke="#d9e9cb" stroke-width="5" opacity=".8"/>'],
 [/шестерн/i,'<path d="M60 19h20l5 18 12 7 19-4 10 18-13 15v13l13 15-10 18-19-4-12 7-5 17H60l-5-17-12-7-19 4-10-18 13-15V73L14 58l10-18 19 4 12-7 5-18Z" transform="translate(13 4) scale(.8)" fill="#b47d45" '+EDGE+'/><circle cx="70" cy="80" r="20" fill="#6d5541" '+EDGE+'/>'],
 [/око/i,'<path d="M17 80q53-75 106 0-53 75-106 0Z" fill="#d8a34c" '+EDGE+'/><circle cx="70" cy="80" r="27" fill="#83aaa1" '+EDGE+'/><circle cx="70" cy="80" r="13" fill="#322522"/><circle cx="64" cy="72" r="5" fill="#ffe6b8"/>'],
 [/гриб/i,'<path d="M58 80h27l9 39H48l10-39Z" fill="#f3dbb6" '+EDGE+'/><path d="M16 83q4-62 54-62t54 62H16Z" fill="#b9513e" '+EDGE+'/><circle cx="48" cy="53" r="10" fill="#fbe1b4"/><circle cx="90" cy="44" r="8" fill="#fbe1b4"/><circle cx="70" cy="107" r="4" fill="#322522"/>'],
 [/час/i,'<path d="M37 24h66m-66 105h66M47 26q-3 29 23 52-26 23-23 50m46-102q3 29-23 52 26 23 23 50" fill="none" '+EDGE+'/><path d="M50 47h40L70 80 50 47Zm0 64h40l-20-26-20 26Z" fill="#dfa968" stroke="#ad714a" stroke-width="2"/>'],
 [/амул/i,'<path d="M70 13 99 43l-2 37-27 43-27-43-2-37 29-30Z" fill="#bb744c" '+EDGE+'/><path d="M70 29 86 50l-3 26-13 22-13-22-3-26 16-21Z" fill="#83ad92" '+EDGE+'/><path d="M70 39v49m-14-26h28" stroke="#f8ddb7" stroke-width="5"/>']
];
const hidden='<path d="M35 54q35-22 70 0l-5 62H40L35 54Z" fill="#bc875a" '+EDGE+'/><path d="m35 54 13-24h44l13 24H35Z" fill="#dbad73" '+EDGE+'/><path d="M70 64q12 0 12 12t-12 12-12-12 12-12Zm0 24v14" fill="none" '+EDGE+'/>';
export function artifactSVG(visibleName){
 const match=shapes.find(([re])=>re.test(visibleName||''));
 return '<svg viewBox="0 0 140 140" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><ellipse cx="71" cy="128" rx="48" ry="7" fill="#241711" opacity=".2"/>'+ (match?match[1]:hidden)+'</svg>';
}
export function brandEmblem(){
 return '<svg viewBox="0 0 220 220" role="img" aria-label="Чёрная барахолка"><path d="M44 49Q105 10 176 49l-7 111q-59 38-116 0L44 49Z" fill="#d2a46c" stroke="#38271e" stroke-width="12"/><path d="M62 60h96l-5 82q-45 34-86 0L62 60Z" fill="#774333" stroke="#35231e" stroke-width="7"/><path d="m87 85 20-30 21 30-9 41H98L87 85Z" fill="#dca34f" stroke="#34241b" stroke-width="6"/><circle cx="96" cy="93" r="5" fill="#22160f"/><circle cx="119" cy="93" r="5" fill="#22160f"/><path d="M99 113q8 12 17 0" fill="none" stroke="#22160f" stroke-width="5"/><path d="m66 159-17 26m102-26 17 26" stroke="#e5c184" stroke-width="9" stroke-linecap="round"/><path d="m110 9 7 13 15-5-7 15 9 10-17-1-7 13-6-13-17 1 9-10-7-15 15 5 6-13Z" fill="#ecc06a" stroke="#34241b" stroke-width="4"/></svg>';
}