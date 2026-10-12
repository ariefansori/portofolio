/**
 * ============================================================================
 * PARTICLE & SURFACE MARK SYSTEMS
 * ============================================================================
 *
 * Semua partikel/jejak dunia: asap drift, daun, debu, percikan darah + noda
 * darah di tanah, percikan api (spark), riak air, skid mark, dan jejak ban
 * di pasir.
 */

import { particles } from './state.js';

/* ==========================================================================
   KONSTANTA
   ========================================================================== */

const MAX_SKID_MARKS = 400;
const MAX_TIRE_TRACKS = 600;
const MAX_BLOOD_DECALS = 40;

/** Berkas darah di tanah: tampil penuh ±7 detik, lalu fade out ±4 detik. */
const BLOOD_DECAL_HOLD_FRAMES = 420;
const BLOOD_DECAL_FADE = 0.004;

const SPARK_COLORS = ['#fffdf0', '#fde68a', '#fbbf24', '#fb923c'];
const LEAF_COLORS = ['#4ade80', '#22c55e', '#a3b84a', '#b8860b', '#a16207'];

/* ==========================================================================
   JEJAK DI ATAS PERMUKAAN (SKID MARK & TRAIL BAN)
   ========================================================================== */

/** Geometri titik roda belakang mobil (kiri & kanan) pada frame berjalan. */
function rearWheelPoints(car, cosAngle, sinAngle, toX, toY) {
    const rearOffset = car.height / 2 - 4;
    const sideOffset = car.width / 2 - 3;

    return {
        fromLeft: {
            x: car.x - sinAngle * sideOffset - cosAngle * rearOffset,
            y: car.y + cosAngle * sideOffset - sinAngle * rearOffset
        },
        fromRight: {
            x: car.x + sinAngle * sideOffset - cosAngle * rearOffset,
            y: car.y - cosAngle * sideOffset - sinAngle * rearOffset
        },
        toLeft: {
            x: toX - sinAngle * sideOffset - cosAngle * rearOffset,
            y: toY + cosAngle * sideOffset - sinAngle * rearOffset
        },
        toRight: {
            x: toX + sinAngle * sideOffset - cosAngle * rearOffset,
            y: toY - cosAngle * sideOffset - sinAngle * rearOffset
        }
    };
}

/**
 * Skid mark drift. Warna mengikuti permukaan
 * (tarmac/concrete = gelap, rumput = coklat).
 */
export function addSkidMarks(car, cosAngle, sinAngle, toX, toY, alpha, color) {
    const p = rearWheelPoints(car, cosAngle, sinAngle, toX, toY);
    const list = particles.skids;

    list.push({ x1: p.fromLeft.x, y1: p.fromLeft.y, x2: p.toLeft.x, y2: p.toLeft.y, alpha, color, width: 3 });
    list.push({ x1: p.fromRight.x, y1: p.fromRight.y, x2: p.toRight.x, y2: p.toRight.y, alpha, color, width: 3 });

    if (list.length > MAX_SKID_MARKS) list.splice(0, list.length - MAX_SKID_MARKS);
}

/** Jejak ban di pasir (pengganti skid mark saat berada di sand). */
export function addTireTracks(car, cosAngle, sinAngle, toX, toY) {
    const p = rearWheelPoints(car, cosAngle, sinAngle, toX, toY);
    const list = particles.tireTracks;
    const alpha = 0.7;
    const color = '#4a3012';
    const width = 6;

    list.push({ x1: p.fromLeft.x, y1: p.fromLeft.y, x2: p.toLeft.x, y2: p.toLeft.y, alpha, color, width });
    list.push({ x1: p.fromRight.x, y1: p.fromRight.y, x2: p.toRight.x, y2: p.toRight.y, alpha, color, width });

    if (list.length > MAX_TIRE_TRACKS) list.splice(0, list.length - MAX_TIRE_TRACKS);
}

/* ==========================================================================
   SPAWNERS
   ========================================================================== */

/** Asap drift dari dua roda belakang (tarmac / concrete). */
export function spawnDriftSmoke(car, cosAngle, sinAngle, toX, toY, smokeCount) {
    const p = rearWheelPoints(car, cosAngle, sinAngle, toX, toY);
    const list = particles.exhaust;

    for (let i = 0; i < smokeCount; i++) {
        [p.toLeft, p.toRight].forEach(wheel => {
            list.push({
                x: wheel.x + (Math.random() - 0.5) * 4,
                y: wheel.y + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 0.8 - cosAngle * 0.3,
                vy: (Math.random() - 0.5) * 0.8 - sinAngle * 0.3,
                radius: 2 + Math.random() * 2, maxRadius: 18 + Math.random() * 8,
                growth: 0.35 + Math.random() * 0.25, alpha: 0.65,
                decay: 0.012 + Math.random() * 0.008
            });
        });
    }
}

