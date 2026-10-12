/**
 * ============================================================================
 * WORLD BAKER — KONVERSI VECTOR → RASTER
 * ============================================================================
 *
 * Dua hasil bake:
 *
 * 1. BAKED WORLD (bitmap visual)
 *    Render akhir yang dilihat user: rumput, concrete zone, parking lot,
 *    sand trap (dengan noise), badan danau, lintasan tarmac, objek statis
 *    tanpa animasi/efek (bangunan, ban, road barrier), serta garis putih
 *    penentu start/finish.
 *    Di-render hanya SEKALI saat boot, lalu tiap frame cukup satu drawImage.
 *
 * 2. BAKED SURFACE (peta fisika / klasifikasi warna)
 *    Kanvas berisi warna sentinel per kategori permukaan:
 *      hitam   = tarmac      abu-abu = concrete (termasuk parking lot)
 *      hijau   = rumput      coklat  = sand
 *      biru    = lake        pink    = collision (objek isStatic)
 *    Hasilnya dikonversi ke Uint8Array 1 byte/pixel untuk sampling O(1).
 */

import { WORLD, MAP_OBJECTS } from './state.js';
import {
    WORLD_BAKE_SCALE, SURFACE_BAKE_SCALE, SURFACE, SURFACE_COLORS
} from './config.js';
import { drawGrassPattern, drawConcreteZone } from './patterns.js';
import {
    isBakedBuilding, isBakedProp, drawBuilding, drawProp, drawStartFinishLine
} from './objects.js';

/* ==========================================================================
   HASIL BAKE
   ========================================================================== */

let worldBitmap = null;        // HTMLCanvasElement (baked world)
let surfaceMap = null;         // Uint8Array (id surface per pixel)
let surfaceDebugBitmap = null; // kanvas sentinel (untuk debug overlay)
let surfaceSize = { width: 0, height: 0, scale: SURFACE_BAKE_SCALE };

const bakeStats = {
    worldMs: 0,
    surfaceMs: 0,
    totalMs: 0,
    surfaceBytes: 0,
    surfaceWidth: 0,
    surfaceHeight: 0
};

/* ==========================================================================
   HELPERS
   ========================================================================== */

function hasTrack() {
    return typeof TrackRenderer !== 'undefined' && !!TrackRenderer.data;
}

