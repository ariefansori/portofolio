/**
 * TRACK EDITOR ENGINE (editor.js)
 */
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;

let objectsData = {
    checkpoints: [],
    concreteZones: [],
    parkingLots: [],
    sandTraps: [],
    lakes: [],
    buildings: [],
    grandstands: [],
    crowds: [],
    bushes: [],
    props: [],
    prefabs: []
};

// Modul pattern (grass + concrete) — diimpor dinamis karena editor bukan ES module
let Patterns = null;

// Template objek dasar — dipisah ke objects.templates.json agar objects.json
// hanya berisi daftar objek (modularisasi data)
let templatesData = {};

const CONCRETE_PATTERN_OPTIONS = [
    ['grid', 'Grid'], ['stripes', 'Strip'], ['honeycomb', 'Honeycomb'],
    ['tiles', 'Tiles'], ['crosshatch', 'Crosshatch'], ['plain', 'Plain']
];

// State Kamera & Zoom
let camera = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, zoom: 0.35 };
let showGrid = true;

// State Interaksi & Seleksi
let selectedObject = null; 
let draggedObject = null;
let activeTransformMode = null; // 'move', 'rotate', 'resize_w', 'resize_h'
let isPanning = false;
let panStart = { x: 0, y: 0 };
let dragOffset = { x: 0, y: 0, startRot: 0, startW: 0, startH: 0 };

// Inisialisasi Canvas
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');

async function initEditor() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Modul pattern (opsional — editor tetap jalan tanpa preview pattern)
    try {
        Patterns = await import('./js/patterns.js');
    } catch (e) {
        console.warn('Modul patterns.js tidak tersedia, preview pattern dinonaktifkan:', e);
    }

    // Muat track dari track.json (jika TrackRenderer tersedia)
    if (typeof TrackRenderer !== 'undefined' && TrackRenderer.load) {
        try {
            await TrackRenderer.load('track.json');
        } catch (e) {
            console.warn("TrackRenderer load failed:", e);
        }
    }

    // Muat template objek dasar (blok `templates`) dari berkas terpisah
    try {
        const response = await fetch('objects.templates.json');
        if (response.ok) {
            const tplData = await response.json();
            templatesData = tplData.templates || tplData || {};
        }
    } catch (e) {
        console.log("objects.templates.json tidak ditemukan — template diambil dari objek pertama tiap kategori");
    }

    // Muat objek dekorasi dari objects.json
    try {
        const response = await fetch('objects.json');
        if (response.ok) objectsData = await response.json();
        // Kompatibilitas: berkas lama masih memuat blok `templates` di dalam objects.json
        if (objectsData.templates) {
            templatesData = objectsData.templates;
            delete objectsData.templates;
        }
    } catch (e) {
        console.log("Menggunakan data objek standar (objects.json tidak ditemukan)");
    }

    setupEventListeners();
    renderObjectsTree();
    renderPropertiesForm();
    requestAnimationFrame(drawEditor);
}

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

/**
 * Preview semak (bush) di editor: lingkaran berdaun rongga + outline seleksi.
 * Dipakai untuk kategori bushes, prop bertipe bush, dan prefab bertipe bush.
 */
function drawBushPreview(g, x, y, r, leafColor) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.beginPath(); g.ellipse(0, r * 0.25, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const rad = r * 0.6;
        g.fillStyle = leafColor || '#2f7d32';
        g.beginPath(); g.arc(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.82, r * 0.36, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#ec4899';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.restore();
}

// Konversi Koordinat Layar <-> Dunia
function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = sx - rect.left;
    const canvasY = sy - rect.top;
    
    const wx = (canvasX - canvas.width / 2) / camera.zoom + camera.x;
    const wy = (canvasY - canvas.height / 2) / camera.zoom + camera.y;
    return { x: wx, y: wy };
}

/**
 * UTAMA: RENDER LOOP EDITOR
 */