/** Daun berterbangan — pengganti asap drift di rumput. */
export function spawnLeaves(car, cosAngle, sinAngle, toX, toY, count) {
    const p = rearWheelPoints(car, cosAngle, sinAngle, toX, toY);
    const list = particles.leaves;

    for (let i = 0; i < count; i++) {
        [p.toLeft, p.toRight].forEach(wheel => {
            list.push({
                x: wheel.x + (Math.random() - 0.5) * 6,
                y: wheel.y + (Math.random() - 0.5) * 6,
                vx: (Math.random() - 0.5) * 1.4 - cosAngle * 0.5,
                vy: (Math.random() - 0.5) * 1.4 - sinAngle * 0.5,
                rot: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.4,
                size: 2 + Math.random() * 2.5,
                color: LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0],
                alpha: 0.95,
                decay: 0.014 + Math.random() * 0.012
            });
        });
    }
}

/** Debu pasir (sand trap / drift di pasir). */
export function spawnDustBurst(x, y, dirAngle, count) {
    const list = particles.dust;

    for (let i = 0; i < count; i++) {
        const pAngle = dirAngle + (Math.random() - 0.5) * 1.2;
        const pSpeed = 1 + Math.random() * 2;
        list.push({
            x: x + (Math.random() - 0.5) * 15,
            y: y + (Math.random() - 0.5) * 15,
            vx: Math.cos(pAngle) * pSpeed,
            vy: Math.sin(pAngle) * pSpeed,
            radius: 3 + Math.random() * 4,
            alpha: 0.7,
            decay: 0.02 + Math.random() * 0.03
        });
    }
}

/** Asap knalpot saat mobil berhenti. */
export function spawnExhaustSmoke(car, cosAngle, sinAngle) {
    const rearOffset = car.height / 2;
    const exhaustX = car.x - cosAngle * rearOffset;
    const exhaustY = car.y - sinAngle * rearOffset;
    const pAngle = car.angle + Math.PI + (Math.random() - 0.5) * 0.6;
    const pSpeed = 0.2 + Math.random() * 0.4;

    particles.exhaust.push({
        x: exhaustX, y: exhaustY,
        vx: Math.cos(pAngle) * pSpeed, vy: Math.sin(pAngle) * pSpeed,
        radius: 2 + Math.random() * 3, alpha: 0.5,
        decay: 0.015 + Math.random() * 0.01
    });
}

/**
 * BERKAS DARAH DI TANAH — noda darah yang menempel di permukaan dan fade out
 * setelah BLOOD_DECAL_HOLD_FRAMES + waktu fade. Dibuat saat menabrak pit crew
 * maupun penonton yang telat menyingkir.
 */
export function spawnBloodDecal(x, y, angle) {
    const list = particles.bloodDecals;

    // Noda utama + percikan mengikuti arah benturan
    const splats = [{
        dx: 0, dy: 0,
        rx: 8 + Math.random() * 6,
        ry: 6 + Math.random() * 5,
        rot: Math.random() * Math.PI
    }];

    const drops = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < drops; i++) {
        const a = angle + (Math.random() - 0.5) * 2.0;
        const dist = 6 + Math.random() * 26;
        splats.push({
            dx: Math.cos(a) * dist,
            dy: Math.sin(a) * dist,
            rx: 2 + Math.random() * 4,
            ry: 1.5 + Math.random() * 3,
            rot: Math.random() * Math.PI
        });
    }

    list.push({
        x, y, splats,
        age: 0,
        hold: BLOOD_DECAL_HOLD_FRAMES + Math.floor(Math.random() * 120),
        alpha: 0.75,
        fade: BLOOD_DECAL_FADE + Math.random() * 0.002
    });

    if (list.length > MAX_BLOOD_DECALS) list.splice(0, list.length - MAX_BLOOD_DECALS);
}

/** Percikan darah saat menabrak pit crew / penonton (juga meninggalkan noda). */
export function spawnBlood(x, y, angle) {
    spawnBloodDecal(x, y, angle);

    for (let i = 0; i < 3; i++) {
        const pAngle = angle + (Math.random() - 0.5) * 1.5;
        const pSpeed = 1 + Math.random() * 2;
        particles.blood.push({
            x, y,
            vx: Math.cos(pAngle) * pSpeed,
            vy: Math.sin(pAngle) * pSpeed,
            radius: 2 + Math.random() * 3,
            alpha: 0.8,
            decay: 0.02 + Math.random() * 0.03
        });
    }
}

