function resetArrays() { mat.fill(MATERIAL.EMPTY); temp.fill(AMBIENT); pressure.fill(0); charge.fill(0); age.fill(0); aux.fill(0); vx.fill(0); vy.fill(0); history = []; undoStack = []; redoStack = []; selection = null; selectedSensor = -1; sensorSeries = { temp: [], pressure: [] }; }
function setCell(x, y, id, t = null, a = 0) { if (!inBounds(x, y, width, height))
    return; const i = indexOfCell(x, y, width); mat[i] = id; temp[i] = t ?? materials[id]?.temperature ?? AMBIENT; pressure[i] = 0; charge[i] = 0; age[i] = 0; aux[i] = a; }
function rect(x0, y0, x1, y1, id, t = null) { for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
        setCell(x, y, id, t); }
function circle(cx, cy, r, id, t = null) { for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r)
            setCell(x, y, id, t); }
function line(x0, y0, x1, y1, id, t = null, r = 1) { const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; let err = dx + dy; while (true) {
    circle(x0, y0, r, id, t);
    if (x0 === x1 && y0 === y1)
        break;
    const e2 = 2 * err;
    if (e2 >= dy) {
        err += dy;
        x0 += sx;
    }
    if (e2 <= dx) {
        err += dx;
        y0 += sy;
    }
} }
function shell(id = MATERIAL.WALL) { rect(0, 0, width, 3, id); rect(0, height - 3, width, height, id); rect(0, 0, 3, height, id); rect(width - 3, 0, width, height, id); }
function setupBlank() { resetArrays(); shell(); worldName = 'Чистая камера'; currentTask = null; fitCamera(); }
function setupVolcano() {
    resetArrays();
    shell();
    for (let y = 80; y < height - 3; y++) {
        const slope = Math.abs(width / 2 - (width / 2));
        for (let x = 3; x < width - 3; x++) {
            const dy = y - 80;
            if (Math.abs(x - width / 2) < dy * 0.72 + 9)
                setCell(x, y, MATERIAL.STONE, 70);
        }
    }
    for (let y = 125; y < height - 5; y++)
        for (let x = 48; x < 72; x++)
            if (rand() > .13)
                setCell(x, y, MATERIAL.LAVA, 1150);
    for (let y = 24; y < 88; y++)
        for (let x = 8; x < 112; x++)
            if (y > 42 + Math.sin(x * .12) * 7 && rand() > .08)
                setCell(x, y, MATERIAL.ICE, -12);
    rect(12, 16, 108, 24, MATERIAL.SNOW, -18);
    line(60, 82, 60, 125, MATERIAL.EMPTY, AMBIENT, 4);
    worldName = 'Вулкан под ледником';
    currentTask = null;
    fitCamera();
    showCoach();
}
function setupFurnace(metal) { resetArrays(); shell(); rect(18, 46, 102, 160, MATERIAL.CERAMIC); rect(24, 52, 96, 154, MATERIAL.EMPTY); rect(30, 115, 90, 145, metal ? MATERIAL.METAL : MATERIAL.SAND); rect(32, 148, 88, 154, MATERIAL.FIRE, 950); worldName = metal ? 'Плавильный тигель' : 'Стекольная печь'; fitCamera(); }
function setupBoiler() { resetArrays(); shell(); rect(20, 66, 100, 155, MATERIAL.BRITTLE_WALL); rect(25, 72, 95, 148, MATERIAL.WATER, 82); rect(45, 145, 75, 151, MATERIAL.FIRE, 900); rect(56, 58, 64, 70, MATERIAL.SENSOR); selectedSensor = indexOfCell(60, 64, width); worldName = 'Паровой котёл'; fitCamera(); }
function setupUndersea() { resetArrays(); shell(); rect(3, 20, 117, 187, MATERIAL.WATER, 9); for (let y = 130; y < 187; y++)
    for (let x = 3; x < 117; x++)
        if (y > 150 - Math.abs(x - 60) * .28)
            setCell(x, y, MATERIAL.STONE, 40); circle(60, 158, 9, MATERIAL.LAVA, 1150); worldName = 'Подводный вулкан'; fitCamera(); }
