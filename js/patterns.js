/**
 * ============================================================================
 * SURFACE PATTERN LIBRARY (visual saja — tidak memengaruhi baked surface)
 * ============================================================================
 *
 * Dipakai oleh world baker (js/bake.js) saat boot, dan oleh track editor
 * (editor.js, via dynamic import) untuk preview. Semua pattern digambar
 * sekali saat bake / saat editor menggambar frame — bukan tiap frame game.
 */

/* ==========================================================================
   DAFTAR PATTERN CONCRETE (untuk dropdown track editor)
   ========================================================================== */

export const CONCRETE_PATTERNS = [
    { id: 'grid', label: 'Grid' },
    { id: 'stripes', label: 'Strip' },
    { id: 'honeycomb', label: 'Honeycomb' },
    { id: 'tiles', label: 'Tiles' },
    { id: 'crosshatch', label: 'Crosshatch' },
    { id: 'plain', label: 'Plain' }
];

export const DEFAULT_CONCRETE_PATTERN = 'grid';

/* ==========================================================================
   CACHE TILE (dibuat sekali per jenis pattern)
   ========================================================================== */

const tileCache = new Map();

function cachedTile(key, size, draw) {
    let c = tileCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    draw(c.getContext('2d'));
    tileCache.set(key, c);
    return c;
}

/** Isi warna transparan gelap/terang untuk tekstur rumput. */
function makeGrassNoiseTile() {
    return cachedTile('grass_noise', { w: 160, h: 160 }, (g) => {
        // Bintik gelap (tanah/rambutan rumput)
        for (let i = 0; i < 220; i++) {
            const x = Math.random() * 160;
            const y = Math.random() * 160;
            const r = 0.8 + Math.random() * 2.2;
            g.fillStyle = `rgba(10, 60, 30, ${0.10 + Math.random() * 0.18})`;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
        }
        // Bintik terang ( highlight rumput )
        for (let i = 0; i < 140; i++) {
            const x = Math.random() * 160;
            const y = Math.random() * 160;
            g.fillStyle = `rgba(150, 230, 160, ${0.05 + Math.random() * 0.10})`;
            g.fillRect(x, y, 1.5, 1.5);
        }
        // Sumbu rumput kecil
        g.lineWidth = 1;
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * 160;
            const y = Math.random() * 160;
            const len = 3 + Math.random() * 4;
            const lean = (Math.random() - 0.5) * 3;
            g.strokeStyle = `rgba(20, 90, 45, ${0.15 + Math.random() * 0.2})`;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + lean, y - len);
            g.stroke();
        }
    });
}

/* ==========================================================================
   RUMPUT — stripes hasil potong rumput + noise alami
   ========================================================================== */

const GRASS_BASE = '#2d8a4e';

/**
 * Menggambar permukaan rumput berpola pada rect (0,0)-(width,height).
 * Pola: garis stripes potong rumput bergantian terang/gelap + noise rumput.
 */
export function drawGrassPattern(ctx, width, height, baseColor = GRASS_BASE) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);

    // Stripes hasil potong rumput (pita horizontal bergantian)
    const bandHeight = 150;
    for (let y = 0; y < height; y += bandHeight * 2) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
        ctx.fillRect(0, y, width, bandHeight);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, y + bandHeight, width, bandHeight);
    }

    // Noise rumput (tile transparan, repeat)
    const noise = ctx.createPattern(makeGrassNoiseTile(), 'repeat');
    if (noise) {
        ctx.fillStyle = noise;
        ctx.fillRect(0, 0, width, height);
    }
}

/* ==========================================================================
   CONCRETE — pilihan pattern per zone (properti `pattern` pada concreteZone)
   ========================================================================== */

function shadeColor(hex, amount) {
    // amount > 0 = lebih terang, < 0 = lebih gelap
    const c = hex.replace('#', '');
    const full = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c;
    const n = parseInt(full, 16);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(((n >> 16) & 255) + amount);
    const g = clamp(((n >> 8) & 255) + amount);
    const b = clamp((n & 255) + amount);
    return `rgb(${r}, ${g}, ${b})`;
}

