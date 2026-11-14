// Procedurally drawn sample images (no external assets). All sizes are 960x640.
export const SAMPLE_W = 960;
export const SAMPLE_H = 640;
export const SAMPLE_IDS = ['traffic', 'fruit', 'transit', 'hue', 'chart'];

const FONT = '700 26px system-ui, -apple-system, "Segoe UI", sans-serif';

function disc(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function radial(ctx, x, y, r0, r1, c0, c1) {
  const g = ctx.createRadialGradient(x - r1 * 0.3, y - r1 * 0.3, r0, x, y, r1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTraffic(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#aeb6c2');
  sky.addColorStop(1, '#6f7681');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3b3f46';
  ctx.fillRect(0, h - 70, w, 70);
  ctx.fillStyle = '#e8e8e8';
  for (let x = 20; x < w; x += 110) ctx.fillRect(x, h - 40, 60, 8);

  const heads = [
    { x: 150, lit: 0 }, // red
    { x: 330, lit: 1 }, // amber
    { x: 510, lit: 2 }, // green
  ];
  const on = ['#ff2b2b', '#ffb400', '#12d68a'];
  const off = ['#4a2a2c', '#4c4126', '#244036'];
  for (const hd of heads) {
    ctx.fillStyle = '#4a4d54';
    ctx.fillRect(hd.x - 6, 40, 12, h - 100);
    roundRect(ctx, hd.x - 50, 40, 100, 300, 18);
    ctx.fillStyle = '#1f2125';
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const cy = 100 + i * 90;
      if (i === hd.lit) {
        const g = ctx.createRadialGradient(hd.x, cy, 10, hd.x, cy, 70);
        g.addColorStop(0, on[i] + 'aa');
        g.addColorStop(1, on[i] + '00');
        ctx.fillStyle = g;
        ctx.fillRect(hd.x - 80, cy - 80, 160, 160);
        disc(ctx, hd.x, cy, 32, on[i]);
      } else {
        disc(ctx, hd.x, cy, 32, off[i]);
      }
    }
  }

  // stop sign (red octagon)
  const cx = 740, cy = 130, R = 85;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#d3202a';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STOP', cx, cy + 2);
  ctx.fillStyle = '#4a4d54';
  ctx.fillRect(cx - 6, cy + R, 12, 190);

  // green direction sign
  roundRect(ctx, 650, 380, 270, 130, 14);
  ctx.fillStyle = '#0b7a4b';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT;
  ctx.fillText('EXIT 12', 785, 425);
  ctx.beginPath();
  ctx.moveTo(710, 475); ctx.lineTo(850, 475);
  ctx.moveTo(825, 458); ctx.lineTo(850, 475); ctx.lineTo(825, 492);
  ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawFruit(ctx, w, h) {
  ctx.fillStyle = '#e6dfd1';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b08d62';
  ctx.fillRect(0, 380, w, h - 380);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 410; y < h; y += 50) ctx.fillRect(0, y, w, 3);

  const shadow = (x, y, rx) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,25,10,0.28)';
    ctx.fill();
  };
  const fruit = (x, y, r, c0, c1) => {
    shadow(x, y + r * 0.95, r * 0.95);
    disc(ctx, x, y, r, radial(ctx, x, y, r * 0.1, r, c0, c1));
  };
  const leaf = (x, y, len, ang, col) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(len / 2, 0, len / 2, len * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  };

  // grapes (purple)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c <= 3 - r; c++) {
      fruit(120 + r * 14 + c * 38, 330 + r * 34, 22, '#8b63c2', '#40226d');
    }
  }
  // green apple
  fruit(330, 400, 85, '#c5e36a', '#5d8f1d');
  leaf(330, 322, 60, -0.6, '#3f7a1c');
  // red apple
  fruit(520, 410, 90, '#ff6a5a', '#9d1018');
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(520, 325); ctx.lineTo(530, 295); ctx.stroke();
  leaf(530, 300, 60, -0.5, '#2f7a28');
  // orange
  fruit(700, 440, 72, '#ffc15a', '#d4640a');
  // banana
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8a6d1a'; ctx.lineWidth = 46;
  ctx.beginPath(); ctx.arc(480, 150, 300, 0.45 * Math.PI, 0.72 * Math.PI); ctx.stroke();
  ctx.strokeStyle = '#f4d23c'; ctx.lineWidth = 40;
  ctx.beginPath(); ctx.arc(480, 150, 300, 0.45 * Math.PI, 0.72 * Math.PI); ctx.stroke();
  ctx.restore();
  // strawberries
  for (const [sx, sy] of [[830, 500], [880, 440], [790, 440]]) {
    shadow(sx, sy + 36, 30);
    ctx.beginPath();
    ctx.moveTo(sx - 32, sy - 14);
    ctx.quadraticCurveTo(sx, sy - 34, sx + 32, sy - 14);
    ctx.quadraticCurveTo(sx + 22, sy + 36, sx, sy + 44);
    ctx.quadraticCurveTo(sx - 22, sy + 36, sx - 32, sy - 14);
    ctx.fillStyle = '#d8232f'; ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    for (const [dx, dy] of [[-12, 0], [8, -4], [-2, 14], [14, 14], [-14, 22]]) ctx.fillRect(sx + dx, sy + dy, 3, 5);
    for (let k = -2; k <= 2; k++) leaf(sx, sy - 22, 26, -Math.PI / 2 + k * 0.6, '#2d8a2f');
  }
}

