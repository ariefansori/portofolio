/**
 * ============================================================================
 * CHECKPOINT, LAP, PIT CREW & GRANDSTAND SYSTEMS
 * ============================================================================
 */

import {
    car, SECTIONS, MAP_OBJECTS, crewMembers, pitCrewConfig, ui, lap, particles
} from './state.js';
import { HIGH_SPEED_IMPACT_THRESHOLD, MAX_LAP_TIME_SECONDS } from './config.js';
import { playBeepSound, playCrashSound } from './audio.js';
import { openModal, showNewRecordNotification } from './hud.js';
import { spawnBlood, spawnCameraFlash } from './particles.js';
import { isPointInRotatedRect } from './math.js';

/** Update seluruh sistem dunia (dipanggil sekali per frame setelah fisika). */
export function updateSystems(dt) {
    checkPitProximity(dt);
    updateCrew();
    checkCheckpoints();
    updateLapTimer();
    updateGrandstands();
    updateCrowds(dt);
    updateRipples();
}

/* ==========================================================================
   CHECKPOINT & LAP
   ========================================================================== */

function checkCheckpoints() {
    if (!MAP_OBJECTS.checkpoints || MAP_OBJECTS.checkpoints.length === 0) return;

    const targetCP = MAP_OBJECTS.checkpoints[lap.nextCheckpointIndex];
    if (!targetCP) return;

    const hit = isPointInRotatedRect(
        car.x, car.y,
        targetCP.x, targetCP.y,
        targetCP.w, targetCP.h,
        targetCP.rot || 0
    );
    if (!hit) return;

    if (lap.nextCheckpointIndex === 0) {
        if (!lap.isLapActive) {
            lap.isLapActive = true;
            lap.isLapInvalid = false;
            lap.lapStartTime = performance.now();
            lap.currentLapTrail = [];
            playBeepSound(1200, 0.3);

            lap.nextCheckpointIndex = 1 % MAP_OBJECTS.checkpoints.length;
            return;
        }

        if (lap.isLapActive) {
            const lapTime = (performance.now() - lap.lapStartTime) / 1000;

            if (!lap.isLapInvalid && lapTime <= MAX_LAP_TIME_SECONDS) {
                lap.totalLapsCompleted++;

                if (!lap.bestLapTime || lapTime < lap.bestLapTime) {
                    lap.bestLapTime = lapTime;
                    lap.bestLapTrail = [...lap.currentLapTrail];

                    const bMins = Math.floor(lap.bestLapTime / 60).toString().padStart(2, '0');
                    const bSecs = Math.floor(lap.bestLapTime % 60).toString().padStart(2, '0');
                    const bMs = Math.floor((lap.bestLapTime % 1) * 100).toString().padStart(2, '0');
                    const formattedBest = `${bMins}:${bSecs}.${bMs}`;

                    const bestDisplay = document.getElementById('bestLapDisplay');
                    if (bestDisplay) bestDisplay.innerText = `BEST: ${formattedBest}`;

                    showNewRecordNotification(formattedBest);
                }
            } else {
                console.warn("Lap Invalid: Melebihi batas waktu 2 menit.");
            }

            lap.lapStartTime = performance.now();
            lap.isLapInvalid = false;
            lap.currentLapTrail = [];
            playBeepSound(1200, 0.3);

            lap.nextCheckpointIndex = 1 % MAP_OBJECTS.checkpoints.length;
        }
    } else {
        playBeepSound(900, 0.15);
        lap.nextCheckpointIndex = (lap.nextCheckpointIndex + 1) % MAP_OBJECTS.checkpoints.length;
    }
}