function drawEditor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. RENDER DASAR RUMPUT (pola stripes + noise bila modul pattern tersedia)
    if (Patterns && Patterns.drawGrassPattern) {
        Patterns.drawGrassPattern(ctx, WORLD_WIDTH, WORLD_HEIGHT);
    } else if (typeof TrackRenderer !== 'undefined' && TrackRenderer.drawGrass) {
        TrackRenderer.drawGrass(ctx);
    } else {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    // 2. RENDER ELEMEN LANDSKAP (DI ATAS RUMPUT, DI BAWAH JALAN)
    (objectsData.concreteZones || []).forEach(cz => {
        if (Patterns && Patterns.drawConcreteZone) {
            Patterns.drawConcreteZone(ctx, cz);
        } else {
            ctx.fillStyle = cz.fillColor || '#8f9bba';
            ctx.fillRect(cz.x, cz.y, cz.w, cz.h);
        }
        ctx.strokeStyle = cz.gridColor || '#7884a5';
        ctx.lineWidth = 1;
        ctx.strokeRect(cz.x, cz.y, cz.w, cz.h);
    });

    (objectsData.parkingLots || []).forEach(pl => {
        ctx.fillStyle = pl.fillColor || '#9aa5c4';
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(pl.x + 4, pl.y + 4, pl.w - 8, pl.h - 8);
    });

    (objectsData.sandTraps || []).forEach(s => {
        ctx.fillStyle = s.fillColor || '#d97706';
        ctx.fillRect(s.x, s.y, s.w, s.h);
    });

    (objectsData.lakes || []).forEach(l => {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rot || 0);
        ctx.fillStyle = l.waterColor || 'rgba(37, 99, 235, 0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, (l.w || 100) / 2, (l.h || 100) / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 3. RENDER JALAN UTAMA (TARMAC)
    if (typeof TrackRenderer !== 'undefined' && TrackRenderer.drawTarmac) {
        TrackRenderer.drawTarmac(ctx);
    }

    // Border Dunia
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Grid Overlay
    if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1 / camera.zoom;
        const gridSize = 100;
        for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke();
        }
        for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y); ctx.stroke();
        }
    }

    // 4. RENDER OBJEK ATAS (CHECKPOINT, BUILDING, PROP, PREFAB)
    (objectsData.checkpoints || []).forEach((cp, idx) => {
        ctx.save();
        ctx.translate(cp.x, cp.y);
        ctx.rotate(cp.rot || 0);
        ctx.fillStyle = idx === 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(34, 197, 94, 0.3)';
        ctx.strokeStyle = idx === 0 ? '#3b82f6' : '#22c55e';
        ctx.lineWidth = 2;
        ctx.fillRect(-cp.w / 2, -cp.h / 2, cp.w, cp.h);
        ctx.strokeRect(-cp.w / 2, -cp.h / 2, cp.w, cp.h);

        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(10, 12 / camera.zoom)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(cp.label || cp.id, 0, 4);
        ctx.restore();
    });

    (objectsData.buildings || []).forEach(b => {
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate(b.rot || 0);
        ctx.fillStyle = b.color || '#334155';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.strokeStyle = b.accent || '#e2e8f0';
        ctx.lineWidth = 3;
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.name || b.id, 0, 3);
        ctx.restore();
    });

    (objectsData.grandstands || []).forEach(gs => {
        ctx.save();
        ctx.translate(gs.x + gs.w / 2, gs.y + gs.h / 2);
        ctx.rotate(gs.rot || 0);
        ctx.fillStyle = '#334155';
        ctx.fillRect(-gs.w / 2, -gs.h / 2, gs.w, gs.h);
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.strokeRect(-gs.w / 2, -gs.h / 2, gs.w, gs.h);
        ctx.restore();
    });

    // Crowd: area rectangle + titik penonton (preview jumlah vs kapasitas)
    (objectsData.crowds || []).forEach(cw => {
        const personRadius = cw.personRadius || 10;
        const spacing = personRadius * 2 + 6;
        const cols = Math.max(0, Math.floor(cw.w / spacing));
        const rows = Math.max(0, Math.floor(cw.h / spacing));
        const capacity = cols * rows;
        const shown = Math.min(cw.count || 0, capacity);

        ctx.save();
        ctx.translate(cw.x + cw.w / 2, cw.y + cw.h / 2);
        ctx.rotate(cw.rot || 0);
        ctx.fillStyle = 'rgba(236, 72, 153, 0.10)';
        ctx.fillRect(-cw.w / 2, -cw.h / 2, cw.w, cw.h);
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(-cw.w / 2, -cw.h / 2, cw.w, cw.h);
        ctx.setLineDash([]);

        const startX = -cols * spacing / 2 + spacing / 2;
        const startY = -rows * spacing / 2 + spacing / 2;
        ctx.fillStyle = '#fde047';
        for (let i = 0; i < shown; i++) {
            const col = i % cols;
            const row = (i / cols) | 0;
            ctx.beginPath();
            ctx.arc(startX + col * spacing, startY + row * spacing, personRadius * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = (cw.count || 0) > capacity ? '#f87171' : '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${shown}/${cw.count || 0}`, 0, -cw.h / 2 - 8);
        ctx.restore();
    });

    // Semak (bush): lingkaran berdaun rongga — preview sederhana di editor
    (objectsData.bushes || []).forEach(b => {
        drawBushPreview(ctx, b.x, b.y, b.r || 50, b.leafColor);
    });

    (objectsData.props || []).forEach(p => {
        if (p.type === 'bush') {
            // Prop bush tampil seperti semak biasa (di atas mobil saat balapan)
            drawBushPreview(ctx, p.x, p.y, p.r || 50, p.leafColor);
            return;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        if (p.type === 'tires') {
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(0, 0, p.r || 20, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#374151';
            ctx.beginPath(); ctx.arc(0, 0, (p.r || 20) * 0.4, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'cone') {
            ctx.fillStyle = '#f97316';
            ctx.beginPath(); ctx.arc(0, 0, p.r || 12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, (p.r || 12) * 0.5, 0, Math.PI * 2); ctx.fill();
        } else if (p.type === 'road_barrier') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(-(p.w || 38) / 2 + 2, -(p.h || 14) / 2 + 3, p.w || 38, p.h || 14);
            ctx.fillStyle = p.color || '#ef4444';
            ctx.fillRect(-(p.w || 38) / 2, -(p.h || 14) / 2, p.w || 38, p.h || 14);
        }
        ctx.restore();
    });

    (objectsData.prefabs || []).forEach(pf => {
        const kind = pf.prefab;

        if (pf.points) {
            // Garis penghubung grup hanya untuk node kecil (cone/tires);
            // bush digambar sebagai lingkaran berdaun yang saling menumpuk.
            if (kind !== 'bush') {
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 2;
                ctx.beginPath();
                pf.points.forEach((pt, i) => {
                    if (i === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                ctx.stroke();
            }

            pf.points.forEach(pt => {
                if (kind === 'tires') {
                    // Kumpulan ban: lingkaran gelap + rim abu (mirip prop tires)
                    ctx.fillStyle = '#1e293b';
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, pf.r || 20, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.fillStyle = '#374151';
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, (pf.r || 20) * 0.4, 0, Math.PI * 2); ctx.fill();
                } else if (kind === 'bush') {
                    drawBushPreview(ctx, pt.x, pt.y, pf.r || 50, pf.leafColor);
                } else {
                    ctx.fillStyle = '#f97316';
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, pf.r || 6, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
        if (pf.barriers) {
            pf.barriers.forEach((b, bIdx) => {
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(b.rot || 0);
                // Warna selang-seling sama seperti hasil bake di game
                ctx.fillStyle = (bIdx % 2 === 0) ? '#ef4444' : '#e2e8f0';
                ctx.fillRect(-(pf.width || 38) / 2, -(pf.height || 14) / 2, pf.width || 38, pf.height || 14);
                ctx.restore();
            });
        }
    });

    // 5. HIGHLIGHT TERPILIH DAN CONTROL GIZMO
    if (selectedObject && selectedObject.ref) {
        const obj = selectedObject.ref;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);

        const bounds = getObjectBoundingBox(obj, selectedObject.category, getSelectedParent(selectedObject));
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();

        drawTransformGizmo(ctx, bounds, obj, selectedObject.category);
    }

    ctx.restore();
    requestAnimationFrame(drawEditor);
}

function drawTransformGizmo(ctx, bounds, obj, category = null) {
    const handleSize = 16 / camera.zoom;
    const fontSize = Math.max(9, handleSize * 0.65);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "Font Awesome 6 Free"`;

    // 1. Move Handle Center
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    
    // Move Icon (\uf0b2 - fa-arrows-up-down-left-right)
    ctx.fillStyle = '#ffffff';
    ctx.fillText('\uf0b2', cx, cy);

    // Induk prefab: gizmo hanya untuk geser (tanpa rotate/resize)
    if (Array.isArray(obj.points) || Array.isArray(obj.barriers)) {
        ctx.restore();
        return;
    }

    // 2. Rotate Handle Top (hanya objek yang punya properti rot)
    if ('rot' in obj) {
        const rotY = bounds.y - 25 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(cx, bounds.y);
        ctx.lineTo(cx, rotY);
        ctx.strokeStyle = '#eab308';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, rotY, handleSize / 1.3, 0, Math.PI * 2);
        ctx.fillStyle = '#eab308';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Rotate Icon (\uf2f9 - fa-rotate)
        ctx.fillStyle = '#0f172a';
        ctx.fillText('\uf2f9', cx, rotY);
    }

    // 3. Resize W (Kanan)
    if (obj.w !== undefined) {
        const rx = bounds.x + bounds.w;
        ctx.fillStyle = '#10b981';
        ctx.fillRect(rx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(rx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);

        // Resize W Icon (\uf337 - fa-arrows-left-right)
        ctx.fillStyle = '#ffffff';
        ctx.fillText('\uf337', rx, cy);
    }

    // 4. Resize H (Bawah)
    if (obj.h !== undefined) {
        const ry = bounds.y + bounds.h;
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(cx - handleSize / 2, ry - handleSize / 2, handleSize, handleSize);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(cx - handleSize / 2, ry - handleSize / 2, handleSize, handleSize);

        // Resize H Icon (\uf338 - fa-arrows-up-down)
        ctx.fillStyle = '#ffffff';
        ctx.fillText('\uf338', cx, ry);
    }

    ctx.restore();
}

function getObjectBoundingBox(obj, category, parent = null) {
    let x = obj.x || 0;
    let y = obj.y || 0;
    let w = obj.w || 20;
    let h = obj.h || 20;

    // Prefab tidak punya x/y/w/h
    if (category === 'prefabs') {
        // Anak prefab (satu titik/barrier): box terpusat pada posisinya
        if (!Array.isArray(obj.points) && !Array.isArray(obj.barriers)) {
            let childW = 20, childH = 20;
            if (parent && Array.isArray(parent.points)) {
                childW = childH = (parent.r || 12) * 2;
            } else if (parent && Array.isArray(parent.barriers)) {
                childW = parent.width || 38;
                childH = parent.height || 14;
            }
            return { x: x - childW / 2, y: y - childH / 2, w: childW, h: childH };
        }

        const nodes = [];
        (obj.points || []).forEach(p => nodes.push({ x: p.x, y: p.y, pad: obj.r || 6 }));
        (obj.barriers || []).forEach(b => nodes.push({ x: b.x, y: b.y, pad: Math.max(obj.width || 38, obj.height || 14) / 2 }));

        if (nodes.length) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                minX = Math.min(minX, n.x - n.pad);
                maxX = Math.max(maxX, n.x + n.pad);
                minY = Math.min(minY, n.y - n.pad);
                maxY = Math.max(maxY, n.y + n.pad);
            });
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        return { x, y, w, h };
    }

    if (category === 'checkpoints' || category === 'props' || category === 'lakes' || category === 'bushes') {
        if (obj.r) return { x: x - obj.r, y: y - obj.r, w: obj.r * 2, h: obj.r * 2 };
        return { x: x - w / 2, y: y - h / 2, w, h };
    }
    return { x, y, w, h };
}

function checkGizmoHit(wx, wy, bounds, obj) {
    const handleRadius = (15 / camera.zoom);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;

    const isPrefabParent = Array.isArray(obj.points) || Array.isArray(obj.barriers);
    const rotY = bounds.y - 25 / camera.zoom;
    if (!isPrefabParent && 'rot' in obj && Math.hypot(wx - cx, wy - rotY) <= handleRadius) return 'rotate';
    if (Math.hypot(wx - cx, wy - cy) <= handleRadius) return 'move';
    if (obj.w !== undefined && Math.hypot(wx - (bounds.x + bounds.w), wy - cy) <= handleRadius) return 'resize_w';
    if (obj.h !== undefined && Math.hypot(wx - cx, wy - (bounds.y + bounds.h)) <= handleRadius) return 'resize_h';

    return null;
}

/** Objek induk dari seleksi child (untuk ukuran bounds) */
function getSelectedParent(sel) {
    if (!sel || !sel.subKey) return null;
    const list = objectsData[sel.category];
    return Array.isArray(list) ? (list[sel.index] || null) : null;
}

/** Titik jangkar drag: induk prefab memakai sudut kiri-atas bounds isinya (karena tidak punya x/y) */
function getDragAnchor(obj, category) {
    if (category === 'prefabs' && (Array.isArray(obj.points) || Array.isArray(obj.barriers))) {
        const b = getObjectBoundingBox(obj, category);
        return { x: b.x, y: b.y };
    }
    return { x: obj.x || 0, y: obj.y || 0 };
}

/** Geser seluruh isi prefab secara relatif (points/barriers ikut bergeser) */
function translatePrefabContents(obj, dx, dy) {
    if (!dx && !dy) return;
    (obj.points || []).forEach(pt => { pt.x += dx; pt.y += dy; });
    (obj.barriers || []).forEach(b => { b.x += dx; b.y += dy; });
}

function findObjectAt(wx, wy) {
    // Urut dari objek di atas ke lapisan tanah, agar objek prefab tidak tertutup zona beton/parkir/pasir
    const categories = ['props', 'bushes', 'checkpoints', 'buildings', 'grandstands', 'crowds', 'prefabs', 'lakes', 'parkingLots', 'sandTraps', 'concreteZones'];
    for (const cat of categories) {
        const list = objectsData[cat] || [];
        for (let i = list.length - 1; i >= 0; i--) {
            const obj = list[i];

            if (cat === 'prefabs') {
                if (obj.points) {
                    for (let pIdx = 0; pIdx < obj.points.length; pIdx++) {
                        const pt = obj.points[pIdx];
                        if (Math.hypot(wx - pt.x, wy - pt.y) <= (obj.r || 10)) {
                            return { category: cat, index: i, subKey: 'points', subIndex: pIdx, ref: pt };
                        }
                    }
                }
                if (obj.barriers) {
                    for (let bIdx = 0; bIdx < obj.barriers.length; bIdx++) {
                        const b = obj.barriers[bIdx];
                        const bw = obj.width || 38, bh = obj.height || 14;
                        if (wx >= b.x - bw / 2 && wx <= b.x + bw / 2 && wy >= b.y - bh / 2 && wy <= b.y + bh / 2) {
                            return { category: cat, index: i, subKey: 'barriers', subIndex: bIdx, ref: b };
                        }
                    }
                }
            }

            const bounds = getObjectBoundingBox(obj, cat);
            if (wx >= bounds.x && wx <= bounds.x + bounds.w && wy >= bounds.y && wy <= bounds.y + bounds.h) {
                return { category: cat, index: i, ref: obj };
            }
        }
    }
    return null;
}

function setupEventListeners() {
    document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(camera.zoom * 1.25));
    document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(camera.zoom / 1.25));
    document.getElementById('btnResetView').addEventListener('click', () => {
        camera = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, zoom: 0.35 };
        updateZoomDisplay();
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        setZoom(camera.zoom * (e.deltaY < 0 ? 1.15 : 0.85));
    }, { passive: false });

    document.getElementById('btnGridToggle').addEventListener('click', () => { showGrid = !showGrid; });
    document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelectedObject);

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            deleteSelectedObject();
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY);

        if (e.button === 1 || e.shiftKey) {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            return;
        }

        if (e.button === 0) {
            if (selectedObject && selectedObject.ref) {
                const bounds = getObjectBoundingBox(selectedObject.ref, selectedObject.category, getSelectedParent(selectedObject));
                const gizmoHit = checkGizmoHit(worldPos.x, worldPos.y, bounds, selectedObject.ref);
                if (gizmoHit) {
                    activeTransformMode = gizmoHit;
                    draggedObject = selectedObject;
                    const anchor = getDragAnchor(selectedObject.ref, selectedObject.category);
                    dragOffset = {
                        x: worldPos.x - anchor.x,
                        y: worldPos.y - anchor.y
                    };
                    return;
                }
            }

            const hit = findObjectAt(worldPos.x, worldPos.y);
            if (hit) {
                selectObject(hit, true);
                draggedObject = hit;
                activeTransformMode = 'move';
                const hitAnchor = getDragAnchor(hit.ref, hit.category);
                dragOffset = { x: worldPos.x - hitAnchor.x, y: worldPos.y - hitAnchor.y };
            } else {
                selectObject(null);
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const mxElem = document.getElementById('mouseWorldX');
        const myElem = document.getElementById('mouseWorldY');
        if (mxElem) mxElem.innerText = Math.round(worldPos.x);
        if (myElem) myElem.innerText = Math.round(worldPos.y);

        if (isPanning) {
            camera.x -= (e.clientX - panStart.x) / camera.zoom;
            camera.y -= (e.clientY - panStart.y) / camera.zoom;
            panStart = { x: e.clientX, y: e.clientY };
        } else if (draggedObject && draggedObject.ref && activeTransformMode) {
            const obj = draggedObject.ref;

            if (activeTransformMode === 'move') {
                const isPrefabParent = draggedObject.category === 'prefabs' && !draggedObject.subKey &&
                    (Array.isArray(obj.points) || Array.isArray(obj.barriers));

                if (isPrefabParent) {
                    // Induk prefab: geser isi prefab secara relatif (points/barriers ikut bergeser)
                    const anchor = getDragAnchor(obj, 'prefabs');
                    const targetX = worldPos.x - dragOffset.x;
                    const targetY = worldPos.y - dragOffset.y;
                    translatePrefabContents(obj, Math.round(targetX - anchor.x), Math.round(targetY - anchor.y));
                } else {
                    // Objek biasa & anak prefab (titik/barrier): digeser langsung
                    obj.x = Math.round(worldPos.x - dragOffset.x);
                    obj.y = Math.round(worldPos.y - dragOffset.y);
                }
            } else if (activeTransformMode === 'rotate') {
                const bounds = getObjectBoundingBox(obj, draggedObject.category, getSelectedParent(draggedObject));
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                const angle = Math.atan2(worldPos.y - cy, worldPos.x - cx);
                obj.rot = parseFloat(angle.toFixed(4));
            } else if (activeTransformMode === 'resize_w') {
                const newW = Math.max(20, Math.round(worldPos.x - (obj.x || 0)));
                obj.w = newW;
            } else if (activeTransformMode === 'resize_h') {
                const newH = Math.max(20, Math.round(worldPos.y - (obj.y || 0)));
                obj.h = newH;
            }
            updatePropertiesFormValues();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        draggedObject = null;
        activeTransformMode = null;
    });

    document.querySelectorAll('.btn-palette-add').forEach(btn => {
        btn.addEventListener('click', () => addNewObject(btn.getAttribute('data-type')));
    });

    document.getElementById('btnExportClipboard').addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(objectsData, null, 2)).then(() => showToast('JSON telah disalin ke clipboard!'));
    });

    const importModal = document.getElementById('importModal');
    document.getElementById('btnImportJson').addEventListener('click', () => {
        document.getElementById('importJsonTextarea').value = JSON.stringify(objectsData, null, 2);
        importModal.classList.remove('hidden');
    });
    document.getElementById('btnCloseImportModal').addEventListener('click', () => importModal.classList.add('hidden'));
    document.getElementById('btnCancelImport').addEventListener('click', () => importModal.classList.add('hidden'));
    document.getElementById('btnApplyImport').addEventListener('click', () => {
        try {
            const parsed = JSON.parse(document.getElementById('importJsonTextarea').value);
            // JSON lama berisi `templates` ikut terimpor ke berkas template terpisah
            if (parsed.templates) {
                templatesData = parsed.templates;
                delete parsed.templates;
            }
            objectsData = parsed;
            selectObject(null);
            renderObjectsTree();
            importModal.classList.add('hidden');
            showToast('Data JSON berhasil diimpor!');
        } catch (e) { alert('Format JSON tidak valid: ' + e.message); }
    });
}

function setZoom(newZoom) {
    camera.zoom = Math.min(Math.max(newZoom, 0.1), 3.0);
    updateZoomDisplay();
}

function updateZoomDisplay() {
    const zoomElem = document.getElementById('zoomDisplay');
    if (zoomElem) zoomElem.innerText = `${Math.round(camera.zoom * 100)}%`;
}

function selectObject(hit, autoScroll = false) {
    selectedObject = hit;
    const displayElem = document.getElementById('selectedObjectIdDisplay');
    if (hit && hit.ref) {
        displayElem.innerText = `${hit.category}${hit.subKey ? ` > ${hit.subKey}[${hit.subIndex}]` : ''} [${hit.ref.id || hit.ref.label || hit.index}]`;
    } else {
        displayElem.innerText = 'None';
    }
    renderObjectsTree();
    renderPropertiesForm();

    if (autoScroll && hit) {
        setTimeout(() => {
            const targetElem = document.querySelector(`[data-tree-id="${hit.category}_${hit.index}${hit.subKey ? `_${hit.subKey}_${hit.subIndex}` : ''}"]`);
            if (targetElem) {
                targetElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }
}

function deleteSelectedObject() {
    if (!selectedObject) return;
    const { category, index, subKey, subIndex } = selectedObject;

    if (subKey && subIndex !== undefined && objectsData[category][index]) {
        objectsData[category][index][subKey].splice(subIndex, 1);
    } else if (objectsData[category]) {
        objectsData[category].splice(index, 1);
    }
    selectObject(null);
    showToast('Item berhasil dihapus');
}

/**
 * Mengambil template objek agar properti objek baru persis seperti item di objects.json.
 * Urutan: objectsData.templates[...] -> clone item pertama kategori -> objek minimal.
 */
function getObjectTemplate(category, prefabName) {
    const templates = templatesData || {};
    let tpl = prefabName ? (templates.prefabs || {})[prefabName] : templates[category];

    if (!tpl && Array.isArray(objectsData[category]) && objectsData[category][0]) {
        tpl = objectsData[category][0];
    }

    if (!tpl) {
        console.warn(`Template "${prefabName || category}" tidak ditemukan di objects.templates.json`);
        tpl = { x: 0, y: 0 };
    }

    return JSON.parse(JSON.stringify(tpl));
}

function addNewObject(categoryType) {
    let category = categoryType;
    let prefabName = null;

    if (categoryType === 'prefab_barrier') { category = 'prefabs'; prefabName = 'barrier'; }
    else if (categoryType === 'prefab_cone') { category = 'prefabs'; prefabName = 'cone'; }
    else if (categoryType === 'prefab_tires') { category = 'prefabs'; prefabName = 'tires'; }
    else if (categoryType === 'prefab_bush') { category = 'prefabs'; prefabName = 'bush'; }

    const spawnX = Math.round(camera.x);
    const spawnY = Math.round(camera.y);
    const newObj = getObjectTemplate(category, prefabName);

    if (prefabName) {
        // Prefab di objects.json tidak punya x/y: posisi ditentukan oleh isinya
        if (!newObj.prefab) newObj.prefab = prefabName;
        if (prefabName === 'barrier') {
            const gap = (newObj.width || 38) + 4;
            newObj.barriers = [
                { x: spawnX, y: spawnY, rot: 0 },
                { x: spawnX + gap, y: spawnY, rot: 0 }
            ];
            delete newObj.points;
        } else {
            // Kumpulan titik (cone/tires/bush): jarak antar node menyesuaikan radius
            const gap = prefabName === 'cone' ? 80
                : prefabName === 'bush' ? (newObj.r || 50) + 40
                : (newObj.r || 20) * 2 + 10;
            newObj.points = [
                { x: spawnX, y: spawnY },
                { x: spawnX + gap, y: spawnY }
            ];
            delete newObj.barriers;
        }
    } else {
        newObj.x = spawnX;
        newObj.y = spawnY;
    }

    // ID unik hanya untuk tipe yang memang punya id di objects.json (mis. props tidak punya)
    if (Object.prototype.hasOwnProperty.call(newObj, 'id')) {
        const prefix = String(newObj.id || category).split('_')[0];
        newObj.id = `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
    }

    if (!objectsData[category]) objectsData[category] = [];
    objectsData[category].push(newObj);
    selectObject({ category, index: objectsData[category].length - 1, ref: newObj }, true);
    showToast(`Menambahkan ${categoryType}`);
}

function renderObjectsTree() {
    const treeContainer = document.getElementById('objectsTree');
    if (!treeContainer) return;
    treeContainer.innerHTML = '';
    let totalCount = 0;

    Object.keys(objectsData).forEach(cat => {
        const list = objectsData[cat];
        if (!Array.isArray(list)) return;
        totalCount += list.length;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'font-pixel text-[9px] text-slate-500 uppercase mt-2 mb-1 px-1 flex justify-between';
        groupHeader.innerHTML = `<span>${cat}</span><span>(${list.length})</span>`;
        treeContainer.appendChild(groupHeader);

        list.forEach((item, idx) => {
            const isParentSelected = selectedObject && selectedObject.category === cat && selectedObject.index === idx && !selectedObject.subKey;

            if (cat === 'prefabs') {
                const detailsElem = document.createElement('details');
                detailsElem.className = 'group border border-slate-800 rounded bg-slate-900/60 my-1';
                detailsElem.open = isParentSelected || (selectedObject && selectedObject.category === cat && selectedObject.index === idx);
                detailsElem.setAttribute('data-tree-id', `${cat}_${idx}`);

                const summaryElem = document.createElement('summary');
                summaryElem.className = `cursor-pointer px-2 py-1.5 text-xs flex items-center justify-between font-bold ${
                    isParentSelected ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50' : 'hover:bg-slate-800 text-slate-300'
                }`;
                summaryElem.innerHTML = `
                    <span class="flex items-center space-x-1.5">
                        <i class="fa-solid fa-chevron-right text-[10px] group-open:rotate-90 transition-transform"></i>
                        <span>${item.id || item.prefab || `Prefab #${idx + 1}`}</span>
                    </span>
                    <span class="flex items-center space-x-1.5">
                        <span class="text-[9px] text-emerald-500/80 font-mono-custom uppercase">${escapeAttr(item.prefab || '')}</span>
                        <i class="fa-solid fa-cubes text-emerald-400 text-[10px]"></i>
                    </span>
                `;

                summaryElem.addEventListener('click', () => {
                    selectObject({ category: cat, index: idx, ref: item });
                });

                const childListContainer = document.createElement('div');
                childListContainer.className = 'pl-4 pr-1 py-1 space-y-1 bg-slate-950/50 border-t border-slate-800/60';

                if (Array.isArray(item.points)) {
                    item.points.forEach((pt, ptIdx) => {
                        const isSubSelected = selectedObject && selectedObject.category === cat && selectedObject.index === idx && selectedObject.subKey === 'points' && selectedObject.subIndex === ptIdx;
                        const subBtn = document.createElement('button');
                        subBtn.setAttribute('data-tree-id', `${cat}_${idx}_points_${ptIdx}`);
                        subBtn.className = `w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between ${
                            isSubSelected ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50' : 'hover:bg-slate-800 text-slate-400'
                        }`;
                        subBtn.innerHTML = `<span>Point #${ptIdx + 1}</span><span class="text-[10px] font-mono-custom text-slate-500">(${pt.x}, ${pt.y})</span>`;
                        subBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            selectObject({ category: cat, index: idx, subKey: 'points', subIndex: ptIdx, ref: pt });
                            camera.x = pt.x; camera.y = pt.y;
                        });
                        childListContainer.appendChild(subBtn);
                    });
                }

                if (Array.isArray(item.barriers)) {
                    item.barriers.forEach((b, bIdx) => {
                        const isSubSelected = selectedObject && selectedObject.category === cat && selectedObject.index === idx && selectedObject.subKey === 'barriers' && selectedObject.subIndex === bIdx;
                        const subBtn = document.createElement('button');
                        subBtn.setAttribute('data-tree-id', `${cat}_${idx}_barriers_${bIdx}`);
                        subBtn.className = `w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between ${
                            isSubSelected ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50' : 'hover:bg-slate-800 text-slate-400'
                        }`;
                        subBtn.innerHTML = `<span>Barrier #${bIdx + 1}</span><span class="text-[10px] font-mono-custom text-slate-500">(${b.x}, ${b.y})</span>`;
                        subBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            selectObject({ category: cat, index: idx, subKey: 'barriers', subIndex: bIdx, ref: b });
                            camera.x = b.x; camera.y = b.y;
                        });
                        childListContainer.appendChild(subBtn);
                    });
                }

                detailsElem.appendChild(summaryElem);
                detailsElem.appendChild(childListContainer);
                treeContainer.appendChild(detailsElem);

            } else {
                const itemBtn = document.createElement('button');
                itemBtn.setAttribute('data-tree-id', `${cat}_${idx}`);
                itemBtn.className = `w-full text-left px-2 py-1.5 rounded transition text-xs flex items-center justify-between ${
                    isParentSelected ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 font-bold' : 'hover:bg-slate-800 text-slate-300'
                }`;

                const labelText = item.label || item.name || item.id || `${item.type || cat} #${idx + 1}`;
                itemBtn.innerHTML = `<span class="truncate">${labelText}</span><i class="fa-solid fa-chevron-right text-[10px] opacity-40"></i>`;
                itemBtn.addEventListener('click', () => {
                    selectObject({ category: cat, index: idx, ref: item });
                    camera.x = item.x || camera.x;
                    camera.y = item.y || camera.y;
                });
                treeContainer.appendChild(itemBtn);
            }
        });
    });

    const countElem = document.getElementById('objectCountDisplay');
    if (countElem) countElem.innerText = `${totalCount} items`;
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isHexColor(val) {
    return typeof val === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val.trim());
}

