function simulateOne() {
    moved.fill(0);
    stepCounter++;
    const reverse = stepCounter % 2 === 0;
    for (let row = 0; row < height; row++) {
        const y = gravity === 2 ? row : height - 1 - row;
        for (let col = 0; col < width; col++) {
            const x = reverse ? width - 1 - col : col;
            const i = indexOfCell(x, y, width), id = mat[i];
            if (id === MATERIAL.EMPTY)
                continue;
            const m = materials[id];
            if (m.lifetime && ++age[i] > m.lifetime) {
                mat[i] = MATERIAL.AIR;
                continue;
            }
            if (stepCounter % 2 === 0) {
                const temps = neighborIndices(x, y).map(j => temp[j]);
                temp[i] = diffuseTemperature(temp[i], temps, m.conductivity, m.heatCapacity);
                if (m.phase === 'gas') {
                    temp[i] += Math.round((AMBIENT - temp[i]) * .008);
                    if (temp[i] > AMBIENT + 20)
                        pressure[i] = clamp(pressure[i] + Math.round((temp[i] - AMBIENT) / 300), -32000, 32000);
                }
            }
            const next = phaseTransition(m, temp[i]);
            if (next !== null && next !== undefined) {
                mat[i] = next;
                age[i] = 0;
                if (next === MATERIAL.STEAM)
                    pressure[i] += 35;
                continue;
            }
            if (temp[i] >= m.ignition && m.flammability > 0)
                igniteAt(x, y, 'heat');
            if (id === MATERIAL.FIRE || id === MATERIAL.SPARK || id === MATERIAL.PLASMA) {
                for (const j of neighborIndices(x, y)) {
                    temp[j] = clamp(temp[j] + (id === MATERIAL.PLASMA ? 70 : 28), -2000, 32000);
                    const nx = j % width, ny = (j / width) | 0;
                    if (materials[mat[j]].flammability > 0 && rand() < .09)
                        igniteAt(nx, ny, 'flame');
                }
                pressure[i] += id === MATERIAL.PLASMA ? 4 : 1;
            }
            processReaction(i, x, y);
            processBiology(i, x, y);
            processDevice(i, x, y);
            processElectric(i, x, y);
            processStructure(i, x, y);
            processMove(i, x, y);
            if (pressure[i] !== 0) {
                const ns = neighborIndices(x, y), share = (pressure[i] * .08) | 0;
                if (share) {
                    for (const j of ns)
                        pressure[j] = clamp(pressure[j] + share, -32000, 32000);
                    pressure[i] -= share * ns.length;
                }
                pressure[i] = (pressure[i] * .97) | 0;
            }
        }
    }
    if (stepCounter % 6 === 0) {
        for (let i = 0; i < size; i++) {
            const id = mat[i];
            if (id === MATERIAL.SALT_WATER && temp[i] < 18 && rand() < .0008) {
                mat[i] = MATERIAL.CRYSTAL;
            }
            if (id === MATERIAL.SUGAR_WATER && temp[i] > 120 && rand() < .003)
                mat[i] = MATERIAL.SUGAR;
            if (id === MATERIAL.AIR && temp[i] < -5 && rand() < .00003)
                mat[i] = MATERIAL.SNOW;
        }
    }
}
function encodeState() { return { formatVersion: FORMAT_VERSION, width, height, materials: rleEncode(mat), temperatures: encodeSigned(temp), pressure: encodeSigned(pressure), charge: encodeSigned(Int16Array.from(charge)), age: rleEncode(age), aux: rleEncode(aux), camera: { ...camera }, gravity, selectedMaterial, selectedTool, brushSize, speed, layer: activeLayer, worldName, customMaterials, settings, createdAt: Date.now() }; }
function applyState(raw) { const s = migrateSave(raw); if (!validateSave(s))
    throw new Error('Некорректное сохранение'); if (s.width !== width || s.height !== height)
    throw new Error('Размер мира не поддерживается'); mat = rleDecode(s.materials, size); temp = decodeSigned(s.temperatures, size); pressure = decodeSigned(s.pressure, size); charge = s.charge ? Int8Array.from(decodeSigned(s.charge, size)) : new Int8Array(size); age = s.age ? Uint8Array.from(rleDecode(s.age, size)) : new Uint8Array(size); aux = rleDecode(s.aux ?? [0, size], size); camera = { x: 0, y: 0, zoom: 3, ...s.camera }; gravity = s.gravity ?? 0; selectedMaterial = s.selectedMaterial ?? MATERIAL.SAND; selectedTool = s.selectedTool ?? 'brush'; brushSize = s.brushSize ?? 5; speed = s.speed ?? 1; activeLayer = s.layer ?? 'normal'; worldName = s.worldName ?? 'Эксперимент'; settings = { ...settings, ...s.settings }; syncUI(); }
function saveAutosave() { try {
    localStorage.setItem(`${STORAGE}:autosave`, JSON.stringify(encodeState()));
    localStorage.setItem(`${STORAGE}:materials`, JSON.stringify(customMaterials));
}
catch (e) {
    toast('Автосохранение не удалось', 'error');
} }
function loadAutosave() { try {
    const raw = localStorage.getItem(`${STORAGE}:autosave`);
    if (raw) {
        applyState(JSON.parse(raw));
        return true;
    }
}
catch (e) {
    localStorage.removeItem(`${STORAGE}:autosave`);
    toast('Повреждённое сохранение пропущено', 'error');
} return false; }
function pushUndo() { undoStack.push(encodeState()); if (undoStack.length > 12)
    undoStack.shift(); redoStack = []; updateUndoButtons(); }
function undo() { if (!undoStack.length)
    return; redoStack.push(encodeState()); applyState(undoStack.pop()); updateUndoButtons(); }
function redo() { if (!redoStack.length)
    return; undoStack.push(encodeState()); applyState(redoStack.pop()); updateUndoButtons(); }
function takeHistory(now) { if (now - lastHistory < 250)
    return; history.push({ mat: new Uint16Array(mat), temp: new Int16Array(temp), pressure: new Int16Array(pressure), charge: new Int8Array(charge), age: new Uint8Array(age), aux: new Uint16Array(aux) }); if (history.length > HISTORY_FRAMES)
    history.shift(); lastHistory = now; }
function rewind() { const s = history.pop(); if (!s)
    return; mat = s.mat; temp = s.temp; pressure = s.pressure; charge = s.charge; age = s.age; aux = s.aux; playing = false; syncUI(); }
