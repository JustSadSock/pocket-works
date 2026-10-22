
/* Original vector props: all ten offerings are legible silhouettes, not emoji fonts. */
const paint={
 goose:'<path d="M22 56q-12-8-8-22 5-14 27-10 7 0 11 5l-7 17-9 12Z" fill="#eee5ce"/><path d="M44 30q9-23 17-20 6 2 4 10l-7 17q-3 8-13 11" fill="#eee5ce"/><circle cx="60" cy="17" r="2.6" fill="#29342f"/><path d="m64 21 12 5-13 3" fill="#bf7042"/><path d="m22 59-3 10m17-10 2 10" stroke="#be814b" stroke-width="3"/><path d="M15 30 5 20m1 16 10 7" stroke="#eee5ce" stroke-width="7" stroke-linecap="round"/>',
 bread:'<ellipse cx="41" cy="55" rx="34" ry="22" fill="#9e5230"/><path d="M10 51Q12 22 41 22t31 29q-30 18-62 0" fill="#d89e57"/><path d="m24 29-5 19m24-24-3 26m19-19-3 17" stroke="#f0c681" stroke-width="5" stroke-linecap="round"/>',
 crown:'<path d="M9 22 24 37l14-26 14 26 17-15-5 36H15Z" fill="#ce9a53" stroke="#623e2b" stroke-width="3"/><path d="M15 55h49v11H15Z" fill="#efd08b" stroke="#623e2b" stroke-width="3"/><circle cx="24" cy="46" r="5" fill="#a34844"/><circle cx="40" cy="43" r="6" fill="#5d8379"/><circle cx="55" cy="46" r="5" fill="#a34844"/>',
 egg:'<path d="M40 8C21 7 11 33 11 48c0 18 12 26 29 26s29-8 29-26C69 33 59 7 40 8Z" fill="#efe5d3" stroke="#baa389" stroke-width="3"/><path d="M21 47q3-18 12-25" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round"/>',
 candle:'<path d="M28 24h23v42H28Z" fill="#efe0b9" stroke="#9d8168" stroke-width="3"/><path d="M25 65h30l7 9H18Z" fill="#a57952"/><path d="M39 4q17 15 1 25-13-7-1-25Z" fill="#e1a34f"/><path d="M40 14q7 9 0 13-5-4 0-13Z" fill="#f8e4a5"/><path d="M39 30v9" stroke="#936749" stroke-width="3"/>',
 fish:'<path d="M17 43 4 25v37l13-17C33 19 57 22 76 43 56 65 34 68 17 43Z" fill="#91a6a3" stroke="#425c5f" stroke-width="3"/><path d="M41 29 48 14l10 18m-15 26 7 13 12-21" fill="#6f8b8b" stroke="#425c5f" stroke-width="2"/><circle cx="62" cy="40" r="3" fill="#273d40"/><path d="m23 41 7 6m4-14 7 11m-5 10 8-8" stroke="#bfd0bd" stroke-width="2"/>',
 key:'<circle cx="25" cy="28" r="15" fill="none" stroke="#b9baba" stroke-width="9"/><path d="M35 38 66 69h7V57h-9v-8H54L34 31" fill="#a5a6a2" stroke="#56646a" stroke-width="3"/><circle cx="25" cy="28" r="4" fill="#2e342f"/>',
 cup:'<path d="M15 22h50L59 48q-4 15-20 15T20 48Z" fill="#d2ab64" stroke="#6c4b37" stroke-width="3"/><path d="M64 27Q84 21 71 43l-12 7" fill="none" stroke="#e1ba78" stroke-width="6"/><path d="M38 61v10m-13 0h28" stroke="#bb9255" stroke-width="7" stroke-linecap="round"/><path d="m25 37 28 0" stroke="#f6d997" stroke-width="3"/>',
 stone:'<path d="M8 48 24 19 52 12l22 28-10 26H21Z" fill="#777b75" stroke="#3e5149" stroke-width="3"/><path d="m24 19 17 24 32-3M41 43l-4 23" fill="none" stroke="#b3b1a0" stroke-width="3"/><path d="m9 49 29 16" stroke="#454e49" stroke-width="4"/>',
 bell:'<path d="M39 16q-3-11 4-11t3 11" fill="none" stroke="#92734b" stroke-width="5"/><path d="M23 59q-6-9-6-26 0-20 23-20t23 20q0 17-6 26Z" fill="#c8ad7c" stroke="#6f5842" stroke-width="3"/><path d="M15 58h51v9H15Z" fill="#a98250" stroke="#6f5842" stroke-width="3"/><circle cx="41" cy="70" r="6" fill="#5f4636"/><path d="M31 25q-4 8-4 19" fill="none" stroke="#f5dba0" stroke-width="4" stroke-linecap="round"/>'
};