function setupOilFire() { resetArrays(); shell(); rect(3, 90, 117, 187, MATERIAL.WATER, 18); rect(25, 70, 95, 96, MATERIAL.OIL, 24); rect(38, 65, 55, 76, MATERIAL.FIRE, 780); worldName = 'Нефтяной пожар'; fitCamera(); }
function setupAcidLab() { resetArrays(); shell(); rect(8, 96, 50, 180, MATERIAL.GLASS); rect(12, 104, 46, 176, MATERIAL.ACID); rect(70, 96, 112, 180, MATERIAL.GLASS); rect(74, 104, 108, 176, MATERIAL.BASE); rect(50, 120, 70, 180, MATERIAL.METAL); worldName = 'Кислотная лаборатория'; fitCamera(); }
function setupMine() { resetArrays(); shell(); rect(3, 20, 117, 180, MATERIAL.STONE); rect(12, 90, 108, 170, MATERIAL.EMPTY); for (let x = 18; x < 108; x += 22)
    rect(x, 88, x + 4, 170, MATERIAL.WOOD); rect(3, 180, 117, 187, MATERIAL.RUBBLE); worldName = 'Обрушение шахты'; fitCamera(); }
function setupDam() { resetArrays(); shell(); rect(3, 40, 54, 187, MATERIAL.WATER); for (let y = 45; y < 187; y++)
    for (let x = 52; x < 83; x++)
        if (rand() > .13)
            setCell(x, y, MATERIAL.SAND); rect(84, 150, 117, 187, MATERIAL.STONE); worldName = 'Песчаная дамба'; fitCamera(); }
function setupForest() { resetArrays(); shell(); rect(3, 150, 117, 187, MATERIAL.SOIL); for (let x = 8; x < 116; x += 7) {
    const h = 25 + (rand() * 35 | 0);
    rect(x, 150 - h, x + 2, 150, MATERIAL.WOOD);
    circle(x + 1, 150 - h, 5, MATERIAL.PLANT);
} circle(10, 140, 5, MATERIAL.FIRE, 780); worldName = 'Лесной пожар'; fitCamera(); }
function setupElectrolysis() { resetArrays(); shell(); rect(18, 86, 102, 174, MATERIAL.GLASS); rect(23, 92, 97, 169, MATERIAL.SALT_WATER); rect(34, 66, 39, 154, MATERIAL.COPPER); rect(81, 66, 86, 154, MATERIAL.COPPER); rect(88, 72, 96, 80, MATERIAL.SENSOR); selectedSensor = indexOfCell(92, 76, width); worldName = 'Электролиз воды'; fitCamera(); }
function setupReactor() { resetArrays(); shell(); rect(16, 48, 104, 174, MATERIAL.CONCRETE); rect(22, 54, 98, 168, MATERIAL.WATER, 20); circle(60, 112, 20, MATERIAL.METAL, 760); circle(60, 112, 10, MATERIAL.EXPLOSIVE, 430); worldName = 'Реактор с охлаждением'; fitCamera(); }
function setupToxic() { resetArrays(); shell(); for (let x = 20; x < 110; x += 22)
    rect(x, 80, x + 5, 187, MATERIAL.CONCRETE); rect(3, 160, 35, 187, MATERIAL.TOXIC_GAS); worldName = 'Распространение токсичного газа'; fitCamera(); }
function setupCrystals() { resetArrays(); shell(); rect(16, 72, 104, 178, MATERIAL.GLASS); rect(21, 78, 99, 173, MATERIAL.SALT_WATER, 62); circle(60, 144, 4, MATERIAL.CRYSTAL); worldName = 'Выращивание кристаллов'; fitCamera(); }
function setupFungus() { resetArrays(); shell(); rect(3, 120, 117, 187, MATERIAL.SOIL); for (let i = 0; i < 220; i++)
    setCell(5 + (rand() * 110 | 0), 100 + (rand() * 80 | 0), MATERIAL.ORGANIC); circle(60, 140, 7, MATERIAL.FUNGUS); rect(18, 110, 30, 150, MATERIAL.WATER); worldName = 'Грибная экосистема'; fitCamera(); }
