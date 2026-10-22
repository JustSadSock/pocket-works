import {zamazkaAchievements} from './zamazka-achievements.js';
import {canticaAchievements} from './cantica-achievements.js';
import {blockiesAchievements} from './blockies-achievements.js';
// Pocket Works MASKOT — original, hand-drawn, composable SVG geometry.
// Asset IDs (not arbitrary markup) are the only user-controlled input.
// Public profile renders are already server-validated; these IDs are visual decoding rights, not ownership grants.
export const mascotPublicUnlocks=['astronaut','wedding','knight','herald','groom','seoul-artist','dragon-keeper',...zamazkaAchievements.map(a=>a.id),...canticaAchievements.map(a=>a.id),...blockiesAchievements.map(a=>a.id)];
export const mascotAnimals=[['cat','Кот'],['black-cat','Чёрный кот'],['fox','Лиса'],['rabbit','Кролик'],['frog','Лягушка']];
export const mascotHats=[['none','Без'],['crown','Корона'],['beret','Берет'],['flower','Цветок']];
export const mascotClothes=[['tunic','Туника'],['vest','Жилет'],['mantle','Мантия']];
export const mascotAccessories=[['none','Без аксессуара']];
export const mascotFaces=[['none','Без'],['glasses','Очки'],['stars','Звёздочки']];
export const mascotTitles=['','Первопроходец','Коллекционер','Хранитель хаоса','Подмастерье','Знаток подделок','Двойной агент','Призрачная кисть','Всевидящий','Авантюрист',...canticaAchievements.filter(a=>a.slot==='title').map(a=>a.item),...blockiesAchievements.filter(a=>a.slot==='title').map(a=>a.item)];
export const mascotSecret={astronaut:{hat:'helmet',clothes:'spacesuit'},wedding:{hat:'veil',clothes:'wedding'},knight:{hat:'bascinet'},herald:{clothes:'tabard'},groom:{clothes:'groom'},'seoul-artist':{hat:'stage-pin',clothes:'stage-hanbok'},'dragon-keeper':{accessory:'shoulder-dragon'}};
const one=(rows,id,fallback)=>rows.some(x=>x[0]===id)?id:fallback;
export function safeMascot(input,unlocks=[]){
  const u=Array.isArray(unlocks)?unlocks:[];
  const valid=(item,category,standard)=>typeof item==='string'&&(standard.some(x=>x[0]===item)||
    zamazkaAchievements.some(a=>a.slot===category&&a.item===item&&u.includes(a.id))||
    canticaAchievements.some(a=>a.slot===category&&a.item===item&&u.includes(a.id))||
    blockiesAchievements.some(a=>a.slot===category&&a.item===item&&u.includes(a.id))||
    Object.entries(mascotSecret).some(([key,x])=>u.includes(key)&&x[category]===item));
  const src=input&&typeof input==='object'?input:{};
  return {
    animal:one(mascotAnimals,src.animal,'cat'),
    hat:valid(src.hat,'hat',mascotHats)?src.hat:'none',
    clothes:valid(src.clothes,'clothes',mascotClothes)?src.clothes:'tunic',
    face:valid(src.face,'face',mascotFaces)?src.face:'none',
    accessory:valid(src.accessory,'accessory',mascotAccessories)?src.accessory:'none'
  };
}
export function mascotSvg(raw,{unlocks=[],size=256}={}){
  const m=safeMascot(raw,unlocks),s=String(size);
  const paths={
    cat:`<path d="M63 96 58 27Q59 17 68 24L102 55 155 55 187 24Q196 17 197 29L191 96" fill="url(#fur)" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/><path d="M74 59 69 38 94 60M170 60 187 37 181 65" fill="#f0ada6"/><path d="M51 99Q56 57 127 56Q198 57 204 101L197 143Q182 185 128 186Q72 185 56 143Z" fill="url(#fur)" stroke="#34434a" stroke-width="5"/><path d="M60 133Q79 111 103 137L127 151 151 137Q177 112 196 132Q188 178 128 182Q68 178 60 133" fill="#fff0d5"/><path d="M80 110Q91 101 101 109M155 109Q165 101 176 109" stroke="#664941" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="92" cy="122" rx="7" ry="10" fill="#313e40"/><ellipse cx="164" cy="122" rx="7" ry="10" fill="#313e40"/><circle cx="90" cy="118" r="2.8" fill="#fff"/><circle cx="162" cy="118" r="2.8" fill="#fff"/><path d="M118 151 137 151 127 162Z" fill="#665054"/><path d="M127 162Q122 171 115 167M128 162Q134 171 141 167" stroke="#795a50" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M78 143 61 138M78 150 59 151M177 142 195 138M177 150 196 150" stroke="#c89275" stroke-width="2.5" stroke-linecap="round"/>`,
    'black-cat':`<!-- Midnight cat: charcoal silhouette, ink tufts, amber eyes and silver whiskers -->
<path d="M54 98 48 24Q51 13 62 20L102 56H153L194 20Q205 13 207 27L199 101" fill="#212a35" stroke="#303943" stroke-width="5" stroke-linejoin="round"/>
<path d="M66 65 60 35 91 62M169 62 193 34 188 68" fill="#815c76"/>
<path d="M49 106Q48 65 97 58Q125 48 155 58Q209 64 208 112L197 153Q180 190 127 190Q75 188 54 151Z" fill="url(#nightFur)" stroke="#303943" stroke-width="5"/>
<path d="M61 154Q85 177 127 179Q171 177 197 152Q188 185 128 190Q73 186 61 154" fill="#384650"/>
<path d="M70 112Q88 101 104 111M149 111Q169 99 187 110" fill="none" stroke="#7c8d87" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="91" cy="128" rx="11" ry="12" fill="#e9b965"/><ellipse cx="164" cy="128" rx="11" ry="12" fill="#e9b965"/>
<ellipse cx="93" cy="129" rx="3.3" ry="9" fill="#202a31"/><ellipse cx="162" cy="129" rx="3.3" ry="9" fill="#202a31"/>
<circle cx="87" cy="123" r="3.1" fill="#fff6da"/><circle cx="160" cy="123" r="3.1" fill="#fff6da"/>
<path d="M117 157 139 157 128 167Z" fill="#d18d96"/>
<path d="M128 166Q119 174 112 169M128 166Q136 174 143 169" stroke="#a8acac" stroke-width="2.7" fill="none" stroke-linecap="round"/>
<path d="M82 153 58 149M80 160 55 164M175 153 199 149M177 160 202 164" stroke="#b8c2c1" stroke-width="2.6" stroke-linecap="round"/>
<path d="M108 83Q127 75 145 83" stroke="#64717b" stroke-width="3.5" opacity=".5" fill="none"/>`,
    fox:`<!-- Red fox: tall swept ears, white mask and pointed narrow muzzle -->
<path d="M53 111 40 24Q41 9 53 18L102 59H151L200 17Q212 9 212 27L202 112" fill="#b95735" stroke="#553e39" stroke-width="5" stroke-linejoin="round"/>
<path d="M57 69 51 37 94 66M165 66 200 37 196 70" fill="#f8ba9e"/>
<path d="M51 115Q53 71 105 60Q127 53 151 60Q204 71 206 115L196 144Q181 183 129 192Q75 184 58 146Z" fill="url(#foxFur)" stroke="#553e39" stroke-width="5"/>
<path d="M59 135Q81 119 106 138L128 150Q150 134 173 122L198 134Q183 176 128 186Q75 175 59 135" fill="#fff0d4"/>
<path d="M82 111Q93 104 107 110M149 110Q165 103 176 110" stroke="#7c4632" stroke-width="5" stroke-linecap="round" fill="none"/>
<path d="M79 123Q93 116 105 126M151 126Q165 116 179 123" fill="none" stroke="#39383a" stroke-width="4" stroke-linecap="round"/>
<ellipse cx="94" cy="126" rx="5.6" ry="8" fill="#2a383a"/><ellipse cx="162" cy="126" rx="5.6" ry="8" fill="#2a383a"/>
<circle cx="92" cy="123" r="2.3" fill="#fff8e3"/><circle cx="160" cy="123" r="2.3" fill="#fff8e3"/>
<path d="M96 151Q127 135 160 151L138 171Q129 179 119 171Z" fill="#fff8e9" stroke="#d7bba2" stroke-width="2"/>
<path d="M116 159 140 159 128 170Z" fill="#3c3c3d"/>
<path d="M128 171Q122 178 116 175M128 171Q134 178 141 175" stroke="#7f5947" stroke-width="2" fill="none"/>
<path d="M79 151 61 145M178 151 196 145" stroke="#fcead3" stroke-width="3" stroke-linecap="round"/>`,
    rabbit:`<path d="M87 94 87 18Q90 -4 106 20L116 73 138 73 149 20Q166 -4 168 18L169 94" fill="#e3cfbd" stroke="#34434a" stroke-width="5"/><path d="M99 64 98 25 109 64M156 64 157 25 145 64" fill="#e8abae"/><path d="M55 102Q61 56 127 58Q193 57 200 103L193 150Q178 187 128 187Q77 187 61 150Z" fill="#ead8c6" stroke="#34434a" stroke-width="5"/><path d="M70 139Q93 119 108 142Q128 158 148 142Q165 119 186 140Q178 178 128 179Q80 178 70 139" fill="#fff5e6"/><path d="M81 112Q90 105 102 111M153 111Q164 105 174 112" stroke="#77665b" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="93" cy="126" rx="7" ry="10" fill="#384447"/><ellipse cx="161" cy="126" rx="7" ry="10" fill="#384447"/><circle cx="91" cy="122" r="3" fill="#fff"/><circle cx="159" cy="122" r="3" fill="#fff"/><ellipse cx="128" cy="154" rx="9" ry="6" fill="#d99e9d"/><path d="M128 160Q122 171 114 166M128 160Q135 171 143 166" stroke="#77655d" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="79" cy="144" rx="9" ry="5" fill="#efc3bd"/><ellipse cx="177" cy="144" rx="9" ry="5" fill="#efc3bd"/>`,
    frog:`<!-- round frog face with protruding eye domes, short cheeks, no reptile muzzle -->
<path d="M64 109Q62 80 77 62Q92 46 112 57L143 60Q171 41 190 69Q202 86 194 111" fill="url(#green)" stroke="#34434a" stroke-width="5"/>
<ellipse cx="91" cy="74" rx="26" ry="27" fill="#9ccd76" stroke="#34434a" stroke-width="5"/>
<ellipse cx="165" cy="74" rx="26" ry="27" fill="#9ccd76" stroke="#34434a" stroke-width="5"/>
<path d="M54 118Q51 92 76 86Q97 79 114 91Q128 97 141 91Q160 79 181 86Q205 95 202 120Q207 176 167 189Q128 203 88 189Q51 175 54 118Z" fill="url(#green)" stroke="#34434a" stroke-width="5"/>
<path d="M71 156Q88 179 127 182Q170 181 185 155Q181 194 128 194Q73 192 71 156" fill="#c6e7a5" opacity=".82"/>
<ellipse cx="91" cy="74" rx="15" ry="16" fill="#fff8df"/>
<ellipse cx="165" cy="74" rx="15" ry="16" fill="#fff8df"/>
<ellipse cx="93" cy="75" rx="8" ry="10" fill="#354a42"/>
<ellipse cx="163" cy="75" rx="8" ry="10" fill="#354a42"/>
<circle cx="89" cy="70" r="3.3" fill="#fff"/>
<circle cx="160" cy="70" r="3.3" fill="#fff"/>
<path d="M79 111Q90 106 102 110M153 110Q165 106 177 111" fill="none" stroke="#619955" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="112" cy="139" rx="3.8" ry="2.5" fill="#639555"/>
<ellipse cx="144" cy="139" rx="3.8" ry="2.5" fill="#639555"/>
<path d="M82 148Q102 174 128 172Q155 171 176 147" fill="none" stroke="#355147" stroke-width="4.5" stroke-linecap="round"/>
<path d="M82 147Q79 149 76 146M176 147Q179 149 182 146" fill="none" stroke="#355147" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="78" cy="137" rx="13" ry="7" fill="#e4a6a7" opacity=".32"/>
<ellipse cx="178" cy="137" rx="13" ry="7" fill="#e4a6a7" opacity=".32"/>
<circle cx="68" cy="115" r="3" fill="#71ac67" opacity=".9"/>
<circle cx="188" cy="115" r="3" fill="#71ac67" opacity=".9"/>
`
  };
  const outfits={
    tunic:`<path d="M47 254Q49 182 106 173L127 190 150 173Q208 182 209 254Z" fill="url(#cloth)" stroke="#34434a" stroke-width="5"/><path d="M102 179Q113 193 128 195Q143 193 153 179" fill="none" stroke="#fff2d8" stroke-width="9" stroke-linecap="round"/><circle cx="128" cy="197" r="7" fill="#e9bf68" stroke="#34434a" stroke-width="2.5"/>`,
    vest:`<!-- Wide-cut waistcoat with full shoulders, replacing the entire base garment rather than floating over it -->
<path d="M24 255Q26 199 58 183Q81 171 102 170L128 190 154 170Q194 175 218 194Q232 220 234 255Z" fill="#e5d5bd" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/>
<path d="M29 252Q32 209 56 190L87 182 104 198 106 254H25Z" fill="#476f76" stroke="#34434a" stroke-width="4"/>
<path d="M227 252Q224 209 200 190L169 182 152 198 150 254H231Z" fill="#476f76" stroke="#34434a" stroke-width="4"/>
<path d="M85 179Q107 186 128 209Q149 186 171 179L182 255H74Z" fill="#f4eee0" stroke="#34434a" stroke-width="3.5"/>
<path d="M86 178 111 196 127 227 121 255 71 255ZM170 178 145 196 129 227 135 255 185 255Z" fill="#467e7e" stroke="#34434a" stroke-width="4" stroke-linejoin="round"/>
<path d="M103 198 114 211M153 198 142 211" stroke="#b5d0bb" stroke-width="4" stroke-linecap="round"/>
<path d="M122 227 128 232 134 227" stroke="#deb775" stroke-width="5" fill="none"/>
<circle cx="128" cy="242" r="4.5" fill="#f0c978" stroke="#34434a" stroke-width="1.6"/>
<path d="M30 242 39 221M226 242 217 221" fill="none" stroke="#94b6b4" stroke-width="4" stroke-linecap="round"/>
`,
    mantle:`<path d="M48 254Q53 188 100 176L128 189 155 176Q202 188 207 254Z" fill="#416a71" stroke="#34434a" stroke-width="5"/><path d="M94 175Q54 183 35 254H103L119 197ZM162 175Q202 183 221 254H153L138 197Z" fill="#af5871" stroke="#34434a" stroke-width="5"/><path d="M94 179Q128 213 163 179" fill="none" stroke="#faead4" stroke-width="11" stroke-linecap="round"/><circle cx="128" cy="202" r="10" fill="#e8c16e" stroke="#34434a" stroke-width="3"/>`,
    spacesuit:`<path d="M43 254Q44 177 103 170L128 189 153 170Q212 177 213 254Z" fill="#ebf4f7" stroke="#34434a" stroke-width="5"/><path d="M80 182Q128 205 176 182" stroke="#afc9d3" stroke-width="11" fill="none"/><rect x="106" y="194" width="44" height="30" rx="6" fill="#6fa8b5" stroke="#34434a" stroke-width="3"/><circle cx="90" cy="212" r="7" fill="#e9bd61" stroke="#34434a" stroke-width="3"/><circle cx="166" cy="212" r="7" fill="#e9bd61" stroke="#34434a" stroke-width="3"/><path d="M104 244H152" stroke="#afc9d3" stroke-width="5"/>`,
    restorer:`<!-- The master's coat: embroidered gold stretcher, carefully folded velvet -->
<path d="M45 254Q49 189 103 172L127 191 153 172Q205 189 211 254Z" fill="#403f68" stroke="#34434a" stroke-width="5"/>
<path d="M57 254 74 192 104 180 122 206 108 254Z" fill="#62557a" stroke="#34434a" stroke-width="4"/>
<path d="M198 254 181 192 152 180 133 206 147 254Z" fill="#62557a" stroke="#34434a" stroke-width="4"/>
<path d="M101 180Q112 198 128 200Q144 198 155 180" fill="none" stroke="#e9cc91" stroke-width="11" stroke-linecap="round"/>
<path d="M123 203V253M133 203V253" fill="none" stroke="#cc9f5b" stroke-width="3"/>
<rect x="112" y="220" width="32" height="26" rx="2" fill="#dfb868" stroke="#313e4b" stroke-width="2.5"/>
<rect x="117" y="225" width="22" height="16" fill="#e8d8a5" stroke="#855b45" stroke-width="2"/>
<path d="M120 238 126 230 131 235 138 228" stroke="#77987b" stroke-width="2" fill="none"/>
<path d="M73 220 64 235M184 220 191 235" stroke="#c0a0ba" stroke-width="4" stroke-linecap="round"/>
<circle cx="128" cy="207" r="6" fill="#e9c678" stroke="#34434a" stroke-width="2"/>
`,
    tabard:`<!-- Full-bodied medieval herald's surcoat: wide flared sleeves, full hem, woven gold quartering. -->
<path d="M16 255Q20 201 49 183Q74 171 99 168L128 188 157 168Q192 171 213 187Q238 207 241 255Z" fill="#ead5a6" stroke="#34434a" stroke-width="6" stroke-linejoin="round"/>
<!-- Dramatic scarlet hanging sleeves extend beyond the shoulder, hiding all undergarments. -->
<path d="M38 192Q18 211 15 255L82 255 96 186Z" fill="#a94050" stroke="#34434a" stroke-width="4.5"/>
<path d="M218 192Q238 211 241 255L174 255 160 186Z" fill="#a94050" stroke="#34434a" stroke-width="4.5"/>
<path d="M26 248Q27 224 44 204M230 248Q229 224 212 204" fill="none" stroke="#da7d6d" stroke-width="6" stroke-linecap="round"/>
<path d="M79 180Q100 173 128 193Q156 173 177 180L199 255H57Z" fill="#f5e4b9" stroke="#34434a" stroke-width="4.5" stroke-linejoin="round"/>
<!-- The surcoat covers the chest rather than being a tiny appliqué. -->
<path d="M89 184Q108 201 128 202Q149 201 166 184L182 255H73Z" fill="#bd4858" stroke="#34434a" stroke-width="4.5" stroke-linejoin="round"/>
<path d="M104 192Q115 205 128 209Q143 205 154 192" fill="none" stroke="#fff0c8" stroke-width="7" stroke-linecap="round"/>
<path d="M91 216H165V255H91Z" fill="#eac77e" stroke="#34434a" stroke-width="3.5"/>
<path d="M128 218V255M93 237H163" fill="none" stroke="#b74a55" stroke-width="5"/>
<path d="M100 225 108 230 101 235 107 242 98 245 101 234Z M154 225 147 230 155 235 148 242 158 245 154 234Z" fill="#ae3d52"/>
<path d="M113 243L128 250 142 243" fill="none" stroke="#ae3d52" stroke-width="4" stroke-linecap="round"/>
<path d="M72 247 70 254M184 247 186 254" stroke="#f8edcd" stroke-width="6"/>
`,
    'stage-hanbok':`<!-- Seoul Moonstage: modern performance hanbok, split silk panels, jade stitching and gold fan -->
<path d="M14 255Q20 207 53 185Q77 173 106 170L128 191 150 170Q182 174 207 187Q235 209 243 255Z" fill="#192d40" stroke="#32424e" stroke-width="6" stroke-linejoin="round"/>
<path d="M27 243Q37 204 68 187L94 178 110 207 99 255H16Z" fill="#264b60" stroke="#32424e" stroke-width="4"/>
<path d="M227 243Q218 204 188 187L163 178 145 207 157 255H240Z" fill="#264b60" stroke="#32424e" stroke-width="4"/>
<path d="M78 179Q103 183 128 209Q152 183 176 179L192 255H64Z" fill="#f1e4d1" stroke="#32424e" stroke-width="3.5"/>
<path d="M80 181 112 197 146 255H61ZM176 181 144 197 110 255H196Z" fill="#344b72" stroke="#35404c" stroke-width="3.5"/>
<path d="M91 180 129 216 112 235 73 198Z" fill="#c25a64" stroke="#f0c48a" stroke-width="3"/>
<path d="M165 180 128 216 145 235 183 198Z" fill="#315d60" stroke="#88b5a6" stroke-width="3"/>
<path d="M68 223Q128 235 188 221L189 237Q127 249 67 239Z" fill="#e2b76d" stroke="#6f6a55" stroke-width="2.5"/>
<path d="M66 239 91 242 87 255H65ZM191 239 164 243 166 255H192Z" fill="#b44e5d"/>
<path d="M117 235Q128 227 141 235L138 247Q127 251 119 247Z" fill="#224b5e" stroke="#d7b56f" stroke-width="2"/>
<path d="M101 239 102 254M154 238 155 254" stroke="#c7dfd0" stroke-width="2.5"/>
<path d="M44 225 49 217 54 225 62 228 54 232 50 240 46 232 38 228Z" fill="#dec178"/>
<path d="M202 220 210 207 220 220 210 234Z" fill="#b2d8c4"/>`,
    groom:`<!-- Formal groom's tuxedo, broad tailored shoulders, ivory shirt, velvet lapels and boutonniere -->
<path d="M14 255Q19 207 47 186Q67 174 104 170L128 191 152 170Q189 174 210 185Q238 207 242 255Z" fill="#263747" stroke="#34434a" stroke-width="6" stroke-linejoin="round"/>
<path d="M24 246Q27 210 59 191M232 246Q229 210 197 191" stroke="#577080" stroke-width="5" fill="none" stroke-linecap="round"/>
<!-- Continuous ivory shirt behind suit lapels, extending all the way to the bottom. -->
<path d="M92 173Q106 187 128 199Q150 187 164 173L174 255H82Z" fill="#fff7e9" stroke="#34434a" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M88 175 106 194 128 230 115 255 42 255 65 189Z" fill="#31475a" stroke="#34434a" stroke-width="4.5"/>
<path d="M168 175 150 194 128 230 141 255 214 255 191 189Z" fill="#31475a" stroke="#34434a" stroke-width="4.5"/>
<!-- Satin peaked lapels -->
<path d="M91 178 72 197 102 213 128 238 108 204 113 195Z" fill="#1f2e3b" stroke="#758898" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M165 178 184 197 154 213 128 238 148 204 143 195Z" fill="#1f2e3b" stroke="#758898" stroke-width="2.4" stroke-linejoin="round"/>
<!-- White collar + bowtie at the base of the chin -->
<path d="M102 178 126 201 113 211 93 194Z M154 178 130 201 143 211 163 194Z" fill="#fffdfa" stroke="#34434a" stroke-width="2"/>
<path d="M128 210 107 204 109 222 128 214 147 222 149 204Z" fill="#1b2932" stroke="#34434a" stroke-width="2.4" stroke-linejoin="round"/>
<circle cx="128" cy="212" r="5" fill="#526874"/>
<path d="M128 218V255" stroke="#d6d9cf" stroke-width="3"/>
<circle cx="128" cy="237" r="2.9" fill="#c1a46e"/><circle cx="128" cy="250" r="2.9" fill="#c1a46e"/>
<!-- Pocket square + small ivory boutonniere -->
<path d="M167 227 188 227 185 235 170 235Z" fill="#fff8e8" stroke="#8a98a0" stroke-width="2"/>
<path d="M172 209 179 221" stroke="#6e9975" stroke-width="3" stroke-linecap="round"/>
<g fill="#f8f1e9" stroke="#b7a49c" stroke-width="1.8"><circle cx="169" cy="203" r="5.5"/><circle cx="179" cy="203" r="5.5"/><circle cx="174" cy="196" r="5.5"/><circle cx="174" cy="209" r="5.5"/></g>
<circle cx="174" cy="203" r="4" fill="#dfc17d"/>
`,
    illuminator:`<!-- Cathedral illuminator: layered ivory and ultramarine robe -->
<path d="M18 255Q23 201 51 184L108 168 128 194 149 168 207 184Q234 200 240 255Z" fill="#172f56" stroke="#34434a" stroke-width="6"/>
<path d="M27 237Q33 209 59 191M226 237Q218 209 198 191" fill="none" stroke="#94a9bb" stroke-width="5"/>
<path d="M75 176 128 213 182 176 190 255H67Z" fill="#efe1b6" stroke="#34434a" stroke-width="4"/>
<path d="M80 184 114 211 103 254H57Z M176 184 143 211 153 254H198Z" fill="#365b79" stroke="#34434a" stroke-width="3"/>
<path d="M121 210H135V255H121Z" fill="#b9a06a"/>
<path d="M74 240Q126 225 182 240M68 253Q130 240 188 253" fill="none" stroke="#ddb974" stroke-width="4"/>
<path d="M111 227 128 214 145 227 128 243Z" fill="#9f4858" stroke="#d7b777" stroke-width="3"/>
<path d="M113 230H143M128 218V241" stroke="#f4d795" stroke-width="3"/>`,
    wedding:`<path d="M44 254Q49 177 102 171L128 190 154 171Q208 177 212 254Z" fill="#fff9f6" stroke="#34434a" stroke-width="5"/><path d="M99 178 127 213 156 178" fill="none" stroke="#e4bed1" stroke-width="7"/><path d="M128 213V253" stroke="#e4bed1" stroke-width="4"/><circle cx="128" cy="201" r="8" fill="#f4d98c" stroke="#34434a" stroke-width="2"/><path d="M80 243Q128 231 177 243" fill="none" stroke="#eadbe3" stroke-width="4"/>`
  };
  const hats={
    none:'',
    'stack-cap':`<!-- Four pixel blocks form a tilted visor above the ears -->
<path d="M67 77Q79 51 121 49L184 63 178 91Q122 85 69 95Z" fill="#235e63" stroke="#2d414a" stroke-width="5" stroke-linejoin="round"/>
<path d="M71 84 182 79 209 93Q158 109 76 99Z" fill="#83d3ba" stroke="#29494d" stroke-width="4"/>
<path d="M90 54h18v18H90zM112 46h18v18h-18zM134 51h18v18h-18z" fill="#f6b65e" stroke="#fff0cb" stroke-width="2"/>`,
    'block-crown':`<!-- A tetromino crown built from four large enameled squares -->
<path d="M71 91 70 72 87 72 87 54 105 54 105 72 119 72 119 38 138 38 138 72 151 72 151 54 169 54 169 72 185 72 184 91Q127 80 71 91Z" fill="#f4c76e" stroke="#334652" stroke-width="4" stroke-linejoin="round"/>
<path d="M74 82 183 82" stroke="#ffe7ab" stroke-width="4"/><path d="M92 57h10v10H92zM123 43h10v10h-10zM156 57h10v10h-10z" fill="#3f8796"/>`,
    crown:`<path d="M74 81 66 44 98 61 127 22 157 61 188 44 179 81Q129 89 74 81Z" fill="#e9c06c" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/><path d="M78 78Q128 88 177 78" fill="none" stroke="#bc6e5d" stroke-width="10" stroke-linecap="round"/><path d="M127 45 137 59 127 70 117 59Z" fill="#4e8390" stroke="#34434a" stroke-width="2"/>`,
    beret:`<path d="M72 76Q79 40 135 40Q182 40 187 76Q150 93 102 85L75 92Z" fill="#82738e" stroke="#34434a" stroke-width="5"/><path d="M128 41Q134 25 141 34" stroke="#34434a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M92 66Q122 54 160 63" stroke="#b6a1c4" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    flower:`<path d="M183 72Q201 58 204 81" fill="none" stroke="#567f62" stroke-width="5"/><g fill="#f6efe9" stroke="#34434a" stroke-width="2.4"><circle cx="184" cy="60" r="12"/><circle cx="206" cy="61" r="12"/><circle cx="195" cy="47" r="12"/><circle cx="195" cy="72" r="12"/></g><circle cx="195" cy="60" r="9" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`,
    helmet:`<ellipse cx="128" cy="120" rx="94" ry="100" fill="#cfecf3" fill-opacity=".18" stroke="#6f9da9" stroke-width="7"/><path d="M49 174Q128 200 207 174L213 192Q128 218 42 192Z" fill="#d4eaf0" stroke="#34434a" stroke-width="5"/><ellipse cx="91" cy="71" rx="24" ry="11" fill="#fff" opacity=".4"/><circle cx="66" cy="189" r="5" fill="#e3c371"/><circle cx="190" cy="189" r="5" fill="#e3c371"/>`,
    bascinet:`<!-- Bascinet of the guard: compact pointed skull, hinged brow, and light cheek lames; expressive eyes and muzzle stay visible. -->
<path d="M67 94Q65 61 83 40Q103 20 128 10Q152 21 174 43Q190 64 188 94L177 100Q163 78 128 74Q96 78 78 100Z" fill="#879aa0" stroke="#34434a" stroke-width="4.7" stroke-linejoin="round"/>
<path d="M86 51Q101 30 126 23Q150 31 168 51" fill="none" stroke="#d9e3db" stroke-width="5.5" stroke-linecap="round" opacity=".85"/>
<path d="M128 19V71" fill="none" stroke="#4a616b" stroke-width="3.4"/>
<path d="M72 87Q128 67 184 87L184 103Q128 93 72 103Z" fill="#afbec0" stroke="#34434a" stroke-width="4.3" stroke-linejoin="round"/>
<path d="M79 87Q128 73 176 87" fill="none" stroke="#eff1e5" stroke-width="3.2" opacity=".8" stroke-linecap="round"/>
<path d="M72 98Q60 122 66 149L79 159 88 152Q77 132 84 111Z" fill="#768f98" stroke="#34434a" stroke-width="4" stroke-linejoin="round"/>
<path d="M184 98Q196 122 190 149L177 159 168 152Q179 132 172 111Z" fill="#768f98" stroke="#34434a" stroke-width="4" stroke-linejoin="round"/>
<path d="M69 116 80 119M70 136 80 139M187 116 176 119M186 136 176 139" stroke="#d4dfd7" stroke-width="2.8" stroke-linecap="round"/>
<path d="M78 163 88 170M178 163 168 170" stroke="#748b8c" stroke-width="3.5" stroke-linecap="round"/>
<circle cx="78" cy="103" r="4.5" fill="#d3af76" stroke="#34434a" stroke-width="2"/>
<circle cx="178" cy="103" r="4.5" fill="#d3af76" stroke="#34434a" stroke-width="2"/>`,
    'seer-diadem':`<!-- Diadem of insight: slender antique-brass circlet, raised eye-like faceted teal stone -->
<path d="M76 91Q128 78 181 91" fill="none" stroke="#34434a" stroke-width="11" stroke-linecap="round"/>
<path d="M77 88Q128 76 180 88" fill="none" stroke="#dbb46e" stroke-width="6.5" stroke-linecap="round"/>
<path d="M89 87 99 80 107 84M169 87 157 80 149 84" fill="none" stroke="#f3d997" stroke-width="3" stroke-linecap="round"/>
<path d="M111 76Q119 64 128 59Q137 64 145 76L128 93Z" fill="#335e60" stroke="#d7bc7f" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M118 76 128 66 138 76 128 85Z" fill="#a2d4b1" stroke="#354d55" stroke-width="1.6"/>
<circle cx="83" cy="90" r="3.5" fill="#f5e5ba"/>
<circle cx="174" cy="90" r="3.5" fill="#f5e5ba"/>`,
    'stage-pin':`<!-- Moonstage headpiece: lacquered ornament, jade crescent and dramatic silk tassel -->
<path d="M70 83Q127 67 185 82" fill="none" stroke="#253f4c" stroke-width="13" stroke-linecap="round"/>
<path d="M73 79Q126 65 181 78" fill="none" stroke="#d8b26f" stroke-width="4" stroke-linecap="round"/>
<path d="M102 66Q118 34 127 33Q137 49 154 66Q126 82 102 66Z" fill="#294b63" stroke="#e0c17b" stroke-width="3"/>
<path d="M118 58Q123 44 127 41Q131 49 140 57Q128 64 118 58Z" fill="#b2d8ca"/>
<path d="M88 66Q71 44 81 29Q98 27 110 51Q94 46 88 66Z" fill="#c85a68" stroke="#e5b985" stroke-width="3"/>
<path d="M166 69Q184 43 177 28Q157 30 148 53Q162 48 166 69Z" fill="#c85a68" stroke="#e5b985" stroke-width="3"/>
<path d="M175 74Q197 93 192 118" fill="none" stroke="#d3a861" stroke-width="3"/>
<path d="M190 118 184 136 198 136Z" fill="#c55966" stroke="#e3bb83" stroke-width="2"/>
<circle cx="80" cy="77" r="5" fill="#eee2c5"/><circle cx="175" cy="75" r="5" fill="#eee2c5"/>`,
    brush:`<!-- A miniature lacquered painter's brush clipped behind one ear -->
<path d="M181 90 207 29" stroke="#604238" stroke-width="8" stroke-linecap="round"/>
<path d="M181 90 207 29" stroke="#ceac78" stroke-width="3" stroke-linecap="round"/>
<path d="M203 39 214 19Q216 12 211 10L205 12 199 37Z" fill="#355969" stroke="#34434a" stroke-width="2.5"/>
<path d="M195 51 206 55" stroke="#d3a659" stroke-width="8" stroke-linecap="round"/>
<path d="M187 77 198 81" stroke="#8e5a47" stroke-width="4" stroke-linecap="round"/>
`,
    'solar-circlet':`<!-- Gilt arched rose crown framing species ears and eyes -->
<path d="M70 81Q84 52 105 67L128 43 152 67Q174 52 187 81L176 92Q129 82 79 92Z" fill="#c6a366" stroke="#34434a" stroke-width="4.5"/>
<path d="M78 82 89 70 108 82 128 56 148 82 168 70 178 82" fill="none" stroke="#fbe0a0" stroke-width="3.5"/>
<circle cx="128" cy="74" r="10" fill="#f7d69c" stroke="#7d4651" stroke-width="3"/>
<path d="M128 63V86M118 74H138M121 67 135 81M135 67 121 81" stroke="#a9554e" stroke-width="2.3"/>`,
    veil:`<path d="M67 74Q128 27 189 74L204 202Q171 222 128 219Q85 221 51 202Z" fill="#fff" fill-opacity=".35" stroke="#efdae5" stroke-width="4"/><path d="M85 72Q128 50 171 72" fill="none" stroke="#f8f6f1" stroke-width="10" stroke-linecap="round"/><circle cx="128" cy="61" r="7" fill="#e9bf6d" stroke="#34434a" stroke-width="2"/>`
  };
  const accessories={
    none:'',
    'mini-block':`<!-- Tiny solid tetromino keeps clear of the face -->
<path d="M196 225 196 203 212 203 212 186 229 186 229 203 244 203 244 220 229 220 229 237 212 237 212 220Z" fill="#49aabb" stroke="#304651" stroke-width="4" stroke-linejoin="round"/>
<path d="M198 205h12v12h-12zM214 188h12v12h-12zM214 205h12v12h-12zM231 205h11v12h-11z" fill="#b6f2e7" opacity=".7"/>`,
    'spectral-quill':`<!-- Spectral feather floats just above the shoulder, never hiding the animal's face -->
<path d="M202 222Q238 190 232 141Q212 147 199 169Q187 193 202 222Z" fill="#9ed5c6" opacity=".6" stroke="#497c79" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M203 218Q222 184 230 148" fill="none" stroke="#edf7dc" stroke-width="3.7" stroke-linecap="round"/>
<path d="M210 199 198 191M216 185 201 179M221 171 208 166M209 204 222 205" fill="none" stroke="#e9f8e9" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
<path d="M202 222 189 240" fill="none" stroke="#bd9478" stroke-width="3.5" stroke-linecap="round"/>
<circle cx="192" cy="166" r="3" fill="#d7f3d9"/><circle cx="244" cy="171" r="2.5" fill="#d7f3d9"/><circle cx="239" cy="212" r="2" fill="#d7f3d9"/>`,
    'sun-crystal':`<!-- Faceted sun relic pinned to the left shoulder -->
<path d="M42 207 34 197 50 196 56 181 64 195 80 199 68 209 70 225 55 216 42 224Z" fill="#c6a66d" stroke="#37464b" stroke-width="3"/>
<path d="M55 187 68 204 56 219 44 204Z" fill="#a9d2d0" stroke="#e5d6a7" stroke-width="3"/>
<path d="M55 190V217M46 205H66" stroke="#fff4cf" stroke-width="2"/>`,
    'shoulder-dragon':`<!-- Tiny shoulder dragon: coiled tail, leathery wings, golden horns, jade scales -->
<path d="M195 232Q225 252 242 234Q253 221 239 210" fill="none" stroke="#2b4651" stroke-width="10" stroke-linecap="round"/>
<path d="M195 232Q226 246 239 230" fill="none" stroke="#80ae96" stroke-width="6" stroke-linecap="round"/>
<path d="M191 195Q184 171 196 147L214 175Q233 154 242 156L235 190 224 205Z" fill="#376e68" stroke="#273c48" stroke-width="4" stroke-linejoin="round"/>
<path d="M197 185 198 155 210 186M216 187 236 164" fill="none" stroke="#87b4a2" stroke-width="3" opacity=".8"/>
<path d="M183 226Q173 207 190 194Q205 181 225 199L231 221Q218 232 205 226L193 237Z" fill="#488778" stroke="#304652" stroke-width="4.5"/>
<path d="M188 224Q208 229 226 215" fill="none" stroke="#acd6a0" stroke-width="5" stroke-linecap="round"/>
<path d="M198 193 201 184 207 195 213 185 220 198" fill="#e0b66d" stroke="#4b635d" stroke-width="2"/>
<path d="M193 209Q170 193 165 178Q164 164 182 163L194 153 203 166Q212 166 214 183L205 199Z" fill="#4f9280" stroke="#304652" stroke-width="4.5" stroke-linejoin="round"/>
<path d="M173 169 169 151 182 161M194 162 201 149 205 170" fill="#d7b97d" stroke="#304652" stroke-width="3" stroke-linejoin="round"/>
<path d="M167 185 151 184 167 193 185 194" fill="#376c68" stroke="#304652" stroke-width="3"/>
<path d="M171 179 182 176" stroke="#203c40" stroke-width="3.5" stroke-linecap="round"/>
<circle cx="177" cy="176" r="2.6" fill="#f4d477"/><circle cx="178" cy="175" r="0.9" fill="#fff8cc"/>
<path d="M154 185 151 181M156 187 150 189" stroke="#a9c9b9" stroke-width="1.8" stroke-linecap="round"/>
<path d="M206 223 202 231M220 222 223 231" stroke="#283e46" stroke-width="4" stroke-linecap="round"/>
<path d="M193 220 204 227 204 220" fill="#d5bd80"/>`
  };
  const faces={
    none:'',
    glasses:`<g fill="none" stroke="#34434a" stroke-width="4"><circle cx="93" cy="123" r="21"/><circle cx="163" cy="123" r="21"/><path d="M114 120Q128 112 142 120M73 121 59 117M183 121 198 117"/></g>`,
    monocle:`<circle cx="164" cy="124" r="24" fill="#e6f7f1" fill-opacity=".12" stroke="#ca9b4d" stroke-width="5"/><circle cx="164" cy="124" r="20" fill="none" stroke="#fff0ba" stroke-width="1.7"/><path d="M182 141Q197 159 178 186Q168 200 173 211" stroke="#cb9d4f" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="173" cy="212" r="4" fill="#d5b070" stroke="#34434a" stroke-width="1.5"/>`,
    stars:`<path d="M75 143 79 152 88 153 81 160 82 169 75 165 67 169 68 160 61 153 71 152ZM183 143 187 152 195 153 189 160 190 169 183 165 175 169 176 160 169 153 179 152Z" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`
  };
  // Frog-fitted tournament bascinet: open eye domes, narrow central ridge.
  // The rabbit and other species use the fitted steel crown without losing
  // ears or facial expression.
  const frogHelm=`<!-- Frog-fitted tournament bascinet with open eye domes -->
<path d="M112 85 112 37Q117 17 128 12Q140 18 144 37L144 85 134 91 122 91Z" fill="#8c9fa6" stroke="#34434a" stroke-width="4.5" stroke-linejoin="round"/>
<path d="M128 23 128 80" stroke="#dbe6df" stroke-width="3.5" stroke-linecap="round"/>
<path d="M61 101Q53 91 54 78L63 59Q70 46 81 46" fill="none" stroke="#819aa2" stroke-width="11" stroke-linecap="round"/>
<path d="M195 101Q203 91 202 78L193 59Q186 46 175 46" fill="none" stroke="#819aa2" stroke-width="11" stroke-linecap="round"/>
<path d="M56 104Q49 128 61 152L77 160 85 150 76 133 77 110Z" fill="#80959a" stroke="#34434a" stroke-width="4"/>
<path d="M200 104Q207 128 195 152L179 160 171 150 180 133 179 110Z" fill="#80959a" stroke="#34434a" stroke-width="4"/>
<path d="M67 123 76 125M189 123 180 125" stroke="#dbe2d9" stroke-width="3.4"/>
<circle cx="66" cy="106" r="4.5" fill="#c7a66e" stroke="#34434a" stroke-width="2"/>
<circle cx="190" cy="106" r="4.5" fill="#c7a66e" stroke="#34434a" stroke-width="2"/>`;
  const equippedHat=m.hat==='bascinet'&&m.animal==='frog'?frogHelm:
    m.hat==='bascinet'&&m.animal==='rabbit'?'<!-- Rabbit-fitted helm: tall ears remain visible beside the narrow crown. -->'+hats.bascinet:hats[m.hat];
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="'+s+'" height="'+s+'" class="pws-maskot-svg" aria-hidden="true"><defs><linearGradient id="fur" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffdea1"/><stop offset="1" stop-color="#d78b5b"/></linearGradient><linearGradient id="green"><stop stop-color="#a9d77f"/><stop offset="1" stop-color="#5b9f61"/></linearGradient><linearGradient id="nightFur"><stop stop-color="#3b4553"/><stop offset="1" stop-color="#171d27"/></linearGradient><linearGradient id="foxFur"><stop stop-color="#f2a451"/><stop offset="1" stop-color="#c55c35"/></linearGradient><linearGradient id="cloth"><stop stop-color="#709ba0"/><stop offset="1" stop-color="#365c69"/></linearGradient></defs>'+outfits[m.clothes]+paths[m.animal]+faces[m.face]+equippedHat+accessories[m.accessory]+'</svg>';
}
