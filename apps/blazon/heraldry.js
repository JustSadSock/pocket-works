export const HERALDIC_SCHOOLS = {
  imperial: {
    id: 'imperial', name: 'Имперская школа', short: 'Имперская', shield: 'iberian',
    summary: 'Осевая симметрия, тяжёлая корона и властная центральная фигура.',
    mantle: 'imperial', composition: 'axial'
  },
  civic: {
    id: 'civic', name: 'Городская школа', short: 'Городская', shield: 'french',
    summary: 'Строгая геометрия, ясный ординарий и ритм повторяющихся знаков.',
    mantle: 'civic', composition: 'tiered'
  },
  knightly: {
    id: 'knightly', name: 'Рыцарская школа', short: 'Рыцарская', shield: 'heater',
    summary: 'Крупная фигура, турнирный наклон и минимум мелких деталей.',
    mantle: 'knightly', composition: 'heroic'
  },
  northern: {
    id: 'northern', name: 'Северная школа', short: 'Северная', shield: 'kite',
    summary: 'Узкий длинный щит, суровые пустоты и знаки на нижних флангах.',
    mantle: 'northern', composition: 'vertical'
  }
};

export const FIELD_PALETTES = {
  gules: { field:'#8f2932', metal:'#e7c86a', main:'#f0e4c8', accent:'#223c5d', ink:'#231b16', material:'ruby' },
  azure: { field:'#1f4d7a', metal:'#e9deca', main:'#d7ad43', accent:'#8d2932', ink:'#201c18', material:'sapphire' },
  argent: { field:'#e5dfd2', metal:'#8f2932', main:'#263f62', accent:'#c39a38', ink:'#211e1a', material:'silver' },
  sable: { field:'#202521', metal:'#d4ad48', main:'#ece2cd', accent:'#8e2931', ink:'#171815', material:'iron' }
};

const ORDINARY_TO_SCHOOL = { pale:'imperial', fess:'civic', bend:'knightly', chevron:'northern' };
const SHIELD_PATHS = {
  iberian: 'M18 38Q18 31 26 31H94Q102 31 102 38V101C102 128 87 149 60 164C33 149 18 128 18 101Z',
  french: 'M15 38H105V104C105 131 88 150 60 164C32 150 15 131 15 104Z',
  heater: 'M18 35H102V92C102 124 83 148 60 164C37 148 18 124 18 92Z',
  kite: 'M24 33H96V91C96 124 78 153 60 174C42 153 24 124 24 91Z'
};
const INNER_PATHS = {
  iberian: 'M24 43Q24 38 30 38H90Q96 38 96 43V100C96 123 83 141 60 154C37 141 24 123 24 100Z',
  french: 'M21 44H99V102C99 125 85 141 60 154C35 141 21 125 21 102Z',
  heater: 'M24 42H96V91C96 118 80 138 60 153C40 138 24 118 24 91Z',
  kite: 'M30 40H90V91C90 118 76 143 60 162C44 143 30 118 30 91Z'
};

function hashString(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function schoolForDoctrine(doctrine = {}) {
  return doctrine.school && HERALDIC_SCHOOLS[doctrine.school]
    ? doctrine.school
    : ORDINARY_TO_SCHOOL[doctrine.ordinary] || 'imperial';
}

export function paletteForDoctrine(doctrine = {}) {
  const base = FIELD_PALETTES[doctrine.field] || FIELD_PALETTES.gules;
  const school = schoolForDoctrine(doctrine);
  const shift = hashString(`${doctrine.main || ''}:${doctrine.secondary || ''}:${school}`) % 3;
  if (shift === 0) return { ...base };
  if (shift === 1) return { ...base, main: base.metal, metal: base.main };
  return { ...base, accent: base.main, main: base.accent };
}

export function shieldGeometry(doctrine = {}) {
  const school = HERALDIC_SCHOOLS[schoolForDoctrine(doctrine)];
  return { id: school.shield, path: SHIELD_PATHS[school.shield], inner: INNER_PATHS[school.shield] };
}

export function compositionForDoctrine(doctrine = {}, compact = false) {
  const school = schoolForDoctrine(doctrine);
  const mainId = doctrine.main || null;
  const secondaryId = doctrine.secondary || null;
  const poseSeed = hashString(`${mainId}:${doctrine.field}:${school}`) % 4;
  const result = { school, main: null, secondary: [], poseSeed };
  if (mainId) {
    if (school === 'imperial') result.main = { x: 27, y: 67, scale: compact ? .50 : .55, rotate:0, flip:false };
    if (school === 'civic') result.main = { x: 32, y: 81, scale: compact ? .43 : .47, rotate:0, flip:false };
    if (school === 'knightly') result.main = { x: 24, y: 57, scale: compact ? .57 : .63, rotate:-8, flip:poseSeed % 2 === 1 };
    if (school === 'northern') result.main = { x: 29, y: 53, scale: compact ? .47 : .52, rotate:0, flip:poseSeed === 3 };
  }
  if (secondaryId) {
    if (school === 'imperial') result.secondary = [{x:25,y:48,scale:.20},{x:71,y:48,scale:.20,flip:true}];
    if (school === 'civic') result.secondary = [{x:24,y:45,scale:.18},{x:51,y:43,scale:.18},{x:78,y:45,scale:.18}];
    if (school === 'knightly') result.secondary = [{x:75,y:43,scale:.23}];
    if (school === 'northern') result.secondary = [{x:29,y:109,scale:.20},{x:70,y:109,scale:.20,flip:true}];
  }
  return result;
}

export function heraldicIdentity(doctrine = {}) {
  const schoolId = schoolForDoctrine(doctrine);
  const school = HERALDIC_SCHOOLS[schoolId];
  return {
    school,
    palette: paletteForDoctrine(doctrine),
    shield: shieldGeometry(doctrine),
    composition: compositionForDoctrine(doctrine)
  };
}

export function liveryForDoctrine(doctrine = {}) {
  const identity = heraldicIdentity(doctrine);
  return {
    primary: identity.palette.field,
    metal: identity.palette.metal,
    accent: identity.palette.accent,
    emblem: identity.palette.main,
    ink: identity.palette.ink,
    school: identity.school.id,
    shield: identity.shield.id
  };
}
