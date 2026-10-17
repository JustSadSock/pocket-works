
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
