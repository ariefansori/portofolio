/**
 * ============================================================================
 * MATH & GEOMETRY UTILITIES
 * ============================================================================
 */

/** Interpolasi linear antara dua nilai. */
export function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

/** Interpolasi linear khusus sudut radian (jalur terpendek). */
export function lerpAngle(a, b, t) {
    const max = Math.PI * 2;
    const da = (b - a) % max;
    const shortestDistance = (2 * da) % max - da;
    return a + shortestDistance * t;
}

/** Batasi nilai dalam rentang [min, max]. */
export function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
}

/** Apakah titik berada di dalam elips terotasi? */
export function isPointInRotatedEllipse(px, py, cx, cy, rx, ry, rot) {
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const dx = px - cx;
    const dy = py - cy;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    return ((localX * localX) / (rx * rx) + (localY * localY) / (ry * ry)) <= 1.0;
}

/** Apakah titik berada di dalam persegi panjang terotasi (pusat cx,cy)? */
export function isPointInRotatedRect(px, py, cx, cy, rw, rh, rot) {
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const dx = px - cx;
    const dy = py - cy;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    return (localX >= -rw / 2 && localX <= rw / 2 && localY >= -rh / 2 && localY <= rh / 2);
}
