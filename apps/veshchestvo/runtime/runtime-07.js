function renderMaterials(query = '') { const tray = document.querySelector('#materialTray'); tray.innerHTML = ''; const q = query.toLowerCase(); const list = materials.filter((m, i) => i > 0 && (!q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))).filter(m => activeCategory === 'Все' || m.category === activeCategory || activeCategory === 'Избранное' && favorites.has(m.id) || activeCategory === 'Недавние' && recents.includes(m.id)); for (const m of list) {
    const b = document.createElement('button');
    b.className = 'sample' + (m.id === selectedMaterial ? ' active' : '');
    b.dataset.id = m.id;
    b.innerHTML = `<span class="sample-chip" style="--sample:${m.color}"></span><span>${m.name}</span><small>${phaseIcon(m.phase)}</small>`;
    b.addEventListener('click', () => selectMaterial(m.id));
    b.addEventListener('dblclick', () => { favorites.has(m.id) ? favorites.delete(m.id) : favorites.add(m.id); saveMeta(); renderMaterials(document.querySelector('#materialSearch').value); });
    tray.appendChild(b);
} if (!list.length)
    tray.innerHTML = '<div class="empty-state">Ничего не найдено</div>'; }
function phaseIcon(p) { return p === 'solid' ? '◆' : p === 'powder' ? '⋯' : p === 'liquid' ? '≈' : p === 'gas' ? '∿' : '·'; }
let activeCategory = 'Все', favorites = new Set(JSON.parse(localStorage.getItem(`${STORAGE}:favorites`) || '[]')), recents = JSON.parse(localStorage.getItem(`${STORAGE}:recents`) || '[]');
function saveMeta() { localStorage.setItem(`${STORAGE}:favorites`, JSON.stringify([...favorites])); localStorage.setItem(`${STORAGE}:recents`, JSON.stringify(recents)); }
function selectMaterial(id) { selectedMaterial = id; recents = [id, ...recents.filter(v => v !== id)].slice(0, 12); saveMeta(); document.querySelector('#selectedSwatch').style.setProperty('--sample', materials[id].color); document.querySelector('#selectedName').textContent = materials[id].name; renderMaterials(document.querySelector('#materialSearch').value); renderInspector(); }
function renderInspector() { const m = materials[selectedMaterial]; const wrap = document.querySelector('#inspectorBody'); const rows = [['Состояние', m.phase], ['Плотность', m.density], ['Вязкость', m.viscosity], ['Теплопроводность', m.conductivity], ['Плавление', m.meltPoint < 9000 ? `${m.meltPoint} °C` : '—'], ['Кипение', m.boilPoint < 9000 ? `${m.boilPoint} °C` : '—'], ['Воспламенение', m.ignition < 9000 ? `${m.ignition} °C` : '—'], ['Проводимость', Math.round(m.electrical * 100) + '%'], ['Прочность', Math.round(m.strength * 100) + '%'], ['Токсичность', Math.round(m.toxicity * 100) + '%'], ['В мире', countMat(m.id) + ' кл.']]; wrap.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join(''); }
const toolDefs = [['brush', 'Кисть', '✎'], ['line', 'Линия', '╱'], ['rect', 'Прямоугольник', '□'], ['circle', 'Окружность', '○'], ['fill', 'Заливка', '▧'], ['spray', 'Распылитель', '⁙'], ['eyedropper', 'Пипетка', '⌁'], ['eraser', 'Ластик', '⌫'], ['heater', 'Нагрев', '♨'], ['cooler', 'Охлаждение', '❄'], ['pressure', 'Давление', '⇈'], ['fan', 'Вентилятор', '↝'], ['electric', 'Электричество', 'ϟ'], ['drain', 'Сток', '⌄'], ['generator', 'Генератор', '∞'], ['wall', 'Стенка', '▦'], ['brittle', 'Хрупкая стенка', '▥'], ['sensor', 'Датчик', '◉'], ['select', 'Выделение', '⌗'], ['paste', 'Вставка', '⧉'], ['pan', 'Камера', '✥']];
function renderTools() { const fan = document.querySelector('#toolFan'); fan.innerHTML = ''; toolDefs.forEach(([id, name, icon], i) => { const b = document.createElement('button'); b.className = id === selectedTool ? 'active' : ''; b.dataset.tool = id; b.title = name; b.innerHTML = `<b>${icon}</b><span>${name}</span>`; b.style.setProperty('--i', i); b.addEventListener('click', () => { selectedTool = id; panMode = id === 'pan'; document.querySelector('#toolName').textContent = name; renderTools(); closeSheet('#toolsSheet'); }); fan.appendChild(b); }); }
function syncUI() { document.querySelector('#worldTitle').textContent = worldName; document.querySelector('#playBtn').textContent = playing ? 'Ⅱ' : '▶'; document.querySelector('#speedLabel').textContent = `×${speed}`; document.querySelector('#layerLabel').textContent = layerName(activeLayer); document.querySelector('#gravityBtn').style.transform = `rotate(${gravity * 90}deg)`; selectMaterial(selectedMaterial); renderTools(); updateUndoButtons(); }
function updateUndoButtons() { document.querySelector('#undoBtn').disabled = !undoStack.length; document.querySelector('#redoBtn').disabled = !redoStack.length; document.querySelector('#rewindBtn').disabled = !history.length; }
function layerName(id) { return { normal: 'Обычный', temperature: 'Температура', pressure: 'Давление', density: 'Плотность', velocity: 'Скорость', charge: 'Заряд', acidity: 'Кислотность', oxygen: 'Кислород', reaction: 'Реакции', strength: 'Прочность' }[id] || id; }
function toast(text, type = 'info') { const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = text; document.querySelector('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600); }
function openSheet(sel) { document.querySelector(sel).classList.add('open'); }
function closeSheet(sel) { document.querySelector(sel).classList.remove('open'); }
function sound(kind) { if (!settings.sound)
    return; try {
    audio.ctx ??= new AudioContext();
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    o.connect(g).connect(audio.ctx.destination);
    o.type = kind === 'boom' ? 'sawtooth' : 'sine';
    o.frequency.value = kind === 'boom' ? 70 : kind === 'success' ? 620 : 280;
    g.gain.setValueAtTime(.08, audio.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audio.ctx.currentTime + (kind === 'boom' ? .4 : .15));
    o.start();
    o.stop(audio.ctx.currentTime + (kind === 'boom' ? .4 : .15));
}
catch { } }
function renderLibrary() { const sceneWrap = document.querySelector('#sceneList'); sceneWrap.innerHTML = ''; scenes.forEach(([id, name, desc, fn]) => { const b = document.createElement('button'); b.className = 'library-row'; b.innerHTML = `<span class="thumb thumb-${id}"></span><span><b>${name}</b><small>${desc}</small></span><i>›</i>`; b.addEventListener('click', () => { pushUndo(); fn(); closeSheet('#librarySheet'); toast(name); }); sceneWrap.appendChild(b); }); const taskWrap = document.querySelector('#taskList'); taskWrap.innerHTML = ''; tasks.forEach(([id, name, desc, fn]) => { const b = document.createElement('button'); b.className = 'library-row task-row'; b.innerHTML = `<span class="task-mark">${tasks.indexOf(tasks.find(t => t[0] === id)) + 1}</span><span><b>${name}</b><small>${desc}</small></span><i>›</i>`; b.addEventListener('click', () => { pushUndo(); fn(); currentTask = id; taskStartedAt = performance.now(); document.querySelector('#taskBadge').hidden = false; document.querySelector('#taskBadge').textContent = name; closeSheet('#librarySheet'); playing = true; syncUI(); }); taskWrap.appendChild(b); }); renderSavedWorlds(); }
function getWorlds() { try {
    return JSON.parse(localStorage.getItem(`${STORAGE}:worlds`) || '[]');
}
catch {
    return [];
} }
function renderSavedWorlds() { const list = document.querySelector('#savedList'), worlds = getWorlds(); list.innerHTML = ''; if (!worlds.length) {
    list.innerHTML = '<div class="empty-state">Сохранённых экспериментов пока нет</div>';
    return;
} worlds.forEach((w, idx) => { const row = document.createElement('div'); row.className = 'saved-row'; row.innerHTML = `<button><b>${w.name}</b><small>${new Date(w.savedAt).toLocaleString('ru-RU')}</small></button><button class="delete">×</button>`; row.querySelector('button').addEventListener('click', () => { applyState(w.state); closeSheet('#librarySheet'); toast('Эксперимент открыт'); }); row.querySelector('.delete').addEventListener('click', () => { const n = getWorlds(); n.splice(idx, 1); localStorage.setItem(`${STORAGE}:worlds`, JSON.stringify(n)); renderSavedWorlds(); }); list.appendChild(row); }); }
function saveWorld() { const name = prompt('Название эксперимента', worldName) || worldName; const worlds = getWorlds(); worlds.unshift({ name, savedAt: Date.now(), state: encodeState() }); localStorage.setItem(`${STORAGE}:worlds`, JSON.stringify(worlds.slice(0, 10))); renderSavedWorlds(); toast('Эксперимент сохранён', 'success'); }
function exportBundle() { const payload = { kind: 'veshchestvo-bundle', version: APP_VERSION, world: encodeState(), customMaterials }; const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `veshchestvo-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function importBundle(file) { const reader = new FileReader(); reader.onload = () => { try {
    const p = JSON.parse(reader.result);
    if (p.kind !== 'veshchestvo-bundle')
        throw new Error('Неизвестный формат');
    if (p.customMaterials)
        installCustomMaterials(p.customMaterials);
    applyState(p.world);
    toast('Импорт завершён', 'success');
}
catch (e) {
    toast(`Импорт не удался: ${e.message}`, 'error');
} }; reader.readAsText(file); }
function renderSynthesis() { const phase = document.querySelector('#synPhase'), name = document.querySelector('#synName'), color = document.querySelector('#synColor'); phase.value = 'powder'; name.value = 'Новый материал'; color.value = '#b7895d'; updateSynPreview(); }
function updateSynPreview() { const phase = document.querySelector('#synPhase').value, color = document.querySelector('#synColor').value; const chamber = document.querySelector('#synthesisPreview'); const c = chamber.getContext('2d'), w = chamber.width, h = chamber.height; c.fillStyle = '#0c161b'; c.fillRect(0, 0, w, h); c.fillStyle = color; for (let i = 0; i < 90; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * w, y = phase === 'gas' ? 20 + ((i * 19) % 70) : phase === 'liquid' ? 70 + ((i * 13) % 28) : phase === 'solid' ? 45 + ((i * 7) % 45) : 25 + ((i * 17) % 75);
    c.globalAlpha = .55 + ((i % 5) / 10);
    c.beginPath();
    c.arc(x, y, phase === 'gas' ? 3 : 2.2, 0, Math.PI * 2);
    c.fill();
} c.globalAlpha = 1; }
function collectSynthetic() { const state = document.querySelector('#synPhase').value; const m = { name: document.querySelector('#synName').value.trim() || 'Новый материал', category: 'Пользовательские', phase: state, color: document.querySelector('#synColor').value, density: +document.querySelector('#synDensity').value, viscosity: +document.querySelector('#synViscosity').value, cohesion: +document.querySelector('#synCohesion').value, granular: +document.querySelector('#synGranular').value, heatCapacity: +document.querySelector('#synHeatCapacity').value, conductivity: +document.querySelector('#synConductivity').value, meltPoint: +document.querySelector('#synMelt').value, boilPoint: +document.querySelector('#synBoil').value, ignition: +document.querySelector('#synIgnition').value, flammability: +document.querySelector('#synFlammability').value, burnRate: .12, opacity: +document.querySelector('#synOpacity').value, electrical: +document.querySelector('#synElectrical').value, strength: +document.querySelector('#synStrength').value, brittleness: +document.querySelector('#synBrittleness').value, acidity: +document.querySelector('#synAcidity').value, toxicity: +document.querySelector('#synToxicity').value, growth: +document.querySelector('#synGrowth').value, glow: +document.querySelector('#synGlow').checked, movable: state !== 'solid' }; const withId = +document.querySelector('#ruleWith').value, productId = +document.querySelector('#ruleProduct').value, rule = { with: withId, minTemp: +document.querySelector('#ruleTemp').value || undefined, needsOxygen: document.querySelector('#ruleOxygen').checked, chance: +document.querySelector('#ruleChance').value, selfTo: productId || undefined, heat: +document.querySelector('#ruleHeat').value || undefined, pressure: +document.querySelector('#rulePressure').value || undefined, spread: document.querySelector('#ruleSpread').checked }; if (withId) {
    const result = validateReactionRule(rule);
    if (!result.ok)
        throw new Error(result.warning);
    m.rules = [rule];
} return m; }
function installCustomMaterials(list) { for (const raw of list) {
    if (materials.some(m => m.customKey === raw.customKey))
        continue;
    const { id: _oldId, ...clean } = raw;
    const id = addMaterial(`CUSTOM_${materials.length}`, clean.name, 'Пользовательские', clean.phase, clean.color, { ...clean, customKey: clean.customKey || crypto.randomUUID() });
    customMaterials.push({ ...clean, id, customKey: materials[id].customKey });
} renderMaterials(); populateRuleSelects(); }
function saveSynthetic() { try {
    const raw = collectSynthetic();
    raw.customKey = crypto.randomUUID();
    const id = addMaterial(`CUSTOM_${materials.length}`, raw.name, 'Пользовательские', raw.phase, raw.color, { ...raw, customKey: raw.customKey });
    customMaterials.push({ ...raw, id });
    localStorage.setItem(`${STORAGE}:materials`, JSON.stringify(customMaterials));
    selectMaterial(id);
    closeSheet('#synthesisSheet');
    toast('Вещество добавлено в библиотеку', 'success');
    sound('success');
}
catch (e) {
    document.querySelector('#synWarning').textContent = e.message;
    document.querySelector('#synWarning').hidden = false;
} }
function populateRuleSelects() { for (const sel of [document.querySelector('#ruleWith'), document.querySelector('#ruleProduct')]) {
    const value = sel.value;
    sel.innerHTML = '<option value="0">—</option>' + materials.filter(m => m.id > 0).map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    sel.value = value;
} }
function showCoach() { if (localStorage.getItem(`${STORAGE}:coach`))
    return; const coach = document.querySelector('#coach'); coach.hidden = false; coach.innerHTML = '<b>Попробуйте прямо в сцене</b><button data-action="lava">Провести канал для лавы</button><button data-action="cool">Охладить участок</button><button data-action="layer">Открыть температуру</button><button data-action="sensor">Поставить датчик давления</button><button data-action="done">Понятно</button>'; coach.addEventListener('click', e => { const a = e.target.dataset.action; if (a === 'lava') {
    selectedMaterial = MATERIAL.EMPTY;
    selectedTool = 'eraser';
    syncUI();
} if (a === 'cool') {
    selectedTool = 'cooler';
    syncUI();
} if (a === 'layer') {
    activeLayer = 'temperature';
    syncUI();
} if (a === 'sensor') {
    selectedTool = 'sensor';
    syncUI();
} if (a === 'done') {
    coach.hidden = true;
    localStorage.setItem(`${STORAGE}:coach`, '1');
} }); }
