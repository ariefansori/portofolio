/**
 * ============================================================================
 * DEV CIRCUIT — ARCADE RACING ENGINE & INTERACTIVE CIRCUIT
 * ============================================================================
 *
 * File        : game.js (entry point)
 * Description : Bootstrap data, konversi vector → raster (baked world +
 *               baked surface), dan main game loop.
 *
 * Pipeline render:
 *   1. Saat boot, dunia di-BAKE menjadi dua bitmap:
 *        - Baked World  : bitmap visual final (rumput, concrete, parking,
 *                         sand + noise, danau, tarmac) → 1x drawImage/frame.
 *        - Baked Surface: peta fisika berwarna klasifikasi (hitam tarmac,
 *                         abu-abu concrete, hijau rumput, coklat sand,
 *                         biru lake, pink collision) → sampling O(1).
 *   2. Objek statis tanpa animasi (bangunan, ban, road barrier) + garis
 *      start/finish ikut di-bake ke baked world. Sisanya (grandstand, crowd,
 *      cone, barrier dinamis, bendera checkpoint) tetap vector di atasnya.
 *   3. Fisika mobil membaca baked surface, bukan geometri vektor.
 *
 * Struktur modul ada di folder ./js.
 * ============================================================================
 */

import {
    WORLD, SECTIONS, trackWaypoints, sectionContents,
    car, pitCrewConfig, ui, perf, particles, MAP_OBJECTS, keys,
    resizeCanvas
} from './js/state.js';
import { SURFACE_LABELS } from './js/config.js';
import { processPrefabs, initCrew } from './js/mapData.js';
import { bakeAll, surfaceAt, getBakeStats } from './js/bake.js';
import { updatePhysics } from './js/physics.js';
import { updateSystems } from './js/systems.js';
import { recordGhostFrame } from './js/ghost.js';
import { renderFrame } from './js/renderer.js';
import {
    updateSpeedHud, drawMinimap, bakeMinimap,
    teleportToZone, openModal, closeModal, handleFormSubmit, toggleCRT
} from './js/hud.js';
import { toggleSound } from './js/audio.js';
import './js/input.js';   // side-effect: binding keyboard & touch

/* ==========================================================================
   GLOBAL API (dipakai handler inline di index.html)
   ========================================================================== */

window.teleportToZone = teleportToZone;
window.openModal = openModal;
window.closeModal = closeModal;
window.handleFormSubmit = handleFormSubmit;
window.toggleSound = toggleSound;
window.toggleCRT = toggleCRT;

// window.car menunjuk objek live (bukan snapshot)
Object.defineProperty(window, 'car', {
    configurable: true,
    get: () => car
});

window.getCarTelemetry = function () {
    const currentSpeed = Math.hypot(car.vx, car.vy);
    const angleDeg = ((car.angle * 180 / Math.PI) % 360 + 360) % 360;

    return {
        position: { x: Number(car.x.toFixed(2)), y: Number(car.y.toFixed(2)) },
        speedKmh: Number((currentSpeed * 18).toFixed(1)),
        rawSpeed: Number(car.speed.toFixed(2)),
        angleDeg: Number(angleDeg.toFixed(1)),
        angleRad: Number(car.angle.toFixed(2)),
        velocity: { vx: Number(car.vx.toFixed(2)), vy: Number(car.vy.toFixed(2)) },
        inWater: car.inWater,
        surface: SURFACE_LABELS[car.surface] || 'NONE'
    };
};

/* ==========================================================================
   DEBUG API (surface sampling, bake stats, performa)
   ========================================================================== */