function toPickerHex(val) {
    let hex = String(val).trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(hex)) hex = '#' + hex.slice(1).split('').map(c => c + c).join('');
    return hex;
}

/** Deteksi properti warna: nama key mengandung "color" atau value berupa literal hex */
function isColorProperty(key, val) {
    if (typeof val !== 'string') return false;
    if (key.toLowerCase().includes('color')) return true;
    return isHexColor(val);
}

function buildPositionRow(obj) {
    const inputCls = 'prop-input w-full min-w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500';
    return `
        <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label class="block text-[10px] font-pixel text-slate-400 mb-1.5 uppercase">Position</label>
            <div class="flex items-center space-x-2">
                <div class="flex-1 flex items-center space-x-1.5">
                    <span class="text-[10px] font-pixel text-slate-500">X</span>
                    <input type="number" step="any" data-prop="x" value="${obj.x}" class="${inputCls}">
                </div>
                <div class="flex-1 flex items-center space-x-1.5">
                    <span class="text-[10px] font-pixel text-slate-500">Y</span>
                    <input type="number" step="any" data-prop="y" value="${obj.y}" class="${inputCls}">
                </div>
            </div>
        </div>`;
}

function buildSizeRow(obj) {
    const inputCls = 'prop-input w-full min-w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500';
    return `
        <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label class="block text-[10px] font-pixel text-slate-400 mb-1.5 uppercase">Size</label>
            <div class="flex items-center space-x-2">
                <div class="flex-1 flex items-center space-x-1.5">
                    <span class="text-[10px] font-pixel text-slate-500">W</span>
                    <input type="number" step="any" data-prop="w" value="${obj.w}" class="${inputCls}">
                </div>
                <div class="flex-1 flex items-center space-x-1.5">
                    <span class="text-[10px] font-pixel text-slate-500">H</span>
                    <input type="number" step="any" data-prop="h" value="${obj.h}" class="${inputCls}">
                </div>
            </div>
        </div>`;
}

