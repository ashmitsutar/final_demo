/* ── Premium Animated Blur Background ────────────────────────────────────
   Large, vivid blue/indigo/cyan blobs — heavily blurred, very slow drift.
   Layered with a subtle light-ray sweep for depth.
──────────────────────────────────────────────────────────────────────── */
(function () {
    const canvas = document.getElementById('waveCanvas') || document.createElement('canvas');
    if (!document.getElementById('waveCanvas')) {
        canvas.id = 'waveCanvas';
        canvas.style.cssText =
            'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;pointer-events:none';
        document.body.insertBefore(canvas, document.body.firstChild);
    }

    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();

    // ── Blobs config ──────────────────────────────────────────────────────
    // Visibile, moving sky blue fog
    const blobs = [
        { x:.18, y:.22, vx: 0.00035, vy: 0.00020, r:.55, col:[56,189,248],   a:0.45, ph:0.0  },  // sky-400
        { x:.78, y:.68, vx:-0.00028, vy:-0.00018, r:.60, col:[14,165,233],   a:0.35, ph:1.2  },  // sky-500
        { x:.50, y:.88, vx: 0.00020, vy:-0.00030, r:.45, col:[6,182,212],    a:0.40, ph:2.4  },  // cyan-500
        { x:.10, y:.75, vx: 0.00038, vy: 0.00015, r:.40, col:[125,211,252],  a:0.50, ph:0.7  },  // sky-300
        { x:.88, y:.18, vx:-0.00025, vy: 0.00028, r:.48, col:[59,130,246],   a:0.30, ph:3.5  },  // blue-500
        { x:.42, y:.40, vx: 0.00018, vy: 0.00025, r:.35, col:[96,165,250],   a:0.40, ph:1.8  },  // blue-400
        { x:.65, y:.30, vx:-0.00032, vy:-0.00020, r:.42, col:[2,132,199],    a:0.35, ph:2.9  },  // sky-600
    ];

    function drawBlob(b, t) {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -.25) b.vx =  Math.abs(b.vx);
        if (b.x > 1.25) b.vx = -Math.abs(b.vx);
        if (b.y < -.25) b.vy =  Math.abs(b.vy);
        if (b.y > 1.25) b.vy = -Math.abs(b.vy);

        // Faster breathing
        const breathe = 1 + 0.12 * Math.sin(t * 0.6 + b.ph);
        const R       = b.r * Math.min(W, H) * breathe;
        const opacity = b.a * (0.80 + 0.20 * Math.sin(t * 0.4 + b.ph + 1));
        const [r,g,bl]= b.col;

        ctx.save();
        const sy = 0.78 + 0.15 * Math.sin(t * 0.45 + b.ph);
        ctx.translate(b.x * W, b.y * H);
        ctx.scale(1, sy);

        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        grd.addColorStop(0,   `rgba(${r},${g},${bl},${(opacity * 0.8).toFixed(3)})`);
        grd.addColorStop(0.45,`rgba(${r},${g},${bl},${(opacity * 0.3).toFixed(3)})`);
        grd.addColorStop(1,   `rgba(${r},${g},${bl},0)`);

        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.restore();
    }

    // ── Light-ray sweep ───────────────────────────────────────────────────
    function drawRay(t) {
        const angle   = (t * 0.012) % (Math.PI * 2);
        const cx      = W * 0.5;
        const cy      = H * 0.45;
        const len     = Math.max(W, H) * 1.4;
        const x2      = cx + Math.cos(angle) * len;
        const y2      = cy + Math.sin(angle) * len;

        const ray = ctx.createLinearGradient(cx, cy, x2, y2);
        ray.addColorStop(0,   'rgba(148,163,184,0.00)');
        ray.addColorStop(0.3, 'rgba(255,255,255,0.04)');
        ray.addColorStop(0.6, 'rgba(148,163,184,0.02)');
        ray.addColorStop(1,   'rgba(148,163,184,0.00)');

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, len, angle - 0.08, angle + 0.08);
        ctx.closePath();
        ctx.fillStyle = ray;
        ctx.fill();
        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // Pass 1: blobs with heavy blur
        ctx.filter = 'blur(110px)';
        blobs.forEach(b => drawBlob(b, t));

        // Pass 2: light ray (no blur)
        ctx.filter = 'none';
        drawRay(t);

        t += 0.006;
        requestAnimationFrame(draw);
    }

    draw();
})();
