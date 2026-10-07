/**
 * ============================================================================
 * GENERALLY PORTFOLIO - ARCADE RACING ENGINE & INTERACTIVE CIRCUIT
 * ============================================================================
 *
 * File        : game.js
 * Description : Core game loop, Web Audio synthesizer, canvas renderer,
 *               physics engine, checkpoint system, and UI modal manager.
 * ============================================================================
 */

/* ==========================================================================
   SECTION 1: GLOBAL CONFIGURATION & GAME STATE
   ========================================================================== */

/** Ukuran Dunia Game */
let WORLD = { width: 3200, height: 2400 };

/** Data Seksi Portfolio, Waypoints, dan Modal Content */
let SECTIONS = [];
let trackWaypoints = [];
let sectionContents = {};

/** Koleksi Objek Peta & Prefab */
let MAP_OBJECTS = {
    concreteZones: [],
    parkingLots: [],
    sandTraps: [],
    lakes: [],
    buildings: [],
    grandstands: [],
    props: [],
    checkpoints: [],
    ghostCar: {}
};

/** Pattern Canvas Noise untuk Pasir/Tanah */
let noisePattern = null;

/** Konfigurasi & State Kendaraan */
let car = {
    x: 600, y: 2050, angle: 0, speed: 0,
    vx: 0, vy: 0,
    maxSpeed: 8.5, reverseSpeed: -2.5, accel: 0.18, decel: 0.05, brake: 0.20, turnSpeed: 0.055,
    gripNormal: 0.92,
    gripDrift: 0.975,
    width: 22, height: 38, color: '#EDD139',
    inWater: false
};

/** Konfigurasi Pit Crew */
let pitCrewConfig = {
    speed: 0.6,
    stopDuration: 1.5,
    offsets: [
        { x: 0, y: -25 }, { x: -18, y: -10 }, { x: -18, y: 10 },
        { x: 18, y: -10 }, { x: 18, y: 10 }
    ]
};

/** Kontrol Kamera & Zoom Dynamics */
let cameraZoom = 1.0;
const MIN_ZOOM = 0.80;
const MAX_ZOOM = 2.50;
const ZOOM_SMOOTHING = 0.05;

/** System Partikel & Jejak Ban */
let bloodParticles = [];
let dustParticles = [];
let exhaustSmokeParticles = [];
let waterRipples = [];
let skidMarks = [];
let cameraFlashes = [];
const HIGH_SPEED_IMPACT_THRESHOLD = 4.0;

/** State Input Keyboard & Touch */
const keys = { up: false, down: false, left: false, right: false };

/** State Pit Stop & Modal UI */
let crewMembers = [];
let activePitStop = null;
let stopTimer = 0;
let pitCooldownTimer = 0;
let isModalOpen = false;

/** Checkpoint & Lap State Engine */
let nextCheckpointIndex = 0;
let totalLapsCompleted = 0;
let lapStartTime = null;
let currentLapTime = 0;
let bestLapTime = null;
let isLapActive = false;
let recordBannerTimeout = null;

/** Validasi Lap & Ghost Car Data */
let isLapInvalid = false;
let currentLapTrail = [];
let bestLapTrail = [];
const MAX_LAP_TIME_SECONDS = 120;

/* ==========================================================================
   SECTION 2: MATH & PHYSICS UTILITIES
   ========================================================================== */

/**
 * Melakukan Interpolasi Linear antara dua nilai.
 */
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

/**
 * Melakukan Interpolasi Linear khusus untuk sudut radian (shortest path).
 */
function lerpAngle(a, b, t) {
    const max = Math.PI * 2;
    const da = (b - a) % max;
    const shortestDistance = (2 * da) % max - da;
    return a + shortestDistance * t;
}

/**
 * Memeriksa apakah suatu titik berada di dalam Elips terotasi.
 */
function isPointInRotatedEllipse(px, py, cx, cy, rx, ry, rot) {
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const dx = px - cx;
    const dy = py - cy;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    return ((localX * localX) / (rx * rx) + (localY * localY) / (ry * ry)) <= 1.0;
}

/**
 * Memeriksa apakah suatu titik berada di dalam Persegi Panjang terotasi.
 */
function isPointInRotatedRect(px, py, rx, ry, rw, rh, rot) {
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const dx = px - rx;
    const dy = py - ry;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    return (localX >= -rw / 2 && localX <= rw / 2 && localY >= -rh / 2 && localY <= rh / 2);
}

/* ==========================================================================
   SECTION 3: PROCEDURAL WEB AUDIO SYNTHESIZER
   ========================================================================== */

let audioCtx = null;
let soundEnabled = false;
let engineOsc = null;
let engineGain = null;

/**
 * Inisialisasi AudioContext dan Node Oscillator Mesin.
 */
function initAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioCtx.currentTime);

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

/**
 * Mengaktifkan/mematikan suara game.
 */
function toggleSound() {
    if (!audioCtx) initAudio();
    soundEnabled = !soundEnabled;
    
    const soundIcon = document.getElementById('soundIcon');
    if (soundEnabled) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (soundIcon) soundIcon.className = "fa-solid fa-volume-high text-green-400";
    } else {
        if (engineGain) engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
        if (soundIcon) soundIcon.className = "fa-solid fa-volume-xmark text-gray-400";
    }
}

/**
 * Mengubah pitch dan volume mesin berdasarkan persentase kecepatan.
 */
