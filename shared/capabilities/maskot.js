// Pocket Works MASKOT — original, hand-drawn, composable SVG geometry.
// Asset IDs (not arbitrary markup) are the only user-controlled input.
export const mascotAnimals=[['cat','Кот'],['rabbit','Кролик'],['frog','Лягушка']];
export const mascotHats=[['none','Без'],['crown','Корона'],['beret','Берет'],['flower','Цветок']];
export const mascotClothes=[['tunic','Туника'],['vest','Жилет'],['mantle','Мантия']];
export const mascotFaces=[['none','Без'],['glasses','Очки'],['stars','Звёздочки']];
export const mascotTitles=['','Первопроходец','Коллекционер','Хранитель хаоса'];
export const mascotSecret={astronaut:{hat:'helmet',clothes:'spacesuit'},wedding:{hat:'veil',clothes:'wedding'},knight:{hat:'bascinet'},herald:{clothes:'tabard'}};
const one=(rows,id,fallback)=>rows.some(x=>x[0]===id)?id:fallback;
export function safeMascot(input,unlocks=[]){
  const u=Array.isArray(unlocks)?unlocks:[];
  const valid=(item,category,standard)=>typeof item==='string'&&(standard.some(x=>x[0]===item)||
    ((category==='hat'?Object.values(mascotSecret).map(x=>x.hat):Object.values(mascotSecret).map(x=>x.clothes))
      .includes(item)&&Object.entries(mascotSecret).some(([key,x])=>u.includes(key)&&x[category]===item)));
  const src=input&&typeof input==='object'?input:{};
  return {
    animal:one(mascotAnimals,src.animal,'cat'),
    hat:valid(src.hat,'hat',mascotHats)?src.hat:'none',
    clothes:valid(src.clothes,'clothes',mascotClothes)?src.clothes:'tunic',
    face:one(mascotFaces,src.face,'none')
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
    vest:`<path d="M46 254Q51 180 102 171L128 191 154 171Q207 181 210 254Z" fill="#f7eee0" stroke="#34434a" stroke-width="5"/><path d="M55 247 90 182 112 192 127 229 127 254 53 254ZM201 247 166 182 144 192 129 229 129 254 203 254Z" fill="#477a78" stroke="#34434a" stroke-width="4"/><path d="M117 196 128 215 139 196" fill="none" stroke="#ddbb73" stroke-width="6"/><circle cx="128" cy="236" r="5" fill="#e6c27c"/>`,
    mantle:`<path d="M48 254Q53 188 100 176L128 189 155 176Q202 188 207 254Z" fill="#416a71" stroke="#34434a" stroke-width="5"/><path d="M94 175Q54 183 35 254H103L119 197ZM162 175Q202 183 221 254H153L138 197Z" fill="#af5871" stroke="#34434a" stroke-width="5"/><path d="M94 179Q128 213 163 179" fill="none" stroke="#faead4" stroke-width="11" stroke-linecap="round"/><circle cx="128" cy="202" r="10" fill="#e8c16e" stroke="#34434a" stroke-width="3"/>`,
    spacesuit:`<path d="M43 254Q44 177 103 170L128 189 153 170Q212 177 213 254Z" fill="#ebf4f7" stroke="#34434a" stroke-width="5"/><path d="M80 182Q128 205 176 182" stroke="#afc9d3" stroke-width="11" fill="none"/><rect x="106" y="194" width="44" height="30" rx="6" fill="#6fa8b5" stroke="#34434a" stroke-width="3"/><circle cx="90" cy="212" r="7" fill="#e9bd61" stroke="#34434a" stroke-width="3"/><circle cx="166" cy="212" r="7" fill="#e9bd61" stroke="#34434a" stroke-width="3"/><path d="M104 244H152" stroke="#afc9d3" stroke-width="5"/>`,
    tabard:`<!-- 14th-century herald's embroidered surcoat and contrasting sleeves -->
<path d="M52 254Q52 192 94 175L128 191 162 175Q205 190 206 254Z" fill="#e6d7ac" stroke="#34434a" stroke-width="5"/>
<path d="M56 237Q64 198 95 187L89 254H51Z" fill="#a33d4f" stroke="#34434a" stroke-width="3.5"/>
<path d="M201 237Q192 198 161 187L168 254H206Z" fill="#a33d4f" stroke="#34434a" stroke-width="3.5"/>
<path d="M93 183Q126 205 163 183L171 254H85Z" fill="#bd4657" stroke="#34434a" stroke-width="4"/>
<path d="M99 190Q112 203 127 204Q144 203 158 190" fill="none" stroke="#f3dd9b" stroke-width="8" stroke-linecap="round"/>
<path d="M105 208H152V252H105Z" fill="#e8c477" stroke="#34434a" stroke-width="3.5"/>
<path d="M127 209V251M106 230H151" stroke="#bd4657" stroke-width="3.5"/>
<path d="M111 214 117 218 111 222 116 226 107 227 110 219Z" fill="#a73f50"/>
<path d="M142 214 148 218 142 222 147 226 138 227 141 219Z" fill="#a73f50"/>
<path d="M114 235 120 240 114 245M140 235 134 240 140 245" fill="none" stroke="#a73f50" stroke-width="3" stroke-linecap="round"/>
<path d="M98 186 85 212M157 186 170 212" fill="none" stroke="#f7e4b4" stroke-width="4" stroke-linecap="round"/>
`,
    wedding:`<path d="M44 254Q49 177 102 171L128 190 154 171Q208 177 212 254Z" fill="#fff9f6" stroke="#34434a" stroke-width="5"/><path d="M99 178 127 213 156 178" fill="none" stroke="#e4bed1" stroke-width="7"/><path d="M128 213V253" stroke="#e4bed1" stroke-width="4"/><circle cx="128" cy="201" r="8" fill="#f4d98c" stroke="#34434a" stroke-width="2"/><path d="M80 243Q128 231 177 243" fill="none" stroke="#eadbe3" stroke-width="4"/>`
  };
  const hats={
    none:'',
    crown:`<path d="M74 81 66 44 98 61 127 22 157 61 188 44 179 81Q129 89 74 81Z" fill="#e9c06c" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/><path d="M78 78Q128 88 177 78" fill="none" stroke="#bc6e5d" stroke-width="10" stroke-linecap="round"/><path d="M127 45 137 59 127 70 117 59Z" fill="#4e8390" stroke="#34434a" stroke-width="2"/>`,
    beret:`<path d="M72 76Q79 40 135 40Q182 40 187 76Q150 93 102 85L75 92Z" fill="#82738e" stroke="#34434a" stroke-width="5"/><path d="M128 41Q134 25 141 34" stroke="#34434a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M92 66Q122 54 160 63" stroke="#b6a1c4" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    flower:`<path d="M183 72Q201 58 204 81" fill="none" stroke="#567f62" stroke-width="5"/><g fill="#f6efe9" stroke="#34434a" stroke-width="2.4"><circle cx="184" cy="60" r="12"/><circle cx="206" cy="61" r="12"/><circle cx="195" cy="47" r="12"/><circle cx="195" cy="72" r="12"/></g><circle cx="195" cy="60" r="9" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`,
    helmet:`<ellipse cx="128" cy="120" rx="94" ry="100" fill="#cfecf3" fill-opacity=".18" stroke="#6f9da9" stroke-width="7"/><path d="M49 174Q128 200 207 174L213 192Q128 218 42 192Z" fill="#d4eaf0" stroke="#34434a" stroke-width="5"/><ellipse cx="91" cy="71" rx="24" ry="11" fill="#fff" opacity=".4"/><circle cx="66" cy="189" r="5" fill="#e3c371"/><circle cx="190" cy="189" r="5" fill="#e3c371"/>`,
    bascinet:`<!-- 14th-century open-faced bascinet with raised visor and chainmail aventail -->
<path d="M68 107Q66 52 127 40Q185 52 188 107L180 123Q173 80 127 72Q83 81 75 124Z" fill="#879ba4" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/>
<path d="M81 84Q96 47 127 48Q160 47 177 84" fill="none" stroke="#d7e1da" stroke-width="8" opacity=".7" stroke-linecap="round"/>
<path d="M73 112L67 155Q75 180 92 185L102 168 87 142 87 112Z" fill="#9eafb3" stroke="#34434a" stroke-width="4"/>
<path d="M182 112L188 155Q180 180 162 185L152 168 169 142 169 112Z" fill="#9eafb3" stroke="#34434a" stroke-width="4"/>
<path d="M75 157 83 170M83 149 95 164M181 157 173 170M173 149 161 164" stroke="#51666d" stroke-width="3" stroke-linecap="round" fill="none"/>
<path d="M87 80Q128 66 170 80L180 103Q128 91 76 103Z" fill="#a6b8bc" stroke="#34434a" stroke-width="5" stroke-linejoin="round"/>
<path d="M95 84Q128 78 160 84" stroke="#eef5ed" stroke-width="4.5" fill="none" stroke-linecap="round"/>
<path d="M84 113Q127 103 173 113" fill="none" stroke="#445963" stroke-width="7" stroke-linecap="round"/>
<path d="M113 75 128 52 143 75" stroke="#cfa96b" stroke-width="5" fill="none" stroke-linecap="round"/>
<circle cx="82" cy="118" r="5.5" fill="#e5ba72" stroke="#34434a" stroke-width="2"/>
<circle cx="174" cy="118" r="5.5" fill="#e5ba72" stroke="#34434a" stroke-width="2"/>
<path d="M91 176 100 183M165 176 156 183" stroke="#b4c2bf" stroke-width="3" stroke-linecap="round"/>
`,
    veil:`<path d="M67 74Q128 27 189 74L204 202Q171 222 128 219Q85 221 51 202Z" fill="#fff" fill-opacity=".35" stroke="#efdae5" stroke-width="4"/><path d="M85 72Q128 50 171 72" fill="none" stroke="#f8f6f1" stroke-width="10" stroke-linecap="round"/><circle cx="128" cy="61" r="7" fill="#e9bf6d" stroke="#34434a" stroke-width="2"/>`
  };
  const faces={
    none:'',
    glasses:`<g fill="none" stroke="#34434a" stroke-width="4"><circle cx="93" cy="123" r="21"/><circle cx="163" cy="123" r="21"/><path d="M114 120Q128 112 142 120M73 121 59 117M183 121 198 117"/></g>`,
    stars:`<path d="M75 143 79 152 88 153 81 160 82 169 75 165 67 169 68 160 61 153 71 152ZM183 143 187 152 195 153 189 160 190 169 183 165 175 169 176 160 169 153 179 152Z" fill="#e9c36c" stroke="#34434a" stroke-width="2"/>`
  };
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="'+s+'" height="'+s+'" class="pws-maskot-svg" aria-hidden="true"><defs><linearGradient id="fur" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffdea1"/><stop offset="1" stop-color="#d78b5b"/></linearGradient><linearGradient id="green"><stop stop-color="#a9d77f"/><stop offset="1" stop-color="#5b9f61"/></linearGradient><linearGradient id="cloth"><stop stop-color="#709ba0"/><stop offset="1" stop-color="#365c69"/></linearGradient></defs>'+outfits[m.clothes]+paths[m.animal]+faces[m.face]+hats[m.hat]+'</svg>';
}