function buildColorField(key, val) {
    const canPick = isHexColor(val);
    return `
        <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label class="block text-[10px] font-pixel text-slate-400 mb-1.5 uppercase">${escapeAttr(key)}</label>
            <div class="flex items-center space-x-2">
                ${canPick ? `<input type="color" value="${toPickerHex(val)}" class="color-picker w-9 h-9 p-0 bg-slate-900 border border-slate-600 rounded cursor-pointer shrink-0" title="Color picker">` : ''}
                <input type="text" spellcheck="false" data-prop="${escapeAttr(key)}" value="${escapeAttr(val)}" class="prop-input color-text flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500">
            </div>
        </div>`;
}

function buildTypeSelectField(key, val, options, labels) {
    const opts = options.slice();
    // Nilai legacy (mis. cone_line) tetap ditampilkan walau tak ada di daftar opsi
    if (!opts.includes(val)) opts.unshift(val);
    return `
        <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
            <label class="block text-[10px] font-pixel text-yellow-400 mb-1.5 uppercase">${key} (type)</label>
            <select data-type-select="${key}" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500 cursor-pointer">
                ${opts.map(v => `<option value="${escapeAttr(v)}" ${v === val ? 'selected' : ''}>${escapeAttr(labels[v] || v)}</option>`).join('')}
            </select>
        </div>`;
}