/**
 * Percikan api (spark) saat mobil menabrak.
 * Kuantitas & energinya sebanding dengan kecepatan benturan.
 */
export function spawnSparks(x, y, angle, impactSpeed) {
    const list = particles.sparks;
    if (list.length > 260) return;

    const impact = Math.max(0, impactSpeed);
    const count = Math.max(3, Math.min(45, Math.round(impact * 5)));

    for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * 1.6;
        const velocity = (0.8 + Math.random() * 1.6) * (0.6 + impact * 0.5);
        list.push({
            x, y,
            vx: Math.cos(a) * velocity,
            vy: Math.sin(a) * velocity,
            life: 1,
            decay: 0.05 + Math.random() * 0.07,
            width: 1 + Math.random() * 1.8,
            color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0]
        });
    }
}

/** Riak air di danau. */
export function spawnRipple(x, y) {
    particles.ripples.push({
        x, y,
        radius: 4,
        maxRadius: 18 + Math.random() * 10,
        alpha: 0.8,
        decay: 0.03
    });
}

/** Kilatan kamera grandstand. */
export function spawnCameraFlash(gsId, x, y, radius) {
    particles.flashes.push({
        gsId, x, y,
        radius,
        alpha: 1.0,
        decay: 0.08 + Math.random() * 0.06
    });
}

/* ==========================================================================
   RENDER (dipanggil sekali per frame)
   ========================================================================== */

/** Noda darah di tanah — menempel di permukaan, memudar sendiri. */
function drawBloodDecals(ctx) {
    const list = particles.bloodDecals;

    for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.age += 1;
        if (d.age > d.hold) d.alpha -= d.fade;
        if (d.alpha <= 0) { list.splice(i, 1); continue; }

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.fillStyle = `rgba(130, 10, 10, ${d.alpha})`;
        d.splats.forEach(s => {
            ctx.beginPath();
            ctx.ellipse(s.dx, s.dy, s.rx, s.ry, s.rot, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
}

/** Jejak di atas baked world: noda darah, trail ban pasir, lalu skid mark. */
export function drawMarkLayers(ctx) {
    ctx.save();

    drawBloodDecals(ctx);

    // Jejak ban pasir (memudar lebih lambat)
    const tracks = particles.tireTracks;
    for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i];
        t.alpha -= 0.0004;
        if (t.alpha <= 0) { tracks.splice(i, 1); continue; }
        ctx.strokeStyle = t.color;
        ctx.lineWidth = t.width;
        ctx.globalAlpha = t.alpha;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
    }

    // Skid mark drift
    const skids = particles.skids;
    for (let i = skids.length - 1; i >= 0; i--) {
        const sm = skids[i];
        sm.alpha -= 0.0008;
        if (sm.alpha <= 0) { skids.splice(i, 1); continue; }
        ctx.strokeStyle = sm.color;
        ctx.lineWidth = sm.width;
        ctx.globalAlpha = sm.alpha;
        ctx.beginPath();
        ctx.moveTo(sm.x1, sm.y1);
        ctx.lineTo(sm.x2, sm.y2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawDust(ctx) {
    const list = particles.dust;
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { list.splice(i, 1); continue; }

        ctx.fillStyle = `rgba(217, 119, 6, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawExhaust(ctx) {
    const list = particles.exhaust;
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.growth && p.radius < (p.maxRadius || 20)) p.radius += p.growth;
        p.alpha -= p.decay || 0.02;
        if (p.alpha <= 0) { list.splice(i, 1); continue; }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 220, 225, ${p.alpha})`;
        ctx.fill();
    }
}

function drawLeaves(ctx) {
    const list = particles.leaves;
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.rot += p.vRot;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { list.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawBlood(ctx) {
    const list = particles.blood;
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { list.splice(i, 1); continue; }

        ctx.fillStyle = `rgba(180, 0, 0, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSparks(ctx) {
    const list = particles.sparks;
    ctx.lineCap = 'round';
    for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.90;
        p.vy *= 0.90;
        p.life -= p.decay;
        if (p.life <= 0) { list.splice(i, 1); continue; }

        ctx.globalAlpha = Math.max(0, p.life);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 3.5, p.y - p.vy * 3.5);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

/** Update + gambar seluruh partikel (debu → asap → daun → darah → spark). */
export function drawParticleLayers(ctx) {
    ctx.save();
    drawDust(ctx);
    drawExhaust(ctx);
    drawLeaves(ctx);
    drawBlood(ctx);
    drawSparks(ctx);
    ctx.restore();
}
