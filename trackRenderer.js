/**
 * TRACK RENDERER ENGINE
 * Menggambar lintasan dari data track.json
 */
const TrackRenderer = {
    data: null,

    // Load data JSON
    async load(jsonPath = 'track.json') {
        try {
            const response = await fetch(jsonPath);
            this.data = await response.json();
            return this.data;
        } catch (err) {
            console.error('Gagal memuat track.json:', err);
            return null;
        }
    },

    // Fungsi utilitas untuk memuat instruksi path ke Canvas
    buildPath(ctx, scaleX = 1, scaleY = 1, avgScale = 1) {
        if (!this.data || !this.data.path) return;

        ctx.beginPath();
        this.data.path.forEach(step => {
            const args = step.args || [];
            switch (step.cmd) {
                case 'moveTo':
                    ctx.moveTo(args[0] * scaleX, args[1] * scaleY);
                    break;
                case 'lineTo':
                    ctx.lineTo(args[0] * scaleX, args[1] * scaleY);
                    break;
                case 'arcTo':
                    ctx.arcTo(
                        args[0] * scaleX, args[1] * scaleY,
                        args[2] * scaleX, args[3] * scaleY,
                        args[4] * avgScale
                    );
                    break;
                case 'bezierCurveTo':
                    ctx.bezierCurveTo(
                        args[0] * scaleX, args[1] * scaleY,
                        args[2] * scaleX, args[3] * scaleY,
                        args[4] * scaleX, args[5] * scaleY
                    );
                    break;
                case 'closePath':
                    ctx.closePath();
                    break;
            }
        });
    },

    // 1. RENDER RUMPUT
    drawGrass(ctx) {
        if (!this.data) return;
        ctx.fillStyle = this.data.world.grassColor || '#15803d';
        ctx.fillRect(0, 0, this.data.world.width, this.data.world.height);
    },

    // 2. RENDER JALAN TARMAC LENGKAP WITH FINISH LINE
    drawTarmac(ctx) {
        if (!this.data) return;
        const r = this.data.road;

        ctx.save();
        ctx.lineCap = r.lineCap || 'round';
        ctx.lineJoin = r.lineJoin || 'round';

        // Lapisan Luar (Pondasi Jalan)
        ctx.strokeStyle = r.outerColor;
        ctx.lineWidth = r.outerWidth;
        this.buildPath(ctx);
        ctx.stroke();

        // Lapisan Dalam (Aspal Utama)
        ctx.strokeStyle = r.innerColor;
        ctx.lineWidth = r.innerWidth;
        this.buildPath(ctx);
        ctx.stroke();

        // Garis Start/Finish Motif Catur
        if (this.data.startLine) {
            const sl = this.data.startLine;
            ctx.save();
            ctx.translate(sl.x, sl.y);
            ctx.rotate(sl.rotationRad);
            ctx.fillStyle = '#ffffff';

            for (let i = -65; i < 65; i += 20) {
                for (let j = -10; j < 10; j += 10) {
                    if (((i / 20) + (j / 10)) % 2 === 0) {
                        ctx.fillRect(j, i, 10, 10);
                    }
                }
            }
            ctx.restore();
        }

        ctx.restore();
    },
};