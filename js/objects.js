/**
 * ============================================================================
 * OBJECT DRAWING — GAMBAR VEKTOR BERSAMA (BAKE & RENDER)
 * ============================================================================
 *
 * Berkas ini adalah satu-satunya sumber gambar vektor objek peta, dipakai oleh:
 *   - js/bake.js    → objek STATIS tanpa animasi/efek (bangunan, ban, barrier,
 *                     garis start/finish) di-bake sekali ke BAKED WORLD.
 *   - js/renderer.js→ objek DINAMIS (cone, barrier yang bisa digeser, bangunan
 *                     non-statis) tetap digambar vektor tiap frame.
 *
 * Dengan satu berkas gambar, hasil bake dan render dijamin identik.
 */

/* ==========================================================================
   KLASIFIKASI: BAKE (STATIS) vs VEKTOR (DINAMIS)
   ========================================================================== */

/** Bangunan statis tanpa animasi → di-bake ke baked world. */
export function isBakedBuilding(b) {
    return b.isStatic !== false;
}

/** Prop statis (ban / road barrier) → di-bake ke baked world. */
export function isBakedProp(p) {
    return p.isStatic === true;
}

/* ==========================================================================
   GAMBAR OBJEK
   ========================================================================== */

/** Bangunan: bayangan + badan + aksen + label. */
export function drawBuilding(g, b) {
    g.save();
    g.translate(b.x + b.w / 2, b.y + b.h / 2);
    g.rotate(b.rot || 0);

    g.fillStyle = 'rgba(0, 0, 0, 0.4)';
    g.fillRect(-b.w / 2 + 12, -b.h / 2 + 12, b.w, b.h);

    g.fillStyle = b.color;
    g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

    g.strokeStyle = '#64748b';
    g.lineWidth = 4;
    g.strokeRect(-b.w / 2 + 4, -b.h / 2 + 4, b.w - 8, b.h - 8);

    g.fillStyle = b.accent;
    g.fillRect(-b.w / 2 + 8, -b.h / 2 + 8, b.w - 16, 8);

    g.fillStyle = '#ffffff';
    g.font = '10px "Press Start 2P"';
    g.textAlign = 'center';
    g.fillText(b.name, 0, 4);

    g.restore();
}

/** Prop: tires (statis), cone (dinamis), road_barrier (statis/dinamis). */
export function drawProp(g, p) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot || 0);

    if (p.type === 'tires') {
        g.fillStyle = '#111827';
        g.beginPath();
        g.arc(0, 0, p.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ef4444';
        g.lineWidth = 4;
        g.stroke();

        g.fillStyle = '#374151';
        g.beginPath();
        g.arc(0, 0, p.r * 0.4, 0, Math.PI * 2);
        g.fill();
    } else if (p.type === 'cone') {
        g.fillStyle = '#f97316';
        g.beginPath();
        g.arc(0, 0, p.r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(0, 0, p.r * 0.5, 0, Math.PI * 2);
        g.fill();
    } else if (p.type === 'road_barrier') {
        g.fillStyle = 'rgba(0, 0, 0, 0.3)';
        g.fillRect(-p.w / 2 + 2, -p.h / 2 + 3, p.w, p.h);

        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);

        g.strokeStyle = '#1e293b';
        g.lineWidth = 1.5;
        g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);

        g.fillStyle = 'rgba(0, 0, 0, 0.15)';
        g.fillRect(-p.w / 2, -p.h / 6, p.w, p.h / 3);
    }

    g.restore();
}

/* ==========================================================================
   CHECKPOINT
   ========================================================================== */

/**
 * GARIS START / FINISH — garis putih lurus yang HANYA menempel di atas
 * lintasan (aspal/concrete). Tiap titik diuji lewat isRoad(x, y); hanya
 * segmen yang berada di jalan yang digambar, sehingga garis tidak keluar
 * ke rumput/pasir di luar track.
 * Hanya di-bake (checkpoint start/finish tidak punya visual vektor saat balapan).
 */
export function drawStartFinishLine(g, cp, isRoad) {
    const barH = Math.max(6, cp.h / 3);
    const cosR = Math.cos(cp.rot || 0);
    const sinR = Math.sin(cp.rot || 0);

    // Fallback: tanpa uji jalan, gambar penuh seperti sebelumnya
    if (typeof isRoad !== 'function') {
        g.save();
        g.translate(cp.x, cp.y);
        g.rotate(cp.rot || 0);
        g.fillStyle = '#ffffff';
        g.fillRect(-cp.w / 2, -barH / 2, cp.w, barH);
        g.restore();
        return;
    }

    // Seberangi sumbu lokal X checkpoint; catat run titik yang berada di jalan
    const steps = Math.max(24, Math.round(cp.w / 4));
    const stepW = cp.w / steps;
    let runStart = null;

    g.save();
    g.translate(cp.x, cp.y);
    g.rotate(cp.rot || 0);
    g.fillStyle = '#ffffff';

    const flushRun = (endLocalX) => {
        if (runStart === null) return;
        const w = endLocalX - runStart;
        if (w > 0.5) g.fillRect(runStart, -barH / 2, w, barH);
        runStart = null;
    };

    for (let i = 0; i <= steps; i++) {
        const localX = -cp.w / 2 + i * stepW;
        const wx = cp.x + localX * cosR;
        const wy = cp.y + localX * sinR;
        if (isRoad(wx, wy)) {
            if (runStart === null) runStart = localX;
        } else {
            flushRun(localX);
        }
    }
    flushRun(cp.w / 2);

    g.restore();
}

/**
 * BENDERA CHECKPOINT (saat balapan): hanya tiang + bendera di kedua ujung.
 * Rectangle area, dash "next checkpoint", dan label HANYA tampil di editor.
 */
