/**
 * ============================================================================
 * GHOST CAR & LAP RECORDING ENGINE
 * ============================================================================
 */

import { car, lap, ctx, MAP_OBJECTS } from './state.js';
import { lerp, lerpAngle } from './math.js';

/** Rekam posisi mobil untuk ghost lap berjalan. */
export function recordGhostFrame() {
    if (lap.isLapActive && lap.lapStartTime && !lap.isLapInvalid) {
        lap.currentLapTrail.push({
            t: (performance.now() - lap.lapStartTime) / 1000,
            x: car.x,
            y: car.y,
            rot: car.angle
        });
    }
}

export function drawGhostCar() {
    if (!lap.isLapActive || !lap.bestLapTrail || lap.bestLapTrail.length === 0 || !lap.lapStartTime) return;

    const config = MAP_OBJECTS.ghostCar || {};
    const gap = config.gap !== undefined ? config.gap : 0.1;
    const targetTime = lap.currentLapTime + gap;

    const lastFrame = lap.bestLapTrail[lap.bestLapTrail.length - 1];
    if (targetTime >= lastFrame.t) {
        const dist = Math.hypot(car.x - lastFrame.x, car.y - lastFrame.y);
        const alpha = calculateGhostAlpha(dist, config);
        renderGhostCarGraphic(lastFrame.x, lastFrame.y, lastFrame.rot, alpha, config);
        return;
    }

    let prevFrame = lap.bestLapTrail[0];
    let nextFrame = lap.bestLapTrail[0];

    for (let i = 0; i < lap.bestLapTrail.length - 1; i++) {
        if (lap.bestLapTrail[i].t <= targetTime && lap.bestLapTrail[i + 1].t >= targetTime) {
            prevFrame = lap.bestLapTrail[i];
            nextFrame = lap.bestLapTrail[i + 1];
            break;
        }
    }

    const timeGap = nextFrame.t - prevFrame.t;
    const factor = timeGap > 0 ? (targetTime - prevFrame.t) / timeGap : 0;

    const interpolatedX = lerp(prevFrame.x, nextFrame.x, factor);
    const interpolatedY = lerp(prevFrame.y, nextFrame.y, factor);
    const interpolatedRot = lerpAngle(prevFrame.rot || 0, nextFrame.rot || 0, factor);

    const distance = Math.hypot(car.x - interpolatedX, car.y - interpolatedY);
    const dynamicAlpha = calculateGhostAlpha(distance, config);

    renderGhostCarGraphic(interpolatedX, interpolatedY, interpolatedRot, dynamicAlpha, config);
}

function calculateGhostAlpha(distance, config) {
    const maxAlpha = config.maxAlpha ?? 0.55;

    if (config.transparent === false) {
        return maxAlpha;
    }

    const minDistance = 40;
    const maxDistance = 180;
    const minAlpha = config.minAlpha ?? 0.15;

    if (distance <= minDistance) return minAlpha;
    if (distance >= maxDistance) return maxAlpha;

    const factor = (distance - minDistance) / (maxDistance - minDistance);
    return minAlpha + factor * (maxAlpha - minAlpha);
}

function renderGhostCarGraphic(x, y, rot, alpha, config) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot + Math.PI / 2);

    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(-car.width / 2 + 3, -car.height / 2 + 3, car.width, car.height);

    ctx.fillStyle = config.color || '#ef4444';
    ctx.beginPath();
    ctx.roundRect(-car.width / 2, -car.height / 2, car.width, car.height, 5);
    ctx.fill();

    ctx.strokeStyle = config.strokeColor || '#f87171';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = config.glassColor || '#450a0a';
    ctx.fillRect(-car.width / 2 + 3, -car.height / 4, car.width - 6, car.height / 2.2);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-car.width / 2 + 2, -car.height / 2 - 2, 4, 3);
    ctx.fillRect(car.width / 2 - 6, -car.height / 2 - 2, 4, 3);

    ctx.fillStyle = '#991b1b';
    ctx.fillRect(-car.width / 2 + 2, car.height / 2 - 1, 5, 3);
    ctx.fillRect(car.width / 2 - 7, car.height / 2 - 1, 5, 3);

    ctx.fillStyle = '#111827';
    ctx.fillRect(-car.width / 2 - 1, car.height / 2 - 4, car.width + 2, 4);

    ctx.restore();
}
