import { HEROES, HERO_BY_ID, TEAM_UPS, ROLE_TARGETS, TIERS } from './data.js';

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, Number(n) || 0));
const tierWeight = { 'S+': 12, S: 9, A: 5, B: 0, C: -5, D: -10 };
const roleIndex = { Vanguard: 0, Duelist: 1, Strategist: 2 };
const roleNames = { Vanguard: 'танка', Duelist: 'дамагера', Strategist: 'саппорта', Flex: 'флекса' };

export function heroRating(hero, prefs = {}) {
  const tier = prefs.tiers?.[hero.id] || hero.tier;
  const personal = prefs.scores?.[hero.id] ?? hero.power;
  const confidence = prefs.confidence?.[hero.id] ?? 50;
  const favorite = prefs.favorites?.includes(hero.id) ? 4 : 0;
  return clamp(hero.power * .42 + personal * .43 + confidence * .11 + (tierWeight[tier] || 0) + favorite, 0, 110);
}

export function roleCounts(ids) {
  const counts = { Vanguard: 0, Duelist: 0, Strategist: 0, Flex: 0 };
  for (const id of ids.filter(Boolean)) {
    const hero = HERO_BY_ID[id];
    if (!hero) continue;
    if (hero.role === 'Flex') counts.Flex += 1;
    else counts[hero.role] += 1;
  }
  return counts;
}

export function allocateFlex(counts, size) {
  const out = { ...counts };
  const target = ROLE_TARGETS[Math.max(1, Math.min(6, size))] || ROLE_TARGETS[6];
  for (let i = 0; i < counts.Flex; i += 1) {
    const need = ['Vanguard','Duelist','Strategist']
      .map((role, index) => ({ role, need: target[index] - out[role] }))
      .sort((a,b) => b.need - a.need)[0].role;
    out[need] += 1;
  }
  return out;
}

export function activeLinks(ids) {
  const set = new Set(ids.filter(Boolean));
  return TEAM_UPS.filter(link => link.members.every(id => set.has(id)));
}

export function partialLinks(ids, candidateId) {
  const set = new Set([...ids.filter(Boolean), candidateId]);
  return TEAM_UPS.filter(link => link.members.includes(candidateId) && link.members.every(id => set.has(id)));
}

