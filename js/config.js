/**
 * ============================================================================
 * KONFIGURASI & TABEL SURFACE GAME
 * ============================================================================
 *
 * Berkas ini memuat konstanta global serta tabel pengaruh surface hasil
 * konversi raster (baked surface). Semua modul boleh import dari sini.
 */

/* ==========================================================================
   KAMERA & ZOOM
   ========================================================================== */

export const MIN_ZOOM = 0.80;
export const MAX_ZOOM = 2.50;
export const ZOOM_SMOOTHING = 0.05;

/* ==========================================================================
   AMBANG GAMEPLAY / FISIKA
   ========================================================================== */

/** Kecepatan minimum dampak agar dianggap tabrakan keras (pit crew). */
export const HIGH_SPEED_IMPACT_THRESHOLD = 4.0;

/** Batas waktu satu lap (detik) seingga lap dianggap invalid. */
export const MAX_LAP_TIME_SECONDS = 120;

/** Jarak batas dunia dari tepi dunia (dinding tak terlihat). */
export const WORLD_BOUNDARY_INNER = 35;

/**
 * Gerbang suara benturan:
 * - Dampak di bawah ambang ini DIAM (mis. wall-ride pelan yang menempel
 *   dinding akan memicu tabrakan tiap frame → spam suara).
 * - Jeda minimum antar bunyi benturan (cooldown anti-spam).
 */
export const CRASH_SOUND_MIN_IMPACT = 1.6;   // px/frame
export const CRASH_SOUND_COOLDOWN = 0.18;    // detik

/* ==========================================================================
   SKALA BAKE RASTER
   ========================================================================== */

/** Skala baked world (bitmap visual yang dilihat user). */
export const WORLD_BAKE_SCALE = 1.0;

/** Skala baked surface (peta fisika klasifikasi warna). 0.5 = akurat & hemat. */
export const SURFACE_BAKE_SCALE = 0.5;

/* ==========================================================================
   KLASIFIKASI SURFACE BERDASARKAN WARNA
   ========================================================================== */

export const SURFACE = Object.freeze({
    TARMAC: 1,      // hitam   - aspal
    CONCRETE: 2,    // abu-abu - concrete zone & parking lot
    GRASS: 3,       // hijau   - rumput
    SAND: 4,        // coklat  - sand trap
    LAKE: 5,        // biru    - danau
    COLLISION: 6,   // pink    - objek statis (isStatic), tidak bisa dilintasi
    BUSH: 7         // hijau tua - semak-semak (bisa dilalui, perlambat mobil)
});

/** Warna sentinel yang dipakai saat membake peta fisika (bukan warna visual). */
export const SURFACE_COLORS = Object.freeze({
    [SURFACE.TARMAC]: [16, 16, 16],
    [SURFACE.CONCRETE]: [128, 128, 128],
    [SURFACE.GRASS]: [0, 200, 60],
    [SURFACE.SAND]: [166, 110, 40],
    [SURFACE.LAKE]: [40, 90, 220],
    [SURFACE.COLLISION]: [255, 95, 176],
    [SURFACE.BUSH]: [28, 86, 40]
});

export const SURFACE_LABELS = Object.freeze({
    0: 'NONE',
    [SURFACE.TARMAC]: 'TARMAC',
    [SURFACE.CONCRETE]: 'CONCRETE',
    [SURFACE.GRASS]: 'GRASS',
    [SURFACE.SAND]: 'SAND',
    [SURFACE.LAKE]: 'LAKE',
    [SURFACE.COLLISION]: 'COLLISION',
    [SURFACE.BUSH]: 'BUSH'
});

/**
 * Pengaruh tiap surface terhadap fisika mobil dan efek visualnya.
 *
 * speedMul        : pengali top speed.
 * accelMul        : pengali akselerasi.
 * speedLimit      : batas kecepatan absolut opsional (dipakai bersama speedMul).
 * overLimitDecay  : faktor per-frame saat kecepatan melebihi batas zona
 *                   (semakin kecil = semakin cepat perlambatannya).
 * skidColor       : warna skid mark; null = efek skid hilang.
 * driftFx         : 'smoke' | 'leaves' | 'dust' | 'none'.
 * tireTrail       : true = meninggalkan jejak ban di belakang mobil.
 */
export const SURFACE_EFFECTS = Object.freeze({
    [SURFACE.TARMAC]: Object.freeze({
        speedMul: 1.0, accelMul: 1.0, speedLimit: null, overLimitDecay: 0.95,
        skidColor: '#1e293b', driftFx: 'smoke', tireTrail: false
    }),
    [SURFACE.CONCRETE]: Object.freeze({
        speedMul: 1.0, accelMul: 1.0, speedLimit: null, overLimitDecay: 0.95,
        skidColor: '#1e293b', driftFx: 'smoke', tireTrail: false
    }),
    [SURFACE.GRASS]: Object.freeze({
        speedMul: 0.70, accelMul: 0.55, speedLimit: null, overLimitDecay: 0.985,
        skidColor: '#6b4a1e', driftFx: 'leaves', tireTrail: false
    }),
    [SURFACE.SAND]: Object.freeze({
        speedMul: 0.35, accelMul: 0.50, speedLimit: 2.2, overLimitDecay: 0.94,
        skidColor: null, driftFx: 'dust', tireTrail: true
    }),
    [SURFACE.LAKE]: Object.freeze({
        speedMul: 1.0, accelMul: 1.0, speedLimit: 1.8, overLimitDecay: 0.75,
        skidColor: null, driftFx: 'none', tireTrail: false
    }),
    [SURFACE.COLLISION]: Object.freeze({
        speedMul: 1.0, accelMul: 1.0, speedLimit: null, overLimitDecay: 0.95,
        skidColor: '#1e293b', driftFx: 'smoke', tireTrail: false
    }),
    // Semak: bisa dilalui tapi memperlambat; skid/trail/asap drift dimatikan
    [SURFACE.BUSH]: Object.freeze({
        speedMul: 0.5, accelMul: 0.6, speedLimit: null, overLimitDecay: 0.92,
        skidColor: null, driftFx: 'none', tireTrail: false
    })
});

/** Efek netral, dipakai saat surface belum terbaca. */
export const NEUTRAL_EFFECT = SURFACE_EFFECTS[SURFACE.TARMAC];

export function surfaceEffect(id) {
    return SURFACE_EFFECTS[id] || NEUTRAL_EFFECT;
}
