/**
 * ============================================================================
 * MAP DATA PROCESSING (prefab → objek runtime)
 * ============================================================================
 */

import { MAP_OBJECTS, SECTIONS, crewMembers, pitCrewConfig } from './state.js';

/* ==========================================================================
   CROWD (PENONTON RALLY)
   ========================================================================== */

/** Jarak antar penonton (center-to-center) — menjamin tidak bertumpukan. */
function crowdSpacing(personRadius) {
    return personRadius * 2 + 6;
}

/** Kapasitas maksimum area crowd: berapa many penonton muat tanpa tumpang tindih. */
export function crowdCapacity(cw) {
    const spacing = crowdSpacing(cw.personRadius || 10);
    const cols = Math.max(0, Math.floor(cw.w / spacing));
    const rows = Math.max(0, Math.floor(cw.h / spacing));
    return cols * rows;
}

/**
 * Membentuk penonton crowd: posisi random di dalam area rectangle,
 * ukuran seragam, tidak bertumpukan (grid sel + jitter random).
 * Jumlah melebihi kapasitas area → kelebihan dibuang.
 */
function buildCrowdPeople(cw) {
    const personRadius = cw.personRadius || 10;
    const spacing = crowdSpacing(personRadius);
    const cols = Math.max(0, Math.floor(cw.w / spacing));
    const rows = Math.max(0, Math.floor(cw.h / spacing));
    const capacity = cols * rows;

    const requested = Math.max(0, Math.round(cw.count || 0));
    const total = Math.min(requested, capacity);
    if (requested > capacity) {
        console.warn(`[crowd] ${cw.id}: jumlah ${requested} melebihi kapasitas area (${capacity}) — sisanya dihilangkan.`);
    }

    const shirtColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#ffffff'];
    const startX = -cols * spacing / 2 + spacing / 2;
    const startY = -rows * spacing / 2 + spacing / 2;
    const jitter = Math.max(0, spacing / 2 - personRadius - 1);

    // Posisi penonton DISIMPAN dalam koordinat DUNIA (area boleh berotasi,
    // tapi orang digambar tegak lurus / tidak ikut berotasi).
    const centerX = cw.x + cw.w / 2;
    const centerY = cw.y + cw.h / 2;
    const cosR = Math.cos(cw.rot || 0);
    const sinR = Math.sin(cw.rot || 0);

    const people = [];
    // Acak urutan sel agar penonton tersebar merata di seluruh area
    const cells = Array.from({ length: capacity }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    for (let i = 0; i < total; i++) {
        const cell = cells[i];
        const col = cell % cols;
        const row = (cell / cols) | 0;
        // Posisi lokal di dalam area → konversi sekali ke dunia
        const localX = startX + col * spacing + (Math.random() - 0.5) * 2 * jitter;
        const localY = startY + row * spacing + (Math.random() - 0.5) * 2 * jitter;
        const worldX = centerX + localX * cosR - localY * sinR;
        const worldY = centerY + localX * sinR + localY * cosR;

        people.push({
            x: worldX,
            y: worldY,
            homeX: worldX, homeY: worldY,   // posisi asli = titik kembali setelah minggir
            shirtColor: shirtColors[Math.floor(Math.random() * shirtColors.length)],
            skinColor: Math.random() > 0.5 ? '#fca5a5' : '#fde047',
            phase: Math.random() * Math.PI * 2,
            jumpSpeed: 0.05 + Math.random() * 0.05,
            jumpOffset: 0,
            isFleeing: false
        });
    }

    return people;
}

/**
 * Normalisasi tipe prefab legacy → tipe canonical:
 *   cone_line → cone, road_barrier_line → barrier
 * (data lama tetap didukung tanpa migrasi paksa)
 */
const PREFAB_KIND = { cone_line: 'cone', road_barrier_line: 'barrier' };

/** Bentuk objek bush runtime (dipakai oleh kategori bushes, prefab bush, dan prop bush). */
function makeBush(b) {
    return {
        ...b,
        r: b.r || 50,
        leafColor: b.leafColor || '#2f7d32',
        leafDark: b.leafDark || '#1f5a24',
        leafLight: b.leafLight || '#4caf50',
        isStatic: false,        // mobil bisa menembus
        shake: 0,               // intensitas getar saat ini
        _leafSeed: Math.random() * 1000   // variasi susunan daun per semak
    };
}

/**
 * Mengubah data mentah objects.json menjadi koleksi objek runtime.
 * Prefab (cone / tires / barrier / bush) dipecah menjadi item individual.
 */
export function processPrefabs(rawObjects) {
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

    MAP_OBJECTS.crowds = (rawObjects.crowds || []).map(cw => {
        const people = buildCrowdPeople(cw);
        return {
            ...cw,
            rot: cw.rot || 0,
            personRadius: cw.personRadius || 10,
            triggerRadius: cw.triggerRadius || 420,
            fleeRadius: cw.fleeRadius || 90,
            // Kecepatan berjalan/menghindar (px/detik) — kecepatan manusiawi
            walkSpeed: cw.walkSpeed || 45,
            runSpeed: cw.runSpeed || 130,
            returnSpeed: cw.returnSpeed || 38,
            maxFleeOffset: cw.maxFleeOffset || 170,
            isStatic: false,            // penonton bukan penghalang — mobil bisa menembus
            people,
            lastFlashTime: 0,
            flashCooldown: 0.3 + Math.random() * 0.4
        };
    });

    // Semak-semak: objek lingkaran berdaun yang BISA dilalui mobil.
    // - shake: intensitas getar (0..1) saat mobil masuk & bergerak di dalamnya.
    // - TIDAK menjadi collision (baked surface memakai SURFACE.BUSH, bukan pink).
    MAP_OBJECTS.bushes = (rawObjects.bushes || []).map(makeBush);

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

    // Prop bertipe bush → pindah ke daftar bushes (digambar di atas mobil,
    // tanpa area pink, bisa dilalui — perilaku bush yang sama seperti biasanya).
    if (MAP_OBJECTS.props.some(p => p.type === 'bush')) {
        MAP_OBJECTS.props.filter(p => p.type === 'bush').forEach(p => MAP_OBJECTS.bushes.push(makeBush(p)));
        MAP_OBJECTS.props = MAP_OBJECTS.props.filter(p => p.type !== 'bush');
    }

    if (rawObjects.prefabs) {
        rawObjects.prefabs.forEach(p => {
            const kind = PREFAB_KIND[p.prefab] || p.prefab;

            if (kind === 'cone') {
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

            if (kind === 'barrier') {
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

            // Kumpulan ban (statis → di-bake + area pink, sama seperti prop tires)
            if (kind === 'tires') {
                (p.points || []).forEach(pt => {
                    MAP_OBJECTS.props.push({
                        id: p.id,
                        type: 'tires',
                        layer: p.layer || 3,
                        x: pt.x,
                        y: pt.y,
                        r: p.r || 20,
                        rot: 0,
                        vx: 0, vy: 0, vRot: 0,
                        isStatic: true,
                        bounceFactor: p.bounceFactor !== undefined ? p.bounceFactor : 0.5
                    });
                });
            }

            // Kumpulan semak → tiap titik jadi satu bush (digambar di atas mobil)
            if (kind === 'bush') {
                const base = { ...p };
                delete base.points;
                delete base.barriers;
                delete base.prefab;
                (p.points || []).forEach(pt => {
                    MAP_OBJECTS.bushes.push(makeBush({ ...base, x: pt.x, y: pt.y }));
                });
            }
        });
    }
}

/** Membangun anggota pit crew untuk tiap seksi. */
export function initCrew() {
    crewMembers.length = 0;
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
