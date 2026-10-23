// Pixel art for the menus, drawn into small canvases that the page scales up with chunky pixels:
// locked level cards (black, chains wrapped round them, a padlock where they meet).
(function () {
  'use strict';

  const METAL = { hi: '#b4b2a8', mid: '#76746c', lo: '#3c3b37' };

  function px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }

  // Almost black, with a little grain.
  function darkness(ctx, w, h) {
    ctx.fillStyle = '#040404';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.08; i++) {
      const v = 8 + Math.floor(Math.random() * 10);
      px(ctx, Math.random() * w, Math.random() * h, 'rgb(' + v + ',' + v + ',' + v + ')');
    }
  }

  // One chain link at (cx, cy), lying along angle a. Every other link is seen edge-on (a short bar).
  function link(ctx, cx, cy, a, flat, size) {
    const rx = 4.4 * size, ry = 2.6 * size;
    const c = Math.cos(a), s = Math.sin(a);
    const r = Math.ceil(rx) + 1;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = dx * c + dy * s, v = -dx * s + dy * c;
        let on;
        if (flat) {
          const q = (u / rx) * (u / rx) + (v / ry) * (v / ry);
          const hole = (u / (rx - 1.5 * size)) * (u / (rx - 1.5 * size)) + (v / Math.max(0.6, ry - 1.4 * size)) * (v / Math.max(0.6, ry - 1.4 * size));
          on = q <= 1 && hole >= 1;
        } else {
          on = Math.abs(v) <= 0.9 * size && Math.abs(u) <= rx;
        }
        if (on) px(ctx, x, y, v < -0.6 * size ? METAL.hi : v > 0.8 * size ? METAL.lo : METAL.mid);
      }
    }
  }

  // A chain from (x0, y0) to (x1, y1).
  function chain(ctx, x0, y0, x1, y1, size) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const step = 6.6 * size;
    for (let i = 0, d = 0; d <= len; i++, d += step) {
      link(ctx, x0 + Math.cos(a) * d, y0 + Math.sin(a) * d, a, i % 2 === 0, size);
    }
  }

  // A padlock centred at (cx, cy): shackle on top, iron body, keyhole.
  function padlock(ctx, cx, cy, size) {
    const bw = Math.round(16 * size), bh = Math.round(13 * size);
    const x0 = Math.round(cx - bw / 2), y0 = Math.round(cy - bh / 2 + 3 * size);
    // shackle: a thick upside-down U
    const sr = 5.2 * size, sw = 1.8 * size;
    for (let y = Math.floor(y0 - sr - 4 * size); y <= y0; y++) {
      for (let x = Math.floor(cx - sr - sw); x <= cx + sr + sw; x++) {
        const dx = x + 0.5 - cx;
        const top = y0 - 3 * size;
        let on;
        if (y + 0.5 < top) {
          const d = Math.hypot(dx, y + 0.5 - top);
          on = d <= sr + sw / 2 && d >= sr - sw / 2;
        } else {
          on = Math.abs(Math.abs(dx) - sr) <= sw / 2;
        }
        if (on) px(ctx, x, y, dx < 0 ? METAL.hi : METAL.mid);
      }
    }
    // body
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const edge = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
        const c = edge ? '#2a2318' : y < 2 ? '#a08a52' : (x + y) % 7 === 0 ? '#5e4f2e' : '#7a6740';
        px(ctx, x0 + x, y0 + y, c);
      }
    }
    // keyhole
    const kx = Math.round(cx), ky = Math.round(y0 + bh * 0.42);
    ctx.fillStyle = '#080604';
    ctx.fillRect(kx - Math.round(size), ky - Math.round(size), Math.max(2, Math.round(2 * size)), Math.max(2, Math.round(2 * size)));
    ctx.fillRect(kx - Math.round(size * 0.4), ky, Math.max(1, Math.round(size)), Math.max(2, Math.round(3.5 * size)));
  }

  // A locked level: black, two chains crossing over it, padlocked where they meet.
  function lockedCard(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    darkness(ctx, w, h);
    chain(ctx, -6, -4, w + 6, h + 4, 1);
    chain(ctx, -6, h + 4, w + 6, -4, 1);
    padlock(ctx, w / 2, h / 2, 1);
  }

  // A small locked button: one chain straight across, a little padlock.
  function lockedMini(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    darkness(ctx, w, h);
    chain(ctx, -2, h / 2 + 1, w + 2, h / 2 - 1, 0.55);
    padlock(ctx, w / 2, h / 2 - 1, 0.45);
  }

  window.Art = { lockedCard: lockedCard, lockedMini: lockedMini };
})();