function updateLapTimer() {
    const timerDisplay = document.getElementById('timerDisplay');
    const cpDisplay = document.getElementById('cpDisplay');

    if (!lap.isLapActive || !lap.lapStartTime) {
        if (timerDisplay) {
            timerDisplay.innerText = "00:00.00";
            timerDisplay.style.color = "#ffffff";
        }
        if (cpDisplay) {
            cpDisplay.innerText = `START / FINISH | LAP: ${lap.totalLapsCompleted}`;
        }
        return;
    }

    lap.currentLapTime = (performance.now() - lap.lapStartTime) / 1000;

    if (lap.currentLapTime > MAX_LAP_TIME_SECONDS) {
        lap.isLapInvalid = true;
    }

    const mins = Math.floor(lap.currentLapTime / 60).toString().padStart(2, '0');
    const secs = Math.floor(lap.currentLapTime % 60).toString().padStart(2, '0');
    const ms = Math.floor((lap.currentLapTime % 1) * 100).toString().padStart(2, '0');

    if (timerDisplay) {
        timerDisplay.innerText = `${mins}:${secs}.${ms}`;
        timerDisplay.style.color = lap.isLapInvalid ? "#ef4444" : "#ffffff";
    }

    if (cpDisplay && MAP_OBJECTS.checkpoints.length > 0) {
        if (lap.isLapInvalid) {
            cpDisplay.innerText = `INVALID LAP (> 2 MINS) | LAP: ${lap.totalLapsCompleted}`;
        } else {
            const currentCP = MAP_OBJECTS.checkpoints[lap.nextCheckpointIndex];
            const cpName = currentCP ? (currentCP.label || `CP ${lap.nextCheckpointIndex}`) : 'START/FINISH';
            cpDisplay.innerText = `NEXT: ${cpName} | LAP: ${lap.totalLapsCompleted}`;
        }
    }
}

/* ==========================================================================
   PIT STOP PROXIMITY
   ========================================================================== */

function checkPitProximity(dt) {
    if (ui.pitCooldownTimer > 0) ui.pitCooldownTimer -= dt;

    let nearSection = null;
    if (ui.pitCooldownTimer <= 0) {
        SECTIONS.forEach(sec => {
            if (Math.hypot(car.x - sec.x, car.y - sec.y) < 110) nearSection = sec;
        });
    }

    const indicator = document.getElementById('zoneIndicator');

    if (nearSection) {
        ui.activePitStop = nearSection;
        const textElem = document.getElementById('zoneIndicatorText');
        if (textElem) textElem.innerText = `PIT CREW SERVICING ${nearSection.title}`;
        if (indicator) indicator.classList.remove('opacity-0', '-translate-y-4');

        if (Math.hypot(car.vx, car.vy) < 1.2) {
            ui.stopTimer += dt;
            if (ui.stopTimer >= pitCrewConfig.stopDuration && !ui.isModalOpen) {
                openModal(nearSection.id);
            }
        } else {
            ui.stopTimer = Math.max(0, ui.stopTimer - dt * 2);
        }
    } else {
        ui.activePitStop = null;
        ui.stopTimer = 0;
        if (indicator) indicator.classList.add('opacity-0', '-translate-y-4');
    }
}

/* ==========================================================================
   PIT CREW (AI + TABRAKAN)
   ========================================================================== */

