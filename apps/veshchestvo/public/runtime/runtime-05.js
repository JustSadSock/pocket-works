function resize() { const rect = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); for (const c of [canvas, fxCanvas]) {
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
} miniGraph.width = Math.round(220 * dpr); miniGraph.height = Math.round(58 * dpr); }
function fitCamera() { const rect = canvas.parentElement.getBoundingClientRect(); camera.zoom = Math.min(rect.width / width, rect.height / height) * .98; camera.x = (rect.width - width * camera.zoom) / 2; camera.y = (rect.height - height * camera.zoom) / 2; }
function screenToWorld(clientX, clientY) { const r = canvas.getBoundingClientRect(); return { x: Math.floor((clientX - r.left - camera.x) / camera.zoom), y: Math.floor((clientY - r.top - camera.y) / camera.zoom) }; }
function render() {
    const off = render.off || (render.off = document.createElement('canvas'));
    if (off.width !== width || off.height !== height) {
        off.width = width;
        off.height = height;
        render.img = off.getContext('2d').createImageData(width, height);
    }
    const data = render.img.data;
    for (let i = 0; i < size; i++) {
        const id = mat[i], m = materials[id] || materials[0];
        let color = m.color;
        let r = parseInt(color.slice(1, 3), 16) || 0, g = parseInt(color.slice(3, 5), 16) || 0, b = parseInt(color.slice(5, 7), 16) || 0, a = Math.round((m.opacity ?? 1) * 255);
        if (id === MATERIAL.EMPTY) {
            r = 8;
            g = 16;
            b = 23;
            a = 255;
        }
        if (activeLayer === 'temperature') {
            const v = clamp((temp[i] + 80) / 1500, 0, 1);
            r = Math.round(20 + 235 * v);
            g = Math.round(70 + 150 * (1 - Math.abs(v - .5) * 2));
            b = Math.round(230 * (1 - v));
            a = 255;
        }
        else if (activeLayer === 'pressure') {
            const v = clamp(Math.abs(pressure[i]) / 180, 0, 1);
            r = Math.round(55 + 200 * v);
            g = Math.round(70 + 70 * (1 - v));
            b = Math.round(85 + 120 * (1 - v));
            a = 255;
        }
        else if (activeLayer === 'density') {
            const v = clamp(m.density / 9, 0, 1);
            r = Math.round(235 * v);
            g = Math.round(210 * (1 - v));
            b = Math.round(175 * (1 - v));
            a = 255;
        }
        else if (activeLayer === 'velocity') {
            const v = clamp((Math.abs(vx[i]) + Math.abs(vy[i])) / 12, 0, 1);
            r = Math.round(35 + 200 * v);
            g = Math.round(90 + 140 * v);
            b = Math.round(120 + 100 * (1 - v));
            a = 255;
        }
        else if (activeLayer === 'charge') {
            const v = charge[i] / 127;
            r = v > 0 ? 255 : 40;
            g = Math.round(120 + 110 * (1 - Math.abs(v)));
            b = v < 0 ? 255 : 65;
            a = 255;
        }
        else if (activeLayer === 'acidity') {
            const v = clamp((m.acidity + 1) / 2, 0, 1);
            r = Math.round(230 * v);
            g = 180;
            b = Math.round(230 * (1 - v));
            a = 255;
        }
        else if (activeLayer === 'oxygen') {
            const v = m.oxygen ?? (id === MATERIAL.AIR ? 0.21 : 0);
            r = 45;
            g = Math.round(65 + 190 * v);
            b = Math.round(90 + 160 * v);
            a = 255;
        }
        else if (activeLayer === 'reaction') {
            const hot = temp[i] > m.ignition || id === MATERIAL.FIRE || pressure[i] > 70;
            r = hot ? 245 : 40;
            g = hot ? 110 : 45;
            b = hot ? 45 : 50;
            a = hot ? 255 : 180;
        }
        else if (activeLayer === 'strength') {
            const v = clamp(m.strength / 1, 0, 1);
            r = Math.round(190 * (1 - v));
            g = Math.round(70 + 160 * v);
            b = 85;
            a = 255;
        }
        else if (m.glow && activeLayer === 'normal') {
            const pulse = .82 + .18 * Math.sin(performance.now() / 90 + i);
            r = Math.min(255, Math.round(r * pulse + 35));
            g = Math.min(255, Math.round(g * pulse + 15));
        }
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = a;
    }
    off.getContext('2d').putImageData(render.img, 0, 0);
    const dpr = Math.min(2, devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#071018';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.drawImage(off, 0, 0);
    if (selection) {
        ctx.strokeStyle = '#f1e6c6';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.setLineDash([3 / camera.zoom, 2 / camera.zoom]);
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
        ctx.setLineDash([]);
    }
    ctx.restore();
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.clearRect(0, 0, fxCanvas.width / dpr, fxCanvas.height / dpr);
    drawSensor();
}
function pulseFx(x, y, r) { if (!effectsQuality)
    return; const el = document.createElement('span'); el.className = 'impact'; el.style.left = `${camera.x + x * camera.zoom}px`; el.style.top = `${camera.y + y * camera.zoom}px`; el.style.setProperty('--r', `${r * camera.zoom}px`); document.querySelector('#simFrame').appendChild(el); setTimeout(() => el.remove(), 520); }
function drawSensor() {
    if (selectedSensor < 0 || mat[selectedSensor] !== MATERIAL.SENSOR) {
        document.querySelector('#sensorPanel').hidden = true;
        return;
    }
    document.querySelector('#sensorPanel').hidden = false;
    const t = temp[selectedSensor], p = pressure[selectedSensor];
    document.querySelector('#sensorReadout').textContent = `${t} °C · ${p} kPa · заряд ${charge[selectedSensor]}`;
    if (stepCounter % 6 === 0) {
        sensorSeries.temp.push(t);
        sensorSeries.pressure.push(p);
        if (sensorSeries.temp.length > 80) {
            sensorSeries.temp.shift();
            sensorSeries.pressure.shift();
        }
    }
    const dpr = Math.min(2, devicePixelRatio || 1), w = miniGraph.width / dpr, h = miniGraph.height / dpr;
    graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    graphCtx.clearRect(0, 0, w, h);
    const draw = (arr, min, max, stroke) => { if (arr.length < 2)
        return; graphCtx.strokeStyle = stroke; graphCtx.lineWidth = 1.5; graphCtx.beginPath(); arr.forEach((v, i) => { const x = i / (arr.length - 1) * w, y = h - clamp((v - min) / (max - min), 0, 1) * h; i ? graphCtx.lineTo(x, y) : graphCtx.moveTo(x, y); }); graphCtx.stroke(); };
    draw(sensorSeries.temp, -100, 1200, '#e58544');
    draw(sensorSeries.pressure, -20, 180, '#5aa2be');
}
function frame(now) {
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    fpsSamples.push(1000 / Math.max(1, dt));
    if (now - lastFpsCheck > 2000) {
        const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
        effectsQuality = avg < 38 ? 0 : avg < 52 ? .5 : 1;
        document.documentElement.dataset.effects = String(effectsQuality);
        fpsSamples = [];
        lastFpsCheck = now;
    }
    if (playing) {
        simAccumulator += dt * speed;
        const tickMs = 16.67;
        let loops = 0;
        while (simAccumulator >= tickMs && loops < 8) {
            simulateOne();
            simAccumulator -= tickMs;
            loops++;
        }
        takeHistory(now);
    }
    render();
    if (currentTask && stepCounter % 20 === 0) {
        const task = tasks.find(t => t[0] === currentTask);
        if (task && task[4]()) {
            currentTask = null;
            playing = false;
            toast('Задача выполнена', 'success');
            document.querySelector('#taskBadge').hidden = true;
            sound('success');
            navigator.vibrate?.([35, 40, 70]);
        }
    }
    if (now - lastAutosave > 5000) {
        saveAutosave();
        lastAutosave = now;
    }
    requestAnimationFrame(frame);
}