function setupChain() { resetArrays(); shell(MATERIAL.CONCRETE); for (let a = 0; a < 8; a++) {
    const cx = 60 + Math.cos(a * Math.PI / 4) * 36, cy = 100 + Math.sin(a * Math.PI / 4) * 36;
    circle(cx | 0, cy | 0, 6, MATERIAL.EXPLOSIVE);
    line(60, 100, cx | 0, cy | 0, MATERIAL.GUNPOWDER, null, 1);
} circle(60, 100, 8, MATERIAL.EXPLOSIVE); worldName = 'Цепная реакция'; fitCamera(); }
function setupInfection() { resetArrays(); shell(); rect(10, 70, 110, 175, MATERIAL.ORGANIC); circle(60, 120, 18, MATERIAL.PARASITE); worldName = 'Органическая инфекция'; fitCamera(); }
function setupPlantShock() { resetArrays(); shell(); rect(3, 145, 117, 187, MATERIAL.SOIL); rect(24, 125, 34, 175, MATERIAL.WATER); for (let x = 40; x < 90; x += 5) {
    rect(x, 110 + (rand() * 20 | 0), x + 2, 145, MATERIAL.PLANT);
} rect(3, 20, 117, 50, MATERIAL.COLD_GAS, -90); worldName = 'Перепад температуры'; fitCamera(); }
function setupBlastWall() { resetArrays(); shell(); rect(55, 35, 66, 175, MATERIAL.BRITTLE_WALL); rect(10, 120, 45, 175, MATERIAL.SAND); worldName = 'Минимальный заряд'; usedExplosive = 0; fitCamera(); }
function setupMixture() { resetArrays(); shell(); rect(8, 90, 112, 180, MATERIAL.GLASS); for (let i = 0; i < 850; i++)
    setCell(12 + (rand() * 96 | 0), 94 + (rand() * 78 | 0), rand() < .45 ? MATERIAL.SALT : MATERIAL.WATER); rect(55, 115, 60, 180, MATERIAL.WALL); worldName = 'Разделение смеси'; fitCamera(); }
function setupWaterCycle() { resetArrays(); shell(); rect(10, 38, 110, 180, MATERIAL.GLASS); rect(15, 110, 105, 175, MATERIAL.WATER, 30); rect(20, 55, 100, 75, MATERIAL.ICE, -12); rect(45, 170, 75, 176, MATERIAL.FIRE, 760); worldName = 'Самоподдерживающийся цикл воды'; fitCamera(); }
function setupGasFilter() { resetArrays(); shell(); rect(3, 75, 30, 170, MATERIAL.TOXIC_GAS); rect(52, 70, 68, 175, MATERIAL.COAL); rect(100, 105, 108, 113, MATERIAL.SENSOR); selectedSensor = indexOfCell(104, 109, width); worldName = 'Газовый фильтр'; fitCamera(); }
function countMat(id) { let n = 0; for (let i = 0; i < size; i++)
    if (mat[i] === id)
        n++; return n; }
function maxPressure() { let m = 0; for (let i = 0; i < size; i++)
    if (pressure[i] > m)
        m = pressure[i]; return m; }
function maxTemp() { let m = -9999; for (let i = 0; i < size; i++)
    if (temp[i] > m)
        m = temp[i]; return m; }
function regionCount(id, x0, y0, x1, y1) { let n = 0; for (let y = y0; y < Math.min(y1, height); y++)
    for (let x = x0; x < Math.min(x1, width); x++)
        if (mat[indexOfCell(x, y, width)] === id)
            n++; return n; }
function localToxic(index) { const x = index % width, y = (index / width) | 0; let n = 0; for (let yy = y - 4; yy <= y + 4; yy++)
    for (let xx = x - 4; xx <= x + 4; xx++)
        if (inBounds(xx, yy, width, height) && mat[indexOfCell(xx, yy, width)] === MATERIAL.TOXIC_GAS)
            n++; return n; }
function gravityVector() { return [[0, 1], [-1, 0], [0, -1], [1, 0]][gravity]; }
function swap(i, j) { const tm = mat[i]; mat[i] = mat[j]; mat[j] = tm; const tt = temp[i]; temp[i] = temp[j]; temp[j] = tt; const tp = pressure[i]; pressure[i] = pressure[j]; pressure[j] = tp; const tc = charge[i]; charge[i] = charge[j]; charge[j] = tc; const ta = age[i]; age[i] = age[j]; age[j] = ta; const tx = aux[i]; aux[i] = aux[j]; aux[j] = tx; moved[i] = moved[j] = 1; }
function emptyLike(id) { return id === MATERIAL.EMPTY || id === MATERIAL.AIR; }
function canDisplace(a, b) { if (emptyLike(b))
    return true; const A = materials[a], B = materials[b]; if (A.phase === 'gas' && B.phase !== 'gas')
    return false; if (A.phase === 'liquid' && B.phase === 'gas')
    return true; if (A.phase === 'powder' && (B.phase === 'liquid' || B.phase === 'gas'))
    return A.density > B.density; if (A.phase === 'liquid' && B.phase === 'liquid')
    return A.density > B.density + 0.04; if (A.phase === 'gas' && B.phase === 'gas')
    return A.density < B.density; return false; }
