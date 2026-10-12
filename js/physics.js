/**
 * ============================================================================
 * PHYSICS ENGINE — SURFACE DRIVEN (RASTER)
 * ============================================================================
 *
 * Fisika mobil kini membaca BAKED SURFACE (peta pixel) alih-alih geometri
 * vektor:
 *   - tarmac / concrete : perilaku normal
 *   - grass             : akselerasi & top speed berkurang, skid coklat,
 *                         asap drift menjadi daun
 *   - sand              : top speed turun drastis + perlambatan, skid hilang,
 *                         jejak ban di belakang, asap debu
 *   - lake              : distorsi + perlambatan sesuai efek danau
 *   - collision (pink)  : tidak bisa dilintasi, memantul + percikan spark
 *
 * Objek non-land (bangunan, tribun, cone, barrier, ban) tetap digambar
 * vektor, tetapi area collision-nya sudah dibake menjadi warna pink.
 */

import { car, keys, ui, WORLD, MAP_OBJECTS } from './state.js';
import { SURFACE, surfaceEffect, WORLD_BOUNDARY_INNER, CRASH_SOUND_MIN_IMPACT, CRASH_SOUND_COOLDOWN } from './config.js';
import { surfaceAt } from './bake.js';
import {
    addSkidMarks, addTireTracks, spawnDriftSmoke, spawnLeaves,
    spawnDustBurst, spawnExhaustSmoke, spawnSparks, spawnRipple
} from './particles.js';
import { playCrashSound, updateEngineAudio } from './audio.js';

/* ==========================================================================
   SAMPLING FOOTPRINT MOBIL
   ========================================================================== */

/** Titik sampel terhadap setengah lebar/panjang mobil (diskalakan hw/hh). */
const FOOTPRINT = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
];

/**
 * Apakah seluruh badan mobil pada posisi (x, y) menyentuh area pink?
 * Mentransformasikan titik lokal dengan orientasi visual mobil
 * (rotate(angle + PI/2)) agar footprint cocok dengan yang digambar.
 */
function footprintCollides(x, y) {
    const hw = car.width / 2 - 3;
    const hh = car.height / 2 - 4;
    const theta = car.angle + Math.PI / 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    for (let i = 0; i < FOOTPRINT.length; i++) {
        const lx = FOOTPRINT[i][0] * hw;
        const ly = FOOTPRINT[i][1] * hh;
        const wx = x + lx * cos - ly * sin;
        const wy = y + lx * sin + ly * cos;
        if (surfaceAt(wx, wy) === SURFACE.COLLISION) return true;
    }
    return false;
}

/** Surface yang sedang dikendarai (titik tengah mobil). */
function sampleDrivingSurface() {
    const id = surfaceAt(car.x, car.y);
    if (id !== SURFACE.COLLISION) return id;

    // fallback: titik ekor mobil (mobil menempel di dinding)
    const rearId = surfaceAt(
        car.x - Math.cos(car.angle) * (car.height / 2),
        car.y - Math.sin(car.angle) * (car.height / 2)
    );
    if (rearId !== SURFACE.COLLISION) return rearId;

    return car.surface || SURFACE.TARMAC;
}

/** Keluar otomatis bila mobil spawn/terjepit di dalam area pink. */
function escapeIfEmbedded() {
    if (!footprintCollides(car.x, car.y)) return;
    for (let r = 6; r <= 60; r += 6) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            const nx = car.x + Math.cos(a) * r;
            const ny = car.y + Math.sin(a) * r;
            if (!footprintCollides(nx, ny)) {
                car.x = nx;
                car.y = ny;
                return;
            }
        }
    }
}

/* ==========================================================================
   SUARA BENTURAN (GERBANG KECEPATAN + COOLDOWN ANTI-SPAM)
   ========================================================================== */

let lastCrashSoundAt = -Infinity;

/**
 * Mainkan suara benturan hanya bila dampak cukup kuat dan cooldown terpenuhi.
 * Tanpa gerbang ini, mobil yang meluncur pelan menempel dinding (wall-ride
 * pelan) akan memicu playCrashSound tiap frame → spam suara mendengung.
 */
function playCrashIfHard(impact) {
    const nowSec = performance.now() / 1000;
    if (impact < CRASH_SOUND_MIN_IMPACT) return;
    if (nowSec - lastCrashSoundAt < CRASH_SOUND_COOLDOWN) return;
    lastCrashSoundAt = nowSec;
    playCrashSound();
}

/* ==========================================================================
   MAIN PHYSICS UPDATE
   ========================================================================== */