function rgbString(id) {
    const c = SURFACE_COLORS[id];
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Kanvas noise transparan (dipakai tekstur sand trap). */
function createNoiseCanvas(size = 128) {
    const nCanvas = document.createElement('canvas');
    nCanvas.width = size;
    nCanvas.height = size;
    const nCtx = nCanvas.getContext('2d');
    const imgData = nCtx.createImageData(size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const val = Math.random() * 35;
        imgData.data[i] = 0;
        imgData.data[i + 1] = 0;
        imgData.data[i + 2] = 0;
        imgData.data[i + 3] = val;
    }
    nCtx.putImageData(imgData, 0, 0);
    return nCanvas;
}

/* ==========================================================================
   BAKED WORLD (BITMAP VISUAL)
   ========================================================================== */

/** Lapisan daratan statis: concrete zone, parking lot, sand trap. */
function drawGroundLayers(g) {
    const noiseCanvas = createNoiseCanvas();

    MAP_OBJECTS.concreteZones.forEach(cz => drawConcreteZone(g, cz));

    MAP_OBJECTS.parkingLots.forEach(pl => {
        g.fillStyle = pl.fillColor || '#9aa5c4';
        g.fillRect(pl.x, pl.y, pl.w, pl.h);

        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.strokeRect(pl.x + 5, pl.y + 5, pl.w - 10, pl.h - 10);

        const slotW = (pl.w - 20) / pl.cols;
        const slotH = (pl.h - 40) / pl.rows;

        g.lineWidth = 2;
        for (let r = 0; r < pl.rows; r++) {
            for (let c = 0; c < pl.cols; c++) {
                const sx = pl.x + 10 + c * slotW;
                const sy = pl.y + 20 + r * slotH;
                g.strokeRect(sx, sy, slotW, slotH);

                g.fillStyle = pl.stopColor || '#eab308';
                g.fillRect(sx + 6, sy + 4, slotW - 12, 5);
            }
        }
    });

    MAP_OBJECTS.sandTraps.forEach(s => {
        g.fillStyle = s.fillColor || '#d97706';
        g.fillRect(s.x, s.y, s.w, s.h);

        const noise = g.createPattern(noiseCanvas, 'repeat');
        if (noise) {
            g.fillStyle = noise;
            g.fillRect(s.x, s.y, s.w, s.h);
        }
    });
}

/** Badan air danau (bank + kolam dalam) — permukaan animasi tetap vektor. */
function drawLakesBase(g) {
    MAP_OBJECTS.lakes.forEach(l => {
        g.save();
        g.translate(l.x, l.y);
        g.rotate(l.rot || 0);

        const radiusX = l.w / 2;
        const radiusY = l.h / 2;

        g.fillStyle = l.bankColor || '#b45309';
        g.beginPath();
        g.ellipse(0, 0, radiusX + 12, radiusY + 12, 0, 0, Math.PI * 2);
        g.fill();

        g.fillStyle = l.deepColor || '#1e3a8a';
        g.beginPath();
        g.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        g.fill();

        g.restore();
    });
}

/* ==========================================================================
   OBJEK STATIS (BAKED) + GARIS START / FINISH
   ========================================================================== */

/**
 * Apakah garis checkpoint start/finish menyentuh lintasan?
 * Sampling sepanjang sumbu lokal checkpoint terhadap baked surface:
 * minimal 2 titik jatuh di tarmac / concrete.
 */
function checkpointTouchesTrack(cp) {
    const cosR = Math.cos(cp.rot || 0);
    const sinR = Math.sin(cp.rot || 0);
    const steps = 16;
    let hits = 0;

    for (let i = 0; i <= steps; i++) {
        const localX = -cp.w / 2 + (cp.w * i) / steps;
        const id = surfaceAt(cp.x + localX * cosR, cp.y + localX * sinR);
        if (id === SURFACE.TARMAC || id === SURFACE.CONCRETE) hits++;
    }

    return hits >= 2;
}

/**
 * Objek statis tanpa animasi & efek (bangunan, ban, road barrier) di-bake ke
 * baked world — tidak lagi digambar vektor tiap frame (lihat js/objects.js).
 * Ditambah garis putih penentu start/finish bila menyentuh lintasan.
 */
function drawStaticObjects(g) {
    MAP_OBJECTS.props.forEach(p => { if (isBakedProp(p)) drawProp(g, p); });
    MAP_OBJECTS.buildings.forEach(b => { if (isBakedBuilding(b)) drawBuilding(g, b); });

    const startFinish = (MAP_OBJECTS.checkpoints || [])[0];
    if (startFinish && checkpointTouchesTrack(startFinish)) {
        // Uji tiap titik garis terhadap baked surface: HANYA segmen di atas
        // aspal (tarmac) yang digambar — bukan concrete/rumput/pasir.
        const isRoad = (x, y) => surfaceAt(x, y) === SURFACE.TARMAC;
        drawStartFinishLine(g, startFinish, isRoad);
    }
}

/** Membangun bitmap visual dunia (sekali saat boot). */
export function bakeWorld() {
    const t0 = performance.now();

    const w = Math.max(1, Math.round(WORLD.width * WORLD_BAKE_SCALE));
    const h = Math.max(1, Math.round(WORLD.height * WORLD_BAKE_SCALE));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;

    const g = c.getContext('2d', { alpha: false });
    g.save();
    g.scale(WORLD_BAKE_SCALE, WORLD_BAKE_SCALE);

    // 1. Rumput (stripes potong + noise)
    drawGrassPattern(g, WORLD.width, WORLD.height);

    // 2. Land/surface statis (concrete, parking, sand + noise)
    drawGroundLayers(g);

    // 3. Badan danau
    drawLakesBase(g);

    // 4. Lintasan tarmac + garis start (motif catur)
    if (hasTrack()) TrackRenderer.drawTarmac(g);

    // 5. Objek statis (bangunan, ban, barrier) + garis start/finish putih
    drawStaticObjects(g);

    g.restore();

    worldBitmap = c;
    bakeStats.worldMs = +(performance.now() - t0).toFixed(2);
    return c;
}

/* ==========================================================================
   BAKED SURFACE (PETA FISIKA)
   ========================================================================== */

/** Cat area collision (pink) dari seluruh objek bertanda isStatic. */
function paintStaticCollisions(g) {
    g.fillStyle = rgbString(SURFACE.COLLISION);

    // Bangunan & grandstand: inset+9 tiap sisi (setara margin 18 total)
    const rectList = [
        ...MAP_OBJECTS.buildings,
        ...MAP_OBJECTS.grandstands
    ];
    rectList.forEach(b => {
        if (b.isStatic === false) return;
        const margin = (b.margin !== undefined ? b.margin : 18);
        const pad = margin / 2;
        g.save();
        g.translate(b.x + b.w / 2, b.y + b.h / 2);
        g.rotate(b.rot || 0);
        g.fillRect(-(b.w + pad * 2) / 2, -(b.h + pad * 2) / 2, b.w + pad * 2, b.h + pad * 2);
        g.restore();
    });

    // Props (tires, barrier) — prop statis, prop dinamis tetap vektor
    MAP_OBJECTS.props.forEach(p => {
        if (!p.isStatic) return;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot || 0);
        if (p.type === 'road_barrier') {
            const pad = 9;
            g.fillRect(-(p.w + pad * 2) / 2, -(p.h + pad * 2) / 2, p.w + pad * 2, p.h + pad * 2);
        } else {
            g.beginPath();
            g.arc(0, 0, (p.r || 12) + 10, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();
    });
}

/**
 * Konversi pixel RGB → id surface (nearest sentinel).
 * Pixel hasil antialias di tepi dibawa ke klasemen terdekat.
 */
function classifyPixels(data, width, height) {
    const ids = Object.keys(SURFACE_COLORS).map(Number);
    const cr = ids.map(id => SURFACE_COLORS[id][0]);
    const cg = ids.map(id => SURFACE_COLORS[id][1]);
    const cb = ids.map(id => SURFACE_COLORS[id][2]);

    // fast path: pixel persis sama dengan warna sentinel
    const exact = new Map();
    ids.forEach((id, i) => exact.set((cr[i] << 16) | (cg[i] << 8) | cb[i], id));

    const out = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        if (a < 64) { out[i] = SURFACE.GRASS; continue; }

        const packed = (r << 16) | (g << 8) | b;
        const hit = exact.get(packed);
        if (hit !== undefined) { out[i] = hit; continue; }

        let bestId = SURFACE.GRASS;
        let bestD = Infinity;
        for (let k = 0; k < ids.length; k++) {
            const dr = r - cr[k], dg = g - cg[k], db = b - cb[k];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; bestId = ids[k]; }
        }
        out[i] = bestId;
    }
    return out;
}