const PREFAB_TYPE_OPTIONS = ['tires', 'cone', 'barrier', 'bush'];
const PROP_TYPE_OPTIONS = ['tires', 'cone', 'road_barrier', 'bush'];
const PREFAB_TYPE_LABELS = {
    tires: 'tires — kumpulan ban',
    cone: 'cone — deretan cone',
    barrier: 'barrier — deretan pagar (ada rot)',
    bush: 'bush — kumpulan semak'
};
const PROP_TYPE_LABELS = {
    tires: 'tires — 1 ban',
    cone: 'cone — 1 cone',
    road_barrier: 'road_barrier — 1 pagar',
    bush: 'bush — 1 semak'
};

/**
 * Ganti tipe prefab (dropdown properties): konversi bentuk data points <-> barriers
 * dan samakan field default dengan tipe tujuan. Posisi node TIDAK berubah.
 */
function convertPrefabType(obj, newType) {
    if (obj.prefab === newType) return;

    // Kumpulkan node dari bentuk saat ini (barrier menyimpan rot per titik)
    const nodes = Array.isArray(obj.barriers)
        ? obj.barriers.map(b => ({ x: b.x, y: b.y, rot: b.rot || 0 }))
        : (Array.isArray(obj.points) ? obj.points.map(p => ({ x: p.x, y: p.y })) : []);

    delete obj.points;
    delete obj.barriers;
    obj.prefab = newType;

    if (newType === 'barrier') {
        delete obj.r;
        delete obj.leafColor;
        delete obj.leafDark;
        delete obj.leafLight;
        if (obj.width === undefined) obj.width = 38;
        if (obj.height === undefined) obj.height = 14;
        if (obj.isStatic === undefined) obj.isStatic = true;
        obj.bounceFactor = 0.5;
        obj.layer = 3;
        obj.barriers = nodes.map(n => ({ x: n.x, y: n.y, rot: n.rot !== undefined ? n.rot : 0 }));
        return;
    }

    delete obj.width;
    delete obj.height;
    obj.points = nodes.map(n => ({ x: n.x, y: n.y }));

    if (newType === 'cone') {
        obj.r = 12;
        obj.bounceFactor = 0.3;
        obj.isStatic = false;
        obj.layer = 3;
        delete obj.leafColor; delete obj.leafDark; delete obj.leafLight;
    } else if (newType === 'tires') {
        obj.r = 20;
        obj.bounceFactor = 0.5;
        obj.isStatic = true;
        obj.layer = 3;
        delete obj.leafColor; delete obj.leafDark; delete obj.leafLight;
    } else if (newType === 'bush') {
        obj.r = 50;
        obj.layer = 2;
        obj.leafColor = obj.leafColor || '#2f7d32';
        obj.leafDark = obj.leafDark || '#1f5a24';
        obj.leafLight = obj.leafLight || '#4caf50';
        delete obj.isStatic;
        delete obj.bounceFactor;
    }
}

