/**
 * ============================================================================
 * RENDER PIPELINE — BAKED WORLD + VECTOR OBJECTS
 * ============================================================================
 *
 * Urutan render per frame (z-order dari bawah ke atas):
 *   1. Baked world        → 1x drawImage (rumput, concrete, parking, sand,
 *                           danau, tarmac + objek statis: bangunan, ban,
 *                           barrier, garis start/finish — di-bake saat boot)
 *   2. Objek vektor       → bendera checkpoint, grandstand, crowd, props
 *                           dinamis (cone/barrier tak statis), banner pit,
 *                           pagar (objek statis sudah masuk baked world)
 *   3. Jejak permukaan    → trail ban pasir, skid mark
 *   4. Partikel           → debu, asap/daun, darah, spark
 *   5. Ghost car, mobil,  → elemen dinamis di paling atas
 *      permukaan air animasi
 */

import {
    canvas, ctx, WORLD, MAP_OBJECTS, SECTIONS, crewMembers,
    ui, keys, car, lap, camera, particles, pitCrewConfig
} from './state.js';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_SMOOTHING } from './config.js';
import { getWorldBitmap, getSurfaceDebugBitmap } from './bake.js';
import { drawMarkLayers, drawParticleLayers } from './particles.js';
import {
    isBakedBuilding, isBakedProp, drawBuilding, drawProp, drawCheckpointFlags, drawBush
} from './objects.js';
import { drawGhostCar } from './ghost.js';
import { playImpactPneumaticSound } from './audio.js';

/** Render satu frame lengkap. */
export function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentSpeed = Math.hypot(car.vx, car.vy);
    const speedRatio = Math.min(currentSpeed / car.maxSpeed, 1.0);
    const targetZoom = MAX_ZOOM - (speedRatio * (MAX_ZOOM - MIN_ZOOM));
    camera.zoom += (targetZoom - camera.zoom) * ZOOM_SMOOTHING;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-car.x, -car.y);

    drawBakedWorld();
    if (ui.surfaceDebug) drawSurfaceDebugOverlay();

    drawCheckpoints();
    drawBuildings();
    drawGrandstands();
    drawCrowds();
    drawProps();
    drawOverheadBannersAndCrew();
    drawFenceBorder();

    drawMarkLayers(ctx);
    drawParticleLayers(ctx);

    drawGhostCar();
    drawCar();
    drawBushes();      // di ATAS mobil — saat mobil lewat, badan tertutup sebagian daun
    drawLakesSurface();

    ctx.restore();
}

/* ==========================================================================
   BAKED WORLD (RASTER)
   ========================================================================== */

function drawBakedWorld() {
    const bitmap = getWorldBitmap();
    if (!bitmap) return;
    ctx.drawImage(bitmap, 0, 0, WORLD.width, WORLD.height);
}

/** Overlay debug: menampilkan peta baked surface (klasifikasi warna). */
function drawSurfaceDebugOverlay() {
    const dbg = getSurfaceDebugBitmap();
    if (!dbg) return;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dbg, 0, 0, WORLD.width, WORLD.height);
    ctx.restore();
}

/* ==========================================================================
   OBJEK VEKTOR
   ========================================================================== */

function drawFenceBorder() {
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(22, 22, WORLD.width - 44, WORLD.height - 44);

    const posts = [
        { x: 22, y: 22 },
        { x: WORLD.width - 22, y: 22 },
        { x: 22, y: WORLD.height - 22 },
        { x: WORLD.width - 22, y: WORLD.height - 22 }
    ];

    posts.forEach(p => {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.stroke();
    });
    ctx.restore();
}

