function processReaction(i, x, y) {
    const id = mat[i], m = materials[id];
    for (const j of neighborIndices(x, y)) {
        const other = mat[j];
        if (id === MATERIAL.ACID && other === MATERIAL.BASE) {
            mat[i] = MATERIAL.WATER;
            mat[j] = MATERIAL.SALT_WATER;
            temp[i] += 35;
            return;
        }
        if (id === MATERIAL.ACID && (other === MATERIAL.METAL || other === MATERIAL.COPPER || other === MATERIAL.METAL_POWDER)) {
            if (rand() < .16) {
                mat[j] = MATERIAL.RUST;
                mat[i] = MATERIAL.TOXIC_GAS;
                pressure[i] += 20;
                return;
            }
        }
        if ((id === MATERIAL.WATER || id === MATERIAL.SALT_WATER) && other === MATERIAL.LAVA) {
            mat[i] = MATERIAL.STEAM;
            mat[j] = MATERIAL.STONE;
            temp[i] = 180;
            pressure[i] += 95;
            return;
        }
        if (id === MATERIAL.LAVA && (other === MATERIAL.WATER || other === MATERIAL.ICE || other === MATERIAL.SNOW)) {
            mat[i] = MATERIAL.STONE;
            mat[j] = MATERIAL.STEAM;
            temp[j] = 160;
            pressure[j] += 100;
            return;
        }
        if (id === MATERIAL.SALT && other === MATERIAL.WATER && rand() < .35) {
            mat[i] = MATERIAL.SALT_WATER;
            mat[j] = MATERIAL.SALT_WATER;
            return;
        }
        if (id === MATERIAL.SUGAR && other === MATERIAL.WATER && rand() < .3) {
            mat[i] = MATERIAL.SUGAR_WATER;
            mat[j] = MATERIAL.SUGAR_WATER;
            return;
        }
        if (id === MATERIAL.WATER && other === MATERIAL.SALT) {
            mat[i] = MATERIAL.SALT_WATER;
            mat[j] = MATERIAL.SALT_WATER;
            return;
        }
        if (id === MATERIAL.WATER && other === MATERIAL.SUGAR) {
            mat[i] = MATERIAL.SUGAR_WATER;
            mat[j] = MATERIAL.SUGAR_WATER;
            return;
        }
        if ((id === MATERIAL.METAL || id === MATERIAL.COPPER) && other === MATERIAL.WATER && temp[i] > 300 && rand() < .001) {
            mat[i] = MATERIAL.RUST;
            return;
        }
        if (id === MATERIAL.COAL && other === MATERIAL.TOXIC_GAS && rand() < .045) {
            mat[j] = MATERIAL.AIR;
            return;
        }
    }
    if (m.rules) {
        for (const rule of m.rules) {
            for (const j of neighborIndices(x, y)) {
                if (mat[j] !== rule.with)
                    continue;
                if (rule.minTemp !== undefined && temp[i] < rule.minTemp)
                    continue;
                if (rule.maxTemp !== undefined && temp[i] > rule.maxTemp)
                    continue;
                if (rule.needsOxygen && hasOxygen(x, y) < 0)
                    continue;
                if (rand() > (rule.chance ?? 1))
                    continue;
                if (rule.selfTo !== undefined)
                    mat[i] = rule.selfTo;
                if (rule.otherTo !== undefined)
                    mat[j] = rule.otherTo;
                if (rule.heat)
                    temp[i] = clamp(temp[i] + rule.heat, -2000, 32000);
                if (rule.pressure)
                    pressure[i] = clamp(pressure[i] + rule.pressure, -32000, 32000);
                if (rule.gas) {
                    const n = neighborIndices(x, y).find(k => emptyLike(mat[k]));
                    if (n !== undefined)
                        mat[n] = rule.gas;
                }
                if (rule.spread && emptyLike(mat[j]))
                    mat[j] = id;
                return;
            }
        }
    }
}
function processBiology(i, x, y) {
    const id = mat[i], m = materials[id];
    if (!m.growth)
        return;
    const ns = neighborIndices(x, y);
    const wet = ns.some(j => [MATERIAL.WATER, MATERIAL.SALT_WATER, MATERIAL.SOIL].includes(mat[j]));
    if (id === MATERIAL.SEED && wet && temp[i] > 4 && temp[i] < 45 && rand() < .025) {
        mat[i] = MATERIAL.PLANT;
        age[i] = 0;
        return;
    }
    if (id === MATERIAL.PLANT) {
        if ((!wet && rand() < .0007) || temp[i] < -20 || temp[i] > 70) {
            mat[i] = MATERIAL.ORGANIC;
            return;
        }
        if (wet && rand() < .003) {
            const targets = ns.filter(j => emptyLike(mat[j]));
            if (targets.length) {
                const j = pick(targets);
                mat[j] = rand() < .25 ? MATERIAL.SEED : MATERIAL.PLANT;
                temp[j] = temp[i];
            }
        }
    }
    if (id === MATERIAL.FUNGUS) {
        const food = ns.find(j => mat[j] === MATERIAL.ORGANIC || mat[j] === MATERIAL.WOOD);
        if (food !== undefined && wet && rand() < .018) {
            mat[food] = MATERIAL.FUNGUS;
            age[food] = 0;
        }
        else if (!wet && rand() < .002)
            mat[i] = MATERIAL.ASH;
    }
    if (id === MATERIAL.BACTERIA) {
        const food = ns.find(j => mat[j] === MATERIAL.ORGANIC || mat[j] === MATERIAL.SUGAR_WATER);
        if (food !== undefined && wet && rand() < .025) {
            mat[food] = MATERIAL.BACTERIA;
            temp[food] += 2;
        }
        if (temp[i] > 80 || temp[i] < -10)
            mat[i] = MATERIAL.ASH;
    }
    if (id === MATERIAL.PARASITE) {
        const food = ns.find(j => mat[j] === MATERIAL.ORGANIC || mat[j] === MATERIAL.PLANT);
        if (food !== undefined && rand() < .035)
            mat[food] = MATERIAL.PARASITE;
        if (temp[i] > 130 || temp[i] < -30 || charge[i] > 40)
            mat[i] = MATERIAL.ASH;
    }
}
function processDevice(i, x, y) { const m = materials[mat[i]]; if (m.device === 'drain') {
    for (const j of neighborIndices(x, y))
        if (materials[mat[j]].movable)
            mat[j] = MATERIAL.EMPTY;
}
else if (m.device === 'generator') {
    const id = aux[i] || MATERIAL.WATER;
    const [gx, gy] = gravityVector();
    const tx = x + gx, ty = y + gy;
    if (inBounds(tx, ty, width, height)) {
        const j = indexOfCell(tx, ty, width);
        if (emptyLike(mat[j]))
            setCell(tx, ty, id);
    }
} }
function processElectric(i, x, y) {
    const m = materials[mat[i]];
    if (charge[i] === 0)
        return;
    const ns = neighborIndices(x, y);
    for (const j of ns) {
        const n = materials[mat[j]];
        if (n.electrical > 0 && Math.abs(charge[j]) < Math.abs(charge[i]) - 1 && rand() < m.electrical * .8) {
            charge[j] = charge[i] > 0 ? charge[i] - 1 : charge[i] + 1;
            temp[j] += Math.round(Math.abs(charge[i]) * n.electrical * .12);
        }
    }
    if (mat[i] === MATERIAL.SALT_WATER && Math.abs(charge[i]) > 40 && rand() < .025) {
        const target = ns.find(j => emptyLike(mat[j]));
        if (target !== undefined) {
            mat[target] = rand() < .5 ? MATERIAL.OXYGEN : MATERIAL.FUEL_GAS;
            pressure[target] += 12;
        }
        temp[i] += 4;
    }
    charge[i] = charge[i] > 0 ? charge[i] - 1 : charge[i] + 1;
    if (temp[i] > m.ignition && m.flammability > 0)
        igniteAt(x, y, 'electric');
}
function processStructure(i, x, y) {
    const m = materials[mat[i]];
    if (m.phase !== 'solid' || mat[i] === MATERIAL.WALL)
        return;
    const stress = Math.abs(pressure[i]) / 120 + (temp[i] > m.meltPoint ? 1 : 0);
    if (stress > m.strength && rand() < m.brittleness * .35) {
        mat[i] = m.brittleness > .7 ? MATERIAL.RUBBLE : MATERIAL.EMPTY;
        pressure[i] = 0;
        pulseFx(x, y, 4);
        return;
    }
    if (m.movable !== false && m.strength < .75) {
        const [gx, gy] = gravityVector();
        const nx = x + gx, ny = y + gy;
        if (inBounds(nx, ny, width, height)) {
            const j = indexOfCell(nx, ny, width);
            if (emptyLike(mat[j]) && rand() < .04)
                swap(i, j);
        }
    }
}
function processMove(i, x, y) {
    if (moved[i])
        return;
    const id = mat[i], m = materials[id];
    if (!m.movable || m.phase === 'solid' || m.phase === 'empty')
        return;
    const [gx, gy] = gravityVector();
    let targets = [];
    if (m.phase === 'powder') {
        targets = [[x + gx, y + gy], [x + gx + (gy || 1), y + gy + (gx || 0)], [x + gx - (gy || 1), y + gy - (gx || 0)]];
    }
    else if (m.phase === 'liquid') {
        const spread = Math.max(1, Math.round(4 * (1 - m.viscosity)));
        targets = [[x + gx, y + gy]];
        for (let d = 1; d <= spread; d++) {
            targets.push([x + (gy || 1) * d, y + (gx || 0) * d], [x - (gy || 1) * d, y - (gx || 0) * d]);
        }
    }
    else if (m.phase === 'gas') {
        targets = [[x - gx, y - gy], [x + (gy || 1), y + (gx || 0)], [x - (gy || 1), y - (gx || 0)], [x + gx, y + gy]];
    }
    if (vx[i] || vy[i]) {
        targets.unshift([x + Math.sign(vx[i]), y + Math.sign(vy[i])]);
        vx[i] -= Math.sign(vx[i]);
        vy[i] -= Math.sign(vy[i]);
    }
    for (const [nx, ny] of targets.sort(() => rand() - .5)) {
        if (!inBounds(nx, ny, width, height))
            continue;
        const j = indexOfCell(nx, ny, width);
        if (canDisplace(id, mat[j])) {
            swap(i, j);
            return;
        }
    }
}