/* Additional hand-drawn miniatures: coherent ink outlines, different silhouettes. */
Object.assign(paint,{
 goat:'<path d="M16 52Q8 32 24 29l28 4 10 17-8 12H22Z" fill="#ddcfb5" stroke="#67513e" stroke-width="3"/><path d="M20 33 11 17l15 7 21-5 11 8-4 24-25 3-7-13Z" fill="#e7d9c1" stroke="#735944" stroke-width="3"/><path d="m16 27-6-15m35 10 8-14" stroke="#b7a081" stroke-width="5"/><circle cx="43" cy="36" r="2.9" fill="#302d27"/><path d="m55 45 9 7-8 6-7-5M28 61l-3 13m26-14 4 14" stroke="#6e5141" stroke-width="4" fill="none"/>',
 apple:'<path d="M42 24Q12 8 11 43q-1 31 25 32 7-5 12 0 28-1 25-34Q69 17 42 24Z" fill="#b7503f" stroke="#733c32" stroke-width="3"/><path d="M40 24q-5-14 3-21" stroke="#5e593a" stroke-width="5" fill="none"/><path d="M44 17Q60 5 68 13q-12 14-24 4Z" fill="#658569"/><path d="M21 39q2-10 10-13" stroke="#e5a36f" stroke-width="5" fill="none" stroke-linecap="round"/>',
 mushroom:'<path d="M32 42h18l8 27Q40 78 21 69Z" fill="#dccab1" stroke="#74624b" stroke-width="3"/><path d="M5 46q1-34 35-36t35 36q-33 17-70 0Z" fill="#775342" stroke="#3e342f" stroke-width="3"/><path d="M13 41q23 12 52 0" fill="none" stroke="#c59b75" stroke-width="3"/><circle cx="28" cy="25" r="5" fill="#e8c998"/><circle cx="50" cy="33" r="4" fill="#e8c998"/><circle cx="41" cy="16" r="3" fill="#e8c998"/>',
 flower:'<path d="M39 75V37M38 60Q20 38 11 51q2 15 26 11m4-13q24-21 32-9-7 18-32 18" fill="#6d8a65" stroke="#4d684a" stroke-width="3"/><circle cx="40" cy="30" r="11" fill="#e8b66f"/><g fill="#c96c62" stroke="#783e41" stroke-width="2"><ellipse cx="40" cy="12" rx="10" ry="12"/><ellipse cx="40" cy="48" rx="10" ry="12"/><ellipse cx="21" cy="30" rx="12" ry="10"/><ellipse cx="59" cy="30" rx="12" ry="10"/></g><circle cx="40" cy="30" r="9" fill="#ebc16b"/>',
 mirror:'<path d="M40 55v17m-15 0h30" stroke="#ad956f" stroke-width="8"/><ellipse cx="40" cy="31" rx="28" ry="29" fill="#af9264" stroke="#664835" stroke-width="3"/><ellipse cx="40" cy="31" rx="22" ry="23" fill="#a1c4bb" stroke="#e9d3a4" stroke-width="3"/><path d="M26 35 40 16l12 6-19 29M43 48l15-22" fill="none" stroke="#d7e7cc" stroke-width="4" opacity=".8"/>',
 mask:'<path d="M16 14 40 8l24 6-4 40-20 20-20-20Z" fill="#d2a469" stroke="#785039" stroke-width="4"/><path d="m19 33 19 5-9 12-10-10m42-7-19 5 9 12 10-10" fill="#453e35" stroke="#704a3a" stroke-width="2"/><path d="M34 58q6 6 12 0M39 40l-3 13h8" fill="none" stroke="#73513c" stroke-width="3"/><circle cx="40" cy="21" r="5" fill="#b35c51"/>',
 scroll:'<path d="M20 16h38v48H20Z" fill="#efe1bc" stroke="#a88767" stroke-width="3"/><path d="M20 16q-14-8-14 8t14 8m38-16q14-8 14 8t-14 8M20 64q-14-8-14 6t14 5m38-11q15-8 15 6t-15 5" fill="#ddc7a6" stroke="#8b7057" stroke-width="3"/><path d="M29 32h21M29 40h21M29 48h16" stroke="#a07d5e" stroke-width="3"/><circle cx="44" cy="59" r="8" fill="#a75848"/>',
 sword:'<path d="M47 10 62 3l-1 19-26 30-9-9Z" fill="#bccaca" stroke="#53696d" stroke-width="3"/><path d="m12 42 28 27m-24 4 25-26" stroke="#9d865d" stroke-width="7"/><path d="m10 76 10-10 9 9-10 5Z" fill="#ad7952"/><path d="M49 18 33 41" stroke="#edf1dc" stroke-width="3"/>',
 shield:'<path d="M40 6 70 17l-5 35Q55 68 40 77 23 65 15 52L10 17Z" fill="#b68d54" stroke="#6b5036" stroke-width="4"/><path d="M40 12v59M16 24h48" stroke="#e3bf82" stroke-width="5"/><circle cx="40" cy="41" r="9" fill="#a45547" stroke="#e9d49c" stroke-width="3"/>',
 hourglass:'<path d="M16 7h48M16 73h48" stroke="#745640" stroke-width="7"/><path d="M21 10h38Q59 29 45 39q17 15 14 31H21q-2-16 14-31Q21 29 21 10Z" fill="#aec6bb" opacity=".78" stroke="#c4a16e" stroke-width="4"/><path d="M25 26q13 5 30 0l-15 14v10l13 16H27l13-16V40Z" fill="#dec08b"/><path d="M40 40v9" stroke="#916b47" stroke-width="3"/>',
 book:'<path d="M12 18q14-9 29-1 13-9 27-1v48q-14-4-27 4-15-9-29-4Z" fill="#8c6753" stroke="#573b32" stroke-width="4"/><path d="M41 17v51M20 29q9-4 15 0m-15 9q8-4 15 0m12-9q8-4 15 0m-15 9q8-4 15 0" stroke="#e7c69e" stroke-width="2.5" fill="none"/><path d="M13 59q13-5 28 5 14-10 26-5" stroke="#d8bb91" fill="none" stroke-width="3"/>',
 boot:'<path d="M25 9h28l-5 36 11 12 16 4v12H9V60q20-3 18-18Z" fill="#77523e" stroke="#462f29" stroke-width="4"/><path d="m26 28 23 5M13 65h58M30 17h21" stroke="#b28a62" stroke-width="4"/><path d="m33 37 12 4M22 52h22" stroke="#c49d74" stroke-width="3"/>',
 cheese:'<path d="M8 40 68 19v49H8Z" fill="#e9bd63" stroke="#a77943" stroke-width="3"/><path d="M8 40 38 28l30-9-18-9-42 18Z" fill="#f4d17e" stroke="#ba9251" stroke-width="3"/><circle cx="24" cy="54" r="7" fill="#c8954f"/><circle cx="52" cy="49" r="5" fill="#c8954f"/><circle cx="42" cy="65" r="3" fill="#c8954f"/>',
 lantern:'<path d="M29 16q0-12 12-12t12 12" stroke="#806343" stroke-width="5" fill="none"/><path d="M22 20h38l9 41-13 10H25L12 61Z" fill="#a87c4c" stroke="#594637" stroke-width="3"/><path d="M30 25h21l8 30-10 10H32L22 55Z" fill="#f3c779" stroke="#a87348" stroke-width="3"/><path d="M40 31q12 12 0 27-11-15 0-27Z" fill="#fff1bd"/><path d="M21 70h39" stroke="#cfad76" stroke-width="7"/>',
 frog:'<ellipse cx="40" cy="53" rx="29" ry="19" fill="#749a61" stroke="#425a45" stroke-width="3"/><circle cx="23" cy="34" r="13" fill="#81a767"/><circle cx="57" cy="34" r="13" fill="#81a767"/><circle cx="23" cy="34" r="7" fill="#f4dbb7"/><circle cx="57" cy="34" r="7" fill="#f4dbb7"/><circle cx="25" cy="34" r="3" fill="#242d28"/><circle cx="55" cy="34" r="3" fill="#242d28"/><path d="M29 56q11 9 22 0m-33 5L5 72m57-11 13 11" fill="none" stroke="#405b43" stroke-width="4" stroke-linecap="round"/>',
 compass:'<circle cx="40" cy="42" r="32" fill="#baaa89" stroke="#606660" stroke-width="5"/><circle cx="40" cy="42" r="24" fill="#e7e2c9" stroke="#737c71" stroke-width="2"/><path d="M40 16v52M14 42h52" stroke="#b1b2a4" stroke-width="2"/><path d="m46 36 9-15-21 13-8 29Z" fill="#bb6753" stroke="#70514a" stroke-width="2"/><circle cx="40" cy="42" r="5" fill="#715d46"/>',
 skull:'<path d="M40 9Q10 8 12 37q-1 15 12 21v15h32V58q13-7 12-21Q70 7 40 9Z" fill="#dfd5be" stroke="#8f806d" stroke-width="3"/><ellipse cx="28" cy="39" rx="11" ry="12" fill="#493e35"/><ellipse cx="52" cy="39" rx="11" ry="12" fill="#493e35"/><path d="m40 44-5 10h10Z" fill="#695d4e"/><path d="M26 65h28M33 59v13m7-13v13m7-13v13" stroke="#908572" stroke-width="2.5"/>',
 potato:'<path d="M17 20Q6 32 12 55t31 18Q76 71 71 43 68 14 41 12q-13-5-24 8Z" fill="#aa8060" stroke="#654b38" stroke-width="4"/><circle cx="25" cy="33" r="4" fill="#826044"/><circle cx="51" cy="48" r="3" fill="#826044"/><circle cx="35" cy="61" r="3.5" fill="#826044"/><path d="M19 47q-5 11 8 17" fill="none" stroke="#c9a483" stroke-width="3"/>'
});
const toolPaint={
 wash:'<path d="M12 2C9 8 4 13 4 17a8 8 0 0 0 16 0c0-4-5-9-8-15Z" fill="#9ac8ca" stroke="#d9e5d7" stroke-width="1.5"/><path d="M8 17q0 4 4 4" stroke="#eff6df" stroke-width="2" fill="none"/>',
 smoke:'<path d="M6 24h14M8 19q-7-5 1-10 6-4 0-8M17 19q-7-5 1-10 6-4 0-8" stroke="#d3c0b2" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
 gild:'<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z" fill="#e5b565" stroke="#f1d79d" stroke-width="1.2"/>',
 ribbon:'<path d="M12 11Q0-2 2 10q1 8 10 1Q24-2 23 10q-1 8-11 1Zm0 0-7 13 7-4 6 4Z" fill="#c97361" stroke="#e7ad98" stroke-width="1.2"/>',
 anoint:'<path d="M7 2h10v4l-2 4v12H9V10L7 6Z" fill="#b4a16d" stroke="#f2d39a" stroke-width="1.4"/><path d="M8 6h8M11 15h2" stroke="#f7e8bf" stroke-width="2"/>'
};
export function treatmentArt(id,size=22){
 return '<svg class="tool-symbol" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" aria-hidden="true">'+(toolPaint[id]||toolPaint.wash)+'</svg>';
}
const incidentGlyph={
 tax:'<path d="M12 2 22 8v9l-10 5L2 17V8Z M7 11h10m-10 4h10" />',
 rats:'<path d="M4 17q-3-10 8-10t8 10q-6 7-16 0Zm2-11L3 2m15 4 3-4M7 15h1m8 0h1"/>',
 choir:'<path d="M4 21V7l5 2 4-6 7 4v14ZM8 13h1m5 0h1m-8 4h10"/>',
 drought:'<path d="M12 2q-13 15-8 19 8 6 16 0 5-6-8-19Zm-4 16 4 3"/>',
 festival:'<path d="M12 11Q0-1 2 10q1 8 10 1Q24-1 22 10q-1 8-10 1Zm0 0-5 11 5-3 5 3Z"/>',
 audit:'<path d="M5 3h14v18H5Z M8 9h8M8 13h8m-8 4h5"/>',
 wind:'<path d="M2 7h14q6 0 5-4M2 12h19M2 17h13q6 0 5 4"/>',
 eclipse:'<circle cx="12" cy="12" r="9"/><path d="M17 4A9 9 0 0 0 17 20a9 9 0 1 1 0-16Z"/>',
 pilgrims:'<path d="m12 3-7 9 7 9 7-9Z M4 12h16M12 3v18"/>',
 thieves:'<path d="M5 9 12 3l7 6v11H5Z M9 13h6m-3-3v6"/>',
 fashion:'<path d="m3 21 2-15 7-4 7 4 2 15Z M5 6l7 7 7-7"/>',
 silence:'<path d="M4 13Q4 7 12 7t8 6v7H4Z M2 3l20 18"/>',
 market:'<path d="M3 11h18l-2 10H5Z M2 11l4-7h12l4 7M9 15h6"/>',
 democracy:'<path d="M3 8h18M6 8v12m6-12v12m6-12v12M2 21h20M12 2l9 6H3Z"/>',
 flood:'<path d="M2 12q3-4 6 0t8 0 6 0M2 18q3-4 6 0t8 0 6 0M12 2l-4 8h8Z"/>',
 oil:'<path d="M8 3h8v4l-2 3v12h-4V10L8 7ZM7 7h10M11 14h2"/>'
};
export function incidentArt(id,size=58){
 return '<svg class="incident-symbol" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" aria-hidden="true">'+
 '<g stroke="#f0c88e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none">'+(incidentGlyph[id]||incidentGlyph.audit)+'</g></svg>';
}