function drawLakesSurface() {
    const time = performance.now() * 0.002;

    MAP_OBJECTS.lakes.forEach(l => {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rot || 0);

        const radiusX = l.w / 2;
        const radiusY = l.h / 2;

        ctx.fillStyle = l.waterColor || 'rgba(37, 99, 235, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX * 0.75 + Math.sin(time) * 3, radiusY * 0.75 + Math.cos(time) * 3, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    });

    particles.ripples.forEach(r => {
        ctx.save();
        ctx.strokeStyle = `rgba(191, 219, 254, ${r.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });
}

function drawCheckpoints() {
    MAP_OBJECTS.checkpoints.forEach((cp, idx) => {
        // Start/finish: tanpa visual vektor — penentu finish berupa garis putih
        // lurus di atas lintasan yang sudah di-bake ke baked world.
        if (idx === 0) return;

        const isNext = (idx === lap.nextCheckpointIndex);
        drawCheckpointFlags(ctx, cp, isNext);
    });
}

function drawBuildings() {
    MAP_OBJECTS.buildings.forEach(b => {
        // Bangunan statis sudah di-bake ke baked world (lihat js/bake.js)
        if (isBakedBuilding(b)) return;
        drawBuilding(ctx, b);
    });
}

function drawGrandstands() {
    MAP_OBJECTS.grandstands.forEach(gs => {
        ctx.save();
        ctx.translate(gs.x + gs.w / 2, gs.y + gs.h / 2);
        ctx.rotate(gs.rot || 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(-gs.w / 2 + 8, -gs.h / 2 + 8, gs.w, gs.h);

        ctx.fillStyle = '#334155';
        ctx.fillRect(-gs.w / 2, -gs.h / 2, gs.w, gs.h);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.strokeRect(-gs.w / 2, -gs.h / 2, gs.w, gs.h);

        const rowHeight = (gs.h - 20) / gs.rows;
        for (let r = 0; r < gs.rows; r++) {
            ctx.fillStyle = (r % 2 === 0) ? '#1e293b' : '#0f172a';
            ctx.fillRect(-gs.w / 2 + 5, -gs.h / 2 + 10 + r * rowHeight, gs.w - 10, rowHeight - 2);
        }

        (gs.spectators || []).forEach(s => {
            const renderY = s.localY - s.jumpOffset;

            ctx.fillStyle = s.skinColor;
            ctx.beginPath();
            ctx.arc(s.localX, renderY - 4, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = s.shirtColor;
            ctx.fillRect(s.localX - 3, renderY - 1, 6, 5);
        });

        ctx.fillStyle = 'rgba(234, 179, 8, 0.85)';
        ctx.fillRect(-gs.w / 2 - 5, -gs.h / 2 - 5, gs.w + 10, 12);

        ctx.fillStyle = '#ffffff';
        ctx.font = '8px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(gs.name || "GRANDSTAND", 0, -gs.h / 2 + 4);

        ctx.restore();
    });
}

/*
 * CROWD — penonton rally di area rectangle (tanpa struktur tribun).
 * Hanya AREA yang berotasi (rot). Penonton disimpan dalam koordinat DUNIA
 * (lihat mapData.js) sehingga TIDAK ikut berotasi — orang selalu tegak,
 * tanpa kaki: hanya bayangan + badan + kepala. Saat minggir badan sedikit
 * condong ke arah gerakan.
 */
function drawCrowds() {
    (MAP_OBJECTS.crowds || []).forEach(cw => {
        const r = cw.personRadius || 10;

        // 1. AREA rectangle (penanda batas) — boleh berotasi
        ctx.save();
        ctx.translate(cw.x + cw.w / 2, cw.y + cw.h / 2);
        ctx.rotate(cw.rot || 0);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.10)';
        ctx.fillRect(-cw.w / 2, -cw.h / 2, cw.w, cw.h);
        ctx.restore();

        // 2. PENONTON — koordinat dunia, TIDAK berotasi (selalu tegak)
        (cw.people || []).forEach(p => {
            const renderY = p.y - p.jumpOffset;

            // Condong ke arah bergerak saat minggir (kaki tidak digambar)
            const leanX = p.isFleeing ? (p.runDirX || 0) * r * 0.15 : 0;
            const leanY = p.isFleeing ? (p.runDirY || 0) * r * 0.15 : 0;

            // Bayangan
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.ellipse(p.x, p.y + r * 0.55, r * 0.45, r * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();

            // Badan (kaus)
            ctx.fillStyle = p.shirtColor;
            ctx.fillRect(p.x + leanX - r * 0.3, renderY + leanY, r * 0.6, r * 0.5);

            // Kepala
            ctx.fillStyle = p.skinColor;
            ctx.beginPath();
            ctx.arc(p.x + leanX, renderY + leanY - r * 0.35, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
        });
    });

    particles.flashes.forEach(f => {
        ctx.save();
        ctx.globalAlpha = f.alpha;

        const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.2, 'rgba(254, 240, 138, 0.9)');
        gradient.addColorStop(0.6, 'rgba(59, 130, 246, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
}

function drawProps() {
    MAP_OBJECTS.props.forEach(p => {
        // Prop statis (ban, road barrier) sudah di-bake ke baked world
        if (isBakedProp(p)) return;
        drawProp(ctx, p);
    });
}

/**
 * Semak (bush) — lingkaran berdaun rongga. Digambar DI ATAS mobil sehingga
 * saat mobil melewatinya, badan mobil tertutup sebagian oleh daun.
 * `b.shake` di-update dari fisika saat mobil bergerak di dalamnya.
 */
function drawBushes() {
    const timeSec = performance.now() * 0.001;
    (MAP_OBJECTS.bushes || []).forEach(b => drawBush(ctx, b, timeSec));
}

function drawOverheadBannersAndCrew() {
    SECTIONS.forEach(sec => {
        ctx.save();
        ctx.translate(sec.x, sec.y - 65);

        ctx.fillStyle = '#111111';
        ctx.fillRect(-60, 0, 6, 25);
        ctx.fillRect(54, 0, 6, 25);

        ctx.fillStyle = '#222222';
        ctx.fillRect(-70, -40, 140, 42);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-66, -36, 132, 34);

        ctx.fillStyle = sec.color;
        ctx.fillRect(-66, -36, 132, 10);

        ctx.fillStyle = '#000000';
        ctx.font = '9px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(sec.title, 0, -10);

        ctx.fillStyle = '#666666';
        ctx.font = '6px "Press Start 2P"';
        ctx.fillText('SPONSOR • PIT ZONE', 0, -29);

        ctx.restore();
    });

    crewMembers.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);

        const walkCycle = Math.sin(c.animFrame) * 2;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 4, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(0, walkCycle, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, -2 + walkCycle, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.fillRect(-2, -4 + walkCycle, 4, 1.2);

        if (ui.activePitStop && ui.activePitStop.id === c.sectionId && ui.stopTimer > 0) {
            if (Math.random() > 0.4) {
                ctx.fillStyle = '#fef08a';
                ctx.fillRect((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 2, 2);
                if (Math.random() > 0.7) playImpactPneumaticSound();
            }
        }

        ctx.restore();
    });
}

/* ==========================================================================
   MOBIL
   ========================================================================== */

function drawCar() {
    ctx.save();
    ctx.translate(car.x, car.y);

    if (car.inWater) {
        const time = performance.now() * 0.008;
        const scaleDistort = 1 + Math.sin(time) * 0.06;
        const skewDistort = Math.cos(time) * 0.05;
        ctx.scale(scaleDistort, 1 / scaleDistort);
        ctx.transform(1, skewDistort, 0, 1, 0, 0);
    }

    ctx.rotate(car.angle + Math.PI / 2);

    ctx.fillStyle = car.inWater ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-car.width / 2 + 3, -car.height / 2 + 3, car.width, car.height);

    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-car.width / 2, -car.height / 2, car.width, car.height, 5);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-car.width / 2 + 3, -car.height / 4, car.width - 6, car.height / 2.2);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-car.width / 2 + 2, -car.height / 2 - 2, 4, 3);
    ctx.fillRect(car.width / 2 - 6, -car.height / 2 - 2, 4, 3);

    ctx.fillStyle = keys.down ? '#ff0000' : '#991b1b';
    ctx.fillRect(-car.width / 2 + 2, car.height / 2 - 1, 5, 3);
    ctx.fillRect(car.width / 2 - 7, car.height / 2 - 1, 5, 3);

    ctx.fillStyle = '#111827';
    ctx.fillRect(-car.width / 2 - 1, car.height / 2 - 4, car.width + 2, 4);

    ctx.restore();

    if (ui.activePitStop && ui.stopTimer > 0) {
        const progress = Math.min(ui.stopTimer / pitCrewConfig.stopDuration, 1);
        ctx.save();
        ctx.beginPath();
        ctx.arc(car.x, car.y, 38, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
        ctx.lineWidth = 5;
        ctx.strokeStyle = ui.activePitStop.color;
        ctx.stroke();

        ctx.font = '8px "Press Start 2P"';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText("SERVICING...", car.x, car.y - 45);
        ctx.restore();
    }
}
