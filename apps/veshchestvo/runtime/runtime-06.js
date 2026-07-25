function paintPoint(x, y, tool = selectedTool) {
    if (!inBounds(x, y, width, height))
        return;
    const id = selectedMaterial, r = Math.max(1, brushSize);
    if (tool === 'brush' || tool === 'eraser' || tool === 'heater' || tool === 'cooler' || tool === 'pressure' || tool === 'fan' || tool === 'electric' || tool === 'drain' || tool === 'generator' || tool === 'wall' || tool === 'brittle' || tool === 'sensor' || tool === 'spray') {
        for (let yy = y - r; yy <= y + r; yy++)
            for (let xx = x - r; xx <= x + r; xx++) {
                if (!inBounds(xx, yy, width, height) || Math.hypot(xx - x, yy - y) > r)
                    continue;
                if (tool === 'spray' && rand() > .35)
                    continue;
                const i = indexOfCell(xx, yy, width);
                if (tool === 'eraser') {
                    mat[i] = MATERIAL.EMPTY;
                    temp[i] = AMBIENT;
                    pressure[i] = 0;
                    charge[i] = 0;
                }
                else if (tool === 'heater')
                    temp[i] = clamp(temp[i] + 35, -2000, 32000);
                else if (tool === 'cooler')
                    temp[i] = clamp(temp[i] - 35, -2000, 32000);
                else if (tool === 'pressure')
                    pressure[i] = clamp(pressure[i] + 18, -32000, 32000);
                else if (tool === 'fan') {
                    const [gx, gy] = gravityVector();
                    vx[i] = clamp(vx[i] + gx * 3 + (gy ? 3 : 0), -12, 12);
                    vy[i] = clamp(vy[i] + gy * 3 + (gx ? 3 : 0), -12, 12);
                }
                else if (tool === 'electric') {
                    charge[i] = 127;
                    if (mat[i] === MATERIAL.EMPTY)
                        mat[i] = MATERIAL.SPARK;
                }
                else if (tool === 'drain')
                    setCell(xx, yy, MATERIAL.DRAIN);
                else if (tool === 'generator')
                    setCell(xx, yy, MATERIAL.GENERATOR, null, id);
                else if (tool === 'wall')
                    setCell(xx, yy, MATERIAL.WALL);
                else if (tool === 'brittle')
                    setCell(xx, yy, MATERIAL.BRITTLE_WALL);
                else if (tool === 'sensor') {
                    setCell(xx, yy, MATERIAL.SENSOR);
                    selectedSensor = i;
                }
                else {
                    setCell(xx, yy, id);
                    if (id === MATERIAL.EXPLOSIVE)
                        usedExplosive++;
                }
            }
    }
}
function floodFill(x, y) { if (!inBounds(x, y, width, height))
    return; const target = mat[indexOfCell(x, y, width)], replacement = selectedMaterial; if (target === replacement)
    return; const stack = [[x, y]], seen = new Uint8Array(size); let budget = 40000; while (stack.length && budget--) {
    const [cx, cy] = stack.pop(), i = indexOfCell(cx, cy, width);
    if (seen[i] || mat[i] !== target)
        continue;
    seen[i] = 1;
    setCell(cx, cy, replacement);
    if (cx > 0)
        stack.push([cx - 1, cy]);
    if (cx < width - 1)
        stack.push([cx + 1, cy]);
    if (cy > 0)
        stack.push([cx, cy - 1]);
    if (cy < height - 1)
        stack.push([cx, cy + 1]);
} }
function applyShape(start, end) { const id = selectedMaterial, r = Math.max(1, brushSize); if (selectedTool === 'line')
    line(start.x, start.y, end.x, end.y, id, null, r);
else if (selectedTool === 'rect') {
    const x0 = Math.min(start.x, end.x), x1 = Math.max(start.x, end.x), y0 = Math.min(start.y, end.y), y1 = Math.max(start.y, end.y);
    for (let x = x0; x <= x1; x++) {
        circle(x, y0, r, id);
        circle(x, y1, r, id);
    }
    for (let y = y0; y <= y1; y++) {
        circle(x0, y, r, id);
        circle(x1, y, r, id);
    }
}
else if (selectedTool === 'circle') {
    circle(start.x, start.y, Math.round(Math.hypot(end.x - start.x, end.y - start.y)), id);
}
else if (selectedTool === 'select') {
    selection = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x) + 1, h: Math.abs(end.y - start.y) + 1 };
    analyzeSelection();
} }
function analyzeSelection() { if (!selection)
    return; const counts = new Map(); for (let y = 0; y < selection.h; y++)
    for (let x = 0; x < selection.w; x++) {
        const xx = selection.x + x, yy = selection.y + y;
        if (!inBounds(xx, yy, width, height))
            continue;
        const id = mat[indexOfCell(xx, yy, width)];
        if (id !== MATERIAL.EMPTY)
            counts.set(id, (counts.get(id) || 0) + 1);
    } const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${materials[id].name} ${n}`).join(' · '); toast(top ? `Состав области: ${top}` : 'Выделенная область пуста'); }
function copySelection() { if (!selection)
    return toast('Сначала выделите область', 'error'); clipboard = { w: selection.w, h: selection.h, mat: new Uint16Array(selection.w * selection.h), temp: new Int16Array(selection.w * selection.h) }; for (let y = 0; y < selection.h; y++)
    for (let x = 0; x < selection.w; x++) {
        const s = indexOfCell(selection.x + x, selection.y + y, width), d = y * selection.w + x;
        clipboard.mat[d] = mat[s];
        clipboard.temp[d] = temp[s];
    } toast('Область скопирована'); }
function pasteAt(x, y) { if (!clipboard)
    return toast('Буфер пуст', 'error'); pushUndo(); for (let yy = 0; yy < clipboard.h; yy++)
    for (let xx = 0; xx < clipboard.w; xx++) {
        if (!inBounds(x + xx, y + yy, width, height))
            continue;
        const s = yy * clipboard.w + xx, d = indexOfCell(x + xx, y + yy, width);
        mat[d] = clipboard.mat[s];
        temp[d] = clipboard.temp[s];
    } toast('Область вставлена'); }
canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) {
    const pts = [...pointers.values()];
    gesture = { distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: camera.zoom, center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, camera: { ...camera } };
    drawing = null;
    return;
} const w = screenToWorld(e.clientX, e.clientY); if (selectedTool === 'eyedropper') {
    if (inBounds(w.x, w.y, width, height)) {
        selectedMaterial = mat[indexOfCell(w.x, w.y, width)];
        selectMaterial(selectedMaterial);
    }
    return;
} if (selectedTool === 'fill') {
    pushUndo();
    floodFill(w.x, w.y);
    return;
} if (selectedTool === 'paste') {
    pasteAt(w.x, w.y);
    return;
} if (panMode || selectedTool === 'pan') {
    drawing = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
    return;
} pushUndo(); drawing = { mode: 'draw', start: w, last: w }; if (!['line', 'rect', 'circle', 'select'].includes(selectedTool))
    paintPoint(w.x, w.y); });
canvas.addEventListener('pointermove', e => { if (!pointers.has(e.pointerId))
    return; e.preventDefault(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2 && gesture) {
    const pts = [...pointers.values()], distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const old = gesture.zoom, newZoom = clamp(gesture.zoom * distance / gesture.distance, .7, 14);
    const r = canvas.getBoundingClientRect();
    const wx = (gesture.center.x - r.left - gesture.camera.x) / old, wy = (gesture.center.y - r.top - gesture.camera.y) / old;
    camera.zoom = newZoom;
    camera.x = center.x - r.left - wx * newZoom;
    camera.y = center.y - r.top - wy * newZoom;
    return;
} if (!drawing)
    return; if (drawing.mode === 'pan') {
    camera.x += e.clientX - drawing.lastX;
    camera.y += e.clientY - drawing.lastY;
    drawing.lastX = e.clientX;
    drawing.lastY = e.clientY;
    return;
} const w = screenToWorld(e.clientX, e.clientY); if (!['line', 'rect', 'circle', 'select'].includes(selectedTool)) {
    if (selectedTool === 'brush')
        line(drawing.last.x, drawing.last.y, w.x, w.y, selectedMaterial, null, Math.max(1, brushSize));
    else if (selectedTool === 'eraser')
        line(drawing.last.x, drawing.last.y, w.x, w.y, MATERIAL.EMPTY, null, Math.max(1, brushSize));
    else {
        const dx = w.x - drawing.last.x, dy = w.y - drawing.last.y, steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
        for (let s = 0; s <= steps; s++)
            paintPoint(Math.round(drawing.last.x + dx * s / steps), Math.round(drawing.last.y + dy * s / steps));
    }
} drawing.last = w; });
function endPointer(e) { pointers.delete(e.pointerId); if (pointers.size < 2)
    gesture = null; if (drawing?.mode === 'draw' && ['line', 'rect', 'circle', 'select'].includes(selectedTool)) {
    applyShape(drawing.start, drawing.last);
} drawing = null; }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', e => e.preventDefault());