export function offeringArt(id,size=76){
 const shape=paint[id]||paint.stone;
 return '<svg class="offering-svg" width="'+size+'" height="'+size+'" viewBox="0 0 80 80" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">'+shape+'</g></svg>';
}
export function godArt(){
 return '<svg class="god-face" viewBox="0 0 260 264" role="img" aria-label="Резной лик бога ОГО">'+
 '<defs><linearGradient id="faceWood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#84583e"/><stop offset=".48" stop-color="#d2a276"/><stop offset=".95" stop-color="#7b4d36"/></linearGradient></defs>'+
 '<path d="M128 5 223 55l20 115-46 64-69 27-72-27-41-70L37 53Z" fill="#4c3428" stroke="#a47652" stroke-width="7"/>'+
 '<path d="M128 18 209 65l17 98-37 58-61 25-63-25-34-58 20-98Z" fill="url(#faceWood)" stroke="#684630" stroke-width="6"/>'+
 '<path d="M60 91Q130 52 201 91m-145 99q73 59 146 0" fill="none" stroke="#6f452f" stroke-width="9" opacity=".45"/>'+
 '<path d="m88 35 40-24 42 24-42 15Z" fill="#ead099" stroke="#604531" stroke-width="4"/>'+
 '<g class="god-brows"><path d="M63 107q29-20 57-3m18 0q28-17 56 3" fill="none" stroke="#4e362c" stroke-width="15" stroke-linecap="round"/></g>'+
 '<g class="god-eyes"><ellipse cx="91" cy="131" rx="20" ry="14" fill="#f2e7cd"/><ellipse cx="165" cy="131" rx="20" ry="14" fill="#f2e7cd"/>'+
 '<circle cx="96" cy="130" r="8" fill="#32514d"/><circle cx="160" cy="130" r="8" fill="#32514d"/><circle cx="98" cy="128" r="2" fill="#fff"/></g>'+
 '<path d="m129 131-12 41 25 3" fill="none" stroke="#754c37" stroke-width="8" stroke-linecap="round"/>'+
 '<g class="god-jaw"><path d="M93 202q36-27 70 0-35 46-70 0Z" fill="#392820" stroke="#efd59f" stroke-width="4"/><path d="M104 207h49" stroke="#f4dca4" stroke-width="7" stroke-linecap="round"/></g>'+
 '<path d="m35 85-17 38 21 6M224 85l17 38-19 6" fill="none" stroke="#c39266" stroke-width="8" stroke-linecap="round"/>'+
 '</svg>';
}
