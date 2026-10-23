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

  window.Geo = { part: part, merge: merge, mat: mat, prism: prism };
})();