/**
 * Ganti tipe prop (dropdown properties): samakan field default dengan tipe tujuan.
 * Prop bush tetap tersimpan di kategori props, tapi saat balapan dikonversi
 * menjadi bush (tanpa tabrakan, digambar di atas mobil).
 */
function convertPropType(obj, newType) {
    if (obj.type === newType) return;
    obj.type = newType;

    if (newType === 'road_barrier') {
        delete obj.leafColor; delete obj.leafDark; delete obj.leafLight;
        if (obj.w === undefined) obj.w = 38;
        if (obj.h === undefined) obj.h = 14;
        if (obj.rot === undefined) obj.rot = 0;
        obj.r = Math.round((obj.w || 38) / 2);
        obj.color = obj.color || '#ef4444';
        obj.bounceFactor = 0.5;
        obj.layer = 3;
    } else if (newType === 'tires') {
        delete obj.w; delete obj.h; delete obj.color;
        delete obj.leafColor; delete obj.leafDark; delete obj.leafLight;
        obj.r = 20;
        obj.isStatic = true;
        obj.bounceFactor = 0.5;
        obj.layer = 3;
    } else if (newType === 'cone') {
        delete obj.w; delete obj.h; delete obj.color;
        delete obj.leafColor; delete obj.leafDark; delete obj.leafLight;
        obj.r = 12;
        obj.isStatic = false;
        obj.bounceFactor = 0.3;
        obj.layer = 3;
    } else if (newType === 'bush') {
        delete obj.w; delete obj.h; delete obj.color;
        delete obj.isStatic; delete obj.bounceFactor;
        obj.r = 50;
        obj.layer = 2;
        obj.leafColor = obj.leafColor || '#2f7d32';
        obj.leafDark = obj.leafDark || '#1f5a24';
        obj.leafLight = obj.leafLight || '#4caf50';
    }
}

