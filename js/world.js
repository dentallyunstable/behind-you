// The endless forest: low-poly models, tree placement and collision.
// Trees are drawn with instancing (one draw call per tree type) to stay fast on phones.
(function () {
  'use strict';

  const ROW_STEP = 2;         // a new row of trees every 2 meters
  const VIEW_AHEAD = 48;      // generate this far in front of the player
  const KEEP_BEHIND = 22;     // forget rows this far behind
  const PLAY_HALF_WIDTH = 11.5; // the player can move between -11.5 and +11.5
  const START_CLEAR = 30;     // no obstacles for the first meters
  const TREE_SIZE = 1.7;      // all trees are scaled up by this much

  // ---- geometry helpers -------------------------------------------------

  // Bake a primitive into a part: transform it and squeeze its UVs into an atlas rect.
  function part(geo, rect, m) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
    }
    return g;
  }

  function merge(parts) {
    let n = 0;
    parts.forEach(p => { n += p.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    parts.forEach(p => {
      pos.set(p.attributes.position.array, o * 3);
      nor.set(p.attributes.normal.array, o * 3);
      uv.set(p.attributes.uv.array, o * 2);
      o += p.attributes.position.count;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  function mat(tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(tx, ty, tz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx || 1, sy || 1, sz || 1)
    );
    return m;
  }

  function pineGeometry(A) {
    const parts = [part(new THREE.CylinderGeometry(0.11, 0.25, 7, 6, 4), A.bark, mat(0, 3.5, 0))];
    const tiers = [[1.7, 2.6, 3.0], [1.35, 2.3, 4.3], [0.95, 2.0, 5.6], [0.55, 1.7, 6.8]];
    tiers.forEach((t, i) => {
      parts.push(part(new THREE.ConeGeometry(t[0], t[1], 7, 1), A.leaves, mat(0, t[2], 0, 0, i * 0.7, 0)));
    });
    return merge(parts);
  }

  function deadTreeGeometry(A) {
    const parts = [part(new THREE.CylinderGeometry(0.07, 0.22, 5, 5, 3), A.dead, mat(0, 2.5, 0))];
    const branches = [
      [2.3, 0.0, 0.9, 1.6], [2.9, 2.1, 1.0, 1.4], [3.5, 4.0, 0.8, 1.3],
      [3.9, 1.0, 1.1, 1.0], [4.3, 3.2, 0.7, 0.9], [2.6, 5.2, 1.2, 1.2]
    ];
    branches.forEach(b => {
      const len = b[3];
      const g = new THREE.CylinderGeometry(0.025, 0.06, len, 4, 1);
      g.translate(0, len / 2, 0);
      parts.push(part(g, A.dead, mat(0, b[0], 0, 0, b[1], b[2])));
    });
    return merge(parts);
  }

  function rockGeometry(A) {
    return merge([part(new THREE.IcosahedronGeometry(0.5, 0), A.rock, mat(0, 0.12, 0, 0, 0, 0, 1, 0.6, 1.2))]);
  }

  function bushGeometry() {
    const a = new THREE.PlaneGeometry(1.6, 1.1);
    a.translate(0, 0.5, 0);
    const b = a.clone();
    b.rotateY(Math.PI / 2);
    const full = [0, 0, 1, 1];
    return merge([part(a, full), part(b, full)]);
  }

  // ---- the world --------------------------------------------------------

  function create(scene, tex) {
    const A = Textures.ATLAS;
    const treeMat = new THREE.MeshLambertMaterial({ map: tex.atlas });
    const bushMat = new THREE.MeshLambertMaterial({ map: tex.bush, alphaTest: 0.5, side: THREE.DoubleSide });

    function inst(geo, material, max) {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.frustumCulled = false; // instances are spread out; culling by the base geometry would be wrong
      m.count = 0;
      scene.add(m);
      return m;
    }

    const kinds = {
      pine: { mesh: inst(pineGeometry(A), treeMat, 700), radius: 0.25 },
      dead: { mesh: inst(deadTreeGeometry(A), treeMat, 300), radius: 0.22 },
      rock: { mesh: inst(rockGeometry(A), treeMat, 200), radius: 0 },
      bush: { mesh: inst(bushGeometry(), bushMat, 400), radius: 0 }
    };

    // Ground: one subdivided plane that follows the player (snapped to the texture tile so it looks fixed).
    // Subdivided because lighting is calculated per vertex (old-school Gouraud shading).
    tex.ground.repeat.set(15, 20);
    const groundGeo = new THREE.PlaneGeometry(60, 80, 40, 56);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: tex.ground }));
    scene.add(ground);

    let rows = [];
    let nextRowD = 0;
    let pathX = 0, pathV = 0;
    let dirty = true;

    function reset() {
      rows = [];
      nextRowD = -KEEP_BEHIND;
      pathX = 0;
      pathV = 0;
      dirty = true;
    }

    // 0 at the start, 1 when the forest is as dense as it gets
    function difficulty(d) {
      const t = Math.min(Math.max((d - START_CLEAR) / 2200, 0), 1);
      return t * (2 - t);
    }

    function genRow(d) {
      const items = [];
      const diff = difficulty(d);

      // The guaranteed open path wanders smoothly left and right.
      pathV += (Math.random() - 0.5) * 0.35;
      pathV = Math.max(-0.45, Math.min(0.45, pathV));
      pathX += pathV;
      if (pathX > 8) { pathX = 8; pathV = -Math.abs(pathV); }
      if (pathX < -8) { pathX = -8; pathV = Math.abs(pathV); }
      const gapHalf = 3.6 - diff * 2.0; // never narrower than 3.2m total

      function free(x, r) {
        return Math.abs(x - pathX) > gapHalf + r + 0.35;
      }

      function add(kind, x, scale) {
        if (kind === 'pine' || kind === 'dead') scale *= TREE_SIZE;
        items.push({
          kind: kind,
          x: x,
          z: -(d + (Math.random() - 0.5) * 1.2),
          s: scale,
          ry: Math.random() * Math.PI * 2,
          rz: kind === 'dead' ? (Math.random() - 0.5) * 0.15 : 0,
          r: kinds[kind].radius * scale
        });
      }

      // Walls of trees at the edges, so the forest feels endless sideways.
      for (let side = -1; side <= 1; side += 2) {
        add('pine', side * (13 + Math.random() * 1.2), 0.9 + Math.random() * 0.5);
        if (Math.random() < 0.7) add(Math.random() < 0.8 ? 'pine' : 'dead', side * (15 + Math.random() * 4), 0.9 + Math.random() * 0.6);
      }

      // Obstacles: few at the start, more the further you run.
      if (d > START_CLEAR) {
        const expected = 0.35 + diff * 3.2;
        let count = Math.floor(expected + Math.random());
        let tries = 0;
        while (count > 0 && tries < 12) {
          tries++;
          const x = (Math.random() * 2 - 1) * PLAY_HALF_WIDTH;
          const kind = Math.random() < 0.75 ? 'pine' : 'dead';
          const s = 0.8 + Math.random() * 0.5;
          const r = kinds[kind].radius * s * TREE_SIZE;
          if (!free(x, r)) continue;
          let clash = false;
          for (let i = 0; i < items.length; i++) {
            if (Math.abs(items[i].x - x) < 2.2) { clash = true; break; }
          }
          if (clash) continue;
          add(kind, x, s);
          count--;
        }
      }

      // Decoration: bushes and rocks (you run through them, so keep them off the safe path).
      for (let i = 0; i < 3; i++) {
        const x = (Math.random() * 2 - 1) * 14;
        if (!free(x, 0.6) && Math.abs(x) < PLAY_HALF_WIDTH) continue;
        if (Math.random() < 0.55) add('bush', x, 0.6 + Math.random() * 0.7);
        else if (Math.random() < 0.4) add('rock', x, 0.5 + Math.random() * 0.9);
      }

      return { d: d, items: items };
    }

    const dummy = new THREE.Object3D();

    function rebuild() {
      const counts = { pine: 0, dead: 0, rock: 0, bush: 0 };
      for (let r = 0; r < rows.length; r++) {
        const items = rows[r].items;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const k = kinds[it.kind];
          if (counts[it.kind] >= k.mesh.instanceMatrix.count) continue;
          dummy.position.set(it.x, 0, it.z);
          dummy.rotation.set(0, it.ry, it.rz);
          dummy.scale.set(it.s, it.s, it.s);
          dummy.updateMatrix();
          k.mesh.setMatrixAt(counts[it.kind]++, dummy.matrix);
        }
      }
      Object.keys(kinds).forEach(name => {
        const m = kinds[name].mesh;
        m.count = counts[name];
        m.instanceMatrix.needsUpdate = true;
      });
    }

    function update(playerD) {
      while (nextRowD < playerD + VIEW_AHEAD) {
        rows.push(genRow(nextRowD));
        nextRowD += ROW_STEP;
        dirty = true;
      }
      while (rows.length && rows[0].d < playerD - KEEP_BEHIND) {
        rows.shift();
        dirty = true;
      }
      if (dirty) {
        rebuild();
        dirty = false;
      }
      ground.position.z = -(Math.round(playerD / 4) * 4) - 25;
    }

    // Push the player out of any trunk they run into. Returns true on a hit.
    function collide(p, radius) {
      let hit = false;
      const pz = -p.d;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (Math.abs(row.d - p.d) > 3) continue;
        for (let i = 0; i < row.items.length; i++) {
          const it = row.items[i];
          if (it.r <= 0) continue;
          const dx = p.x - it.x, dz = pz - it.z;
          const min = it.r + radius;
          const dist2 = dx * dx + dz * dz;
          if (dist2 < min * min) {
            const dist = Math.sqrt(dist2) || 0.001;
            const push = min - dist;
            p.x += (dx / dist) * push;
            p.d -= (dz / dist) * push;
            hit = true;
          }
        }
      }
      return hit;
    }

    return {
      reset: reset,
      update: update,
      collide: collide,
      difficulty: difficulty,
      halfWidth: PLAY_HALF_WIDTH
    };
  }

  window.World = { create: create };
})();
