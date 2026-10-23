// Level 2: the highway at night. An endless two-lane road bending left and right through the woods.
// Everything here lives in the road's own frame (root): you drive towards -z, x is sideways, d = -z.
// root sits exactly where your truck was parked at the end of The Forest, turned to run along the highway,
// so the drive starts from the very spot the first level ended.
(function () {
  'use strict';

  const ROW = 2;              // the road is built in 2 m rows
  const AHEAD = 72;           // build this far ahead
  const BEHIND = 34;          // and keep this much behind (it shows in the mirror)
  const ROWS = (AHEAD + BEHIND) / ROW + 2;
  const HALF_ROAD = 3.75;     // two lanes, 7.5 m
  const START_CX = 5.75;      // the road's centre, seen from where the truck is parked
  const LENGTH = 9000;        // the level is this long
  const TREES_FROM = 8.6;     // the woods start this far from the middle of the road

  const part = Geo.part, merge = Geo.merge, mat = Geo.mat;

  function create(scene, tex) {
    const F = World.FINISH, A = Textures.ATLAS;
    const root = new THREE.Group();
    root.position.set(F.carX, 0, -F.carD);
    root.rotation.y = Math.PI / 2; // local -z runs along the highway (world -x)
    root.visible = false;
    scene.add(root);

    // ---- road and ground: strips of vertices that follow the bends ---------------
    const roadTex = tex.road.clone();
    roadTex.needsUpdate = true;
    roadTex.repeat.set(1, 1);
    const groundTex = tex.ground.clone();
    groundTex.needsUpdate = true;
    groundTex.repeat.set(1, 1);

    const ROAD_COLS = [-3.75, -2.5, -1.25, 0, 1.25, 2.5, 3.75];
    const GROUND_COLS = [-46, -28, -18, -12, -8.5, -6, -4, 0, 4, 6, 8.5, 12, 18, 28, 46];

    function strip(cols, material, y) {
      const n = ROWS * cols.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const nor = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      const idx = [];
      const c = cols.length;
      for (let r = 0; r < ROWS - 1; r++) {
        for (let k = 0; k < c - 1; k++) {
          const a = r * c + k;
          idx.push(a, a + 1, a + c, a + 1, a + c + 1, a + c);
        }
      }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.userData = { cols: cols, y: y };
      root.add(mesh);
      return mesh;
    }
    const road = strip(ROAD_COLS, new THREE.MeshLambertMaterial({ map: roadTex }), 0.02);
    const ground = strip(GROUND_COLS, new THREE.MeshLambertMaterial({ map: groundTex }), 0);

    // ---- the woods and the roadside -----------------------------------------------
    const treeMat = new THREE.MeshLambertMaterial({ map: tex.atlas });
    function inst(geo, material, max) {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.frustumCulled = false;
      m.count = 0;
      root.add(m);
      return m;
    }
    // white posts along the shoulder, with little reflectors that catch your headlights
    const postGeo = merge([part(new THREE.BoxGeometry(0.1, 1.0, 0.1), [0, 0, 1, 1], mat(0, 0.5, 0))]);
    const reflGeo = new THREE.PlaneGeometry(0.07, 0.14);
    reflGeo.translate(0, 0.85, 0.051);
    // puddles lying on the road, and yellow deer crossing signs
    const puddleGeo = new THREE.PlaneGeometry(1, 1);
    puddleGeo.rotateX(-Math.PI / 2);
    puddleGeo.translate(0, 0.035, 0);
    const plateGeo = new THREE.PlaneGeometry(0.9, 0.9);
    plateGeo.translate(0, 2.0, 0.04);
    const signPostGeo = new THREE.BoxGeometry(0.07, 2.0, 0.07);
    signPostGeo.translate(0, 1.0, 0);
    const kinds = {
      puddle: inst(puddleGeo, new THREE.MeshBasicMaterial({ map: tex.puddle, transparent: true, depthWrite: false }), 6),
      plate: inst(plateGeo, new THREE.MeshLambertMaterial({ map: tex.deerSign, alphaTest: 0.5, emissive: 0x1a1404 }), 4),
      signPost: inst(signPostGeo, new THREE.MeshLambertMaterial({ color: 0x5c5c5a }), 4),
      pine: inst(World.geometry.pine(A), treeMat, 900),
      dead: inst(World.geometry.dead(A), treeMat, 300),
      rock: inst(World.geometry.rock(A), treeMat, 120),
      post: inst(postGeo, new THREE.MeshLambertMaterial({ color: 0x8a8a84 }), 24),
      refl: inst(reflGeo, new THREE.MeshBasicMaterial({ color: 0x9a6a1c }), 24)
    };

    // ---- generation -------------------------------------------------------------
    let rows = [];
    let nextRowD = 0;
    let nextPuddleD = 0, nextSignD = 0;
    let cx = START_CX, slope = 0, slopeTarget = 0, bendD = 0;
    let dirty = true;

    function clamp01(v) { return Math.min(Math.max(v, 0), 1); }

    // 0 at the start, about 1 near the end
    function difficulty(d) {
      const t = clamp01((d - 100) / (LENGTH - 600));
      return t * (2 - t);
    }

    function reset() {
      rows = [];
      nextRowD = -BEHIND;
      cx = START_CX;
      slope = 0;
      slopeTarget = 0;
      bendD = 90;
      nextPuddleD = 160 + Math.random() * 120;
      nextSignD = 70;
      dirty = true;
    }

    function genRow(d) {
      const diff = difficulty(d);
      // the road bends: every so often it picks a new direction and eases into it
      if (d >= bendD) {
        const max = 0.05 + diff * 0.13;
        slopeTarget = Math.random() < 0.25 ? 0 : (Math.random() * 2 - 1) * max;
        bendD = d + 60 + Math.random() * 110;
      }
      if (d > 60) {
        slope += Math.max(-0.006, Math.min(0.006, slopeTarget - slope));
        cx += slope * ROW;
      }
      const items = [];
      function add(kind, x, z, s, ry, rz) {
        items.push({ kind: kind, x: x, z: z, s: s, ry: ry || 0, rz: rz || 0 });
      }
      // a wall of trees on both sides, a few more behind it
      for (let side = -1; side <= 1; side += 2) {
        const jit = () => -(d + (Math.random() - 0.5) * 1.6);
        let off = TREES_FROM + Math.random() * 2.2;
        // where the truck is parked, at the start, keep the trees back a little
        if (side < 0 && d < 12 && d > -12) off += 1;
        const kind = Math.random() < 0.82 ? 'pine' : 'dead';
        add(kind, cx + side * off, jit(), (0.9 + Math.random() * 0.5) * World.TREE_SIZE, Math.random() * 6.3, kind === 'dead' ? (Math.random() - 0.5) * 0.15 : 0);
        if (Math.random() < 0.75) {
          const k2 = Math.random() < 0.8 ? 'pine' : 'dead';
          add(k2, cx + side * (off + 3 + Math.random() * 9), jit(), (0.9 + Math.random() * 0.6) * World.TREE_SIZE, Math.random() * 6.3);
        }
        if (Math.random() < 0.3) add('pine', cx + side * (off + 12 + Math.random() * 14), jit(), (1 + Math.random() * 0.5) * World.TREE_SIZE, Math.random() * 6.3);
        if (Math.random() < 0.12) add('rock', cx + side * (HALF_ROAD + 2.2 + Math.random() * 2.5), jit(), 0.4 + Math.random() * 0.6, Math.random() * 6.3);
      }
      // now and then a puddle on the road (what's left of the rain)
      if (d >= nextPuddleD) {
        const w = 2.2 + Math.random() * 1.4;
        items.push({ kind: 'puddle', x: cx + (Math.random() * 2 - 1) * 2.2, z: -d, s: 1, sx: w, sz: w * (0.6 + Math.random() * 0.3), ry: (Math.random() - 0.5) * 0.4, rz: 0, puddle: { d: d, w: w } });
        nextPuddleD = d + 170 + Math.random() * 260;
      }
      // a deer crossing sign on the right
      if (d >= nextSignD) {
        const x = cx + HALF_ROAD + 1.6;
        add('signPost', x, -d, 1, 0);
        add('plate', x, -d, 1, 0);
        nextSignD = d + 500 + Math.random() * 600;
      }
      // reflector posts every 20 m
      if (d % 20 === 0) {
        for (let side = -1; side <= 1; side += 2) {
          const x = cx + side * (HALF_ROAD + 1.1);
          // facing back down the road, at you
          add('post', x, -d, 1, 0);
          add('refl', x, -d, 1, 0);
        }
      }
      return { d: d, cx: cx, items: items };
    }

    const dummy = new THREE.Object3D();
    function rebuild() {
      // trees and posts
      const counts = {};
      Object.keys(kinds).forEach(k => { counts[k] = 0; });
      rows.forEach(r => r.items.forEach(it => {
        const m = kinds[it.kind];
        if (counts[it.kind] >= m.instanceMatrix.count) return;
        dummy.position.set(it.x, 0, it.z);
        dummy.rotation.set(0, it.ry, it.rz);
        dummy.scale.set(it.sx || it.s, it.s, it.sz || it.s);
        dummy.updateMatrix();
        m.setMatrixAt(counts[it.kind]++, dummy.matrix);
      }));
      Object.keys(kinds).forEach(k => {
        kinds[k].count = counts[k];
        kinds[k].instanceMatrix.needsUpdate = true;
      });
      // the road and the ground under it
      [road, ground].forEach(mesh => {
        const cols = mesh.userData.cols, y = mesh.userData.y;
        const pos = mesh.geometry.attributes.position.array;
        const uv = mesh.geometry.attributes.uv.array;
        const isRoad = mesh === road;
        for (let r = 0; r < ROWS; r++) {
          const row = rows[Math.min(r, rows.length - 1)];
          for (let k = 0; k < cols.length; k++) {
            const i = r * cols.length + k;
            const x = row.cx + cols[k];
            pos[i * 3] = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = -row.d;
            if (isRoad) {
              uv[i * 2] = row.d / 8;
              uv[i * 2 + 1] = (cols[k] + HALF_ROAD) / (HALF_ROAD * 2);
            } else {
              uv[i * 2] = x / 4;
              uv[i * 2 + 1] = row.d / 4;
            }
          }
        }
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.attributes.uv.needsUpdate = true;
      });
    }

    function update(playerD) {
      while (nextRowD < playerD + AHEAD) {
        rows.push(genRow(nextRowD));
        nextRowD += ROW;
        dirty = true;
      }
      while (rows.length > ROWS || (rows.length && rows[0].d < playerD - BEHIND - ROW)) {
        rows.shift();
        dirty = true;
      }
      if (dirty) {
        rebuild();
        dirty = false;
      }
    }

    // the middle of the road at distance d (and which way it's heading there: dx per meter)
    function centerAt(d) {
      if (!rows.length) return START_CX;
      const f = (d - rows[0].d) / ROW;
      const i = Math.max(0, Math.min(rows.length - 2, Math.floor(f)));
      const a = rows[i], b = rows[i + 1] || a;
      const t = Math.max(0, Math.min(1, f - i));
      return a.cx + (b.cx - a.cx) * t;
    }
    function slopeAt(d) {
      return (centerAt(d + 1) - centerAt(d - 1)) / 2;
    }

    // the puddles between d0 and d1: [{ x, d, w }]
    function puddlesBetween(d0, d1) {
      const out = [];
      rows.forEach(r => r.items.forEach(it => {
        if (it.puddle && it.puddle.d >= d0 && it.puddle.d < d1) out.push({ x: it.x, d: it.puddle.d, w: it.puddle.w });
      }));
      return out;
    }

    const deer = makeDeer(tex);
    root.add(deer.root);

    // ---- rain: still falling where you parked ------------------------------------------
    const RAIN = 280;
    const rainPos = new Float32Array(RAIN * 6);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0x8a96a6, transparent: true, opacity: 0 });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.visible = false;
    root.add(rain);
    const drops = [];
    for (let i = 0; i < RAIN; i++) drops.push({ x: 0, y: Math.random() * 9, z: 0, fresh: true });
    // amount 0..1, around the point (x, d)
    function updateRain(dt, x, d, amount) {
      rainMat.opacity = 0.4 * amount;
      rain.visible = amount > 0.01;
      if (!rain.visible) return;
      for (let i = 0; i < RAIN; i++) {
        const p = drops[i];
        p.y -= 15 * dt;
        if (p.fresh || p.y < 0 || Math.abs(p.x - x) > 14 || Math.abs(-p.z - d) > 16) {
          if (!p.fresh) p.y = 8 + Math.random();
          p.fresh = false;
          p.x = x + (Math.random() * 2 - 1) * 14;
          p.z = -d + (Math.random() * 2 - 1.3) * 16;
        }
        rainPos.set([p.x, p.y, p.z, p.x + 0.03, p.y + 0.55, p.z], i * 6);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    return {
      root: root,
      reset: reset,
      update: update,
      centerAt: centerAt,
      slopeAt: slopeAt,
      puddlesBetween: puddlesBetween,
      updateRain: updateRain,
      deer: deer,
      difficulty: difficulty,
      LENGTH: LENGTH,
      HALF_ROAD: HALF_ROAD
    };
  }

  // ---- a deer: low-poly, stop-motion like everything alive here ---------------------
  // Faces +z, standing on y = 0. Its eyes shine in your headlights.
  function makeDeer(tex) {
    const hide = new THREE.MeshLambertMaterial({ map: tex.deer });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c140e });
    const pale = new THREE.MeshLambertMaterial({ color: 0x8a8070 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8f0b0, fog: false });
    function box(w, h, d, m, x, y, z, parent, rx, rz) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx || 0, 0, rz || 0);
      parent.add(mesh);
      return mesh;
    }
    const root = new THREE.Group();
    root.visible = false;
    const body = new THREE.Group();
    body.position.y = 1.0;
    root.add(body);
    box(0.36, 0.42, 1.05, hide, 0, 0, 0, body);
    box(0.07, 0.13, 0.05, pale, 0, 0.12, -0.54, body); // tail
    const neck = new THREE.Group();
    neck.position.set(0, 0.12, 0.42);
    neck.rotation.x = 0.45;
    body.add(neck);
    box(0.15, 0.55, 0.18, hide, 0, 0.27, 0, neck);
    const head = new THREE.Group();
    head.position.set(0, 0.55, 0.02);
    neck.add(head);
    box(0.15, 0.17, 0.3, hide, 0, 0.02, 0.1, head, -0.45);
    box(0.09, 0.09, 0.08, dark, 0, -0.06, 0.25, head, -0.45);
    box(0.04, 0.14, 0.07, hide, 0.09, 0.14, -0.02, head, 0, -0.7);
    box(0.04, 0.14, 0.07, hide, -0.09, 0.14, -0.02, head, 0, 0.7);
    // antlers
    [-1, 1].forEach(sd => {
      box(0.025, 0.32, 0.025, pale, sd * 0.08, 0.27, -0.04, head, -0.3, sd * -0.35);
      box(0.02, 0.15, 0.02, pale, sd * 0.14, 0.33, 0.04, head, 0.5, sd * -0.2);
      box(0.02, 0.13, 0.02, pale, sd * 0.17, 0.42, -0.08, head, -0.6, sd * -0.5);
    });
    const eyes = [-1, 1].map(sd => box(0.035, 0.03, 0.035, eyeMat, sd * 0.075, 0.06, 0.12, head));
    const legs = [[0.12, 0.42], [-0.12, 0.42], [0.12, -0.42], [-0.12, -0.42]].map(p => {
      const hip = new THREE.Group();
      hip.position.set(p[0], -0.15, p[1]);
      body.add(hip);
      box(0.08, 0.45, 0.1, hide, 0, -0.22, 0, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      box(0.045, 0.5, 0.05, dark, 0, -0.25, 0, knee);
      return { hip: hip, knee: knee, front: p[1] > 0 };
    });

    let acc = 1, t = 0, mode = 'stand';
    function pose() {
      if (mode === 'leap') {
        // bounding: front legs reach, back legs push, the body arcs
        const p = t * 9;
        legs.forEach(l => {
          const s = Math.sin(p + (l.front ? 0 : Math.PI));
          l.hip.rotation.x = (l.front ? 0.5 : -0.4) + s * 0.75;
          l.knee.rotation.x = l.front ? -Math.max(0, s) * 1.2 : Math.max(0, -s) * 1.0;
        });
        body.rotation.x = Math.sin(p) * 0.18;
        body.position.y = 1.0 + Math.abs(Math.sin(p * 0.5)) * 0.45;
        neck.rotation.x = 0.7;
      } else if (mode === 'stand') {
        legs.forEach(l => { l.hip.rotation.x = 0; l.knee.rotation.x = 0; });
        body.rotation.x = 0;
        body.position.y = 1.0;
        neck.rotation.x = 0.3 + (Math.random() < 0.15 ? 0.08 : 0);
      } else {
        // limp, tumbling through the air
        legs.forEach(l => { l.hip.rotation.x = (Math.random() - 0.5) * 1.6; l.knee.rotation.x = Math.random() * 1.2; });
        neck.rotation.x = 1.2 + Math.random() * 0.5;
      }
    }
    return {
      root: root,
      // 'stand' (frozen in your headlights), 'leap', or 'hit'
      setMode: function (m) { if (m !== mode) { mode = m; acc = 1; } },
      // look this way (radians, 0 = straight ahead)
      look: function (a) { head.rotation.y = a; },
      update: function (dt) {
        t += dt;
        acc += dt;
        if (acc >= 1 / 12) { acc = 0; pose(); }
      },
      eyes: eyes
    };
  }

  window.Highway = { create: create, LENGTH: LENGTH };
})();