function neighborIndices(x, y) { const out = []; if (x > 0)
    out.push(indexOfCell(x - 1, y, width)); if (x < width - 1)
    out.push(indexOfCell(x + 1, y, width)); if (y > 0)
    out.push(indexOfCell(x, y - 1, width)); if (y < height - 1)
    out.push(indexOfCell(x, y + 1, width)); return out; }
function hasOxygen(x, y) { for (const i of neighborIndices(x, y)) {
    const m = materials[mat[i]];
    if ((m.oxygen ?? 0) > 0.15 || mat[i] === MATERIAL.AIR)
        return i;
} return -1; }
function igniteAt(x, y, source) { const oi = hasOxygen(x, y); if (oi < 0)
    return false; const i = indexOfCell(x, y, width), m = materials[mat[i]]; if (m.flammability <= 0)
    return false; temp[i] = Math.max(temp[i], m.ignition + 80); if (rand() < m.burnRate * .7 + 0.03) {
    mat[i] = m.explosive ? MATERIAL.FIRE : (m.phase === 'solid' || m.phase === 'powder' ? MATERIAL.ASH : MATERIAL.FIRE);
    age[i] = 0;
} if (mat[oi] === MATERIAL.OXYGEN || mat[oi] === MATERIAL.AIR)
    mat[oi] = MATERIAL.CO2; pressure[i] += Math.round((m.explosive || 0) * 120); if (m.explosive)
    explode(x, y, m.explosive); return true; }
function explode(cx, cy, power) { const r = Math.min(16, 4 + Math.round(power * 5)); sound('boom'); for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
        if (!inBounds(x, y, width, height))
            continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r)
            continue;
        const i = indexOfCell(x, y, width), fall = (1 - d / r);
        pressure[i] = clamp(pressure[i] + Math.round(power * 170 * fall), -32000, 32000);
        temp[i] = clamp(temp[i] + Math.round(power * 650 * fall), -2000, 32000);
        const m = materials[mat[i]];
        if (m.strength < fall * power * .9 && mat[i] !== MATERIAL.WALL) {
            mat[i] = rand() < .35 ? MATERIAL.FIRE : MATERIAL.RUBBLE;
            age[i] = 0;
        }
        vx[i] = clamp(Math.round((x - cx) * fall * 2), -12, 12);
        vy[i] = clamp(Math.round((y - cy) * fall * 2), -12, 12);
    } pulseFx(cx, cy, r); }

