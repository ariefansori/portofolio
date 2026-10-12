/**
 * ============================================================================
 * HUD, MINIMAP & UI MODAL CONTROLLER
 * ============================================================================
 */

import {
    minimapCanvas, minimapCtx, WORLD, SECTIONS, sectionContents,
    ui, car, pitCrewConfig
} from './state.js';
import { playBeepSound } from './audio.js';

/* ==========================================================================
   SPEEDOMETER
   ========================================================================== */

export function drawClassicSpeedometer(currentSpeed, maxSpeed) {
    const sCanvas = document.getElementById('speedoCanvas');
    if (!sCanvas) return;
    const sCtx = sCanvas.getContext('2d');

    const width = sCanvas.width;
    const height = sCanvas.height;
    const cx = width / 2;
    const cy = height - 10;
    const radius = 55;

    sCtx.clearRect(0, 0, width, height);

    sCtx.lineWidth = 8;
    sCtx.strokeStyle = '#334155';
    sCtx.beginPath();
    sCtx.arc(cx, cy, radius, Math.PI, 0, false);
    sCtx.stroke();

    const totalTicks = 10;
    for (let i = 0; i <= totalTicks; i++) {
        const angle = Math.PI + (i / totalTicks) * Math.PI;
        const innerR = radius - (i % 2 === 0 ? 10 : 5);
        const outerR = radius - 2;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        sCtx.strokeStyle = i > 7 ? '#ef4444' : '#f8fafc';
        sCtx.lineWidth = i % 2 === 0 ? 2 : 1;
        sCtx.beginPath();
        sCtx.moveTo(x1, y1);
        sCtx.lineTo(x2, y2);
        sCtx.stroke();
    }

    const speedRatio = Math.min(Math.max(currentSpeed / maxSpeed, 0), 1.0);
    const needleAngle = Math.PI + (speedRatio * Math.PI);

    sCtx.save();
    sCtx.translate(cx, cy);
    sCtx.rotate(needleAngle);

    sCtx.fillStyle = '#ef4444';
    sCtx.strokeStyle = '#dc2626';
    sCtx.lineWidth = 1;

    sCtx.beginPath();
    sCtx.moveTo(0, -3);
    sCtx.lineTo(radius - 8, 0);
    sCtx.lineTo(0, 3);
    sCtx.closePath();
    sCtx.fill();
    sCtx.stroke();

    sCtx.restore();

    sCtx.fillStyle = '#f1f5f9';
    sCtx.beginPath();
    sCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    sCtx.fill();

    sCtx.fillStyle = '#0f172a';
    sCtx.beginPath();
    sCtx.arc(cx, cy, 3, 0, Math.PI * 2);
    sCtx.fill();
}

/** Update HUD kecepatan (digital + jarum). */
export function updateSpeedHud() {
    const speedKmh = Math.round(Math.abs(car.speed) * 18);
    const speedGauge = document.getElementById('speedDisplay');
    if (speedGauge) speedGauge.innerText = speedKmh.toString().padStart(3, '0');
    drawClassicSpeedometer(speedKmh, car.maxSpeed * 18);
}

/* ==========================================================================
   MINIMAP (bagian statis di-bake, mobil digambar per frame)
   ========================================================================== */

let minimapStatic = null;

/** Bake outline lintasan + titik seksi ke kanvas minimap terpisah. */
export function bakeMinimap() {
    if (!minimapCanvas) return;
    const c = document.createElement('canvas');
    c.width = minimapCanvas.width;
    c.height = minimapCanvas.height;
    const g = c.getContext('2d');

    const scaleX = c.width / WORLD.width;
    const scaleY = c.height / WORLD.height;
    const avgScale = (scaleX + scaleY) / 2;
    const road = (typeof TrackRenderer !== 'undefined' && TrackRenderer.data)
        ? TrackRenderer.data.road
        : null;

    g.save();
    g.strokeStyle = '#475569';
    g.lineWidth = ((road && road.outerWidth) || 140) * avgScale;
    g.lineCap = (road && road.lineCap) || 'round';
    g.lineJoin = (road && road.lineJoin) || 'round';

    g.beginPath();
    if (typeof TrackRenderer !== 'undefined') {
        TrackRenderer.buildPath(g, scaleX, scaleY, avgScale);
    }
    g.stroke();
    g.restore();

    SECTIONS.forEach(s => {
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(s.x * scaleX, s.y * scaleY, 4, 0, Math.PI * 2);
        g.fill();
    });

    minimapStatic = c;
}