export function updatePhysics(dt) {
    if (ui.isModalOpen) return;

    /* ------------------------------------------------------------------------
     * 1. SAMPLING SURFACE & BATAS KECEPATAN ZONA
     * ---------------------------------------------------------------------- */
    escapeIfEmbedded();

    const surfId = sampleDrivingSurface();
    const fx = surfaceEffect(surfId);
    car.surface = surfId;
    car.inWater = (surfId === SURFACE.LAKE);

    let effMaxSpeed = car.maxSpeed * fx.speedMul;
    if (fx.speedLimit != null) effMaxSpeed = Math.min(effMaxSpeed, fx.speedLimit);
    const effAccel = car.accel * fx.accelMul;

    /* ------------------------------------------------------------------------
     * 2. AKSELERASI / REM / INERGIA
     * ---------------------------------------------------------------------- */
    if (keys.up) {
        if (car.speed < effMaxSpeed) car.speed = Math.min(car.speed + effAccel, effMaxSpeed);
    } else if (keys.down) {
        car.speed = Math.max(car.speed - car.brake, car.reverseSpeed);
    } else {
        if (car.speed > 0) car.speed = Math.max(0, car.speed - car.decel);
        if (car.speed < 0) car.speed = Math.min(0, car.speed + car.decel);
    }

    // Perlambatan menuju batas kecepatan zona
    // (sand: drastis, grass: pelan, lake: sesuai slowFactor danau)
    const absSpeed = Math.abs(car.speed);
    if (absSpeed > effMaxSpeed) {
        car.speed = Math.sign(car.speed) * Math.max(effMaxSpeed, absSpeed * fx.overLimitDecay);
    }

    /* ------------------------------------------------------------------------
     * 3. STEERING, GRIP & VELOCITY
     * ---------------------------------------------------------------------- */
    const currentSpeed = Math.abs(car.speed);
    const speedRatio = effMaxSpeed > 0 ? currentSpeed / effMaxSpeed : 0;
    const dir = car.speed >= 0 ? 1 : -1;

    const isTurning = keys.left || keys.right;
    const isHandbraking = keys.down && currentSpeed > 2.0;

    let turnMultiplier = 1.25 - (speedRatio * 0.75);
    if (isHandbraking && isTurning) turnMultiplier = 1.1;

    if (currentSpeed > 0.1) {
        if (keys.left) car.angle -= car.turnSpeed * dir * turnMultiplier;
        if (keys.right) car.angle += car.turnSpeed * dir * turnMultiplier;
    }

    const cosAngle = Math.cos(car.angle);
    const sinAngle = Math.sin(car.angle);

    const forwardVx = cosAngle * car.speed;
    const forwardVy = sinAngle * car.speed;

    const currentMoveAngle = Math.atan2(car.vy, car.vx);
    let slideAngleDiff = Math.abs(car.angle - currentMoveAngle);
    while (slideAngleDiff > Math.PI) slideAngleDiff -= Math.PI * 2;
    while (slideAngleDiff < -Math.PI) slideAngleDiff += Math.PI * 2;

    const isSliding = Math.abs(slideAngleDiff) > 0.35 && currentSpeed > 2.5;

    let currentGrip;
    if (isHandbraking && isTurning) {
        currentGrip = car.gripDrift;
    } else if (isSliding) {
        currentGrip = 0.965;
    } else if (isTurning && currentSpeed > 4.5) {
        currentGrip = 0.94;
    } else {
        currentGrip = car.gripNormal - (speedRatio * 0.04);
    }

    car.vx = car.vx * currentGrip + forwardVx * (1 - currentGrip);
    car.vy = car.vy * currentGrip + forwardVy * (1 - currentGrip);

    let nextX = car.x + car.vx;
    let nextY = car.y + car.vy;

    const isDrifting = isSliding || (isHandbraking && isTurning);

    /* ------------------------------------------------------------------------
     * 4. EFEK DANAU (surface biru)
     * ---------------------------------------------------------------------- */
    if (surfId === SURFACE.LAKE) {
        car.vx *= 0.88;
        car.vy *= 0.88;
    }

    /* ------------------------------------------------------------------------
     * 5. TABRAKAN
     * ---------------------------------------------------------------------- */

    // 5a. Batas luar dunia
    const innerBoundary = WORLD_BOUNDARY_INNER;
    if (nextX < innerBoundary || nextX > WORLD.width - innerBoundary ||
        nextY < innerBoundary || nextY > WORLD.height - innerBoundary) {
        const impact = Math.hypot(car.vx, car.vy);
        playCrashIfHard(impact);
        if (impact > 0.5) spawnSparks(car.x, car.y, Math.atan2(-car.vy, -car.vx), impact);

        car.speed = -car.speed * 0.5;
        car.vx = -car.vx * 0.5;
        car.vy = -car.vy * 0.5;
        nextX = Math.max(innerBoundary, Math.min(WORLD.width - innerBoundary, car.x));
        nextY = Math.max(innerBoundary, Math.min(WORLD.height - innerBoundary, car.y));
    }

    // 5b. Area collision (pink) dari baked surface — objek statis
    if (footprintCollides(nextX, nextY)) {
        const impact = Math.hypot(car.vx, car.vy);
        const probeX = nextX;
        const probeY = nextY;

        const blockX = footprintCollides(nextX, car.y);
        const blockY = footprintCollides(car.x, nextY);
        const fullBlock = (blockX && blockY) || (!blockX && !blockY);

        if (blockX) nextX = car.x;
        if (blockY) nextY = car.y;
        if (fullBlock) { nextX = car.x; nextY = car.y; }

        if (fullBlock) {
            car.speed = -car.speed * 0.45;
            car.vx = -car.vx * 0.4;
            car.vy = -car.vy * 0.4;
        } else if (blockX) {
            car.vx = -car.vx * 0.4;
            car.speed *= 0.75;
        } else {
            car.vy = -car.vy * 0.4;
            car.speed *= 0.75;
        }

        playCrashIfHard(impact);
        // Percikan: kuantitas mengikuti kecepatan saat menabrak
        if (impact > 0.5) {
            spawnSparks(probeX, probeY, Math.atan2(-car.vy, -car.vx), impact);
        }
    }

    // 5c. Props dinamis (cone / barrier yang tidak isStatic) — tetap vektor
    MAP_OBJECTS.props.forEach(p => {
        if (p.isStatic) return;   // sudah diwakili area pink

        const dist = Math.hypot(nextX - p.x, nextY - p.y);
        const minDist = p.r + 12;

        if (dist < minDist) {
            const impact = Math.hypot(car.vx, car.vy);
            playCrashIfHard(impact);
            const impactAngle = Math.atan2(p.y - car.y, p.x - car.x);

            if (impact > 0.5) {
                spawnSparks(nextX, nextY, Math.atan2(car.y - p.y, car.x - p.x), impact * 0.8);
            }

            const force = Math.max(impact * 1.5, 3.0);
            p.vx = Math.cos(impactAngle) * force;
            p.vy = Math.sin(impactAngle) * force;
            p.vRot = (Math.random() - 0.5) * 0.4 * force;

            car.speed *= 0.85;
            car.vx *= 0.85;
            car.vy *= 0.85;
        }
    });

    // 5d. Update posisi props dinamis
    MAP_OBJECTS.props.forEach(p => {
        if (p.isStatic) return;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.vRot *= 0.90;
    });

    /* ------------------------------------------------------------------------
     * 6. EFEK PERMUKAAN (skid, trail ban, partikel drift)
     * ---------------------------------------------------------------------- */
    const slidingFast = currentSpeed > 4.5 && isTurning;

    // Trail ban di pasir — pengganti skid mark
    if (fx.tireTrail && !car.inWater && currentSpeed > 0.3) {
        addTireTracks(car, cosAngle, sinAngle, nextX, nextY);
    }

    if (!car.inWater && (isDrifting || slidingFast)) {
        // Skid mark (hilang di sand karena skidColor null)
        if (fx.skidColor) {
            addSkidMarks(car, cosAngle, sinAngle, nextX, nextY,
                isDrifting ? 0.75 : 0.4, fx.skidColor);
        }

        // Partikel drift sesuai permukaan
        if (fx.driftFx === 'smoke') {
            spawnDriftSmoke(car, cosAngle, sinAngle, nextX, nextY, isDrifting ? 3 : 1);
        } else if (fx.driftFx === 'leaves') {
            spawnLeaves(car, cosAngle, sinAngle, nextX, nextY, isDrifting ? 3 : 1);
        } else if (fx.driftFx === 'dust') {
            spawnDustBurst(car.x, car.y, car.angle + Math.PI, 3);
        }
    }

    // Debu kontinu saat melaju di pasir
    if (surfId === SURFACE.SAND && currentSpeed > 1.5) {
        spawnDustBurst(car.x, car.y, car.angle + Math.PI, 2);
    }

    /* ------------------------------------------------------------------------
     * 6b. BUSH — getar semak saat dilalui
     * ---------------------------------------------------------------------- */
    const bushes = MAP_OBJECTS.bushes || [];
    for (let i = 0; i < bushes.length; i++) {
        const b = bushes[i];
        const dist = Math.hypot(car.x - b.x, car.y - b.y);
        const inside = dist < (b.r || 50);
        // Getar hanya saat mobil berada DI DALAM semak dan bergerak
        if (inside && currentSpeed > 0.4) {
            b.shake = Math.min(1, b.shake + 0.12);
        } else {
            b.shake = Math.max(0, b.shake - 0.05);
        }
    }

    // Asap knalpot saat idle
    if (currentSpeed < 0.3 && Math.random() > 0.4 && !car.inWater) {
        spawnExhaustSmoke(car, cosAngle, sinAngle);
    }

    /* ------------------------------------------------------------------------
     * 7. KOMIT POSISI & AUDIO
     * ---------------------------------------------------------------------- */
    car.x = nextX;
    car.y = nextY;

    if (surfId === SURFACE.LAKE && Math.abs(car.speed) > 0.4 && Math.random() < 0.4) {
        spawnRipple(
            car.x + (Math.random() - 0.5) * 12,
            car.y + (Math.random() - 0.5) * 12
        );
    }

    updateEngineAudio(currentSpeed / car.maxSpeed);
}
