// Low-poly models for the things you pass in the forest: fallen logs and abandoned places.
// Each model is built once into a single geometry. They stand on y = 0 and their front faces +z.
(function () {
  'use strict';

  const part = Geo.part, merge = Geo.merge, mat = Geo.mat;

  function box(w, h, d, rect, m, sx, sy, sz) {
    return part(new THREE.BoxGeometry(w, h, d, sx || 1, sy || 1, sz || 1), rect, m);
  }

  // A fallen tree lying along x, 8 m long (stretched to other lengths per instance).
  // Uses the tree atlas.
  function log(A) {
    const body = new THREE.CylinderGeometry(0.26, 0.3, 8, 7, 6);
    body.rotateZ(Math.PI / 2);
    const parts = [part(body, A.bark, mat(0, 0.27, 0))];
    // torn-up roots at one end, a broken-off top at the other
    const roots = new THREE.CylinderGeometry(0.3, 0.62, 0.5, 7, 1);
    roots.rotateZ(Math.PI / 2);
    parts.push(part(roots, A.dead, mat(4.2, 0.33, 0)));
    const top = new THREE.ConeGeometry(0.26, 0.6, 7, 1);
    top.rotateZ(Math.PI / 2);
    parts.push(part(top, A.dead, mat(-4.3, 0.27, 0)));
    // stubs of broken branches
    [[-2.6, 0.5, 0.5], [-0.8, -0.6, 0.9], [1.1, 0.4, -0.7], [2.7, -0.3, 0.4]].forEach(b => {
      const g = new THREE.CylinderGeometry(0.03, 0.07, 0.7, 4, 1);
      g.translate(0, 0.35, 0);
      parts.push(part(g, A.dead, mat(b[0], 0.4, 0, b[1], 0, b[2])));
    });
    return merge(parts);
  }

  // Cabin: 4.2 wide (x), 3.6 deep (z), a dark open doorway and a boarded-up window.
  function cabin(P) {
    const parts = [
      box(4.2, 2.4, 3.6, P.planks, mat(0, 1.2, 0), 4, 3, 4),
      // roof
      box(4.7, 0.12, 2.35, P.planks, mat(0, 2.98, 1.02, 0.49, 0, 0), 3, 1, 2),
      box(4.7, 0.12, 2.35, P.planks, mat(0, 2.98, -1.02, -0.49, 0, 0), 3, 1, 2),
      part(Geo.prism(3.6, 1.1, 4.2), P.planks, mat(0, 2.4, 0, 0, Math.PI / 2, 0)),
      // the doorway, and the door hanging open
      box(0.9, 1.8, 0.05, P.soot, mat(0.6, 0.9, 1.81)),
      box(0.9, 1.8, 0.06, P.planks, mat(0.15, 0.9, 1.83, 0, -1.1, 0).multiply(mat(0.45, 0, 0))),
      // window with boards nailed across it
      box(0.9, 0.7, 0.05, P.soot, mat(-1.1, 1.45, 1.81)),
      box(1.15, 0.12, 0.06, P.planks, mat(-1.1, 1.3, 1.85, 0, 0, 0.25)),
      box(1.15, 0.12, 0.06, P.planks, mat(-1.1, 1.62, 1.85, 0, 0, -0.18)),
      // side window, black
      box(0.05, 0.6, 0.8, P.soot, mat(2.11, 1.45, -0.4)),
      // step
      box(1.4, 0.2, 0.6, P.planks, mat(0.6, 0.1, 2.1))
    ];
    return merge(parts);
  }

  // A broken fence, 7 m long, running along z.
  function fence(P) {
    const parts = [];
    [[-3.3, 0, 0], [-1.6, 0.12, 0], [0.1, 0, -0.1], [3.3, -0.25, 0.15]].forEach(p => {
      parts.push(box(0.12, 1.15, 0.12, P.planks, mat(0, 0.5, p[0], p[1], 0, p[2])));
    });
    // a post snapped off, lying in the grass
    parts.push(box(0.12, 0.9, 0.12, P.planks, mat(0.35, 0.07, 1.7, Math.PI / 2, 0.4, 0)));
    // rails: the top one sags, the bottom one is broken and hangs down
    parts.push(box(0.05, 0.1, 6.8, P.planks, mat(0, 0.85, 0, 0.03, 0, 0)));
    parts.push(box(0.05, 0.1, 3.5, P.planks, mat(0, 0.42, -1.6)));
    parts.push(box(0.05, 0.1, 1.6, P.planks, mat(0.03, 0.2, 0.8, -0.45, 0, 0)));
    return merge(parts);
  }

  // A rusted car, 4.2 long (z), with dark windows and a door left open.
  function car(P) {
    const parts = [
      box(1.8, 0.6, 4.2, P.rust, mat(0, 0.62, 0), 2, 1, 4),
      box(1.6, 0.55, 2.0, P.soot, mat(0, 1.19, -0.2)),
      box(1.66, 0.06, 2.0, P.rust, mat(0, 1.49, -0.2)),
      // pillars between the windows
      box(0.08, 0.55, 0.08, P.rust, mat(0.79, 1.19, 0.78)),
      box(0.08, 0.55, 0.08, P.rust, mat(-0.79, 1.19, 0.78)),
      // dead headlights and bumpers
      box(0.32, 0.16, 0.04, P.canvas, mat(0.6, 0.7, 2.11)),
      box(0.32, 0.16, 0.04, P.canvas, mat(-0.6, 0.7, 2.11)),
      box(1.84, 0.14, 0.14, P.soot, mat(0, 0.4, 2.12)),
      box(1.84, 0.14, 0.14, P.soot, mat(0, 0.4, -2.12)),
      // the driver's door, hanging open
      box(0.06, 0.65, 1.0, P.rust, mat(0.92, 0.95, 0.8, 0, -0.9, 0).multiply(mat(0, 0, -0.5)))
    ];
    [[0.85, 1.35], [-0.85, 1.35], [0.85, -1.35], [-0.85, -1.35]].forEach((w, i) => {
      const g = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 7);
      g.rotateZ(Math.PI / 2);
      parts.push(part(g, P.soot, mat(w[0], i === 0 ? 0.24 : 0.33, w[1])));
    });
    return merge(parts);
  }

  // A small A-frame tent with a dark opening at the front.
  // withPit: also a cold, burnt-out fire pit in front of it.
  function tent(P, withPit) {
    const parts = [
      part(Geo.prism(2.2, 1.4, 2.6), P.canvas, mat(0, 0, 0)),
      part(Geo.prism(1.0, 1.0, 0.04), P.soot, mat(0, 0, 1.31)),
      // a torn flap hanging off the front
      box(0.5, 0.9, 0.03, P.canvas, mat(0.62, 0.48, 1.36, 0, -0.3, 0.45))
    ];
    if (withPit) {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        parts.push(box(0.22, 0.14, 0.18, P.soot, mat(Math.cos(a) * 0.55, 0.07, 2.6 + Math.sin(a) * 0.55, 0, a, 0)));
      }
      [0.3, 1.4, 2.5].forEach(a => {
        parts.push(box(0.75, 0.09, 0.09, P.soot, mat(0, 0.06, 2.6, 0, a, 0.06)));
      });
    }
    return merge(parts);
  }

  window.Props = { log: log, cabin: cabin, fence: fence, car: car, tent: tent };
})();