export function drawMinimap() {
    if (!minimapCtx) return;
    const scaleX = minimapCanvas.width / WORLD.width;
    const scaleY = minimapCanvas.height / WORLD.height;

    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    if (minimapStatic) minimapCtx.drawImage(minimapStatic, 0, 0);

    const carMapX = car.x * scaleX;
    const carMapY = car.y * scaleY;

    minimapCtx.save();
    minimapCtx.translate(carMapX, carMapY);
    minimapCtx.rotate(car.angle);

    minimapCtx.fillStyle = 'rgba(66, 133, 244, 0.35)';
    minimapCtx.beginPath();
    minimapCtx.arc(0, 0, 10, 0, Math.PI * 2);
    minimapCtx.fill();

    minimapCtx.fillStyle = '#4285F4';
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 1.5;

    minimapCtx.beginPath();
    minimapCtx.moveTo(7, 0);
    minimapCtx.lineTo(-6, -5);
    minimapCtx.lineTo(-3, 0);
    minimapCtx.lineTo(-6, 5);
    minimapCtx.closePath();

    minimapCtx.fill();
    minimapCtx.stroke();

    minimapCtx.restore();
}

/* ==========================================================================
   MODAL PORTOFOLIO & UI LAIN
   ========================================================================== */

export function teleportToZone(zoneId) {
    const sec = SECTIONS.find(s => s.id === zoneId);
    if (sec) {
        car.x = sec.x;
        car.y = sec.y;
        car.speed = 0;
        car.vx = 0;
        car.vy = 0;
        playBeepSound(800, 0.1);
        openModal(zoneId);
    }
}

export function openModal(zoneId) {
    const content = sectionContents[zoneId];
    if (!content) return;

    ui.isModalOpen = true;
    playBeepSound(900, 0.2);

    const titleElem = document.getElementById('modalTitle');
    const iconElem = document.getElementById('modalIcon');
    const bodyElem = document.getElementById('modalBody');

    if (titleElem) titleElem.innerText = content.title;
    if (iconElem) iconElem.className = `fa-solid ${content.icon}`;
    if (bodyElem) bodyElem.innerHTML = content.html;

    const overlay = document.getElementById('modalOverlay');
    const container = document.getElementById('modalContainer');

    if (overlay && container) {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }
}

export function closeModal() {
    if (!ui.isModalOpen) return;
    ui.isModalOpen = false;
    playBeepSound(400, 0.15);

    const overlay = document.getElementById('modalOverlay');
    const container = document.getElementById('modalContainer');

    if (overlay && container) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
        container.classList.remove('scale-100');
        container.classList.add('scale-95');
    }

    car.x += Math.cos(car.angle) * 25;
    car.y += Math.sin(car.angle) * 25;

    ui.activePitStop = null;
    ui.stopTimer = 0;
    ui.pitCooldownTimer = 5.0;

    const indicator = document.getElementById('zoneIndicator');
    if (indicator) indicator.classList.add('opacity-0', '-translate-y-4');
}

export function handleFormSubmit(e) {
    e.preventDefault();
    playBeepSound(1000, 0.3);
    alert("Transmission Sent Successfully! Thank you for visiting.");
    closeModal();
}

export function showNewRecordNotification(timeFormatted) {
    const banner = document.getElementById('newRecordBanner');
    const timeElem = document.getElementById('newRecordTime');

    if (!banner || !timeElem) return;

    timeElem.innerText = timeFormatted;

    if (ui.recordBannerTimeout) clearTimeout(ui.recordBannerTimeout);

    banner.classList.remove('hidden');
    banner.classList.add('flex');

    playBeepSound(1500, 0.4);

    ui.recordBannerTimeout = setTimeout(() => {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }, 3000);
}

/** Mengaktifkan / mematikan mode visual CRT Retro. */
export function toggleCRT() {
    document.body.classList.toggle('crt');
    const isCRT = document.body.classList.contains('crt');
    const btn = document.getElementById('crtToggle');
    const dot = document.getElementById('crtDot');

    if (btn && dot) {
        if (isCRT) {
            btn.className = "font-pixel text-[9px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/60 px-2.5 py-1.5 rounded flex items-center space-x-1.5 transition";
            dot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]";
        } else {
            btn.className = "font-pixel text-[9px] bg-gray-800 text-gray-400 border border-gray-700 px-2.5 py-1.5 rounded flex items-center space-x-1.5 transition opacity-60";
            dot.className = "w-2 h-2 rounded-full bg-gray-500";
        }
    }
}
