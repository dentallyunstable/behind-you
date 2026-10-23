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
    const kinds = {
      pine: inst(World.geometry.pine(A), treeMat, 900),
      dead: inst(World.geometry.dead(A), treeMat, 300),
      rock: inst(World.geometry.rock(A), treeMat, 120),
      post: inst(postGeo, new THREE.MeshLambertMaterial({ color: 0x8a8a84 }), 24),
      refl: inst(reflGeo, new THREE.MeshBasicMaterial({ color: 0x9a6a1c }), 24)
    };

    // ---- generation -------------------------------------------------------------
    let rows = [];
    let nextRowD = 0;
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
        dummy.scale.setScalar(it.s);
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

    return {
      root: root,
      reset: reset,
      update: update,
      centerAt: centerAt,
      slopeAt: slopeAt,
      difficulty: difficulty,
      LENGTH: LENGTH,
      HALF_ROAD: HALF_ROAD
    };
  }

  window.Highway = { create: create, LENGTH: LENGTH };
})();
