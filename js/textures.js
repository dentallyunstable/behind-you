// Tiny procedural textures, drawn once at startup.
// They're deliberately low resolution so they look stretched and blurry on the models,
// like early-2000s games.
(function () {
  'use strict';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Fill a rect pixel by pixel with a color function (r,g,b,a 0-255).
  function paint(ctx, x0, y0, w, h, fn) {
    const img = ctx.getImageData(x0, y0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = fn(x, y);
        const i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] === undefined ? 255 : c[3];
      }
    }
    ctx.putImageData(img, x0, y0);
  }

  // Cheap tileable value noise.
  function makeNoise(size, cells) {
    const grid = [];
    for (let i = 0; i < cells * cells; i++) grid.push(Math.random());
    const g = (x, y) => grid[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
    return function (x, y) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g(ix, iy), b = g(ix + 1, iy), c = g(ix, iy + 1), d = g(ix + 1, iy + 1);
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    };
  }

  function toTexture(canvas, repeat) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter; // no mipmaps: cheap and a bit shimmery, very retro
    t.generateMipmaps = false;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    return t;
  }

  // ---- Atlas: 4 materials packed in one 128x128 image (one texture = one draw call per tree type)
  function buildAtlas() {
    const S = 64;
    const c = makeCanvas(S * 2, S * 2);
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // Top-left: bark (vertical streaks)
    const n1 = makeNoise(S, 8);
    const streak = [];
    for (let x = 0; x < S; x++) streak.push(Math.random());
    paint(ctx, 0, 0, S, S, (x, y) => {
      const v = 0.45 + streak[x] * 0.35 + n1(x, y * 0.2) * 0.3 - (streak[(x + 1) % S] > 0.85 ? 0.3 : 0);
      return [70 * v, 52 * v, 38 * v];
    });

    // Top-right: pine needles
    const n2 = makeNoise(S, 16);
    paint(ctx, S, 0, S, S, (x, y) => {
      const v = 0.35 + n2(x, y) * 0.5 + Math.random() * 0.25;
      return [30 * v, 62 * v, 34 * v];
    });

    // Bottom-left: dead grey bark
    const n3 = makeNoise(S, 6);
    paint(ctx, 0, S, S, S, (x, y) => {
      const v = 0.5 + n3(x * 3, y * 0.3) * 0.4 + Math.random() * 0.1;
      return [78 * v, 74 * v, 68 * v];
    });

    // Bottom-right: mossy rock
    const n4 = makeNoise(S, 8);
    paint(ctx, S, S, S, S, (x, y) => {
      const m = n4(x, y);
      const v = 0.5 + Math.random() * 0.2 + m * 0.3;
      return m > 0.62 ? [50 * v, 70 * v, 40 * v] : [85 * v, 85 * v, 80 * v];
    });

    return toTexture(c, false);
  }

  // UV rects inside the atlas (three.js UV origin is bottom-left). Inset a bit to avoid bleeding.
  const E = 0.01;
  const ATLAS = {
    bark:   [0 + E,   0.5 + E, 0.5 - E, 1 - E],
    leaves: [0.5 + E, 0.5 + E, 1 - E,   1 - E],
    dead:   [0 + E,   0 + E,   0.5 - E, 0.5 - E],
    rock:   [0.5 + E, 0 + E,   1 - E,   0.5 - E]
  };

  // ---- Props atlas: 4 materials for the abandoned places (same layout as the tree atlas)
  function buildPropsAtlas() {
    const S = 64;
    const c = makeCanvas(S * 2, S * 2);
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // Top-left: weathered grey planks, with dark gaps and a few nails
    const n1 = makeNoise(S, 8);
    const board = [];
    for (let i = 0; i < 8; i++) board.push(0.7 + Math.random() * 0.4);
    paint(ctx, 0, 0, S, S, (x, y) => {
      const b = Math.floor(y / 8);
      if (y % 8 === 0) return [14, 12, 10];
      const grain = n1(x * 0.3, y * 3) * 0.35;
      const v = (0.45 + grain + Math.random() * 0.12) * board[b];
      return [92 * v, 84 * v, 72 * v];
    });
    ctx.fillStyle = '#1a1612';
    for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rand(2, S - 2)), Math.floor(rand(0, 8)) * 8 + 3, 1, 1);

    // Top-right: faded paint eaten by rust
    const n2 = makeNoise(S, 8);
    const n2b = makeNoise(S, 16);
    paint(ctx, S, 0, S, S, (x, y) => {
      const r = n2(x, y) * 0.7 + n2b(x, y) * 0.4;
      const v = 0.6 + Math.random() * 0.2;
      if (r > 0.62) return [96 * v, 50 * v, 26 * v];
      if (r > 0.52) return [70 * v, 40 * v, 26 * v];
      return [58 * v, 70 * v, 74 * v];
    });

    // Bottom-left: dirty, stained tent canvas
    const n3 = makeNoise(S, 6);
    paint(ctx, 0, S, S, S, (x, y) => {
      const v = 0.5 + n3(x, y) * 0.35 + Math.random() * 0.1 - (x % 16 === 0 ? 0.15 : 0);
      return [96 * v, 92 * v, 58 * v];
    });
    ctx.fillStyle = 'rgba(30,20,14,0.5)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rand(0, S)), S + Math.floor(rand(0, S - 10)), Math.floor(rand(3, 8)), Math.floor(rand(4, 12)));

    // Bottom-right: soot and darkness (doorways, windows, tyres, burnt wood)
    paint(ctx, S, S, S, S, () => {
      const v = 6 + Math.random() * 10;
      return [v, v * 0.9, v * 0.8];
    });

    return toTexture(c, false);
  }

  // Highway asphalt, one tile = 8 m of road (along x) and its full width (along y):
  // white edge lines, a dashed yellow centre line, cracks and tar patches.
  function buildRoad() {
    const W = 64, H = 64;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = makeNoise(W, 8);
    paint(ctx, 0, 0, W, H, (x, y) => {
      const v = 0.55 + n(x, y) * 0.3 + Math.random() * 0.15;
      return [40 * v, 40 * v, 42 * v];
    });
    ctx.fillStyle = 'rgba(10,10,10,0.6)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rand(0, W)), Math.floor(rand(8, H - 8)), Math.floor(rand(4, 14)), Math.floor(rand(2, 5)));
    ctx.fillStyle = 'rgba(150,146,130,0.75)';
    ctx.fillRect(0, 5, W, 2);
    ctx.fillRect(0, H - 7, W, 2);
    ctx.fillStyle = 'rgba(160,130,40,0.8)';
    ctx.fillRect(4, H / 2 - 1, 26, 2);
    ctx.fillRect(36, H / 2 - 1, 26, 2);
    // cracks
    ctx.fillStyle = 'rgba(12,12,12,0.8)';
    for (let i = 0; i < 4; i++) {
      let x = rand(0, W), y = rand(10, H - 10);
      for (let k = 0; k < 10; k++) { ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1); x += rand(-1, 1.5); y += rand(-1, 1); }
    }
    return toTexture(c, true);
  }

  // Dark red paint, faded and scratched (the pickup truck).
  function buildPaint() {
    const S = 32;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = makeNoise(S, 6);
    paint(ctx, 0, 0, S, S, (x, y) => {
      const v = 0.6 + n(x, y) * 0.3 + Math.random() * 0.1;
      return Math.random() < 0.02 ? [90, 70, 60] : [110 * v, 22 * v, 20 * v];
    });
    return toTexture(c, false);
  }


  function buildGlow() {
    const S = 32;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTexture(c, false);
  }

  function buildGround() {
    const S = 64;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = makeNoise(S, 4);
    const n2 = makeNoise(S, 16);
    paint(ctx, 0, 0, S, S, (x, y) => {
      const v = 0.45 + n(x, y) * 0.35 + n2(x, y) * 0.25 + Math.random() * 0.12;
      const grass = n2(x + 7, y + 3) > 0.55;
      return grass ? [38 * v, 52 * v, 26 * v] : [62 * v, 46 * v, 30 * v];
    });
    // a few fallen leaves / twigs
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgb(90,60,30)' : 'rgb(70,64,40)';
      ctx.fillRect(Math.floor(rand(0, S)), Math.floor(rand(0, S)), Math.random() < 0.3 ? 3 : 2, 1);
    }
    return toTexture(c, true);
  }

  // Bush sprite with transparent background (used on crossed planes, classic trick).
  function buildBush() {
    const S = 64;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const x = rand(4, S - 4);
      const y = rand(S * 0.25 + Math.abs(x - S / 2) * 0.5, S);
      const v = rand(0.4, 1);
      ctx.fillStyle = 'rgb(' + Math.floor(34 * v) + ',' + Math.floor(64 * v) + ',' + Math.floor(30 * v) + ')';
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(rand(2, 5)), Math.floor(rand(2, 6)));
    }
    return toTexture(c, false);
  }

  // Hand skin + flashlight metal for the first-person viewmodel.
  function buildHand() {
    const S = 32;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    paint(ctx, 0, 0, S, S, () => {
      const v = 0.85 + Math.random() * 0.15;
      return [190 * v, 140 * v, 110 * v];
    });
    return toTexture(c, false);
  }

  // The thing's skin: dark, blotchy, with pale streaks like stretched skin over bone.
  function buildMonsterSkin() {
    const S = 32;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = makeNoise(S, 6);
    paint(ctx, 0, 0, S, S, (x, y) => {
      const v = 0.35 + n(x, y) * 0.5 + Math.random() * 0.15;
      const streak = (y % 6 === 0 && Math.random() < 0.7) ? 1.6 : 1;
      return [52 * v * streak, 48 * v * streak, 46 * v * streak];
    });
    return toTexture(c, false);
  }

  // Its face: pale, with hollow black eye sockets and a long gaping mouth.
  function buildMonsterFace() {
    const S = 64;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const n = makeNoise(S, 8);
    paint(ctx, 0, 0, S, S, (x, y) => {
      const v = 0.55 + n(x, y) * 0.35 + Math.random() * 0.1;
      return [175 * v, 168 * v, 155 * v];
    });
    // dark stains running down from the eyes
    ctx.fillStyle = 'rgba(30,20,20,0.55)';
    [20, 44].forEach(ex => {
      for (let i = 0; i < 4; i++) ctx.fillRect(ex - 4 + Math.floor(Math.random() * 8), 28, 1, 8 + Math.floor(Math.random() * 18));
    });
    // hollow eye sockets
    ctx.fillStyle = '#050303';
    [20, 44].forEach(ex => {
      ctx.beginPath();
      ctx.ellipse(ex, 24, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // long gaping mouth
    ctx.beginPath();
    ctx.ellipse(32, 50, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // crooked teeth
    ctx.fillStyle = '#c8c0a0';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(25 + i * 2.5 + Math.random(), 39 + Math.random() * 2, 1, 3 + Math.floor(Math.random() * 3));
      ctx.fillRect(25 + i * 2.5 + Math.random(), 58 - Math.random() * 2, 1, 3 + Math.floor(Math.random() * 3));
    }
    return toTexture(c, false);
  }

  window.Textures = {
    ATLAS: ATLAS,
    PROPS: { planks: ATLAS.bark, rust: ATLAS.leaves, canvas: ATLAS.dead, soot: ATLAS.rock },
    build: function () {
      return {
        atlas: buildAtlas(),
        props: buildPropsAtlas(),
        glow: buildGlow(),
        road: buildRoad(),
        paint: buildPaint(),
        ground: buildGround(),
        bush: buildBush(),
        hand: buildHand(),
        monsterSkin: buildMonsterSkin(),
        monsterFace: buildMonsterFace()
      };
    }
  };
})();