function renderPropertiesForm() {
    const formContainer = document.getElementById('propertiesForm');
    const badgeElem = document.getElementById('propTypeBadge');
    if (!formContainer || !badgeElem) return;

    if (!selectedObject || !selectedObject.ref) {
        badgeElem.innerText = '-';
        formContainer.innerHTML = `
            <div class="text-center py-12 text-slate-600 text-xs">
                <i class="fa-solid fa-arrow-pointer text-2xl mb-2 text-slate-700"></i>
                <p>Pilih objek atau child item untuk melihat dan mengedit properti</p>
            </div>`;
        return;
    }

    badgeElem.innerText = selectedObject.subKey
        ? `${selectedObject.category} > ${selectedObject.subKey}`
        : `${selectedObject.category}${(selectedObject.ref.type || selectedObject.ref.prefab) ? `: ${selectedObject.ref.type || selectedObject.ref.prefab}` : ''}`;
    const obj = selectedObject.ref;

    let html = `<div class="space-y-3">`;

    const hasX = obj.x !== undefined;
    const hasY = obj.y !== undefined;
    const hasW = obj.w !== undefined;
    const hasH = obj.h !== undefined;
    let positionRendered = false;
    let sizeRendered = false;

    Object.keys(obj).forEach(key => {
        const val = obj[key];
        const valType = typeof val;

        // x + y digabung jadi satu baris Position
        if ((key === 'x' || key === 'y') && hasX && hasY) {
            if (!positionRendered) {
                positionRendered = true;
                html += buildPositionRow(obj);
            }
            return;
        }

        // w + h digabung jadi satu baris Size
        if ((key === 'w' || key === 'h') && hasW && hasH) {
            if (!sizeRendered) {
                sizeRendered = true;
                html += buildSizeRow(obj);
            }
            return;
        }

        if (key === 'rot') {
            const radVal = parseFloat(val) || 0;
            const degVal = Math.round((radVal * 180 / Math.PI) % 360);

            html += `
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-[10px] font-pixel text-yellow-400 uppercase">ROTASI (ROT)</label>
                        <span id="rotDegDisplay" class="text-xs text-yellow-400 font-bold">${degVal}° (${radVal.toFixed(2)} rad)</span>
                    </div>
                    <input type="range" min="0" max="360" value="${degVal < 0 ? degVal + 360 : degVal}" id="rotSlider" class="w-full accent-yellow-500 cursor-pointer">
                </div>`;
        } else if (Array.isArray(val)) {
            html += `
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-2">
                    <div class="flex justify-between items-center">
                        <label class="text-[10px] font-pixel text-emerald-400 uppercase">${key} (${val.length})</label>
                        <button type="button" data-add-array="${key}" class="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-pixel transition">+ Tambah</button>
                    </div>
                    <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">`;
            
            val.forEach((arrItem, itemIdx) => {
                html += `
                    <div class="flex items-center space-x-1.5 bg-slate-900 p-1.5 rounded border border-slate-800 text-xs">
                        <span class="text-[10px] text-slate-500 font-mono-custom w-4">#${itemIdx + 1}</span>
                        <input type="number" data-arr-key="${key}" data-arr-idx="${itemIdx}" data-sub-prop="x" value="${arrItem.x || 0}" class="array-item-input w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-slate-200" placeholder="X">
                        <input type="number" data-arr-key="${key}" data-arr-idx="${itemIdx}" data-sub-prop="y" value="${arrItem.y || 0}" class="array-item-input w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-slate-200" placeholder="Y">
                        ${arrItem.rot !== undefined ? `<input type="number" step="any" data-arr-key="${key}" data-arr-idx="${itemIdx}" data-sub-prop="rot" value="${arrItem.rot}" class="array-item-input w-16 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-slate-200" placeholder="Rot">` : ''}
                        <button type="button" data-del-array="${key}" data-arr-idx="${itemIdx}" class="text-red-400 hover:text-red-300 px-1 text-xs" title="Hapus baris"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
            });

            html += `</div></div>`;
        } else if (valType === 'object' && val !== null) {
            html += `
                <div>
                    <label class="block text-[10px] font-pixel text-slate-400 mb-1 uppercase">${key} (JSON)</label>
                    <textarea data-prop="${key}" class="prop-input w-full h-20 bg-slate-950 border border-slate-800 rounded p-2 text-xs font-mono-custom text-slate-200 focus:outline-none focus:border-yellow-500">${JSON.stringify(val)}</textarea>
                </div>`;
        } else if (isColorProperty(key, val)) {
            html += buildColorField(key, val);
        } else if (key === 'prefab' && selectedObject.category === 'prefabs' && !selectedObject.subKey) {
            html += buildTypeSelectField('prefab', val, PREFAB_TYPE_OPTIONS, PREFAB_TYPE_LABELS);
        } else if (key === 'type' && selectedObject.category === 'props' && !selectedObject.subKey) {
            html += buildTypeSelectField('type', val, PROP_TYPE_OPTIONS, PROP_TYPE_LABELS);
        } else if (key === 'pattern' && selectedObject.category === 'concreteZones') {
            html += `
                <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
                    <label class="block text-[10px] font-pixel text-slate-400 mb-1.5 uppercase">pattern</label>
                    <select data-prop="pattern" class="prop-input w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500 cursor-pointer">
                        ${CONCRETE_PATTERN_OPTIONS.map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>`;
        } else {
            html += `
                <div>
                    <label class="block text-[10px] font-pixel text-slate-400 mb-1 uppercase">${key}</label>
                    <input type="${valType === 'number' ? 'number' : 'text'}" step="any" data-prop="${key}" value="${val}" class="prop-input w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono-custom focus:outline-none focus:border-yellow-500">
                </div>`;
        }
    });

    html += `</div>`;
    formContainer.innerHTML = html;

    const rotSlider = document.getElementById('rotSlider');
    if (rotSlider) {
        rotSlider.addEventListener('input', (e) => {
            const deg = parseInt(e.target.value);
            const rad = deg * (Math.PI / 180);
            obj.rot = parseFloat(rad.toFixed(4));
            const rotDisplay = document.getElementById('rotDegDisplay');
            if (rotDisplay) rotDisplay.innerText = `${deg}° (${obj.rot} rad)`;
        });
    }

    // Dropdown type (prop) & prefab — konversi bentuk data saat diganti
    formContainer.querySelectorAll('[data-type-select]').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const key = e.target.getAttribute('data-type-select');
            const newVal = e.target.value;
            if (key === 'prefab') convertPrefabType(obj, newVal);
            if (key === 'type') convertPropType(obj, newVal);
            renderPropertiesForm();
            renderObjectsTree();
            showToast(`Type diganti ke "${newVal}"`);
        });
    });

    formContainer.querySelectorAll('.prop-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const prop = e.target.getAttribute('data-prop');
            const rawVal = e.target.value;

            if (typeof obj[prop] === 'number') {
                obj[prop] = parseFloat(rawVal) || 0;
            } else if (typeof obj[prop] === 'object') {
                try { obj[prop] = JSON.parse(rawVal); } catch (err) {}
            } else {
                obj[prop] = rawVal;
            }
        });
    });

    // Sinkronisasi color picker saat hex diubah manual
    formContainer.querySelectorAll('.color-text').forEach(input => {
        input.addEventListener('input', (e) => {
            const wrap = e.target.parentElement;
            const picker = wrap ? wrap.querySelector('.color-picker') : null;
            if (picker && isHexColor(e.target.value)) picker.value = toPickerHex(e.target.value);
        });
    });

    // Warna dipilih dari color picker -> tulis ke objek dan input teks
    formContainer.querySelectorAll('.color-picker').forEach(picker => {
        picker.addEventListener('input', (e) => {
            const wrap = e.target.parentElement;
            const textInput = wrap ? wrap.querySelector('.color-text') : null;
            if (!textInput) return;
            obj[textInput.getAttribute('data-prop')] = e.target.value;
            textInput.value = e.target.value;
        });
    });

    formContainer.querySelectorAll('.array-item-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = e.target.getAttribute('data-arr-key');
            const idx = parseInt(e.target.getAttribute('data-arr-idx'));
            const subProp = e.target.getAttribute('data-sub-prop');
            if (obj[key] && obj[key][idx]) {
                obj[key][idx][subProp] = parseFloat(e.target.value) || 0;
            }
        });
    });

    formContainer.querySelectorAll('[data-add-array]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.getAttribute('data-add-array');
            if (Array.isArray(obj[key])) {
                const lastItem = obj[key][obj[key].length - 1] || { x: obj.x || 100, y: obj.y || 100 };
                const newItem = key === 'barriers' ? { x: lastItem.x + 40, y: lastItem.y, rot: lastItem.rot || 0 } : { x: lastItem.x + 50, y: lastItem.y };
                obj[key].push(newItem);
                renderPropertiesForm();
                renderObjectsTree();
            }
        });
    });

    formContainer.querySelectorAll('[data-del-array]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = btn.getAttribute('data-del-array');
            const idx = parseInt(btn.getAttribute('data-arr-idx'));
            if (Array.isArray(obj[key])) {
                obj[key].splice(idx, 1);
                renderPropertiesForm();
                renderObjectsTree();
            }
        });
    });
}

function updatePropertiesFormValues() {
    if (!selectedObject || !selectedObject.ref) return;
    const obj = selectedObject.ref;
    
    document.querySelectorAll('.prop-input').forEach(input => {
        const prop = input.getAttribute('data-prop');
        if (prop && obj[prop] !== undefined && document.activeElement !== input) {
            input.value = typeof obj[prop] === 'object' ? JSON.stringify(obj[prop]) : obj[prop];
        }
    });

    const rotSlider = document.getElementById('rotSlider');
    if (rotSlider && obj.rot !== undefined) {
        const deg = Math.round((obj.rot * 180 / Math.PI) % 360);
        rotSlider.value = deg < 0 ? deg + 360 : deg;
        const displayElem = document.getElementById('rotDegDisplay');
        if (displayElem) displayElem.innerText = `${deg}° (${Number(obj.rot).toFixed(2)} rad)`;
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const msgElem = document.getElementById('toastMessage');
    if (toast && msgElem) {
        msgElem.innerText = msg;
        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2500);
    }
}

window.addEventListener('DOMContentLoaded', initEditor);