/** Membangun peta fisika dunia (sekali saat boot). */
export function bakeSurface() {
    const t0 = performance.now();

    const s = SURFACE_BAKE_SCALE;
    const w = Math.max(1, Math.round(WORLD.width * s));
    const h = Math.max(1, Math.round(WORLD.height * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;

    const g = c.getContext('2d', { alpha: false });
    g.save();
    g.scale(s, s);

    // 1. Default: rumput
    g.fillStyle = rgbString(SURFACE.GRASS);
    g.fillRect(0, 0, WORLD.width, WORLD.height);

    // 2. Concrete zone & parking lot → satu kategori concrete
    g.fillStyle = rgbString(SURFACE.CONCRETE);
    MAP_OBJECTS.concreteZones.forEach(cz => g.fillRect(cz.x, cz.y, cz.w, cz.h));
    MAP_OBJECTS.parkingLots.forEach(pl => g.fillRect(pl.x, pl.y, pl.w, pl.h));

    // 3. Sand trap
    g.fillStyle = rgbString(SURFACE.SAND);
    MAP_OBJECTS.sandTraps.forEach(st => g.fillRect(st.x, st.y, st.w, st.h));

    // 4. Danau (hanya badan air; bank/teluk tetap surface dasar di bawahnya)
    g.fillStyle = rgbString(SURFACE.LAKE);
    MAP_OBJECTS.lakes.forEach(l => {
        g.save();
        g.translate(l.x, l.y);
        g.rotate(l.rot || 0);
        g.beginPath();
        g.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
    });

    // 5. Tarmac (outer + inner stroke) — di atas seluruh land
    if (hasTrack()) {
        const road = TrackRenderer.data.road;
        g.fillStyle = rgbString(SURFACE.TARMAC);
        g.strokeStyle = rgbString(SURFACE.TARMAC);
        g.lineCap = road.lineCap || 'round';
        g.lineJoin = road.lineJoin || 'round';

        g.lineWidth = road.outerWidth || 150;
        TrackRenderer.buildPath(g);
        g.stroke();

        g.lineWidth = road.innerWidth || 130;
        TrackRenderer.buildPath(g);
        g.stroke();
    }

    // 5b. Semak (bush) — mobil bisa melaluinya, memperlambat; meng-override
    // surface di bawahnya (rumput/beton tepi aspal) tapi di bawah collision.
    g.fillStyle = rgbString(SURFACE.BUSH);
    (MAP_OBJECTS.bushes || []).forEach(b => {
        g.beginPath();
        g.arc(b.x, b.y, b.r || 50, 0, Math.PI * 2);
        g.fill();
    });

    // 6. Collision (pink) dari objek statis — paling atas
    paintStaticCollisions(g);

    g.restore();

    // 7. Klasifikasi pixel → id surface
    const img = g.getImageData(0, 0, w, h);
    surfaceMap = classifyPixels(img.data, w, h);
    surfaceSize = { width: w, height: h, scale: s };
    surfaceDebugBitmap = c;

    bakeStats.surfaceMs = +(performance.now() - t0).toFixed(2);
    bakeStats.surfaceBytes = surfaceMap.byteLength;
    bakeStats.surfaceWidth = w;
    bakeStats.surfaceHeight = h;

    return surfaceMap;
}

/** Bake seluruh layer raster sekaligus. */
export function bakeAll() {
    const t0 = performance.now();
    // Surface lebih dulu: penentuan garis start/finish (bake world) perlu sampling surface
    bakeSurface();
    bakeWorld();
    bakeStats.totalMs = +(performance.now() - t0).toFixed(2);
    console.info(
        `[bake] world ${bakeStats.worldMs}ms | surface ${bakeStats.surfaceMs}ms ` +
        `(${bakeStats.surfaceWidth}x${bakeStats.surfaceHeight}, ` +
        `${(bakeStats.surfaceBytes / 1024).toFixed(0)} KB) | total ${bakeStats.totalMs}ms`
    );
    return bakeStats;
}

/* ==========================================================================
   SAMPLING SURFACE (DIPAKAI FISIKA)
   ========================================================================== */

/**
 * Ambil id surface pada koordinat dunia (x, y). O(1), tanpa getImageData.
 * Di luar dunia dianggap COLLISION.
 */
export function surfaceAt(x, y) {
    if (!surfaceMap) return SURFACE.GRASS;
    const px = (x * surfaceSize.scale) | 0;
    const py = (y * surfaceSize.scale) | 0;
    if (px < 0 || py < 0 || px >= surfaceSize.width || py >= surfaceSize.height) {
        return SURFACE.COLLISION;
    }
    return surfaceMap[py * surfaceSize.width + px];
}

export function getWorldBitmap() {
    return worldBitmap;
}

export function getSurfaceDebugBitmap() {
    return surfaceDebugBitmap;
}

export function getBakeStats() {
    return bakeStats;
}