export function teamTags(ids) {
  const counts = {};
  for (const id of ids.filter(Boolean)) {
    for (const tag of HERO_BY_ID[id]?.tags || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

export function analyzeTeam(ids, prefs = {}) {
  const picked = ids.filter(Boolean);
  const size = Math.max(1, ids.length || 6);
  const counts = allocateFlex(roleCounts(picked), size);
  const target = ROLE_TARGETS[size] || ROLE_TARGETS[6];
  const tags = teamTags(picked);
  const links = activeLinks(picked);
  const official = links.filter(x => x.type === 'official');
  const tactical = links.filter(x => x.type === 'tactical');
  const rating = picked.length ? picked.reduce((sum,id) => sum + heroRating(HERO_BY_ID[id], prefs), 0) / picked.length : 0;
  const roleDiff = Math.abs(counts.Vanguard-target[0]) + Math.abs(counts.Duelist-target[1]) + Math.abs(counts.Strategist-target[2]);
  const coverage = (keys) => clamp(keys.reduce((sum,key) => sum + Math.min(2, tags[key] || 0) * 18, 0));
  const frontline = coverage(['frontline','shield','brawl']);
  const sustain = coverage(['sustain','burst-heal','save','self-sustain']);
  const pressure = coverage(['burst','poke','pick','sustain-damage','anti-tank']);
  const control = coverage(['control','area-control','disrupt','wall','setup']);
  const mobility = coverage(['mobility','dive','flight','stealth']);
  const synergy = clamp(official.length * 22 + tactical.length * 11 + Math.min(18, Object.values(tags).filter(v => v >= 2).length * 3));
  const balance = clamp(100 - roleDiff * 23 - Math.max(0, target[2]-counts.Strategist) * 12 - Math.max(0, target[0]-counts.Vanguard) * 8);
  const completeness = picked.length / size;
  const overall = clamp((rating * .30 + balance * .23 + synergy * .17 + sustain * .09 + frontline * .07 + pressure * .07 + control * .04 + mobility * .03) * (.58 + completeness * .42));
  const warnings = [];
  if (picked.length < size) warnings.push(`свободных слотов: ${size-picked.length}`);
  if (counts.Strategist < target[2]) warnings.push('мало лечения и сейва');
  if (counts.Vanguard < target[0]) warnings.push('тонкий фронтлайн');
  if (!tags.control && !tags['area-control']) warnings.push('почти нет контроля');
  if ((tags.dive || 0) >= 3 && (tags.sustain || 0) < 1) warnings.push('дайв остаётся без последующего лечения');
  if ((tags.poke || 0) >= 3 && (tags.frontline || 0) < 1) warnings.push('поук-ядру некому создавать пространство');
  return { counts, target, tags, links, official, tactical, rating, balance, synergy, frontline, sustain, pressure, control, mobility, overall, warnings };
}

function roleNeedScore(hero, ids, size) {
  const counts = allocateFlex(roleCounts(ids), size);
  const target = ROLE_TARGETS[size] || ROLE_TARGETS[6];
  if (hero.role === 'Flex') return 14;
  const index = roleIndex[hero.role];
  const current = counts[hero.role];
  const need = target[index] - current;
  return need > 0 ? 24 + need * 6 : current > target[index] ? -14 : 2;
}

function diversityScore(hero, ids) {
  const tags = teamTags(ids);
  const strategic = ['frontline','sustain','burst','poke','control','mobility','anti-dive','save'];
  let score = 0;
  for (const tag of hero.tags) {
    if (strategic.includes(tag) && !tags[tag]) score += 3.5;
    if (tags[tag] === 1) score += 1.2;
  }
  return Math.min(16, score);
}

export function recommendHeroes(ids, prefs = {}, { limit = 8, size = ids.length || 6, role = null } = {}) {
  const selected = new Set(ids.filter(Boolean));
  return HEROES
    .filter(hero => !selected.has(hero.id) && (!role || hero.role === role || hero.role === 'Flex'))
    .map(hero => {
      const links = partialLinks(ids, hero.id);
      const official = links.filter(x => x.type === 'official').length;
      const tactical = links.filter(x => x.type === 'tactical').length;
      const reasons = [];
      const roleNeed = roleNeedScore(hero, ids, size);
      if (roleNeed >= 20) reasons.push(`закрывает нехватку ${roleNames[hero.role] || 'роли'}`);
      if (official) reasons.push(`активирует Team-Up: ${official}`);
      if (tactical) reasons.push(`тактических связок: ${tactical}`);
      const diversity = diversityScore(hero, ids);
      if (diversity >= 7) reasons.push('добавляет недостающие инструменты');
      const score = heroRating(hero, prefs) + roleNeed + official * 20 + tactical * 8 + diversity;
      return { hero, score, links, reasons: reasons.slice(0,3) };
    })
    .sort((a,b) => b.score - a.score || a.hero.order - b.hero.order)
    .slice(0, limit);
}

export function autoComplete(ids, locks = [], prefs = {}) {
  const result = [...ids];
  for (let i = 0; i < result.length; i += 1) {
    if (result[i] || locks[i]) continue;
    result[i] = recommendHeroes(result, prefs, { limit: 1, size: result.length })[0]?.hero.id || null;
  }
  return result;
}

export function optimizeTeam(ids, locks = [], prefs = {}) {
  const result = ids.map((id,index) => locks[index] ? id : null);
  const anchors = new Set(result.filter(Boolean));
  for (let i = 0; i < result.length; i += 1) {
    if (result[i]) continue;
    const candidate = recommendHeroes(result, prefs, { limit: 1, size: result.length })[0]?.hero.id;
    if (candidate && !anchors.has(candidate)) result[i] = candidate;
  }
  return result;
}

export function tierGroups(prefs = {}) {
  const groups = Object.fromEntries(TIERS.map(tier => [tier, []]));
  for (const hero of HEROES) {
    const tier = prefs.tiers?.[hero.id] || hero.tier;
    (groups[tier] ||= []).push(hero);
  }
  for (const tier of Object.keys(groups)) groups[tier].sort((a,b) => heroRating(b,prefs)-heroRating(a,prefs));
  return groups;
}

export function exportPayload(state) {
  return {
    schema: 'rival-forge/1',
    exportedAt: new Date().toISOString(),
    teamSize: state.teamSize,
    team: state.team,
    locks: state.locks,
    prefs: state.prefs,
    savedTeams: state.savedTeams
  };
}

export function normalizeImported(payload) {
  if (!payload || payload.schema !== 'rival-forge/1') throw new Error('неподдерживаемый формат файла');
  const teamSize = Math.max(1, Math.min(6, Number(payload.teamSize) || 6));
  const team = Array.from({ length: teamSize }, (_,i) => HERO_BY_ID[payload.team?.[i]] ? payload.team[i] : null);
  const locks = Array.from({ length: teamSize }, (_,i) => Boolean(payload.locks?.[i]));
  const rawPrefs = payload.prefs && typeof payload.prefs === 'object' ? payload.prefs : {};
  const validMap = (source, mapper = value => value) => Object.fromEntries(
    Object.entries(source && typeof source === 'object' ? source : {})
      .filter(([id]) => HERO_BY_ID[id])
      .map(([id, value]) => [id, mapper(value)])
  );
  const prefs = {
    tiers: Object.fromEntries(Object.entries(rawPrefs.tiers && typeof rawPrefs.tiers === 'object' ? rawPrefs.tiers : {}).filter(([id,value]) => HERO_BY_ID[id] && TIERS.includes(value))),
    scores: validMap(rawPrefs.scores, value => clamp(value)),
    confidence: validMap(rawPrefs.confidence, value => clamp(value)),
    notes: validMap(rawPrefs.notes, value => String(value ?? '').slice(0,1200)),
    favorites: Array.isArray(rawPrefs.favorites) ? [...new Set(rawPrefs.favorites.filter(id => HERO_BY_ID[id]))] : []
  };
  const savedTeams = (Array.isArray(payload.savedTeams) ? payload.savedTeams : []).slice(0,40).map((saved, index) => {
    const size = Math.max(1, Math.min(6, Number(saved?.teamSize) || 6));
    return {
      id: String(saved?.id || `imported-${index}`),
      name: String(saved?.name || `Импортированная команда ${index + 1}`).slice(0,60),
      teamSize: size,
      team: Array.from({ length: size }, (_,i) => HERO_BY_ID[saved?.team?.[i]] ? saved.team[i] : null),
      locks: Array.from({ length: size }, (_,i) => Boolean(saved?.locks?.[i])),
      score: clamp(saved?.score),
      updated: Number(saved?.updated) || Date.now()
    };
  });
  return { teamSize, team, locks, prefs, savedTeams };
}
