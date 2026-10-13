import {ownedAchievementItem,zamazkaAchievements} from './zamazka-achievements.js';
// Pocket Works MASKOT — original, hand-drawn, composable SVG geometry.
// Asset IDs (not arbitrary markup) are the only user-controlled input.
// Public profile renders are already server-validated; these IDs are visual decoding rights, not ownership grants.
export const mascotPublicUnlocks=['astronaut','wedding','knight','herald','groom',...zamazkaAchievements.map(a=>a.id)];
export const mascotAnimals=[['cat','Кот'],['rabbit','Кролик'],['frog','Лягушка']];
export const mascotHats=[['none','Без'],['crown','Корона'],['beret','Берет'],['flower','Цветок']];
export const mascotClothes=[['tunic','Туника'],['vest','Жилет'],['mantle','Мантия']];
export const mascotFaces=[['none','Без'],['glasses','Очки'],['stars','Звёздочки']];
export const mascotTitles=['','Первопроходец','Коллекционер','Хранитель хаоса','Подмастерье','Знаток подделок'];
export const mascotSecret={astronaut:{hat:'helmet',clothes:'spacesuit'},wedding:{hat:'veil',clothes:'wedding'},knight:{hat:'bascinet'},herald:{clothes:'tabard'},groom:{clothes:'groom'}};
const one=(rows,id,fallback)=>rows.some(x=>x[0]===id)?id:fallback;
export function safeMascot(input,unlocks=[]){
  const u=Array.isArray(unlocks)?unlocks:[];
  const valid=(item,category,standard)=>typeof item==='string'&&(standard.some(x=>x[0]===item)||ownedAchievementItem(item,u)||
    ((category==='hat'?Object.values(mascotSecret).map(x=>x.hat):Object.values(mascotSecret).map(x=>x.clothes))
      .includes(item)&&Object.entries(mascotSecret).some(([key,x])=>u.includes(key)&&x[category]===item)));
  const src=input&&typeof input==='object'?input:{};
  return {
    animal:one(mascotAnimals,src.animal,'cat'),
    hat:valid(src.hat,'hat',mascotHats)?src.hat:'none',
    clothes:valid(src.clothes,'clothes',mascotClothes)?src.clothes:'tunic',
    face:valid(src.face,'face',mascotFaces)?src.face:'none'
  };
}
export function mascotSvg(raw,{unlocks=[],size=256}={}){
  const m=safeMascot(raw,unlocks),s=String(size);
  const paths={
    cat:`<path d="M63 96 58 27Q59 17 68 24L102 55 155 55 187 24Q196 17 197 29L191 96" fill="url(#fur)" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/><path d="M74 59 69 38 94 60M170 60 187 37 181 65" fill="#f0ada6"/><path d="M51 99Q56 57 127 56Q198 57 204 101L197 143Q182 185 128 186Q72 185 56 143Z" fill="url(#fur)" stroke="#34434a" stroke-width="5"/><path d="M60 133Q79 111 103 137L127 151 151 137Q177 112 196 132Q188 178 128 182Q68 178 60 133" fill="#fff0d5"/><path d="M80 110Q91 101 101 109M155 109Q165 101 176 109" stroke="#664941" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="92" cy="122" rx="7" ry="10" fill="#313e40"/><ellipse cx="164" cy="122" rx="7" ry="10" fill="#313e40"/><circle cx="90" cy="118" r="2.8" fill="#fff"/><circle cx="162" cy="118" r="2.8" fill="#fff"/><path d="M118 151 137 151 127 162Z" fill="#665054"/><path d="M127 162Q122 171 115 167M128 162Q134 171 141 167" stroke="#795a50" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M78 143 61 138M78 150 59 151M177 142 195 138M177 150 196 150" stroke="#c89275" stroke-width="2.5" stroke-linecap="round"/>`,
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
    wedding:`<path d="M44 254Q49 177 102 171L128 190 154 171Q208 177 212 254Z" fill="#fff9f6" stroke="#34434a" stroke-width="5"/><path d="M99 178 127 213 156 178" fill="none" stroke="#e4bed1" stroke-width="7"/><path d="M128 213V253" stroke="#e4bed1" stroke-width="4"/><circle cx="128" cy="201" r="8" fill="#f4d98c" stroke="#34434a" stroke-width="2"/><path d="M80 243Q128 231 177 243" fill="none" stroke="#eadbe3" stroke-width="4"/>`
  };
  const hats={
    none:'',
    crown:`<path d="M74 81 66 44 98 61 127 22 157 61 188 44 179 81Q129 89 74 81Z" fill="#e9c06c" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/><path d="M78 78Q128 88 177 78" fill="none" stroke="#bc6e5d" stroke-width="10" stroke-linecap="round"/><path d="M127 45 137 59 127 70 117 59Z" fill="#4e8390" stroke="#34434a" stroke-width="2"/>`,
    beret:`<path d="M72 76Q79 40 135 40Q182 40 187 76Q150 93 102 85L75 92Z" fill="#82738e" stroke="#34434a" stroke-width="5"/><path d="M128 41Q134 25 141 34" stroke="#34434a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M92 66Q122 54 160 63" stroke="#b6a1c4" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    flower:`<path d="M183 72Q201 58 204 81" fill="none" stroke="#567f62" stroke-width="5"/><g fill="#f6efe9" stroke="#34434a" stroke-width="2.4"><circle cx="184" cy="60" r="12"/><circle cx="206" cy="61" r="12"/><circle cx="195" cy="47" r="12"/><circle cx="195" cy="72" r="12"/></g><circle cx="195" cy="60" r="9" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`,
    helmet:`<ellipse cx="128" cy="120" rx="94" ry="100" fill="#cfecf3" fill-opacity=".18" stroke="#6f9da9" stroke-width="7"/><path d="M49 174Q128 200 207 174L213 192Q128 218 42 192Z" fill="#d4eaf0" stroke="#34434a" stroke-width="5"/><ellipse cx="91" cy="71" rx="24" ry="11" fill="#fff" opacity=".4"/><circle cx="66" cy="189" r="5" fill="#e3c371"/><circle cx="190" cy="189" r="5" fill="#e3c371"/>`,
    bascinet:`<!-- A full-size raised-visor bascinet. Opaque shell and aventail FRAME the face, no tiny hat floating above it. -->
<!-- Wide steel skull cap: 211px width. -->
<path d="M28 110Q23 46 78 20Q99 10 128 7Q170 9 195 30Q230 64 227 113
 L201 118Q198 70 171 58Q130 40 87 58Q57 78 54 121Z"
 fill="#839aa3" stroke="#34434a" stroke-width="6.5" stroke-linejoin="round"/>
<path d="M43 89Q44 51 80 34Q103 20 130 21Q178 24 201 63" fill="none" stroke="#d6e4e2" stroke-width="10" stroke-linecap="round" opacity=".75"/>
<path d="M125 17Q131 24 129 49" stroke="#576b74" stroke-width="4.5" stroke-linecap="round"/>
<!-- Raised visor (over forehead) with articulation and seven breathing slots. -->
<path d="M53 83Q122 54 203 82L204 106Q131 92 51 109Z" fill="#b1c4c6" stroke="#34434a" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M61 88Q124 69 195 89" fill="none" stroke="#f1f5df" stroke-width="5.5" stroke-linecap="round" opacity=".9"/>
<g stroke="#5a6d70" stroke-width="3.5" stroke-linecap="round"><path d="M76 98 83 96M95 94 102 93M115 91 122 90M136 90 143 91M156 92 163 93M176 95 183 97"/></g>
<!-- Solid cheek guards broaden to the animal cheeks; gaps stay between eyes and central muzzle. -->
<path d="M38 99Q31 139 41 172L58 198 82 191Q69 160 78 130L67 112Z" fill="#8da1a8" stroke="#34434a" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M218 99Q225 139 215 172L198 198 174 191Q187 160 178 130L189 112Z" fill="#8da1a8" stroke="#34434a" stroke-width="5.5" stroke-linejoin="round"/>
<!-- Aventail chain rings have a deliberate matte-metal rhythm. -->
<path d="M44 135 51 143 44 150 51 157 44 164M61 147 68 154 61 162 68 170 61 177M212 135 205 143 212 150 205 157 212 164M195 147 188 154 195 162 188 170 195 177" fill="none" stroke="#d9e4dd" stroke-width="3.3" stroke-linecap="round" opacity=".85"/>
<path d="M48 119 65 125M208 119 191 125" stroke="#435864" stroke-width="7" stroke-linecap="round"/>
<circle cx="53" cy="114" r="8" fill="#d9b679" stroke="#34434a" stroke-width="3"/>
<circle cx="203" cy="114" r="8" fill="#d9b679" stroke="#34434a" stroke-width="3"/>
<circle cx="53" cy="114" r="2.8" fill="#fff2c0"/><circle cx="203" cy="114" r="2.8" fill="#fff2c0"/>
<path d="M91 51Q129 29 166 51" fill="none" stroke="#edf3de" stroke-width="4" opacity=".5" stroke-linecap="round"/>
`,
    brush:`<!-- A miniature lacquered painter's brush clipped behind one ear -->
<path d="M181 90 207 29" stroke="#604238" stroke-width="8" stroke-linecap="round"/>
<path d="M181 90 207 29" stroke="#ceac78" stroke-width="3" stroke-linecap="round"/>
<path d="M203 39 214 19Q216 12 211 10L205 12 199 37Z" fill="#355969" stroke="#34434a" stroke-width="2.5"/>
<path d="M195 51 206 55" stroke="#d3a659" stroke-width="8" stroke-linecap="round"/>
<path d="M187 77 198 81" stroke="#8e5a47" stroke-width="4" stroke-linecap="round"/>
`,
    veil:`<path d="M67 74Q128 27 189 74L204 202Q171 222 128 219Q85 221 51 202Z" fill="#fff" fill-opacity=".35" stroke="#efdae5" stroke-width="4"/><path d="M85 72Q128 50 171 72" fill="none" stroke="#f8f6f1" stroke-width="10" stroke-linecap="round"/><circle cx="128" cy="61" r="7" fill="#e9bf6d" stroke="#34434a" stroke-width="2"/>`
  };
  const faces={
    none:'',
    glasses:`<g fill="none" stroke="#34434a" stroke-width="4"><circle cx="93" cy="123" r="21"/><circle cx="163" cy="123" r="21"/><path d="M114 120Q128 112 142 120M73 121 59 117M183 121 198 117"/></g>`,
    monocle:`<circle cx="164" cy="124" r="24" fill="#e6f7f1" fill-opacity=".12" stroke="#ca9b4d" stroke-width="5"/><circle cx="164" cy="124" r="20" fill="none" stroke="#fff0ba" stroke-width="1.7"/><path d="M182 141Q197 159 178 186Q168 200 173 211" stroke="#cb9d4f" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="173" cy="212" r="4" fill="#d5b070" stroke="#34434a" stroke-width="1.5"/>`,
    stars:`<path d="M75 143 79 152 88 153 81 160 82 169 75 165 67 169 68 160 61 153 71 152ZM183 143 187 152 195 153 189 160 190 169 183 165 175 169 176 160 169 153 179 152Z" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`
  };
  // Helmet uses species-specific openings so rabbit ears and frog eye domes remain recognizable.
  const equippedHat=m.hat==='bascinet'&&m.animal==='frog'?"<!-- Frog-fitted tournament bascinet; leaves raised eye domes visible. -->\n<path d=\"M32 110Q25 73 47 36Q76 8 127 5Q182 8 209 36Q230 76 224 110\n L198 120Q194 90 184 78Q166 55 149 51L128 54L106 51Q85 56 73 79Q62 91 57 120Z\"\n fill=\"#91a5a9\" stroke=\"#34434a\" stroke-width=\"6\" fill-rule=\"evenodd\"/>\n<!-- Helmet has open raised eye ports so amphibian eye silhouette is not swallowed. -->\n<path d=\"M53 78Q59 48 93 43Q117 43 124 67Q128 40 151 43Q188 46 197 78\" fill=\"none\" stroke=\"#354b51\" stroke-width=\"7\" stroke-linecap=\"round\"/>\n<path d=\"M64 68Q77 47 101 54M154 54Q180 47 191 69\" fill=\"none\" stroke=\"#edf5e4\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n<path d=\"M119 48Q128 36 137 48L147 102Q128 110 109 102Z\" fill=\"#aabdc0\" stroke=\"#34434a\" stroke-width=\"4.5\"/>\n<path d=\"M115 85H141M117 94H139\" stroke=\"#5b6e72\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n<path d=\"M39 103Q30 144 41 177L61 198 82 184Q70 154 74 129L66 106Z\" fill=\"#8ea3aa\" stroke=\"#34434a\" stroke-width=\"5\"/>\n<path d=\"M216 103Q225 144 214 177L194 198 173 184Q185 154 181 129L189 106Z\" fill=\"#8ea3aa\" stroke=\"#34434a\" stroke-width=\"5\"/>\n<path d=\"M44 143 51 150 44 158 51 167M211 143 204 150 211 158 204 167\" stroke=\"#e2e8df\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<circle cx=\"53\" cy=\"113\" r=\"8\" fill=\"#dbb87b\" stroke=\"#34434a\" stroke-width=\"3\"/>\n<circle cx=\"203\" cy=\"113\" r=\"8\" fill=\"#dbb87b\" stroke=\"#34434a\" stroke-width=\"3\"/>\n":
    m.hat==='bascinet'&&m.animal==='rabbit'?"<!-- Rabbit-fitted helm: tall ears pass through two visible slotted openings. -->\n<path d=\"M24 118Q21 71 62 40Q87 22 128 20Q177 21 201 46Q237 78 231 118\n L199 117Q197 91 180 75L173 67 167 86Q149 99 128 99Q106 99 89 85L82 67 75 75Q57 91 55 117Z\"\n fill=\"#8fa5ab\" stroke=\"#34434a\" stroke-width=\"6\" stroke-linejoin=\"round\"/>\n<path d=\"M55 67Q82 38 100 45M156 45Q178 36 203 68\" fill=\"none\" stroke=\"#e0eee7\" stroke-width=\"6\" stroke-linecap=\"round\"/>\n<path d=\"M70 85Q128 106 186 85L193 107Q126 116 63 108Z\" fill=\"#adc2c4\" stroke=\"#34434a\" stroke-width=\"5\"/>\n<path d=\"M78 96Q127 107 178 96\" stroke=\"#f6f2d9\" stroke-width=\"4.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M38 102Q27 140 42 169L60 193 84 185 69 145 71 119Z\" fill=\"#8c9fa8\" stroke=\"#34434a\" stroke-width=\"5\"/>\n<path d=\"M218 102Q229 140 214 169L196 193 172 185 187 145 185 119Z\" fill=\"#8c9fa8\" stroke=\"#34434a\" stroke-width=\"5\"/>\n<path d=\"M45 140 54 147 46 154 57 162M211 140 202 147 210 154 199 162\" fill=\"none\" stroke=\"#d6e3db\" stroke-width=\"3.5\"/>\n<circle cx=\"63\" cy=\"119\" r=\"7\" fill=\"#eacb8a\" stroke=\"#34434a\" stroke-width=\"3\"/>\n<circle cx=\"193\" cy=\"119\" r=\"7\" fill=\"#eacb8a\" stroke=\"#34434a\" stroke-width=\"3\"/>\n":hats[m.hat];
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="'+s+'" height="'+s+'" class="pws-maskot-svg" aria-hidden="true"><defs><linearGradient id="fur" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffdea1"/><stop offset="1" stop-color="#d78b5b"/></linearGradient><linearGradient id="green"><stop stop-color="#a9d77f"/><stop offset="1" stop-color="#5b9f61"/></linearGradient><linearGradient id="cloth"><stop stop-color="#709ba0"/><stop offset="1" stop-color="#365c69"/></linearGradient></defs>'+outfits[m.clothes]+paths[m.animal]+faces[m.face]+hats[m.hat]+'</svg>';
}