function updateCrew() {
    const carSpeed = Math.hypot(car.vx, car.vy);

    crewMembers.forEach(c => {
        c.animFrame += 0.08;

        // Target: mengelilingi mobil saat diservis, atau kembali ke pos awal
        if (ui.activePitStop && ui.activePitStop.id === c.sectionId) {
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

        const dx = c.targetX - c.x;
        const dy = c.targetY - c.y;
        const distToTarget = Math.hypot(dx, dy);

        if (distToTarget > 2) {
            c.vx += (dx / distToTarget) * 0.25;
            c.vy += (dy / distToTarget) * 0.25;
        }

        const distToCar = Math.hypot(c.x - car.x, c.y - car.y);
        const avoidRadius = 24;

        if (distToCar < 18) {
            const impactAngle = Math.atan2(c.y - car.y, c.x - car.x);

            if (carSpeed >= HIGH_SPEED_IMPACT_THRESHOLD) {
                playCrashSound();
                const knockForce = carSpeed * 3.5;
                c.vx = Math.cos(impactAngle) * knockForce;
                c.vy = Math.sin(impactAngle) * knockForce;
                spawnBlood(c.x, c.y, impactAngle);
            } else {
                const knockbackDist = Math.max(25, carSpeed * 12);
                c.x += Math.cos(impactAngle) * knockbackDist;
                c.y += Math.sin(impactAngle) * knockbackDist;
            }

            car.speed *= 0.65;
            car.vx *= 0.65;
            car.vy *= 0.65;
        } else if (distToCar < avoidRadius && carSpeed < HIGH_SPEED_IMPACT_THRESHOLD) {
            const pushAngle = Math.atan2(c.y - car.y, c.x - car.x);
            c.vx += Math.cos(pushAngle) * 0.5;
            c.vy += Math.sin(pushAngle) * 0.5;
        }

        c.x += c.vx;
        c.y += c.vy;
        c.vx *= 0.85;
        c.vy *= 0.85;
    });
}

/* ==========================================================================
   GRANDSTAND (PENONTON + KILATAN KAMERA) & RIK AIR
   ========================================================================== */

function updateGrandstands() {
    const nowSec = performance.now() / 1000;

    (MAP_OBJECTS.grandstands || []).forEach(gs => {
        const centerX = gs.x + gs.w / 2;
        const centerY = gs.y + gs.h / 2;
        const triggerRadius = gs.triggerRadius || 300;

        const distToCar = Math.hypot(car.x - centerX, car.y - centerY);
        const carSpeed = Math.hypot(car.vx, car.vy);
        // Efek lompat + kilatan kamera hanya berbasis JARAK — tetap jalan walau mobil diam
        const isTriggered = (distToCar < triggerRadius);

        (gs.spectators || []).forEach(s => {
            if (isTriggered) {
                s.phase += s.jumpSpeed * (1 + carSpeed * 0.1);
                s.jumpOffset = Math.abs(Math.sin(s.phase)) * 6;
            } else {
                s.jumpOffset *= 0.85;
            }
        });

        if (isTriggered) {
            const activeFlashes = particles.flashes.filter(f => f.gsId === gs.id).length;
            const cooldown = gs.flashCooldown || 0.4;

            if (activeFlashes < 3 && (nowSec - gs.lastFlashTime) > cooldown) {
                if (Math.random() < 0.35 && gs.spectators && gs.spectators.length > 0) {
                    const randomSpec = gs.spectators[Math.floor(Math.random() * gs.spectators.length)];

                    const cosR = Math.cos(gs.rot || 0);
                    const sinR = Math.sin(gs.rot || 0);
                    const flashWorldX = centerX + (randomSpec.localX * cosR - (randomSpec.localY - randomSpec.jumpOffset) * sinR);
                    const flashWorldY = centerY + (randomSpec.localX * sinR + (randomSpec.localY - randomSpec.jumpOffset) * cosR);

                    spawnCameraFlash(gs.id, flashWorldX, flashWorldY, 18 + Math.random() * 22);

                    gs.lastFlashTime = nowSec;
                    gs.flashCooldown = 0.3 + Math.random() * 0.5;
                }
            }
        }
    });

    for (let i = particles.flashes.length - 1; i >= 0; i--) {
        const flash = particles.flashes[i];
        flash.alpha -= flash.decay;
        if (flash.alpha <= 0) particles.flashes.splice(i, 1);
    }
}

/* ==========================================================================
   CROWD (PENONTON RALLY)
   ==========================================================================

   Gaya WRC klasik: penonton berdiri di pinggir jalan, dan menyingkir saat
   mobil mendekat. Pergeserannya RELATIF terhadap jarak mobil, bukan ke titik
   tertentu yang sudah ditentukan:

   - posisi asli tiap orang dicatat saat boot (homeX/homeY);
   - mobil masuk `fleeRadius` → orang mulai menghindar ke samping (tegak lurus
     arah datangnya mobil) dengan kecepatan proporsional terhadap kedekatan
     mobil (makin dekat = makin cepat: berjalan → berlari);
   - mobil masih terlalu dekat → orang terus menyingkir; begitu jarak
     menjauh melebihi `fleeRadius * 1.7` (histeresis), orang berhenti lalu
     berjalan pelan kembali ke posisi asli;
   - pergeseran dibatasi `maxFleeOffset` dari posisi asli;
   - mobil terlalu cepat sehingga orang telat menyingkir → tabrakan dengan
     efek darah yang sama seperti pit crew (percikan + berkas darah di tanah)
     dan mobil melambat;
   - animasi lompat & kilatan kamera dipicu oleh jarak CROWD (area) ke mobil.
   - Penonton TIDAK punya kaki (render: bayangan + badan + kepala).
 */

/** Jarak aman minimum penonton ↔ mobil agar tidak tumpang tindih. */
const CROWD_CAR_CLEARANCE = 26;

/** Jeda minimum antar tabrakan mobil ↔ penonton yang sama (detik). */
const CROWD_HIT_COOLDOWN = 1.2;

/** Jarak "aman" = fleeRadius × faktor ini — penonton berhenti menghindar & diam. */
const CROWD_RETURN_FACTOR = 2.0;

/** Jarak mulai berhenti melangkah (di antara flee & return) — cegah mondar-mandir. */
const CROWD_SAFE_FACTOR = 1.4;

function updateCrowds(dt) {
    const step = Math.min(dt || 1 / 60, 0.05);
    const nowSec = performance.now() / 1000;
    const carSpeed = Math.hypot(car.vx, car.vy);

    // Vektor arah datang mobil (fallback ke arah hadap saat hampir diam)
    let dirX, dirY;
    if (carSpeed > 0.3) {
        dirX = car.vx / carSpeed;
        dirY = car.vy / carSpeed;
    } else {
        dirX = Math.cos(car.angle);
        dirY = Math.sin(car.angle);
    }
    // Sisi kiri/kanan mobil (perpendicular terhadap arah datang)
    const perpX = -dirY;
    const perpY = dirX;

    (MAP_OBJECTS.crowds || []).forEach(cw => {
        const centerX = cw.x + cw.w / 2;
        const centerY = cw.y + cw.h / 2;

        // Pemicu animasi area: HANYA berbasis jarak CROWD (area) ke mobil —
        // tetap aktif walau mobil diam. (Penonton yang sedang minggir efeknya
        // disembunyikan di blok bawah.)
        const distToCar = Math.hypot(car.x - centerX, car.y - centerY);
        const isTriggered = (distToCar < (cw.triggerRadius || 420));

        const fleeRadius = cw.fleeRadius || 90;
        const returnRadius = fleeRadius * CROWD_RETURN_FACTOR; // jarak "aman": berhenti menghindar
        const walkSpeed = cw.walkSpeed || 45;      // px/detik — berjalan biasa
        const runSpeed = cw.runSpeed || 130;       // px/detik — lari menghindar
        const returnSpeed = cw.returnSpeed || 38;  // px/detik — berjalan pulang
        const maxFleeOffset = cw.maxFleeOffset || 170;
        const minDist = (cw.personRadius || 10) + CROWD_CAR_CLEARANCE;
        const hitRadius = (cw.personRadius || 10) + 14;
        const people = cw.people || [];

        for (let i = 0; i < people.length; i++) {
            const p = people[i];   // p.x / p.y kini koordinat DUNIA (lihat mapData.js)

            let distPersonToCar = Math.hypot(p.x - car.x, p.y - car.y);

            // --- Tabrakan: mobil terlalu cepat, penonton telat menyingkir ---
            const lastHit = p.lastHitTime || -99;

            if (distPersonToCar < hitRadius &&
                carSpeed >= HIGH_SPEED_IMPACT_THRESHOLD &&
                (nowSec - lastHit) > CROWD_HIT_COOLDOWN) {

                p.lastHitTime = nowSec;
                const impactAngle = Math.atan2(p.y - car.y, p.x - car.x);

                playCrashSound();
                spawnBlood(p.x, p.y, impactAngle);

                // Penonton terpental menjauh (langsung di frame dunia)
                const knock = Math.max(6, carSpeed * 2.5);
                p.x += Math.cos(impactAngle) * knock;
                p.y += Math.sin(impactAngle) * knock;

                car.speed *= 0.65;
                car.vx *= 0.65;
                car.vy *= 0.65;

                distPersonToCar = Math.hypot(p.x - car.x, p.y - car.y);
            }

            // --- State menghindar (tiga pita jarak anti mondar-mandir) ---
            // mobil diam di tengah kerumunan pun penonton hanya MINGGIR sekali
            // lalu DIAM di posisi aman; tidak berbalik lagi ke posisi asli
            // sampai mobil benar-benar menjauh (di atas returnRadius).
            const relX = p.x - car.x;
            const relY = p.y - car.y;
            const sideSign = (relX * perpX + relY * perpY) >= 0 ? 1 : -1;

            // Arah minggir: tegak lurus arah mobil, pada sisi tempat penonton (dunia)
            p.runDirX = perpX * sideSign;
            p.runDirY = perpY * sideSign;

            if (!p.isFleeing && distPersonToCar < fleeRadius) {
                p.isFleeing = true;
                p.jumpOffset = 0;
            } else if (p.isFleeing && distPersonToCar > returnRadius) {
                // Hanya berhenti minggir (lalu jalan pulang) bila mobil sudah jauh
                p.isFleeing = false;
            }

            if (p.isFleeing) {
                const safeRadius = fleeRadius * CROWD_SAFE_FACTOR;

                if (distPersonToCar < safeRadius) {
                    // Masih terlalu dekat → terus menjauh; makin dekat makin cepat
                    const urgency = Math.max(0, Math.min(1, (safeRadius - distPersonToCar) / safeRadius));
                    const speed = (walkSpeed + (runSpeed - walkSpeed) * urgency) * step;

                    let nextX = p.x + p.runDirX * speed;
                    let nextY = p.y + p.runDirY * speed;

                    // Batasi pergeseran total dari posisi asli
                    const offX = nextX - p.homeX;
                    const offY = nextY - p.homeY;
                    const offLen = Math.hypot(offX, offY);
                    if (offLen > maxFleeOffset) {
                        nextX = p.homeX + (offX / offLen) * maxFleeOffset;
                        nextY = p.homeY + (offY / offLen) * maxFleeOffset;
                    }

                    p.x = nextX;
                    p.y = nextY;
                }
                // else: sudah di zona aman (>= safeRadius) → DIAM di tempat,
                // tidak berjalan pulang selama mobil masih di sekitar.

                p.jumpOffset = 0;

                // Pengaman fisik: bila mobil benar-benar menempel, dorong keluar
                if (distPersonToCar < minDist) {
                    const push = minDist - distPersonToCar;
                    p.x += (relX / (distPersonToCar || 1)) * push;
                    p.y += (relY / (distPersonToCar || 1)) * push;
                }
            } else {
                // Berjalan kembali ke posisi asli (kecepatan berjalan manusiawi)
                const dx = p.homeX - p.x;
                const dy = p.homeY - p.y;
                const distHome = Math.hypot(dx, dy);
                if (distHome > 1) {
                    const move = Math.min(returnSpeed * step, distHome);
                    p.x += (dx / distHome) * move;
                    p.y += (dy / distHome) * move;
                }

                if (isTriggered) {
                    p.phase += p.jumpSpeed * (1 + carSpeed * 0.1);
                    p.jumpOffset = Math.abs(Math.sin(p.phase)) * 6;
                } else {
                    p.jumpOffset *= 0.85;
                }
            }
        }

        // --- Kilatan kamera (basis jarak; penonton yang minggir tidak menampilkan efek) ---
        if (isTriggered) {
            const activeFlashes = particles.flashes.filter(f => f.gsId === cw.id).length;
            const cooldown = cw.flashCooldown || 0.4;

            if (activeFlashes < 3 && (nowSec - cw.lastFlashTime) > cooldown) {
                const candidates = people.filter(p => !p.isFleeing);
                if (Math.random() < 0.35 && candidates.length > 0) {
                    const s = candidates[Math.floor(Math.random() * candidates.length)];

                    spawnCameraFlash(cw.id, s.x, s.y - s.jumpOffset, 18 + Math.random() * 22);

                    cw.lastFlashTime = nowSec;
                    cw.flashCooldown = 0.3 + Math.random() * 0.5;
                }
            }
        }
    });
}

function updateRipples() {
    for (let i = particles.ripples.length - 1; i >= 0; i--) {
        const r = particles.ripples[i];
        r.radius += 0.4;
        r.alpha -= r.decay;
        if (r.alpha <= 0 || r.radius >= r.maxRadius) {
            particles.ripples.splice(i, 1);
        }
    }
}
