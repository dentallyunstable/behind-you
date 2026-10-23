// The endless forest: low-poly models, tree placement and collision.
// Trees are drawn with instancing (one draw call per tree type) to stay fast on phones.
(function () {
  'use strict';

  const ROW_STEP = 2;         // a new row of trees every 2 meters
  const VIEW_AHEAD = 48;      // generate this far in front of the player
  const KEEP_BEHIND = 22;     // forget rows this far behind
  const DRAW_AHEAD = 38;      // past this it's all fog (only far glows show through, from 34 m at most)
  const DRAW_BEHIND = 8;      // looking ahead, nothing further back can reach into view (big crowns are 4 m wide)
  const PLAY_HALF_WIDTH = 11.5; // the player can move between -11.5 and +11.5
  const START_CLEAR = 30;     // no obstacles for the first meters
  const TREE_SIZE = 1.7;      // all trees are scaled up by this much
  const LOG_HALF = 4;         // the log model is 8 m long
  const LOG_RADIUS = 0.3;
  const LOG_CLEAR = 0.3;      // you have to be this high in the air to get over a log

  // The camp you start at, behind the start line. Distances are along the run (d), so it's at z = -d.
  const CAMP = {
    fireD: -2.2,
    // where it can stand watching you, between the trees past the fire
    eyes: [{ x: -9.5, d: -5 }, { x: 8, d: -9 }]
  };

  // The end of the level: your truck by the highway. The road runs across the forest (along x).
  const FINISH = {
    length: 2000,         // the level is this long
    carD: 2001, carX: 1.5, doorX: 1.0,
    roadD0: 2003, roadD1: 2010.5,
    lampX: 7.5, lampD: 2001.6,
    approach: 1940,       // from here the trees open up towards the truck
    clearFrom: 1996, clearTo: 2013, // no trees: the shoulder, the road, the far side
    endlessFrom: 2014     // endless mode: the forest beyond the road
  };

  // The abandoned places. w/d: size of the footprint (local x/z), facing: turn it to face the path.
  const PLACES = {
    cabin: { w: 4.6, d: 3.9, facing: true },
    tent: { w: 2.4, d: 2.8, facing: true },
    car: { w: 2.0, d: 4.4, facing: false },
    fence: { w: 0.3, d: 7.0, facing: false }
  };
  const PLACE_NAMES = Object.keys(PLACES);

  const part = Geo.part, merge = Geo.merge, mat = Geo.mat;

  // ---- geometry -------------------------------------------------------

  // (the trunks are open tubes: the bottom is under the ground, the top inside the crown or facing
  // straight up far above your eyes, so their ends could never be seen)
  function pineGeometry(A) {
    const parts = [part(new THREE.CylinderGeometry(0.11, 0.25, 7, 6, 4, true), A.bark, mat(0, 3.5, 0))];
    const tiers = [[1.7, 2.6, 3.0], [1.35, 2.3, 4.3], [0.95, 2.0, 5.6], [0.55, 1.7, 6.8]];
    tiers.forEach((t, i) => {
      parts.push(part(new THREE.ConeGeometry(t[0], t[1], 7, 1), A.leaves, mat(0, t[2], 0, 0, i * 0.7, 0)));
    });
    return merge(parts);
  }

  function deadTreeGeometry(A) {
    const parts = [part(new THREE.CylinderGeometry(0.07, 0.22, 5, 5, 3, true), A.dead, mat(0, 2.5, 0))];
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

  // distance from point (px, pd) to the segment (ax, ad)-(bx, bd)
  function distToSegment(px, pd, ax, ad, bx, bd) {
    const vx = bx - ax, vd = bd - ad;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pd - ad) * vd) / (vx * vx + vd * vd)));
    return Math.hypot(px - (ax + vx * t), pd - (ad + vd * t));
  }

  // ---- the world --------------------------------------------------------

  function create(scene, tex) {
    const A = Textures.ATLAS, P = Textures.PROPS;
    const treeMat = new THREE.MeshLambertMaterial({ map: tex.atlas });
    const propsMat = new THREE.MeshLambertMaterial({ map: tex.props });
    const bushMat = new THREE.MeshLambertMaterial({ map: tex.bush, alphaTest: 0.5, side: THREE.DoubleSide });

    function inst(geo, material, max) {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.frustumCulled = false; // instances are spread out; culling by the base geometry would be wrong
      m.count = 0;
      scene.add(Geo.skipWhileHidden(Geo.still(m)));
      return m;
    }

    const kinds = {
      pine: { mesh: inst(pineGeometry(A), treeMat, 900), radius: 0.25 },
      dead: { mesh: inst(deadTreeGeometry(A), treeMat, 400), radius: 0.22 },
      rock: { mesh: inst(rockGeometry(A), treeMat, 200), radius: 0 },
      bush: { mesh: inst(bushGeometry(), bushMat, 500), radius: 0 },
      log: { mesh: inst(Props.log(A), treeMat, 8), radius: 0 },
      cabin: { mesh: inst(Props.cabin(P), propsMat, 3), radius: 0 },
      tent: { mesh: inst(Props.tent(P, true), propsMat, 3), radius: 0 },
      car: { mesh: inst(Props.car(P), propsMat, 3), radius: 0 },
      fence: { mesh: inst(Props.fence(P), propsMat, 3), radius: 0 }
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
    let lookingBack = true;  // (then the trees behind you are drawn too)
    let shown = true;        // (the whole forest is hidden while you drive the highway)
    // logs and abandoned places
    let nextLogD = 0, nextPlaceD = 0, lastPlace = '';
    let reserved = [];      // areas kept free for a place: {x0, x1, d0, d1, side}
    let pending = [];       // places waiting to be added to the row at their far end
    let mode = 'level';     // 'level': from the camp to the truck; 'endless': on from the truck, forever

    function reset(newMode, startD) {
      mode = newMode || 'level';
      startD = startD || 0;
      rows = [];
      nextRowD = Math.round((startD - KEEP_BEHIND) / ROW_STEP) * ROW_STEP;
      pathX = mode === 'endless' ? FINISH.doorX : 0;
      pathV = 0;
      dirty = true;
      nextLogD = (mode === 'endless' ? FINISH.endlessFrom + 50 : 110) + Math.random() * 40;
      nextPlaceD = (mode === 'endless' ? FINISH.endlessFrom + 90 : 170) + Math.random() * 60;
      lastPlace = '';
      reserved = [];
      pending = [];
    }

    function clamp01(v) { return Math.min(Math.max(v, 0), 1); }

    // 0 at the start, about 1 when the forest is as dense as it gets
    function difficulty(d) {
      if (mode === 'endless') {
        // beyond the road it starts out already fairly thick, and keeps getting worse
        const t = clamp01((d - FINISH.endlessFrom) / 2200);
        return 0.35 + 0.75 * t * (2 - t);
      }
      const t = clamp01((d - START_CLEAR) / 2600);
      // the last stretch before the road is much harder
      const k = clamp01((d - 1750) / 130);
      return t * (2 - t) + 0.35 * k * k * (3 - 2 * k);
    }

    function isReserved(x, d, r) {
      for (let i = 0; i < reserved.length; i++) {
        const z = reserved[i];
        if (x + r > z.x0 && x - r < z.x1 && d + r > z.d0 && d - r < z.d1) return true;
      }
      return false;
    }

    // Plan an abandoned place next to the path, starting just ahead of row d.
    function planPlace(d, gapHalf) {
      let name;
      do { name = PLACE_NAMES[Math.floor(Math.random() * PLACE_NAMES.length)]; } while (name === lastPlace);
      lastPlace = name;
      const def = PLACES[name];
      const side = pathX > 0 ? -1 : 1; // the side with more room
      let ry;
      if (def.facing) ry = -side * Math.PI / 2;          // its front looks at the path
      else ry = (Math.random() < 0.5 ? 0 : Math.PI) + (name === 'car' ? (Math.random() - 0.5) * 0.3 : 0);
      const turned = def.facing;
      const hw = (turned ? def.d : def.w) / 2, hd = (turned ? def.w : def.d) / 2;
      const inner = pathX + side * (gapHalf + 1.2);
      const x = inner + side * (hw + Math.random() * 1.5);
      const dc = d + 1 + hd;
      const zone = { x0: x - hw - 0.5, x1: x + hw + 0.5, d0: d + 0.5, d1: dc + hd + 0.5, side: side };
      reserved.push(zone);
      pending.push({
        atD: zone.d1,
        item: {
          kind: name, x: x, z: -dc, s: 1, ry: ry, rz: name === 'car' ? 0.06 : 0, r: 0,
          // collision box (an old car is a bit smaller than its footprint so you don't snag on air)
          box: { hw: hw - (name === 'fence' ? 0 : 0.1), hd: hd - 0.1 }
        }
      });
    }

    function genRow(d) {
      const items = [];
      const diff = difficulty(d);
      // the open path: never narrower than 2.4 m, and wide open on the way to the truck
      let gapHalf = Math.max(1.2, 3.6 - diff * 2.0);
      const approach = d >= FINISH.approach && d < FINISH.clearFrom;
      if (approach) gapHalf = Math.max(gapHalf, 2 + (d - FINISH.approach) * 0.08);

      // The guaranteed open path wanders smoothly left and right.
      pathV += (Math.random() - 0.5) * 0.35;
      pathV = Math.max(-0.45, Math.min(0.45, pathV));
      pathX += pathV;
      if (pathX > 8) { pathX = 8; pathV = -Math.abs(pathV); }
      if (pathX < -8) { pathX = -8; pathV = Math.abs(pathV); }
      // ...and steers clear of any abandoned place next to it
      reserved = reserved.filter(z => z.d1 > d - 4);
      reserved.forEach(z => {
        if (d < z.d0 - 4) return;
        if (z.side > 0 && pathX > z.x0 - gapHalf - 0.6) { pathX = z.x0 - gapHalf - 0.6; pathV = -Math.abs(pathV) * 0.5; }
        if (z.side < 0 && pathX < z.x1 + gapHalf + 0.6) { pathX = z.x1 + gapHalf + 0.6; pathV = Math.abs(pathV) * 0.5; }
      });
      // ...and leads to the truck's door at the end
      if (d >= FINISH.approach - 20 && d < FINISH.clearTo) {
        pathX += (FINISH.doorX - pathX) * 0.15;
        pathV *= 0.5;
      }

      function free(x, r) {
        return Math.abs(x - pathX) > gapHalf + r + 0.35;
      }

      function add(kind, x, scale) {
        if (kind === 'pine' || kind === 'dead') scale *= TREE_SIZE;
        const jitter = (Math.random() - 0.5) * 1.2;
        if (isReserved(x, d + jitter, kinds[kind].radius * scale + 0.3)) return;
        items.push({
          kind: kind,
          x: x,
          z: -(d + jitter),
          s: scale,
          ry: Math.random() * Math.PI * 2,
          rz: kind === 'dead' ? (Math.random() - 0.5) * 0.15 : 0,
          r: kinds[kind].radius * scale
        });
      }

      // Places planned earlier are added to the row at their far end (so they're forgotten last).
      pending = pending.filter(p => {
        if (p.atD > d) return true;
        items.push(p.item);
        return false;
      });

      // The roadside, the road and the far shoulder: nothing grows there.
      if (d >= FINISH.clearFrom && d < FINISH.clearTo) return { d: d, items: items };

      // Walls of trees at the edges, so the forest feels endless sideways.
      for (let side = -1; side <= 1; side += 2) {
        add('pine', side * (13 + Math.random() * 1.2), 0.9 + Math.random() * 0.5);
        if (Math.random() < 0.7) add(Math.random() < 0.8 ? 'pine' : 'dead', side * (15 + Math.random() * 4), 0.9 + Math.random() * 0.6);
      }

      // Behind the start line: the dark forest around the camp, with a clearing for the fire.
      // Nothing stands between you and the spots where it can watch you from.
      if (d < 0) {
        for (let x = -11.5; x <= 11.5; x += 2.3) {
          const tx = x + (Math.random() - 0.5) * 1.4;
          if (Math.hypot(tx, d - CAMP.fireD) < 7) continue;
          // (pine branches hang down to eye height, so they need a wider gap than a bare trunk)
          const gapToEyes = Math.min.apply(null, CAMP.eyes.map(e => distToSegment(tx, d, 0, 0, e.x, e.d)));
          if (gapToEyes < 1.6) continue;
          if (Math.random() < 0.55) {
            const kind = Math.random() < 0.8 && gapToEyes > 3.4 ? 'pine' : 'dead';
            add(kind, tx, 0.8 + Math.random() * 0.5);
          }
          else if (Math.random() < 0.4) add('bush', tx, 0.6 + Math.random() * 0.6);
        }
      }

      // A fallen tree across the path: jump over it.
      let logRow = null;
      const logsHere = mode === 'endless' ? d > FINISH.endlessFrom + 30 : d > 100 && d < FINISH.approach - 6;
      if (logsHere && d >= nextLogD && !isReserved(pathX, d, 6)) {
        const half = Math.max(gapHalf + 1, 3.2 + Math.random() * 1.6);
        const lx = pathX + (Math.random() - 0.5) * 1.2;
        logRow = { x0: lx - half - 0.8, x1: lx + half + 0.8 };
        items.push({
          kind: 'log', x: lx, z: -d, ld: d, s: 1, sx: half / LOG_HALF,
          ry: (Math.random() - 0.5) * 0.24 + (Math.random() < 0.5 ? Math.PI : 0), rz: 0, r: 0,
          log: { half: half }
        });
        // later on they come more often
        nextLogD = d + 90 - diff * 40 + Math.random() * 70;
        // the last stretch: one after another
        if (mode === 'level' && d > 1750) nextLogD = d + 26 + Math.random() * 26;
      }

      // Now and then: something somebody left behind.
      const placesHere = mode === 'endless' ? d > FINISH.endlessFrom + 60 : d > 170 && d < 1860;
      if (placesHere && d >= nextPlaceD && Math.abs(d - nextLogD) > 12) {
        planPlace(d, gapHalf);
        nextPlaceD = d + 170 + Math.random() * 150;
      }

      function nearLog(x, r) {
        return logRow && x + r > logRow.x0 && x - r < logRow.x1;
      }

      // Obstacles: few at the start, more the further you run.
      const obstaclesHere = mode === 'endless' ? d > FINISH.endlessFrom + 12 : d > START_CLEAR && !approach;
      if (obstaclesHere) {
        const expected = 0.35 + diff * 3.2;
        let count = Math.floor(expected + Math.random());
        let tries = 0;
        while (count > 0 && tries < 12) {
          tries++;
          const x = (Math.random() * 2 - 1) * PLAY_HALF_WIDTH;
          const kind = Math.random() < 0.75 ? 'pine' : 'dead';
          const s = 0.8 + Math.random() * 0.5;
          const r = kinds[kind].radius * s * TREE_SIZE;
          if (!free(x, r) || nearLog(x, r)) continue;
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
        if ((!free(x, 0.6) && Math.abs(x) < PLAY_HALF_WIDTH) || nearLog(x, 0.8)) continue;
        if (Math.random() < 0.55) add('bush', x, 0.6 + Math.random() * 0.7);
        else if (Math.random() < 0.4) add('rock', x, 0.5 + Math.random() * 0.9);
      }

      return { d: d, items: items };
    }

    const dummy = new THREE.Object3D();

    // Only what can be seen is drawn: nothing lost in the fog ahead, and nothing behind you unless you look.
    // (The rows always reach VIEW_AHEAD past you, to within a row, so you're about at nextRowD - VIEW_AHEAD.)
    function rebuild() {
      const youD = nextRowD - VIEW_AHEAD;
      const from = lookingBack ? -Infinity : youD - ROW_STEP - DRAW_BEHIND, to = youD + DRAW_AHEAD;
      const names = Object.keys(kinds);
      names.forEach(name => { kinds[name].mesh.count = 0; });
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].d < from || rows[r].d > to) continue;
        const items = rows[r].items;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const m = kinds[it.kind].mesh;
          if (m.count >= m.instanceMatrix.count) continue;
          // (its place is worked out once, then kept)
          if (!it.m) {
            dummy.position.set(it.x, 0, it.z);
            dummy.rotation.set(0, it.ry, it.rz);
            dummy.scale.set(it.sx || it.s, it.s, it.s);
            dummy.updateMatrix();
            it.m = dummy.matrix.toArray(new Float32Array(16));
          }
          m.instanceMatrix.array.set(it.m, m.count * 16);
          m.count++;
        }
      }
      names.forEach(name => {
        const m = kinds[name].mesh;
        // (only send the graphics card the part that's in use; with none of them around, don't draw it at all)
        m.instanceMatrix.updateRange.count = m.count * 16;
        m.instanceMatrix.needsUpdate = true;
        m.visible = shown && m.count > 0;
      });
    }

    // looking back (or anything but running ahead): draw the trees behind you as well
    function setLookingBack(v) {
      if (v === lookingBack) return;
      lookingBack = v;
      rebuild();
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

    // Push the player out of a box (x/z centre, half sizes). Returns true if they were inside it.
    function pushOutOfBox(p, radius, bx, bz, hw, hd) {
      const dx = p.x - bx, dz = -p.d - bz;
      const cx = Math.max(-hw, Math.min(hw, dx));
      const cz = Math.max(-hd, Math.min(hd, dz));
      const ex = dx - cx, ez = dz - cz;
      const dist = Math.hypot(ex, ez);
      if (dist >= radius) return false;
      if (dist > 0.0001) {
        p.x += ex / dist * (radius - dist);
        p.d -= ez / dist * (radius - dist);
      } else {
        // inside it: leave by the nearest side
        const ox = hw - Math.abs(dx), oz = hd - Math.abs(dz);
        if (ox < oz) p.x += Math.sign(dx || 1) * (ox + radius);
        else p.d -= Math.sign(dz || 1) * (oz + radius);
      }
      return true;
    }

    // Push the player out of anything solid they run into. Returns true on a hit.
    // p.y is how high the player is off the ground (jumping over logs).
    function collide(p, radius) {
      let hit = false;
      const pz = -p.d;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (Math.abs(row.d - p.d) > 9) continue;
        for (let i = 0; i < row.items.length; i++) {
          const it = row.items[i];
          const dx = p.x - it.x, dz = pz - it.z;
          if (it.r > 0) {
            // tree trunk
            const min = it.r + radius;
            const dist2 = dx * dx + dz * dz;
            if (dist2 < min * min) {
              const dist = Math.sqrt(dist2) || 0.001;
              const push = min - dist;
              p.x += (dx / dist) * push;
              p.d -= (dz / dist) * push;
              hit = true;
            }
          } else if (it.box) {
            // a building, a car, a fence
            if (pushOutOfBox(p, radius, it.x, it.z, it.box.hw, it.box.hd)) hit = true;
          } else if (it.log && p.y < LOG_CLEAR) {
            // a fallen tree: along = distance along the log, across = distance from it
            const c = Math.cos(it.ry), s = Math.sin(it.ry);
            const along = dx * c - dz * s;
            const across = dx * s + dz * c;
            const min = LOG_RADIUS + radius;
            if (Math.abs(along) < it.log.half && Math.abs(across) < min) {
              // which way is "in front of the log" for someone running towards -z
              const front = c > 0 ? 1 : -1;
              const out = Math.sign(across || front);
              const push = min - Math.abs(across);
              p.x += s * out * push;
              p.d -= c * out * push;
              // landing on its far side just slides you off; running into it trips you
              if (out === front) hit = true;
            }
          }
        }
      }
      // your truck
      if (Math.abs(p.d - FINISH.carD) < 4 && pushOutOfBox(p, radius, FINISH.carX, -FINISH.carD, 2.6, 1.0)) hit = true;
      return hit;
    }

    // how far ahead the next fallen log is (Infinity if none)
    function logAhead(d) {
      let best = Infinity;
      for (let r = 0; r < rows.length; r++) {
        const items = rows[r].items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].log && items[i].ld > d - 0.5) best = Math.min(best, items[i].ld - d);
        }
      }
      return best;
    }

    // for testing: the abandoned places that exist right now
    function places() {
      const out = [];
      rows.forEach(r => r.items.forEach(it => { if (it.box) out.push({ kind: it.kind, x: it.x, d: -it.z }); }));
      return out;
    }

    // hide the whole forest (on the highway it's somewhere far behind you)
    function setVisible(v) {
      shown = v;
      Object.keys(kinds).forEach(name => { kinds[name].mesh.visible = v && kinds[name].mesh.count > 0; });
      ground.visible = v;
    }

    return {
      places: places,
      setVisible: setVisible,
      setLookingBack: setLookingBack,
      reset: reset,
      update: update,
      collide: collide,
      logAhead: logAhead,
      difficulty: difficulty,
      halfWidth: PLAY_HALF_WIDTH
    };
  }

  window.World = {
    create: create, CAMP: CAMP, FINISH: FINISH,
    // the tree models, for the woods along the highway
    geometry: { pine: pineGeometry, dead: deadTreeGeometry, rock: rockGeometry, bush: bushGeometry },
    TREE_SIZE: TREE_SIZE
  };
})();