window.__debug = {
    labelAt: (x, y) => SURFACE_LABELS[surfaceAt(x, y)] || 'NONE',
    idAt: (x, y) => surfaceAt(x, y),
    __crowds: () => MAP_OBJECTS.crowds,
    bakeStats: () => ({ ...getBakeStats() }),
    perf: () => ({ fps: perf.fps, frameMs: Number(perf.frameMs.toFixed(2)) }),
    sparkCount: () => particles.sparks.length,
    skidColors: () => Array.from(new Set(particles.skids.map(s => s.color))),
    markCounts: () => ({
        skids: particles.skids.length,
        tireTracks: particles.tireTracks.length,
        leaves: particles.leaves.length,
        dust: particles.dust.length,
        bloodDecals: particles.bloodDecals.length
    }),
    teleport: (x, y, angle) => {
        car.x = x; car.y = y;
        if (angle !== undefined) car.angle = angle;
        car.speed = 0; car.vx = 0; car.vy = 0;
    },
    crowdStats: () => (MAP_OBJECTS.crowds || []).map(cw => {
        const people = cw.people || [];
        const centerX = cw.x + cw.w / 2;
        const centerY = cw.y + cw.h / 2;
        return {
            id: cw.id,
            total: people.length,
            requested: cw.count,
            capacity: cw.capacity,
            fleeing: people.filter(p => p.isFleeing).length,
            jumping: people.filter(p => p.jumpOffset > 0.5).length,
            flashes: particles.flashes.filter(f => f.gsId === cw.id).length,
            distCar: Number(Math.hypot(car.x - centerX, car.y - centerY).toFixed(1))
        };
    }),
    toggleSurfaceDebug: () => {
        ui.surfaceDebug = !ui.surfaceDebug;
        return ui.surfaceDebug;
    },
    // Stepping deterministik (uji saat rAF preview ter-suspend)
    step: (n = 1) => {
        for (let i = 0; i < n; i++) {
            updatePhysics(1 / 60);
            updateSystems(1 / 60);
        }
        renderFrame();
        return window.getCarTelemetry();
    },
    setCrew: (up, down, left, right) => {
        keys.up = !!up; keys.down = !!down; keys.left = !!left; keys.right = !!right;
    }
};

/* ==========================================================================
   MAIN GAME LOOP
   ========================================================================== */

let lastTime = performance.now();

function updatePerf(dt) {
    perf.frameMs = perf.frameMs * 0.9 + (dt * 1000) * 0.1;
    perf._acc += dt;
    perf._frames += 1;
    if (perf._acc >= 0.5) {
        perf.fps = Math.round(perf._frames / perf._acc);
        perf._acc = 0;
        perf._frames = 0;
    }
}

function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updatePhysics(dt);
    updateSystems(dt);
    recordGhostFrame();

    renderFrame();
    updateSpeedHud();
    drawMinimap();

    updatePerf(dt);

    requestAnimationFrame(gameLoop);
}

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function boot() {
    // Muat data lintasan dari track.json (trackRenderer.js)
    const trackReady = (typeof TrackRenderer !== 'undefined' && TrackRenderer.load)
        ? TrackRenderer.load('track.json')
        : Promise.resolve(null);

    Promise.all([
        fetch('data.json').then(r => r.json()),
        fetch('objects.json').then(r => r.json()),
        trackReady
    ])
    .then(([gameData, mapObjects, trackData]) => {
        // Dimensi dunia bersumber dari track.json (satu-satunya pemilik `world`)
        if (trackData && trackData.world) {
            Object.assign(WORLD, trackData.world);
        } else {
            console.warn("track.json tidak memiliki `world`, memakai nilai default WORLD.");
        }

        if (gameData.car) Object.assign(car, gameData.car);
        if (gameData.pitCrew) Object.assign(pitCrewConfig, gameData.pitCrew);

        SECTIONS.length = 0;
        (gameData.sections || []).forEach(s => SECTIONS.push(s));
        Object.assign(sectionContents, gameData.sectionContents || {});
        (gameData.trackWaypoints || []).forEach(w => trackWaypoints.push(w));

        processPrefabs(mapObjects);
        initCrew();

        // Tunggu font pixel siap — label bangunan ikut ter-bake ke bitmap
        const fontsReady = (document.fonts && document.fonts.ready)
            ? document.fonts.ready
            : Promise.resolve();

        return fontsReady.then(() => {
            // Konversi vector → raster (sekali saat boot)
            bakeAll();
            bakeMinimap();

            lastTime = performance.now();
            requestAnimationFrame(gameLoop);
        });
    })
    .catch(err => console.error("Error loading modular configuration files:", err));
}

if (document.readyState === 'complete') {
    boot();
} else {
    window.addEventListener('load', boot);
}