function drawTransit(ctx, w, h) {
  ctx.fillStyle = '#f6f5f0';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e1dfd6'; ctx.lineWidth = 1;
  for (let x = 40; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 40; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const lines = [
    { c: '#e53935', l: 'A', pts: [[80, 120], [320, 120], [440, 240], [440, 380], [620, 560], [880, 560]] },
    { c: '#2e9e44', l: 'B', pts: [[80, 520], [240, 520], [360, 400], [680, 400], [800, 280], [880, 280]] },
    { c: '#1f63d6', l: 'C', pts: [[200, 60], [200, 300], [320, 420], [320, 600]] },
    { c: '#f08a00', l: 'D', pts: [[560, 60], [560, 220], [680, 340], [880, 340]] },
    { c: '#8e3fb3', l: 'E', pts: [[80, 300], [200, 300], [440, 300], [700, 300], [700, 600]] },
  ];
  ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const ln of lines) {
    ctx.strokeStyle = ln.c;
    ctx.beginPath();
    ln.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  // stations
  for (const ln of lines) {
    ln.pts.forEach(([x, y], i) => {
      if (i === 0 || i === ln.pts.length - 1) return;
      disc(ctx, x, y, 12, '#ffffff');
      ctx.lineWidth = 4; ctx.strokeStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
    });
    const [ex, ey] = ln.pts[ln.pts.length - 1];
    disc(ctx, ex, ey, 24, ln.c);
    ctx.fillStyle = '#ffffff'; ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ln.l, ex, ey + 1);
  }
  // legend
  roundRect(ctx, 700, 20, 240, 36 + 0, 8);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  lines.forEach((ln, i) => {
    const x = 722 + i * 46;
    disc(ctx, x, 38, 14, ln.c);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(ln.l, x, 39);
  });
}

function drawHue(ctx, w, h) {
  ctx.fillStyle = '#f1f1f1';
  ctx.fillRect(0, 0, w, h);
  const cx = 300, cy = 320, R = 250, r = 110;
  for (let a = 0; a < 360; a += 1) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, ((a - 0.6) * Math.PI) / 180, ((a + 0.6) * Math.PI) / 180);
    ctx.closePath();
    ctx.fillStyle = `hsl(${a}, 85%, 50%)`;
    ctx.fill();
  }
  disc(ctx, cx, cy, r, '#f1f1f1');
  // swatch grid: 12 hues x 3 lightness rows
  const gx = 590, gy = 110, s = 62, gap = 8;
  const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  hues.forEach((hh, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = gx + col * (s + gap), y = gy + row * (s + gap);
    roundRect(ctx, x, y, s, s, 10);
    ctx.fillStyle = `hsl(${hh}, 85%, 50%)`;
    ctx.fill();
  });
  // spectrum bar
  const bx = 590, by = 400, bw = 320, bh = 60;
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30}, 85%, 50%)`);
  ctx.fillStyle = g;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  // lightness ramp for one hue pair
  const g2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g2.addColorStop(0, '#2a2a2a'); g2.addColorStop(1, '#f4f4f4');
  ctx.fillStyle = g2;
  roundRect(ctx, bx, by + 80, bw, 40, 10);
  ctx.fill();
}

function drawChart(ctx, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const L = 90, T = 70, Rr = w - 50, B = h - 80;
  ctx.strokeStyle = '#d7d7d7'; ctx.lineWidth = 2;
  for (let i = 0; i <= 5; i++) {
    const y = T + ((B - T) * i) / 5;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(Rr, y); ctx.stroke();
  }
  ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(Rr, B); ctx.stroke();
  const n = 8;
  const xs = Array.from({ length: n }, (_, i) => L + 40 + ((Rr - L - 80) * i) / (n - 1));
  const y = (v) => B - ((B - T) * v) / 100;
  const series = [
    { c: '#d9262c', l: 'A', d: [20, 32, 41, 38, 55, 62, 58, 75] },
    { c: '#1f9d3d', l: 'B', d: [25, 28, 45, 49, 50, 60, 66, 70] },
    { c: '#2160d1', l: 'C', d: [60, 52, 47, 40, 36, 30, 28, 20] },
  ];
  ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const s of series) {
    ctx.strokeStyle = s.c;
    ctx.beginPath();
    s.d.forEach((v, i) => (i ? ctx.lineTo(xs[i], y(v)) : ctx.moveTo(xs[i], y(v))));
    ctx.stroke();
    s.d.forEach((v, i) => disc(ctx, xs[i], y(v), 9, s.c));
  }
  // legend: swatch + letter
  series.forEach((s, i) => {
    const x = L + i * 120;
    ctx.fillStyle = s.c; ctx.fillRect(x, 24, 36, 14);
    ctx.fillStyle = '#222'; ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.l, x + 46, 32);
  });
}

const DRAWERS = { traffic: drawTraffic, fruit: drawFruit, transit: drawTransit, hue: drawHue, chart: drawChart };

export function drawSample(ctx, id, w = SAMPLE_W, h = SAMPLE_H) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  (DRAWERS[id] || drawTraffic)(ctx, w, h);
  ctx.restore();
}