const scenes = [
    ['volcano', 'Вулкан под ледником', 'Магма плавит ледник; пар ищет выход и ломает породу.', setupVolcano],
    ['glass', 'Стекольная печь', 'Песок и жар в керамической камере.', () => setupFurnace(false)],
    ['boiler', 'Паровой котёл', 'Закрытый котёл уже набирает давление.', setupBoiler],
    ['undersea', 'Подводный вулкан', 'Лава встречает толщу воды.', setupUndersea],
    ['oilfire', 'Нефтяной пожар', 'Горящее топливо плывёт по воде.', setupOilFire],
    ['acidlab', 'Кислотная лаборатория', 'Кислота, щёлочь и металлические образцы.', setupAcidLab],
    ['mine', 'Обрушение шахты', 'Нагруженная порода и хрупкие опоры.', setupMine],
    ['dam', 'Песчаная дамба', 'Вода уже просачивается сквозь слабое место.', setupDam],
    ['forest', 'Лесной пожар', 'Огонь входит в сухой лес при боковом ветре.', setupForest],
    ['electrolysis', 'Электролиз воды', 'Проводники погружены в соляной раствор.', setupElectrolysis],
    ['reactor', 'Реактор с охлаждением', 'Горячее ядро окружено контуром воды.', setupReactor],
    ['toxic', 'Токсичный газ', 'Тяжёлый газ стелется по промышленному отсеку.', setupToxic],
    ['crystals', 'Выращивание кристаллов', 'Пересыщенный раствор охлаждается.', setupCrystals],
    ['fungus', 'Грибная экосистема', 'Грибница, вода и органика конкурируют в почве.', setupFungus],
    ['chain', 'Цепная реакция', 'Нестабильные капсулы соединены пороховыми дорожками.', setupChain]
];
const tasks = [
    ['stop-fire', 'Остановить пожар', 'Потушите все очаги и сохраните хотя бы треть дерева.', setupForest, () => countMat(MATERIAL.FIRE) === 0 && countMat(MATERIAL.WOOD) > 100],
    ['steam-safe', 'Безопасный паровой двигатель', 'Доведите датчик давления до 40–110, не разрушив котёл.', setupBoiler, () => maxPressure() > 40 && maxPressure() < 110 && countMat(MATERIAL.BRITTLE_WALL) > 40],
    ['melt-metal', 'Расплавить металл', 'Получите жидкий металл и сохраните керамический контейнер.', () => setupFurnace(true), () => countMat(MATERIAL.MOLTEN_METAL) > 40 && countMat(MATERIAL.CERAMIC) > 80],
    ['clean-water', 'Очистить воду', 'Удалите кислоту и токсичный газ, сохранив воду.', setupAcidLab, () => countMat(MATERIAL.ACID) < 4 && countMat(MATERIAL.TOXIC_GAS) < 4 && countMat(MATERIAL.WATER) > 80],
    ['grow-crystals', 'Получить кристаллы', 'Вырастите не менее 60 клеток кристалла.', setupCrystals, () => countMat(MATERIAL.CRYSTAL) >= 60],
    ['conduct', 'Провести электричество', 'Зарядите датчик справа.', setupElectrolysis, () => selectedSensor >= 0 && charge[selectedSensor] > 20],
    ['infection', 'Уничтожить инфекцию', 'Уберите паразитическую массу, сохранив органику.', setupInfection, () => countMat(MATERIAL.PARASITE) === 0 && countMat(MATERIAL.ORGANIC) > 50],
    ['save-plant', 'Сохранить растение', 'Поддерживайте растение 25 секунд при холодном фронте.', setupPlantShock, () => performance.now() - taskStartedAt > 25000 && countMat(MATERIAL.PLANT) > 80],
    ['min-explosive', 'Минимальный заряд', 'Разрушьте стену, использовав не более 60 клеток взрывчатки.', setupBlastWall, () => countMat(MATERIAL.BRITTLE_WALL) < 15 && usedExplosive <= 60],
    ['stabilize', 'Стабилизировать реактор', 'Снизьте максимум температуры ниже 350 °C.', setupReactor, () => maxTemp() < 350 && countMat(MATERIAL.WATER) > 30],
    ['separate', 'Разделить смесь', 'Соберите соль в нижнем кармане, воду — в правом.', setupMixture, () => regionCount(MATERIAL.SALT, 0, 140, 55, 190) > 40 && regionCount(MATERIAL.WATER, 60, 120, 120, 190) > 80],
    ['water-cycle', 'Цикл воды', 'Поддерживайте лёд, воду и пар одновременно 20 секунд.', setupWaterCycle, () => performance.now() - taskStartedAt > 20000 && countMat(MATERIAL.ICE) > 20 && countMat(MATERIAL.WATER) > 20 && countMat(MATERIAL.STEAM) > 20],
    ['gas-filter', 'Газовый фильтр', 'Не дайте токсичному газу достичь правого датчика.', setupGasFilter, () => performance.now() - taskStartedAt > 20000 && selectedSensor >= 0 && localToxic(selectedSensor) < 2],
    ['controlled-chain', 'Контролируемая реакция', 'Активируйте центральный заряд, не разрушив внешнее кольцо.', setupChain, () => countMat(MATERIAL.EXPLOSIVE) < 10 && countMat(MATERIAL.CONCRETE) > 150],
    ['synth', 'Синтезировать материал', 'Создайте вещество: твёрдое, проводящее, с прочностью выше 70%.', () => setupBlank(), () => customMaterials.some(m => m.phase === 'solid' && m.electrical > 0.5 && m.strength > 0.7)]
];
let usedExplosive = 0;