function makeConcreteTile(pattern, fill, line, gridSize = 100) {
    switch (pattern) {
        case 'stripes': {
            const size = 48;
            return cachedTile(`cz_stripes_${fill}_${line}`, { w: size, h: size }, (g) => {
                g.fillStyle = 'rgba(0, 0, 0, 0.07)';
                g.fillRect(0, 0, size, size / 2);
                g.fillStyle = 'rgba(255, 255, 255, 0.05)';
                g.fillRect(0, size / 2, size, size / 2);
            });
        }
        case 'honeycomb': {
            // Hexagon pointy-top: R=20, tile 35x60 (period lattice 2 baris)
            const R = 20, w = 35, h = 60;
            return cachedTile(`cz_honeycomb_${fill}_${line}`, { w, h }, (g) => {
                g.strokeStyle = line;
                g.lineWidth = 2;
                const hex = (cx, cy) => {
                    g.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const a = -Math.PI / 2 + i * Math.PI / 3;
                        const vx = cx + R * Math.cos(a);
                        const vy = cy + R * Math.sin(a);
                        if (i === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
                    }
                    g.closePath();
                    g.stroke();
                };
                // Baris 0 (tanpa offset) & baris 1 (offset w/2), plus tetangga tepi
                for (let j = -1; j <= 2; j++) {
                    const cy = j * 1.5 * R;
                    const off = (j % 2 === 0) ? 0 : w / 2;
                    for (let i = -1; i <= 1; i++) {
                        hex(i * w + off, cy);
                    }
                }
            });
        }
        case 'tiles': {
            const size = 64;
            return cachedTile(`cz_tiles_${fill}_${line}`, { w: size, h: size }, (g) => {
                g.strokeStyle = line;
                g.lineWidth = 5;
                g.strokeRect(0, 0, size, size);
                // Bevel terang di sisi atas-kiri tiap ubin
                g.strokeStyle = 'rgba(255, 255, 255, 0.10)';
                g.lineWidth = 2;
                g.beginPath();
                g.moveTo(3, size - 3); g.lineTo(3, 3); g.lineTo(size - 3, 3);
                g.stroke();
            });
        }
        case 'crosshatch': {
            const size = 36;
            return cachedTile(`cz_crosshatch_${fill}_${line}`, { w: size, h: size }, (g) => {
                g.strokeStyle = line;
                g.lineWidth = 1.5;
                g.beginPath();
                g.moveTo(0, size); g.lineTo(size, 0);
                g.moveTo(-size / 2, size / 2); g.lineTo(size / 2, -size / 2);
                g.moveTo(size / 2, size * 1.5); g.lineTo(size * 1.5, size / 2);
                g.stroke();
            });
        }
        case 'grid':
        default: {
            const size = Math.max(20, gridSize);
            return cachedTile(`cz_grid_${fill}_${line}_${size}`, { w: size, h: size }, (g) => {
                g.strokeStyle = line;
                g.lineWidth = 3;
                g.beginPath();
                g.moveTo(0, 0); g.lineTo(0, size);
                g.moveTo(0, 0); g.lineTo(size, 0);
                g.stroke();
            });
        }
    }
}

/**
 * Menggambar satu concrete zone (fill + pattern) dalam koordinat dunia.
 * Properti yang dipakai: x, y, w, h, fillColor, gridColor, gridSize, pattern.
 * `pattern' tidak dikenal atau 'plain' → hanya fill polos.
 */
export function drawConcreteZone(ctx, zone) {
    const fill = zone.fillColor || '#8f9bba';
    const line = zone.gridColor || '#7884a5';
    const pattern = zone.pattern || DEFAULT_CONCRETE_PATTERN;

    ctx.save();
    ctx.translate(zone.x, zone.y);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, zone.w, zone.h);

    if (pattern !== 'plain') {
        const tile = makeConcreteTile(pattern, fill, line, zone.gridSize || 100);
        const pat = ctx.createPattern(tile, 'repeat');
        if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(0, 0, zone.w, zone.h);
        }
    }

    ctx.restore();
}
