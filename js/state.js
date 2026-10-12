/**
 * ============================================================================
 * SHARED GAME STATE
 * ============================================================================
 *
 * Seluruh state mutable game hidup di satu berkas ini agar antar modul tidak
 * terjadi import melingkar: modul lain cukup import objeknya dan memutasi
 * property. Objek tidak pernah diganti identitasnya (hanya Object.assign).
 */

import { SURFACE } from './config.js';

/* ==========================================================================
   DUNIA & DATA KONTEN
   ========================================================================== */

/** Ukuran dunia game (dioverride dari track.json saat boot). */
export const WORLD = { width: 3200, height: 2400 };

/** Seksi pit stop, waypoint, dan konten modal. */
export const SECTIONS = [];
export const trackWaypoints = [];
export const sectionContents = {};

/** Koleksi objek peta & prefab (diisi mapData.processPrefabs). */
export const MAP_OBJECTS = {
    concreteZones: [],
    parkingLots: [],
    sandTraps: [],
    lakes: [],
    buildings: [],
    grandstands: [],
    crowds: [],
    bushes: [],
    props: [],
    checkpoints: [],
    ghostCar: {}
};

/* ==========================================================================
   KENDARAAN & PIT CREW
   ========================================================================== */

export const car = {
    x: 600, y: 2050, angle: 0, speed: 0,
    vx: 0, vy: 0,
    maxSpeed: 8.5, reverseSpeed: -2.5, accel: 0.18, decel: 0.05, brake: 0.20, turnSpeed: 0.055,
    gripNormal: 0.92,
    gripDrift: 0.975,
    width: 22, height: 38, color: '#EDD139',
    inWater: false,
    surface: SURFACE.TARMAC      // id surface aktif (hasil sampling baked surface)
};

export const pitCrewConfig = {
    speed: 0.6,
    stopDuration: 1.5,
    offsets: [
        { x: 0, y: -25 }, { x: -18, y: -10 }, { x: -18, y: 10 },
        { x: 18, y: -10 }, { x: 18, y: 10 }
    ]
};

export const crewMembers = [];

/* ==========================================================================
   KAMERA, INPUT & PARTIKEL
   ========================================================================== */

export const camera = { zoom: 1.0 };

export const keys = { up: false, down: false, left: false, right: false };

export const particles = {
    blood: [],        // percikan darah melayang saat menabrak pit crew / penonton
    bloodDecals: [],  // berkas darah di tanah (memudar sendiri setelah beberapa detik)
    dust: [],         // debu pasir
    exhaust: [],      // asap knalpot / asap drift
    leaves: [],       // daun berterbangan (drift di rumput)
    sparks: [],       // percikan api saat tabrakan
    ripples: [],      // riak air danau
    skids: [],        // skid mark drift
    tireTracks: [],   // jejak ban di pasir
    flashes: []       // kilatan kamera grandstand
};

/* ==========================================================================
   UI / PIT STOP / LAP
   ========================================================================== */

export const ui = {
    isModalOpen: false,
    activePitStop: null,
    stopTimer: 0,
    pitCooldownTimer: 0,
    recordBannerTimeout: null,
    surfaceDebug: false          // tampilkan peta baked surface di layar
};

export const lap = {
    nextCheckpointIndex: 0,
    totalLapsCompleted: 0,
    lapStartTime: null,
    currentLapTime: 0,
    bestLapTime: null,
    isLapActive: false,
    isLapInvalid: false,
    currentLapTrail: [],
    bestLapTrail: []
};

/** Telemetri performa render (diisi gameLoop). */
export const perf = { frameMs: 0, fps: 0, _acc: 0, _frames: 0 };

/* ==========================================================================
   REFERENSI DOM
   ========================================================================== */

export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas ? canvas.getContext('2d') : null;
export const minimapCanvas = document.getElementById('minimapCanvas');
export const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

export function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
