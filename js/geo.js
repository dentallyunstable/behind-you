// Small geometry helpers shared by the forest, the props and the camp.
// Every model is a few primitives baked together into one geometry, with its UVs squeezed
// into a rect of a texture atlas (so a whole model needs only one texture).
(function () {
  'use strict';

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

  // Triangles with no area (the tip of every cone has a ring of them) never show, but they'd still
  // cost on every frame, so they're left out.
  function flat(p, i) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    return cx * cx + cy * cy + cz * cz < 1e-20;
  }

  // Bake parts into one geometry. Corners that are exactly the same (same place, normal and texture
  // spot) are shared, so the graphics card works each one out once instead of once per triangle
  // touching it (about half the work for a tree). The triangles themselves stay exactly as they were.
  function merge(parts) {
    const pos = [], nor = [], uv = [], index = [];
    const seen = new Map();
    parts.forEach(p => {
      const pa = p.attributes.position.array, na = p.attributes.normal.array, ua = p.attributes.uv.array;
      for (let t = 0; t < p.attributes.position.count; t += 3) {
        if (flat(pa, t * 3)) continue;
        for (let v = t; v < t + 3; v++) {
          const key = pa[v * 3] + ',' + pa[v * 3 + 1] + ',' + pa[v * 3 + 2] + ',' + na[v * 3] + ',' + na[v * 3 + 1] + ',' + na[v * 3 + 2] + ',' + ua[v * 2] + ',' + ua[v * 2 + 1];
          let i = seen.get(key);
          if (i === undefined) {
            i = pos.length / 3;
            seen.set(key, i);
            pos.push(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]);
            nor.push(na[v * 3], na[v * 3 + 1], na[v * 3 + 2]);
            uv.push(ua[v * 2], ua[v * 2 + 1]);
          }
          index.push(i);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
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

  // A triangular prism (a tent, a roof gable): the triangle is w wide and h tall, standing on y = 0,
  // and runs len along z. Flat-shaded, with its own normals and UVs.
  function prism(w, h, len) {
    const x = w / 2, z = len / 2;
    const L = [-x, 0], R = [x, 0], T = [0, h];
    const pos = [], nor = [], uv = [];
    function tri(a, b, c, n, ua, ub, uc) {
      [a, b, c].forEach(p => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); });
      uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    }
    function quad(a, b, c, d, n) { // a b c d counter-clockwise seen from outside
      tri(a, b, c, n, [0, 0], [1, 0], [1, 1]);
      tri(a, c, d, n, [0, 0], [1, 1], [0, 1]);
    }
    const s = Math.hypot(x, h);
    // sloped sides
    quad([L[0], L[1], -z], [L[0], L[1], z], [T[0], T[1], z], [T[0], T[1], -z], [-h / s, x / s, 0]);
    quad([R[0], R[1], z], [R[0], R[1], -z], [T[0], T[1], -z], [T[0], T[1], z], [h / s, x / s, 0]);
    // the two triangle ends
    tri([L[0], L[1], z], [R[0], R[1], z], [T[0], T[1], z], [0, 0, 1], [0, 0], [1, 0], [0.5, 1]);
    tri([R[0], R[1], -z], [L[0], L[1], -z], [T[0], T[1], -z], [0, 0, -1], [0, 0], [1, 0], [0.5, 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }

  // A glow sprite for a light far away (size: how big it should look at a distance).
  // The camera can't see past 40 m, so a far glow is drawn closer, scaled to look the same.
  // Returns the real distance.
  const GLOW_MAX = 34;
  function placeGlow(sprite, at, viewer, size) {
    const dist = viewer.distanceTo(at) || 0.001;
    const shown = Math.min(dist, GLOW_MAX);
    sprite.position.copy(viewer).lerp(at, shown / dist);
    sprite.scale.setScalar(size(dist) * shown / dist);
    return dist;
  }

  // A piece that never moves on whatever holds it: its place is worked out once, not every frame.
  // (Only for things whose position, rotation and scale are never changed afterwards.)
  function still(obj) {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
    return obj;
  }

  // While it's hidden, don't work out where it (and everything on it) is every frame.
  // It's brought up to date in the first frame it shows again.
  function skipWhileHidden(obj) {
    const update = obj.updateMatrixWorld;
    obj.updateMatrixWorld = function (force) {
      if (this.visible) update.call(this, force);
    };
    return obj;
  }

  window.Geo = { part: part, merge: merge, mat: mat, prism: prism, placeGlow: placeGlow, still: still, skipWhileHidden: skipWhileHidden };
})();