function updateEngineAudio(speedPercent) {
    if (!soundEnabled || !engineOsc || !audioCtx) return;
    const pitch = 40 + (speedPercent * 160);
    const volume = 0.05 + (speedPercent * 0.1);
    engineOsc.frequency.setTargetAtTime(pitch, audioCtx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
}

/**
 * Memainkan efek suara Beep UI/Checkpoint.
 */
function playBeepSound(freq = 600, duration = 0.15) {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

/**
 * Memainkan efek suara Tabrakan / Crash.
 */
function playCrashSound() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

/**
 * Memainkan efek suara impact pneumatik pit crew.
 */
function playImpactPneumaticSound() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

/**
 * Mengaktifkan / mematikan mode visual CRT Retro.
 */
function toggleCRT() {
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

/* ==========================================================================
   SECTION 4: INITIALIZATION & MAP DATA PROCESSING
   ========================================================================== */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createNoisePattern() {
    const nCanvas = document.createElement('canvas');
    nCanvas.width = 128;
    nCanvas.height = 128;
    const nCtx = nCanvas.getContext('2d');
    const imgData = nCtx.createImageData(128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const val = Math.random() * 35;
        imgData.data[i] = 0;
        imgData.data[i + 1] = 0;
        imgData.data[i + 2] = 0;
        imgData.data[i + 3] = val;
    }
    nCtx.putImageData(imgData, 0, 0);
    noisePattern = ctx.createPattern(nCanvas, 'repeat');
}

function processPrefabs(rawObjects) {
    MAP_OBJECTS.concreteZones = rawObjects.concreteZones || [];
    MAP_OBJECTS.parkingLots = rawObjects.parkingLots || [];
    MAP_OBJECTS.sandTraps = rawObjects.sandTraps || [];
    MAP_OBJECTS.ghostCar = rawObjects.ghostCar || {};

    MAP_OBJECTS.lakes = (rawObjects.lakes || []).map(l => ({
        ...l,
        rot: l.rot || 0,
        speedLimit: l.speedLimit || 1.8,
        slowFactor: l.slowFactor || 0.75
    }));

    MAP_OBJECTS.buildings = (rawObjects.buildings || []).map(b => ({
        ...b,
        rot: b.rot || 0,
        isStatic: b.isStatic !== undefined ? b.isStatic : true
    }));

    MAP_OBJECTS.grandstands = (rawObjects.grandstands || []).map(gs => {
        const paddingX = 6;
        const paddingY = 8;
        const availableW = gs.w - paddingX * 2;
        const availableH = gs.h - paddingY * 2;
        const colWidth = availableW / gs.cols;
        const rowHeight = availableH / gs.rows;
        const shirtColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#ffffff'];

        const spectators = [];
        for (let r = 0; r < gs.rows; r++) {
            for (let c = 0; c < gs.cols; c++) {
                if (Math.random() > 0.05) {
                    spectators.push({
                        localX: (paddingX + c * colWidth + colWidth / 2) - gs.w / 2,
                        localY: (paddingY + r * rowHeight + rowHeight / 2) - gs.h / 2,
                        shirtColor: shirtColors[Math.floor(Math.random() * shirtColors.length)],
                        skinColor: Math.random() > 0.5 ? '#fca5a5' : '#fde047',
                        jumpOffset: 0,
                        jumpSpeed: 0.05 + Math.random() * 0.05,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }
        }

        return {
            ...gs,
            rot: gs.rot || 0,
            isStatic: gs.isStatic !== undefined ? gs.isStatic : true,
            lastFlashTime: 0,
            flashCooldown: 0.3 + Math.random() * 0.4,
            spectators: spectators
        };
    });

    MAP_OBJECTS.checkpoints = (rawObjects.checkpoints || []).map(cp => ({
        ...cp,
        rot: cp.rot || 0
    }));

    MAP_OBJECTS.props = (rawObjects.props || []).map(p => ({
        ...p,
        rot: p.rot || 0,
        vx: 0,
        vy: 0,
        vRot: 0,
        isStatic: p.isStatic !== undefined ? p.isStatic : false
    }));

    if (rawObjects.prefabs) {
        rawObjects.prefabs.forEach(p => {
            if (p.prefab === 'cone_line') {
                p.points.forEach(pt => {
                    MAP_OBJECTS.props.push({
                        id: p.id,
                        type: 'cone',
                        layer: p.layer || 3,
                        x: pt.x,
                        y: pt.y,
                        r: p.r || 12,
                        rot: 0,
                        vx: 0, vy: 0, vRot: 0,
                        isStatic: false,
                        bounceFactor: p.bounceFactor || 0.3
                    });
                });
            }

            if (p.prefab === 'road_barrier_line') {
                p.barriers.forEach((b, index) => {
                    const color = (index % 2 === 0) ? '#ef4444' : '#e2e8f0';

                    MAP_OBJECTS.props.push({
                        id: p.id,
                        type: 'road_barrier',
                        layer: p.layer || 3,
                        x: b.x,
                        y: b.y,
                        w: p.width || 38,
                        h: p.height || 14,
                        r: (p.width || 38) / 2,
                        rot: b.rot || 0,
                        color: color,
                        vx: 0, vy: 0, vRot: 0,
                        isStatic: p.isStatic !== undefined ? p.isStatic : true,
                        bounceFactor: p.bounceFactor || 0.5
                    });
                });
            }
        });
    }
}

function initCrew() {
    crewMembers = [];
    SECTIONS.forEach(sec => {
        pitCrewConfig.offsets.forEach((off, idx) => {
            crewMembers.push({
                sectionId: sec.id,
                roleIndex: idx,
                homeX: sec.x + off.x,
                homeY: sec.y + off.y,
                x: sec.x + off.x,
                y: sec.y + off.y,
                vx: 0,
                vy: 0,
                radius: 8,
                targetX: sec.x + off.x,
                targetY: sec.y + off.y,
                color: sec.color,
                animFrame: Math.random() * 10
            });
        });
    });
}

/* ==========================================================================
   SECTION 5: INPUT LISTENERS & TOUCH BINDINGS
   ========================================================================== */

window.addEventListener('keydown', (e) => {
    if (isModalOpen) {
        if (e.key === 'Escape') closeModal();
        return;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

function bindTouchButton(id, keyName) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => { e.preventDefault(); keys[keyName] = true; };
    const end = (e) => { e.preventDefault(); keys[keyName] = false; };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
}

bindTouchButton('btnGas', 'up');
bindTouchButton('btnBrake', 'down');
bindTouchButton('btnLeft', 'left');
bindTouchButton('btnRight', 'right');

/* ==========================================================================
   SECTION 6: PHYSICS ENGINE & COLLISION DETECTION
   ========================================================================== */

function updatePhysics(dt) {
    if (isModalOpen) return;

    if (keys.up) {
        car.speed = Math.min(car.speed + car.accel, car.maxSpeed);
    } else if (keys.down) {
        car.speed = Math.max(car.speed - car.brake, car.reverseSpeed);
    } else {
        if (car.speed > 0) car.speed = Math.max(0, car.speed - car.decel);
        if (car.speed < 0) car.speed = Math.min(0, car.speed + car.decel);
    }

    const currentSpeed = Math.abs(car.speed);
    const speedRatio = currentSpeed / car.maxSpeed;
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

    let currentGrip = car.gripNormal;
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

    // Batas Luar Peta
    const innerBoundary = 35;
    if (nextX < innerBoundary || nextX > WORLD.width - innerBoundary ||
        nextY < innerBoundary || nextY > WORLD.height - innerBoundary) {
        playCrashSound();
        car.speed = -car.speed * 0.5;
        car.vx = -car.vx * 0.5;
        car.vy = -car.vy * 0.5;
        nextX = Math.max(innerBoundary, Math.min(WORLD.width - innerBoundary, car.x));
        nextY = Math.max(innerBoundary, Math.min(WORLD.height - innerBoundary, car.y));
    }

    // Dynamic Objects Update
    MAP_OBJECTS.props.forEach(p => {
        if (!p.isStatic) {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vRot;
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.vRot *= 0.90;
        }
    });

    // Deteksi Tabrakan Bangunan & Tribun Penonton Terotasi
    const staticObjects = [
        ...MAP_OBJECTS.buildings,
        ...(MAP_OBJECTS.grandstands || [])
    ];

    staticObjects.forEach(b => {
        const centerX = b.x + b.w / 2;
        const centerY = b.y + b.h / 2;

        if (isPointInRotatedRect(nextX, nextY, centerX, centerY, b.w + 18, b.h + 18, b.rot || 0)) {
            playCrashSound();
            car.speed = -car.speed * (b.bounceFactor || 0.4);
            car.vx *= -0.4;
            car.vy *= -0.4;
            nextX = car.x;
            nextY = car.y;
        }
    });

    // Deteksi Tabrakan Obstacle / Props
    MAP_OBJECTS.props.forEach(p => {
        const dist = Math.hypot(nextX - p.x, nextY - p.y);
        const minDist = p.r + 12;

        if (dist < minDist) {
            playCrashSound();
            const impactAngle = Math.atan2(p.y - car.y, p.x - car.x);
            const carImpulse = Math.hypot(car.vx, car.vy);

            if (p.isStatic) {
                car.speed = -car.speed * (p.bounceFactor || 0.4);
                car.vx *= -0.4;
                car.vy *= -0.4;
                nextX = p.x - Math.cos(impactAngle) * (minDist + 2);
                nextY = p.y - Math.sin(impactAngle) * (minDist + 2);
            } else {
                const force = Math.max(carImpulse * 1.5, 3.0);
                p.vx = Math.cos(impactAngle) * force;
                p.vy = Math.sin(impactAngle) * force;
                p.vRot = (Math.random() - 0.5) * 0.4 * force;

                car.speed *= 0.85;
                car.vx *= 0.85;
                car.vy *= 0.85;
            }
        }
    });

    // Tabrakan Pit Crew
    crewMembers.forEach(c => {
        const dist = Math.hypot(nextX - c.x, nextY - c.y);
        const minDist = 18;

        if (dist < minDist) {
            const impactSpeed = Math.hypot(car.vx, car.vy);
            const angle = Math.atan2(c.y - nextY, c.x - nextX);
            const knockbackDist = Math.max(25, impactSpeed * 12);

            c.x += Math.cos(angle) * knockbackDist;
            c.y += Math.sin(angle) * knockbackDist;

            if (impactSpeed >= HIGH_SPEED_IMPACT_THRESHOLD) {
                playCrashSound();

                for (let i = 0; i < 3; i++) {
                    const pAngle = angle + (Math.random() - 0.5) * 1.5;
                    const pSpeed = 1 + Math.random() * 2;
                    bloodParticles.push({
                        x: c.x, y: c.y,
                        vx: Math.cos(pAngle) * pSpeed, vy: Math.sin(pAngle) * pSpeed,
                        radius: 2 + Math.random() * 3, alpha: 0.8,
                        decay: 0.02 + Math.random() * 0.03
                    });
                }
            }
            car.speed *= 0.65;
            car.vx *= 0.65;
            car.vy *= 0.65;
        }
    });

    // Sand Traps
    MAP_OBJECTS.sandTraps.forEach(s => {
        if (nextX >= s.x && nextX <= s.x + s.w &&
            nextY >= s.y && nextY <= s.y + s.h) {
            
            const slowFactor = s.slowFactor || 0.82;
            car.speed *= slowFactor;
            car.vx *= slowFactor;
            car.vy *= slowFactor;

            if (Math.abs(car.speed) > 2.0) {
                for (let i = 0; i < 3; i++) {
                    const pAngle = car.angle + Math.PI + (Math.random() - 0.5) * 1.2;
                    const pSpeed = 1 + Math.random() * 2;
                    dustParticles.push({
                        x: car.x + (Math.random() - 0.5) * 15,
                        y: car.y + (Math.random() - 0.5) * 15,
                        vx: Math.cos(pAngle) * pSpeed, vy: Math.sin(pAngle) * pSpeed,
                        radius: 3 + Math.random() * 4, alpha: 0.7,
                        decay: 0.02 + Math.random() * 0.03
                    });
                }
            }
        }
    });

    // Lake / Pond Physics
    car.inWater = false;
    MAP_OBJECTS.lakes.forEach(l => {
        const radiusX = l.w / 2;
        const radiusY = l.h / 2;

        if (isPointInRotatedEllipse(nextX, nextY, l.x, l.y, radiusX, radiusY, l.rot || 0)) {
            car.inWater = true;

            const limit = l.speedLimit || 1.8;
            if (Math.abs(car.speed) > limit) {
                car.speed = Math.sign(car.speed) * Math.max(limit, Math.abs(car.speed) * (l.slowFactor || 0.75));
            }

            car.vx *= 0.88;
            car.vy *= 0.88;

            if (Math.abs(car.speed) > 0.4 && Math.random() < 0.4) {
                waterRipples.push({
                    x: car.x + (Math.random() - 0.5) * 12,
                    y: car.y + (Math.random() - 0.5) * 12,
                    radius: 4,
                    maxRadius: 18 + Math.random() * 10,
                    alpha: 0.8,
                    decay: 0.03
                });
            }
        }
    });

    // Exhaust Smoke
    if (currentSpeed < 0.3 && Math.random() > 0.4 && !car.inWater) {
        const rearOffset = car.height / 2;
        const exhaustX = car.x - cosAngle * rearOffset;
        const exhaustY = car.y - sinAngle * rearOffset;
        const pAngle = car.angle + Math.PI + (Math.random() - 0.5) * 0.6;
        const pSpeed = 0.2 + Math.random() * 0.4;

        exhaustSmokeParticles.push({
            x: exhaustX, y: exhaustY,
            vx: Math.cos(pAngle) * pSpeed, vy: Math.sin(pAngle) * pSpeed,
            radius: 2 + Math.random() * 3, alpha: 0.5,
            decay: 0.015 + Math.random() * 0.01
        });
    }

    // Skid Marks
    if (!car.inWater && (isDrifting || (currentSpeed > 4.5 && isTurning))) {
        const rearOffset = car.height / 2 - 4;
        const sideOffset = car.width / 2 - 3;

        const lx1 = car.x - sinAngle * sideOffset - cosAngle * rearOffset;
        const ly1 = car.y + cosAngle * sideOffset - sinAngle * rearOffset;
        const rx1 = car.x + sinAngle * sideOffset - cosAngle * rearOffset;
        const ry1 = car.y - cosAngle * sideOffset - sinAngle * rearOffset;

        const lx2 = nextX - sinAngle * sideOffset - cosAngle * rearOffset;
        const ly2 = nextY + cosAngle * sideOffset - sinAngle * rearOffset;
        const rx2 = nextX + sinAngle * sideOffset - cosAngle * rearOffset;
        const ry2 = nextY - cosAngle * sideOffset - sinAngle * rearOffset;

        const skidAlpha = isDrifting ? 0.75 : 0.4;
        skidMarks.push({ x1: lx1, y1: ly1, x2: lx2, y2: ly2, alpha: skidAlpha });
        skidMarks.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2, alpha: skidAlpha });

        if (skidMarks.length > 400) skidMarks.splice(0, 2);

        const smokeCount = isDrifting ? 3 : 1; 
        for (let i = 0; i < smokeCount; i++) {
            exhaustSmokeParticles.push({
                x: lx2 + (Math.random() - 0.5) * 4, y: ly2 + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 0.8 - cosAngle * 0.3,
                vy: (Math.random() - 0.5) * 0.8 - sinAngle * 0.3,
                radius: 2 + Math.random() * 2, maxRadius: 18 + Math.random() * 8,
                growth: 0.35 + Math.random() * 0.25, alpha: 0.65,
                decay: 0.012 + Math.random() * 0.008
            });

            exhaustSmokeParticles.push({
                x: rx2 + (Math.random() - 0.5) * 4, y: ry2 + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 0.8 - cosAngle * 0.3,
                vy: (Math.random() - 0.5) * 0.8 - sinAngle * 0.3,
                radius: 2 + Math.random() * 2, maxRadius: 18 + Math.random() * 8,
                growth: 0.35 + Math.random() * 0.25, alpha: 0.65,
                decay: 0.012 + Math.random() * 0.008
            });
        }
    }

    skidMarks.forEach(sm => sm.alpha -= 0.0008);
    skidMarks = skidMarks.filter(sm => sm.alpha > 0);

    car.x = nextX;
    car.y = nextY;

    updateEngineAudio(currentSpeed / car.maxSpeed);

    // Update Speedometer UI
    const speedKmh = Math.round(currentSpeed * 18);
    const speedGauge = document.getElementById('speedDisplay');
    if (speedGauge) {
        speedGauge.innerText = speedKmh.toString().padStart(3, '0');
    }
    drawClassicSpeedometer(speedKmh, car.maxSpeed * 18);

    checkPitProximity(dt);
    checkCheckpoints();
    updateLapTimer();

    // Logika Penonton & Camera Flash
    const nowSec = performance.now() / 1000;

    (MAP_OBJECTS.grandstands || []).forEach(gs => {
        const centerX = gs.x + gs.w / 2;
        const centerY = gs.y + gs.h / 2;
        const triggerRadius = gs.triggerRadius || 300;

        const distToCar = Math.hypot(car.x - centerX, car.y - centerY);
        const carSpeed = Math.hypot(car.vx, car.vy);
        const isTriggered = (distToCar < triggerRadius) && (carSpeed > 0.5);

        (gs.spectators || []).forEach(s => {
            if (isTriggered) {
                s.phase += s.jumpSpeed * (1 + carSpeed * 0.1);
                s.jumpOffset = Math.abs(Math.sin(s.phase)) * 6;
            } else {
                s.jumpOffset *= 0.85;
            }
        });

        if (isTriggered) {
            const currentActiveFlashes = cameraFlashes.filter(f => f.gsId === gs.id).length;
            const cooldown = gs.flashCooldown || 0.4;

            if (currentActiveFlashes < 3 && (nowSec - gs.lastFlashTime) > cooldown) {
                if (Math.random() < 0.35 && gs.spectators && gs.spectators.length > 0) {
                    const randomSpec = gs.spectators[Math.floor(Math.random() * gs.spectators.length)];
                    
                    const cosR = Math.cos(gs.rot || 0);
                    const sinR = Math.sin(gs.rot || 0);
                    const flashWorldX = centerX + (randomSpec.localX * cosR - (randomSpec.localY - randomSpec.jumpOffset) * sinR);
                    const flashWorldY = centerY + (randomSpec.localX * sinR + (randomSpec.localY - randomSpec.jumpOffset) * cosR);

                    cameraFlashes.push({
                        gsId: gs.id,
                        x: flashWorldX,
                        y: flashWorldY,
                        radius: 18 + Math.random() * 22,
                        alpha: 1.0,
                        decay: 0.08 + Math.random() * 0.06
                    });

                    gs.lastFlashTime = nowSec;
                    gs.flashCooldown = 0.3 + Math.random() * 0.5;
                }
            }
        }
    });

    for (let i = cameraFlashes.length - 1; i >= 0; i--) {
        const flash = cameraFlashes[i];
        flash.alpha -= flash.decay;
        if (flash.alpha <= 0) {
            cameraFlashes.splice(i, 1);
        }
    }

    for (let i = waterRipples.length - 1; i >= 0; i--) {
        const r = waterRipples[i];
        r.radius += 0.4;
        r.alpha -= r.decay;
        if (r.alpha <= 0 || r.radius >= r.maxRadius) {
            waterRipples.splice(i, 1);
        }
    }
}

/* ==========================================================================
   SECTION 7: CHECKPOINT & PIT CREW ENGINE
   ========================================================================== */

function checkCheckpoints() {
    if (!MAP_OBJECTS.checkpoints || MAP_OBJECTS.checkpoints.length === 0) return;

    const targetCP = MAP_OBJECTS.checkpoints[nextCheckpointIndex];
    if (!targetCP) return;

    if (isPointInRotatedRect(car.x, car.y, targetCP.x, targetCP.y, targetCP.w, targetCP.h, targetCP.rot || 0)) {
        
        if (nextCheckpointIndex === 0) {
            if (!isLapActive) {
                isLapActive = true;
                isLapInvalid = false;
                lapStartTime = performance.now();
                currentLapTrail = [];
                playBeepSound(1200, 0.3);

                nextCheckpointIndex = 1 % MAP_OBJECTS.checkpoints.length;
                return;
            }

            if (isLapActive) {
                const lapTime = (performance.now() - lapStartTime) / 1000;
                
                if (!isLapInvalid && lapTime <= MAX_LAP_TIME_SECONDS) {
                    totalLapsCompleted++;

                    if (!bestLapTime || lapTime < bestLapTime) {
                        bestLapTime = lapTime;
                        bestLapTrail = [...currentLapTrail];

                        const bMins = Math.floor(bestLapTime / 60).toString().padStart(2, '0');
                        const bSecs = Math.floor(bestLapTime % 60).toString().padStart(2, '0');
                        const bMs = Math.floor((bestLapTime % 1) * 100).toString().padStart(2, '0');
                        const formattedBest = `${bMins}:${bSecs}.${bMs}`;
                        
                        const bestDisplay = document.getElementById('bestLapDisplay');
                        if (bestDisplay) bestDisplay.innerText = `BEST: ${formattedBest}`;

                        showNewRecordNotification(formattedBest);
                    }
                } else {
                    console.warn("Lap Invalid: Melebihi batas waktu 2 menit.");
                }

                lapStartTime = performance.now();
                isLapInvalid = false;
                currentLapTrail = [];
                playBeepSound(1200, 0.3);

                nextCheckpointIndex = 1 % MAP_OBJECTS.checkpoints.length;
            }

        } else {
            playBeepSound(900, 0.15);
            nextCheckpointIndex = (nextCheckpointIndex + 1) % MAP_OBJECTS.checkpoints.length;
        }
    }
}

function checkPitProximity(dt) {
    if (pitCooldownTimer > 0) pitCooldownTimer -= dt;

    let nearSection = null;
    if (pitCooldownTimer <= 0) {
        SECTIONS.forEach(sec => {
            if (Math.hypot(car.x - sec.x, car.y - sec.y) < 110) nearSection = sec;
        });
    }

    const indicator = document.getElementById('zoneIndicator');

    if (nearSection) {
        activePitStop = nearSection;
        const textElem = document.getElementById('zoneIndicatorText');
        if (textElem) textElem.innerText = `PIT CREW SERVICING ${nearSection.title}`;
        if (indicator) indicator.classList.remove('opacity-0', '-translate-y-4');

        if (Math.hypot(car.vx, car.vy) < 1.2) {
            stopTimer += dt;
            if (stopTimer >= pitCrewConfig.stopDuration && !isModalOpen) {
                openModal(nearSection.id);
            }
        } else {
            stopTimer = Math.max(0, stopTimer - dt * 2);
        }
    } else {
        activePitStop = null;
        stopTimer = 0;
        if (indicator) indicator.classList.add('opacity-0', '-translate-y-4');
    }

    const carSpeed = Math.hypot(car.vx, car.vy);

    crewMembers.forEach(c => {
        c.animFrame += 0.08;

        if (activePitStop && activePitStop.id === c.sectionId) {
            const cos = Math.cos(car.angle);
            const sin = Math.sin(car.angle);

            let offX = 0, offY = 0;
            if (c.roleIndex === 0) { offX = 26; offY = 0; }
            else if (c.roleIndex === 1) { offX = 12; offY = -22; }
            else if (c.roleIndex === 2) { offX = -12; offY = -22; }
            else if (c.roleIndex === 3) { offX = 12; offY = 22; }
            else if (c.roleIndex === 4) { offX = -12; offY = 22; }

            c.targetX = car.x + (offX * cos - offY * sin);
            c.targetY = car.y + (offX * sin + offY * cos);
        } else {
            c.targetX = c.homeX;
            c.targetY = c.homeY;
        }

        let dx = c.targetX - c.x;
        let dy = c.targetY - c.y;
        let distToTarget = Math.hypot(dx, dy);

        if (distToTarget > 2) {
            c.vx += (dx / distToTarget) * 0.25;
            c.vy += (dy / distToTarget) * 0.25;
        }

        const distToCar = Math.hypot(c.x - car.x, c.y - car.y);
        const avoidRadius = 24;

        if (distToCar < avoidRadius && carSpeed < HIGH_SPEED_IMPACT_THRESHOLD) {
            const pushAngle = Math.atan2(c.y - car.y, c.x - car.x);
            c.vx += Math.cos(pushAngle) * 0.5;
            c.vy += Math.sin(pushAngle) * 0.5;
        }

        if (distToCar < 18 && carSpeed >= HIGH_SPEED_IMPACT_THRESHOLD) {
            playCrashSound();

            const impactAngle = Math.atan2(c.y - car.y, c.x - car.x);
            const knockForce = carSpeed * 3.5;

            c.vx = Math.cos(impactAngle) * knockForce;
            c.vy = Math.sin(impactAngle) * knockForce;

            for (let i = 0; i < 3; i++) {
                const pAngle = impactAngle + (Math.random() - 0.5) * 1.2;
                const pSpeed = 1 + Math.random() * 2;
                bloodParticles.push({
                    x: c.x, y: c.y,
                    vx: Math.cos(pAngle) * pSpeed, vy: Math.sin(pAngle) * pSpeed,
                    radius: 2 + Math.random() * 3, alpha: 0.8,
                    decay: 0.02 + Math.random() * 0.03
                });
            }

            car.speed *= 0.7;
            car.vx *= 0.7;
            car.vy *= 0.7;
        }

        c.x += c.vx;
        c.y += c.vy;
        c.vx *= 0.85;
        c.vy *= 0.85;
    });
}

/* ==========================================================================
   SECTION 8: CANVAS RENDERING PIPELINE
   ========================================================================== */

function drawClassicSpeedometer(currentSpeed, maxSpeed) {
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

function drawGroundLayers() {
    ctx.save();
    
    MAP_OBJECTS.concreteZones.forEach(cz => {
        ctx.fillStyle = cz.fillColor || '#8f9bba';
        ctx.fillRect(cz.x, cz.y, cz.w, cz.h);

        ctx.strokeStyle = cz.gridColor || '#7884a5';
        ctx.lineWidth = 3;
        const gSize = cz.gridSize || 100;
        for (let x = cz.x + gSize; x < cz.x + cz.w; x += gSize) {
            ctx.beginPath();
            ctx.moveTo(x, cz.y);
            ctx.lineTo(x, cz.y + cz.h);
            ctx.stroke();
        }
    });

    MAP_OBJECTS.parkingLots.forEach(pl => {
        ctx.fillStyle = pl.fillColor || '#9aa5c4';
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(pl.x + 5, pl.y + 5, pl.w - 10, pl.h - 10);

        const slotW = (pl.w - 20) / pl.cols;
        const slotH = (pl.h - 40) / pl.rows;

        ctx.lineWidth = 2;
        for (let r = 0; r < pl.rows; r++) {
            for (let c = 0; c < pl.cols; c++) {
                const sx = pl.x + 10 + c * slotW;
                const sy = pl.y + 20 + r * slotH;
                ctx.strokeRect(sx, sy, slotW, slotH);

                ctx.fillStyle = pl.stopColor || '#eab308';
                ctx.fillRect(sx + 6, sy + 4, slotW - 12, 5);
            }
        }
    });

    MAP_OBJECTS.sandTraps.forEach(s => {
        ctx.fillStyle = s.fillColor || '#d97706';
        ctx.fillRect(s.x, s.y, s.w, s.h);

        if (noisePattern) {
            ctx.fillStyle = noisePattern;
            ctx.fillRect(s.x, s.y, s.w, s.h);
        }
    });
    
    ctx.restore();
}

function drawLakesBase() {
    MAP_OBJECTS.lakes.forEach(l => {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rot || 0);

        const radiusX = l.w / 2;
        const radiusY = l.h / 2;

        ctx.fillStyle = l.bankColor || '#b45309';
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX + 12, radiusY + 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = l.deepColor || '#1e3a8a';
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });
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

    waterRipples.forEach(r => {
        ctx.save();
        ctx.strokeStyle = `rgba(191, 219, 254, ${r.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });
}

function drawTarmacTrack() {
    ctx.save();

    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 150;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(600, 2050); 
    ctx.lineTo(2400, 2050);

    ctx.arcTo(2900, 2050, 2900, 1700, 250);
    ctx.arcTo(2900, 1600, 2400, 1400, 250);

    ctx.lineTo(1900, 1300); 
    ctx.bezierCurveTo(1700, 1200, 1800, 950, 2100, 950);

    ctx.bezierCurveTo(2700, 950, 3000, 400, 2500, 250);
    ctx.bezierCurveTo(2000, 100, 1500, 700, 1300, 850);

    ctx.lineTo(1300, 300);
    ctx.arcTo(1300, 200, 1100, 200, 100);
    ctx.lineTo(600, 200);
    ctx.arcTo(500, 200, 500, 300, 100);
    ctx.lineTo(500, 1200);

    ctx.bezierCurveTo(500, 1400, 1000, 1300, 1000, 1500);
    ctx.bezierCurveTo(1000, 1700, 400, 1650, 400, 1850);

    ctx.arcTo(400, 2050, 600, 2050, 200);

    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 130;
    ctx.stroke();

    ctx.save();
    ctx.translate(800, 2050);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    for (let i = -65; i < 65; i += 20) {
        for (let j = -10; j < 10; j += 10) {
            if (((i / 20) + (j / 10)) % 2 === 0) {
                ctx.fillRect(j, i, 10, 10);
            }
        }
    }
    ctx.restore();

    ctx.restore();
}

function drawCheckpoints() {
    MAP_OBJECTS.checkpoints.forEach((cp, idx) => {
        const isNext = (idx === nextCheckpointIndex);
        const isStartFinish = (idx === 0);

        ctx.save();
        ctx.translate(cp.x, cp.y);
        ctx.rotate(cp.rot || 0);

        if (isStartFinish) {
            ctx.fillStyle = isNext ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.15)';
            ctx.strokeStyle = isNext ? '#60a5fa' : '#3b82f6';
        } else {
            ctx.fillStyle = isNext ? 'rgba(34, 197, 94, 0.25)' : 'rgba(234, 179, 8, 0.15)';
            ctx.strokeStyle = isNext ? '#22c55e' : '#eab308';
        }
        
        ctx.lineWidth = isNext ? 4 : 2;
        if (isNext) ctx.setLineDash([8, 6]);

        ctx.fillRect(-cp.w / 2, -cp.h / 2, cp.w, cp.h);
        ctx.strokeRect(-cp.w / 2, -cp.h / 2, cp.w, cp.h);

        const sideOffsets = [-cp.w / 2 - 12, cp.w / 2 + 12];
        sideOffsets.forEach(offsetX => {
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.arc(offsetX, 0, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isStartFinish ? '#3b82f6' : (isNext ? '#22c55e' : '#eab308');
            ctx.fillRect(offsetX - 3, -25, 6, 25);

            ctx.fillStyle = isStartFinish ? '#2563eb' : (isNext ? '#16a34a' : '#ca8a04');
            ctx.beginPath();
            ctx.moveTo(offsetX, -25);
            ctx.lineTo(offsetX + (offsetX < 0 ? -20 : 20), -17);
            ctx.lineTo(offsetX, -9);
            ctx.closePath();
            ctx.fill();
        });

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(cp.label || (isStartFinish ? "START / FINISH" : `CP ${idx}`), 0, -cp.h / 2 - 15);

        ctx.restore();
    });
}

function drawBuildings() {
    MAP_OBJECTS.buildings.forEach(b => {
        ctx.save();
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.rotate(b.rot || 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(-b.w / 2 + 12, -b.h / 2 + 12, b.w, b.h);

        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 4;
        ctx.strokeRect(-b.w / 2 + 4, -b.h / 2 + 4, b.w - 8, b.h - 8);

        ctx.fillStyle = b.accent;
        ctx.fillRect(-b.w / 2 + 8, -b.h / 2 + 8, b.w - 16, 8);

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, 0, 4);

        ctx.restore();
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

    cameraFlashes.forEach(f => {
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
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);

        if (p.type === 'tires') {
            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = '#374151';
            ctx.beginPath();
            ctx.arc(0, 0, p.r * 0.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'cone') {
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'road_barrier') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(-p.w / 2 + 2, -p.h / 2 + 3, p.w, p.h);

            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);

            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(-p.w / 2, -p.h / 6, p.w, p.h / 3);
        }
        ctx.restore();
    });
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

        if (activePitStop && activePitStop.id === c.sectionId && stopTimer > 0) {
            if (Math.random() > 0.4) {
                ctx.fillStyle = '#fef08a';
                ctx.fillRect((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 2, 2);
                if (Math.random() > 0.7) playImpactPneumaticSound();
            }
        }

        ctx.restore();
    });
}

function drawWorld() {
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    drawGroundLayers();
    drawLakesBase();
    drawTarmacTrack();
    drawCheckpoints();
    drawBuildings();
    drawGrandstands();
    drawProps();
    drawOverheadBannersAndCrew();
    drawFenceBorder();
}

function drawDustParticles() {
    ctx.save();
    for (let i = dustParticles.length - 1; i >= 0; i--) {
        const p = dustParticles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            dustParticles.splice(i, 1);
            continue;
        }

        ctx.fillStyle = `rgba(217, 119, 6, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawBloodParticles() {
    ctx.save();
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const p = bloodParticles[i];

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            bloodParticles.splice(i, 1);
            continue;
        }

        ctx.fillStyle = `rgba(180, 0, 0, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawExhaustSmokeParticles() {
    ctx.save();
    for (let i = exhaustSmokeParticles.length - 1; i >= 0; i--) {
        let p = exhaustSmokeParticles[i];

        p.x += p.vx;
        p.y += p.vy;

        if (p.growth && p.radius < (p.maxRadius || 20)) {
            p.radius += p.growth;
        }

        p.alpha -= p.decay || 0.02;

        if (p.alpha <= 0) {
            exhaustSmokeParticles.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 220, 225, ${p.alpha})`;
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

function drawSkidMarks() {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    skidMarks.forEach(sm => {
        ctx.globalAlpha = sm.alpha;
        ctx.beginPath();
        ctx.moveTo(sm.x1, sm.y1);
        ctx.lineTo(sm.x2, sm.y2);
        ctx.stroke();
    });
    ctx.globalAlpha = 1.0;
}

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

    if (activePitStop && stopTimer > 0) {
        const progress = Math.min(stopTimer / pitCrewConfig.stopDuration, 1);
        ctx.save();
        ctx.beginPath();
        ctx.arc(car.x, car.y, 38, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
        ctx.lineWidth = 5;
        ctx.strokeStyle = activePitStop.color;
        ctx.stroke();

        ctx.font = '8px "Press Start 2P"';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText("SERVICING...", car.x, car.y - 45);
        ctx.restore();
    }
}

/* ==========================================================================
   SECTION 9: GHOST CAR & LAP RECORDING ENGINE
   ========================================================================== */

function recordGhostFrame() {
    if (isLapActive && lapStartTime && !isLapInvalid) {
        currentLapTrail.push({
            t: (performance.now() - lapStartTime) / 1000,
            x: car.x,
            y: car.y,
            rot: car.angle
        });
    }
}

function drawGhostCar() {
    if (!isLapActive || !bestLapTrail || bestLapTrail.length === 0 || !lapStartTime) return;

    const config = MAP_OBJECTS.ghostCar || {};
    const gap = config.gap !== undefined ? config.gap : 0.1;
    const targetTime = currentLapTime + gap;

    const lastFrame = bestLapTrail[bestLapTrail.length - 1];
    if (targetTime >= lastFrame.t) {
        const dist = Math.hypot(car.x - lastFrame.x, car.y - lastFrame.y);
        const alpha = calculateGhostAlpha(dist, config);
        renderGhostCarGraphic(lastFrame.x, lastFrame.y, lastFrame.rot, alpha, config);
        return;
    }

    let prevFrame = bestLapTrail[0];
    let nextFrame = bestLapTrail[0];

    for (let i = 0; i < bestLapTrail.length - 1; i++) {
        if (bestLapTrail[i].t <= targetTime && bestLapTrail[i + 1].t >= targetTime) {
            prevFrame = bestLapTrail[i];
            nextFrame = bestLapTrail[i + 1];
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

/* ==========================================================================
   SECTION 10: TELEMETRY, MINIMAP & UI MODAL CONTROLLER
   ========================================================================== */

function teleportToZone(zoneId) {
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

function openModal(zoneId) {
    const content = sectionContents[zoneId];
    if (!content) return;

    isModalOpen = true;
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

function closeModal() {
    if (!isModalOpen) return;
    isModalOpen = false;
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

    activePitStop = null;
    stopTimer = 0;
    pitCooldownTimer = 5.0;

    const indicator = document.getElementById('zoneIndicator');
    if (indicator) indicator.classList.add('opacity-0', '-translate-y-4');
}

function handleFormSubmit(e) {
    e.preventDefault();
    playBeepSound(1000, 0.3);
    alert("Transmission Sent Successfully! Thank you for visiting.");
    closeModal();
}

function updateLapTimer() {
    const timerDisplay = document.getElementById('timerDisplay');
    const cpDisplay = document.getElementById('cpDisplay');

    if (!isLapActive || !lapStartTime) {
        if (timerDisplay) {
            timerDisplay.innerText = "00:00.00";
            timerDisplay.style.color = "#ffffff";
        }
        if (cpDisplay) {
            cpDisplay.innerText = `START / FINISH | LAP: ${totalLapsCompleted}`;
        }
        return;
    }

    currentLapTime = (performance.now() - lapStartTime) / 1000;

    if (currentLapTime > MAX_LAP_TIME_SECONDS) {
        isLapInvalid = true;
    }

    const mins = Math.floor(currentLapTime / 60).toString().padStart(2, '0');
    const secs = Math.floor(currentLapTime % 60).toString().padStart(2, '0');
    const ms = Math.floor((currentLapTime % 1) * 100).toString().padStart(2, '0');

    if (timerDisplay) {
        timerDisplay.innerText = `${mins}:${secs}.${ms}`;
        timerDisplay.style.color = isLapInvalid ? "#ef4444" : "#ffffff";
    }

    if (cpDisplay && MAP_OBJECTS.checkpoints.length > 0) {
        if (isLapInvalid) {
            cpDisplay.innerText = `INVALID LAP (> 2 MINS) | LAP: ${totalLapsCompleted}`;
        } else {
            const currentCP = MAP_OBJECTS.checkpoints[nextCheckpointIndex];
            const cpName = currentCP ? (currentCP.label || `CP ${nextCheckpointIndex}`) : 'START/FINISH';
            cpDisplay.innerText = `NEXT: ${cpName} | LAP: ${totalLapsCompleted}`;
        }
    }
}

function showNewRecordNotification(timeFormatted) {
    const banner = document.getElementById('newRecordBanner');
    const timeElem = document.getElementById('newRecordTime');
    
    if (!banner || !timeElem) return;

    timeElem.innerText = timeFormatted;

    if (recordBannerTimeout) clearTimeout(recordBannerTimeout);

    banner.classList.remove('hidden');
    banner.classList.add('flex');

    playBeepSound(1500, 0.4);

    recordBannerTimeout = setTimeout(() => {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }, 3000);
}

function drawMinimap() {
    if (!minimapCtx) return;
    const scaleX = minimapCanvas.width / WORLD.width;
    const scaleY = minimapCanvas.height / WORLD.height;

    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    minimapCtx.save();
    const avgScale = (scaleX + scaleY) / 2;
    
    minimapCtx.strokeStyle = '#475569';
    minimapCtx.lineWidth = 140 * avgScale;
    minimapCtx.lineCap = 'round';
    minimapCtx.lineJoin = 'round';

    minimapCtx.beginPath();
    minimapCtx.moveTo(600 * scaleX, 2050 * scaleY); 
    minimapCtx.lineTo(2400 * scaleX, 2050 * scaleY);

    minimapCtx.arcTo(2900 * scaleX, 2050 * scaleY, 2900 * scaleX, 1700 * scaleY, 250 * avgScale);
    minimapCtx.arcTo(2900 * scaleX, 1600 * scaleY, 2400 * scaleX, 1400 * scaleY, 250 * avgScale);

    minimapCtx.lineTo(1900 * scaleX, 1300 * scaleY); 
    minimapCtx.bezierCurveTo(
        1700 * scaleX, 1200 * scaleY, 
        1800 * scaleX, 950 * scaleY, 
        2100 * scaleX, 950 * scaleY
    );

    minimapCtx.bezierCurveTo(
        2700 * scaleX, 950 * scaleY, 
        3000 * scaleX, 400 * scaleY, 
        2500 * scaleX, 250 * scaleY
    );
    minimapCtx.bezierCurveTo(
        2000 * scaleX, 100 * scaleY, 
        1500 * scaleX, 700 * scaleY, 
        1300 * scaleX, 850 * scaleY
    );

    minimapCtx.lineTo(1300 * scaleX, 300 * scaleY);
    minimapCtx.arcTo(1300 * scaleX, 200 * scaleY, 1100 * scaleX, 200 * scaleY, 100 * avgScale);
    minimapCtx.lineTo(600 * scaleX, 200 * scaleY);
    minimapCtx.arcTo(500 * scaleX, 200 * scaleY, 500 * scaleX, 300 * scaleY, 100 * avgScale);
    minimapCtx.lineTo(500 * scaleX, 1200 * scaleY);

    minimapCtx.bezierCurveTo(
        500 * scaleX, 1400 * scaleY, 
        1000 * scaleX, 1300 * scaleY, 
        1000 * scaleX, 1500 * scaleY
    );
    minimapCtx.bezierCurveTo(
        1000 * scaleX, 1700 * scaleY, 
        400 * scaleX, 1650 * scaleY, 
        400 * scaleX, 1850 * scaleY
    );

    minimapCtx.arcTo(400 * scaleX, 2050 * scaleY, 600 * scaleX, 2050 * scaleY, 200 * avgScale);

    minimapCtx.closePath();
    minimapCtx.stroke();
    minimapCtx.restore();

    SECTIONS.forEach(s => {
        minimapCtx.fillStyle = s.color;
        minimapCtx.beginPath();
        minimapCtx.arc(s.x * scaleX, s.y * scaleY, 4, 0, Math.PI * 2);
        minimapCtx.fill();
    });

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
   SECTION 11: MAIN GAME LOOP & ASYNCHRONOUS INITIALIZATION
   ========================================================================== */

let lastTime = performance.now();

function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    updatePhysics(dt);
    recordGhostFrame();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentSpeed = Math.hypot(car.vx, car.vy);
    const speedRatio = Math.min(currentSpeed / car.maxSpeed, 1.0);
    const targetZoom = MAX_ZOOM - (speedRatio * (MAX_ZOOM - MIN_ZOOM));

    cameraZoom += (targetZoom - cameraZoom) * ZOOM_SMOOTHING;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.translate(-car.x, -car.y);

    drawWorld();
    drawSkidMarks();
    drawDustParticles();
    drawExhaustSmokeParticles();
    drawBloodParticles();
    drawGhostCar();
    drawCar();
    drawLakesSurface();

    ctx.restore();

    drawMinimap();

    requestAnimationFrame(gameLoop);
}

window.onload = function() {
    createNoisePattern();

    Promise.all([
        fetch('data.json').then(r => r.json()),
        fetch('objects.json').then(r => r.json())
    ])
    .then(([gameData, mapObjects]) => {
        WORLD = gameData.world;
        if (gameData.car) car = { ...car, ...gameData.car };
        if (gameData.pitCrew) pitCrewConfig = { ...pitCrewConfig, ...gameData.pitCrew };
        SECTIONS = gameData.sections;
        trackWaypoints = gameData.trackWaypoints;
        sectionContents = gameData.sectionContents;

        processPrefabs(mapObjects);
        initCrew();
        
        requestAnimationFrame(gameLoop);
    })
    .catch(err => console.error("Error loading modular configuration files:", err));
};

/* ==========================================================================
   SECTION 12: DEVELOPER CONSOLE & TELEMETRY API
   ========================================================================== */

window.car = car;
window.getCarTelemetry = function() {
    const currentSpeed = Math.hypot(car.vx, car.vy);
    const angleDeg = ((car.angle * 180 / Math.PI) % 360 + 360) % 360;
    
    return {
        position: { x: Number(car.x.toFixed(2)), y: Number(car.y.toFixed(2)) },
        speedKmh: Number((currentSpeed * 18).toFixed(1)),
        rawSpeed: Number(car.speed.toFixed(2)),
        angleDeg: Number(angleDeg.toFixed(1)),
        angleRad: Number(car.angle.toFixed(2)),
        velocity: { vx: Number(car.vx.toFixed(2)), vy: Number(car.vy.toFixed(2)) },
        inWater: car.inWater
    };
};