export function drawCheckpointFlags(g, cp, isNext) {
    g.save();
    g.translate(cp.x, cp.y);
    g.rotate(cp.rot || 0);

    const poleColor = '#1e293b';
    const flagColor = isNext ? '#22c55e' : '#eab308';
    const flagShade = isNext ? '#16a34a' : '#ca8a04';

    const sideOffsets = [-cp.w / 2 - 12, cp.w / 2 + 12];
    sideOffsets.forEach(offsetX => {
        g.fillStyle = poleColor;
        g.beginPath();
        g.arc(offsetX, 0, 8, 0, Math.PI * 2);
        g.fill();

        g.fillStyle = flagColor;
        g.fillRect(offsetX - 3, -25, 6, 25);

        g.fillStyle = flagShade;
        g.beginPath();
        g.moveTo(offsetX, -25);
        g.lineTo(offsetX + (offsetX < 0 ? -20 : 20), -17);
        g.lineTo(offsetX, -9);
        g.closePath();
        g.fill();
    });

    g.restore();
}

/* ==========================================================================
   BUSH (SEMAK-SEMAK)
   ========================================================================== */

/**
 * SEMAK — lingkaran berdaun yang RONGGA (tidak solid), sehingga mobil masih
 * terlihat saat masuk. Digambar sebagai gugusan daun di sekeliling lingkaran
 * (bukan bidang penuh), dengan sedikit getaran (shake) saat mobil bergerak
 * di dalamnya. Tidak menjadi penghalang — mobil bisa melaluinya.
 *
 * @param g      context canvas
 * @param b      objek bush { x, y, r, leafColor, leafDark, leafLight, shake }
 * @param timeSec waktu (detik) untuk fase getaran
 */
export function drawBush(g, b, timeSec) {
    const r = b.r || 50;
    const shake = b.shake || 0;
    const seed = b._leafSeed || 12345;

    g.save();
    g.translate(b.x, b.y);

    // Efek getaran (shake)
    const jitterAmp = shake * 2.4;
    g.translate(
        Math.sin(timeSec * 22 + seed) * jitterAmp,
        Math.cos(timeSec * 19 + seed * 1.3) * jitterAmp
    );

    // 1. Bayangan dasar lembut di tanah
    g.fillStyle = 'rgba(0, 0, 0, 0.15)';
    g.beginPath();
    g.ellipse(0, r * 0.3, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
    g.fill();

    // Pseudo-random generator sederhana berbasis seed
    function pseudoRandom(n) {
        let x = Math.sin(seed + n) * 10000;
        return x - Math.floor(x);
    }

    // 2. Menggambar Cabang / Ranting Cokelat di bagian dalam
    g.strokeStyle = '#5a3d28';
    g.lineWidth = r * 0.06;
    g.lineCap = 'round';
    
    const branchCount = 8;
    for (let i = 0; i < branchCount; i++) {
        const angle = (i / branchCount) * Math.PI * 2 + pseudoRandom(i) * 0.5;
        const innerDist = r * 0.12; // Rongga tengah untuk mobil
        const outerDist = r * 0.7;
        
        const x1 = Math.cos(angle) * innerDist;
        const y1 = Math.sin(angle) * innerDist * 0.8;
        const x2 = Math.cos(angle) * outerDist;
        const y2 = Math.sin(angle) * outerDist * 0.8;

        g.beginPath();
        g.moveTo(x1, y1);
        const midX = (x1 + x2) * 0.5 + (pseudoRandom(i + 10) - 0.5) * r * 0.2;
        const midY = (y1 + y2) * 0.5 + (pseudoRandom(i + 20) - 0.5) * r * 0.2;
        g.quadraticCurveTo(midX, midY, x2, y2);
        g.stroke();
    }

    // 3. Menggambar Lapisan Daun (Ukuran daun diperkecil, jumlah diperbanyak)
    const totalLeaves = 60; 
    
    for (let i = 0; i < totalLeaves; i++) {
        const rnd1 = pseudoRandom(i);
        const rnd2 = pseudoRandom(i + 100);
        const rnd3 = pseudoRandom(i + 200);

        const distRatio = 0.2 + rnd1 * 0.7; // Menjaga rongga tengah tetap terbuka
        const ang = rnd2 * Math.PI * 2;
        
        const lx = Math.cos(ang) * (r * distRatio);
        const ly = Math.sin(ang) * (r * distRatio * 0.85);

        // UKURAN DAUN DIPERKECIL (sebelumnya 0.22, kini 0.08)
        const leafW = r * (0.08 + rnd3 * 0.07); 
        const leafH = leafW * (0.55 + rnd1 * 0.25);
        const leafAngle = rnd3 * Math.PI * 2;

        g.save();
        g.translate(lx, ly);
        g.rotate(leafAngle);

        // Menentukan warna lapis daun
        let leafColor = '#2f7d32';
        if (rnd1 < 0.3) {
            leafColor = b.leafDark || '#18421c'; // Daun bawah/gelap
        } else if (rnd1 > 0.7) {
            leafColor = b.leafLight || '#7cb342'; // Daun atas/terang
        } else {
            leafColor = b.leafColor || '#4caf50';
        }

        g.fillStyle = leafColor;
        g.beginPath();
        g.ellipse(0, 0, leafW, leafH, 0, 0, Math.PI * 2);
        g.fill();

        // Detail urat daun tipis pada daun tertentu
        if (rnd2 > 0.6) {
            g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            g.lineWidth = 0.8;
            g.beginPath();
            g.moveTo(0, -leafH * 0.7);
            g.lineTo(0, leafH * 0.7);
            g.stroke();
        }

        g.restore();
    }

    g.restore();
}