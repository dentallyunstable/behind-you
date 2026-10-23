// The inside of the truck while you drive (Level 2): your hands on the wheel, the rear-view mirror,
// the wipers, cracks in the windscreen, dents in the bonnet, the tail lights and the hazards.
// Everything is in the truck's own coordinates (front +z, the driver's side +x).
(function () {
  'use strict';

  function create(finish, tex) {
    const car = finish.car;
    const root = new THREE.Group();
    root.visible = false;
    car.add(root);

    // ---- your hands on the wheel ---------------------------------------------------
    const skin = new THREE.MeshBasicMaterial({ map: tex.hand, color: 0x4e4239 });
    const sleeve = new THREE.MeshBasicMaterial({ color: 0x151a23 });
    const hands = [];
    const onWheel = new THREE.Group();
    onWheel.visible = false;
    finish.wheel.add(onWheel);
    // 10 and 2 o'clock (seen from the seat, +x is on your left)
    [{ a: 0.5, elbow: [0.66, 1.0, 0.3] }, { a: Math.PI - 0.5, elbow: [0.18, 1.0, 0.3] }].forEach(h => {
      const grip = new THREE.Group();
      grip.position.set(Math.cos(h.a) * 0.17, Math.sin(h.a) * 0.17, 0);
      grip.rotation.z = h.a;
      onWheel.add(grip);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.07), skin);
      fist.position.set(0.012, 0, -0.012);
      grip.add(fist);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.022), skin);
      thumb.position.set(-0.02, 0.0, 0.03);
      grip.add(thumb);
      // the forearm runs from the wrist back to the elbow (below the view)
      const armGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
      armGeo.translate(0, 0, 0.5);
      const arm = new THREE.Mesh(armGeo, sleeve);
      root.add(arm);
      hands.push({ grip: grip, arm: arm, elbow: new THREE.Vector3(h.elbow[0], h.elbow[1], h.elbow[2]) });
    });
    const tmp = new THREE.Vector3();

    // ---- the gauges behind the wheel: speed, and the engine's temperature ----------
    const gc = document.createElement('canvas');
    gc.width = 64;
    gc.height = 22;
    const g = gc.getContext('2d');
    g.fillStyle = '#080503';
    g.fillRect(0, 0, 64, 22);
    g.strokeStyle = '#d88a38';
    g.fillStyle = '#d88a38';
    [16, 48].forEach((x, n) => {
      g.beginPath();
      g.arc(x, 11, 9, Math.PI * 0.75, Math.PI * 2.25);
      g.stroke();
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * 0.75 + i / 8 * Math.PI * 1.5;
        g.fillRect(Math.round(x + Math.cos(a) * 6.5), Math.round(11 + Math.sin(a) * 6.5), 1, 1);
      }
      // the red end of the temperature gauge
      if (n === 1) { g.strokeStyle = '#c02010'; g.beginPath(); g.arc(x, 11, 9, Math.PI * 1.95, Math.PI * 2.25); g.stroke(); }
    });
    const gaugeTex = new THREE.CanvasTexture(gc);
    gaugeTex.minFilter = gaugeTex.magFilter = THREE.LinearFilter;
    gaugeTex.generateMipmaps = false;
    const gaugeMat = new THREE.MeshBasicMaterial({ map: gaugeTex });
    const gauges = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.11), gaugeMat);
    gauges.position.set(0.43, 1.2, 0.893);
    gauges.rotation.y = Math.PI; // facing you
    root.add(gauges);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
    const needleGeo = new THREE.BoxGeometry(0.005, 0.036, 0.002);
    needleGeo.translate(0, 0.016, 0.001);
    const needles = [-0.085, 0.085].map(x => {
      const n = new THREE.Mesh(needleGeo, needleMat);
      n.position.set(x, 0, 0.002);
      gauges.add(n);
      return n;
    });

    // ---- lights: tail lights (they light up whatever is behind you) and the hazards ---
    const tail = new THREE.PointLight(0xff2a14, 0, 15, 1.1);
    tail.position.set(0, 1.0, -3.3);
    car.add(tail);
    const hazardLight = new THREE.PointLight(0xff9030, 0, 7, 1.5);
    hazardLight.position.set(0, 1.1, 3.0);
    car.add(hazardLight);
    const hazardMat = new THREE.MeshLambertMaterial({ color: 0x2a1a08 });
    const hz = [];
    [[0.9, 0.62, 2.62], [-0.9, 0.62, 2.62]].forEach(p => {
      const g = new THREE.BoxGeometry(0.16, 0.08, 0.04);
      g.translate(p[0], p[1], p[2]);
      hz.push(g);
    });
    hz.forEach(g => root.add(new THREE.Mesh(g, hazardMat)));


    // ---- the rear-view mirror: a tiny camera looking back through the rear window ----
    const EYE = new THREE.Vector3(0.42, 1.58, 0.1);
    const mirrorRT = new THREE.WebGLRenderTarget(240, 75, { magFilter: THREE.NearestFilter, minFilter: THREE.LinearFilter });
    const mirrorGeo = new THREE.PlaneGeometry(0.3, 0.094);
    const muv = mirrorGeo.attributes.uv;
    for (let i = 0; i < muv.count; i++) muv.setX(i, 1 - muv.getX(i)); // a mirror shows things the other way round
    const mirror = new THREE.Mesh(mirrorGeo, new THREE.MeshBasicMaterial({ map: mirrorRT.texture, fog: false }));
    const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.03), finish.propsMat);
    const mirrorRoot = new THREE.Group();
    mirrorRoot.position.set(0.3, 1.72, 1.07); // a little towards you, so it's in view on a phone
    root.add(mirrorRoot);
    mirrorRoot.add(mirror, mirrorFrame);
    mirror.position.z = 0.016;
    car.updateMatrixWorld();
    mirrorRoot.lookAt(car.localToWorld(EYE.clone())); // angled at your eyes
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), finish.propsMat);
    stalk.position.set(0.3, 1.8, 1.09);
    root.add(stalk);
    // (it sits further back than the mirror, so the rear window fills it)
    const mirrorCam = new THREE.PerspectiveCamera(20, 0.3 / 0.094, 0.1, 50);
    mirrorCam.position.set(0.06, 1.64, 0.28);
    mirrorCam.rotation.set(-0.06, 0, 0); // looking back (the truck's -z), a little down
    car.add(mirrorCam);
    let mirrorTick = 0;
    function renderMirror(renderer, scene) {
      // like the monster, the mirror only updates every other frame: choppy, old-school
      mirrorTick = (mirrorTick + 1) % 2;
      if (mirrorTick) return;
      mirrorRoot.visible = false;
      renderer.setRenderTarget(mirrorRT);
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(null);
      mirrorRoot.visible = true;
    }

    // ---- cracks in the windscreen ---------------------------------------------------
    const cc = document.createElement('canvas');
    cc.width = 256;
    cc.height = 104;
    const cx = cc.getContext('2d');
    const crackTex = new THREE.CanvasTexture(cc);
    crackTex.magFilter = THREE.NearestFilter;
    crackTex.minFilter = THREE.LinearFilter;
    crackTex.generateMipmaps = false;
    const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const cracks = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 0.74), crackMat);
    cracks.position.set(0, 1.48, 1.236);
    cracks.rotation.x = -0.25;
    root.add(cracks);
    // a jagged line from (x, y), splitting now and then
    function crackLine(x, y, a, len, w) {
      for (let i = 0; i < len; i++) {
        cx.fillRect(Math.round(x), Math.round(y), w, 1);
        a += (Math.random() - 0.5) * 0.7;
        x += Math.cos(a);
        y += Math.sin(a) * 0.8;
        if (Math.random() < 0.06 && len > 6) crackLine(x, y, a + (Math.random() < 0.5 ? 0.9 : -0.9), len * 0.4, 1);
      }
    }
    // a new crack somewhere on the glass (power 0..1: how big)
    function crack(power) {
      // keep the middle of your view mostly clear
      const x = Math.random() < 0.5 ? 16 + Math.random() * 80 : 160 + Math.random() * 80;
      const y = 10 + Math.random() * 84;
      cx.fillStyle = 'rgba(160,172,184,0.45)';
      const n = 4 + Math.floor(power * 3);
      for (let i = 0; i < n; i++) crackLine(x, y, i / n * Math.PI * 2 + Math.random() * 0.5, 5 + power * 18 * Math.random(), 1);
      // the pale spot where it hit
      cx.fillStyle = 'rgba(190,198,206,0.5)';
      cx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      crackTex.needsUpdate = true;
    }

    // ---- water on the windscreen, and the wipers -------------------------------------
    // The glass, in its own flat frame: x across (+x your side), y up the glass, z out of it.
    const GLASS_W = 1.84, GLASS_H = 0.74;
    const glass = new THREE.Group();
    glass.position.set(0, 1.48, 1.25);
    glass.rotation.x = -0.25;
    root.add(glass);
    const wc = document.createElement('canvas');
    wc.width = 128;
    wc.height = 52;
    const wx = wc.getContext('2d');
    const waterTex = new THREE.CanvasTexture(wc);
    waterTex.minFilter = waterTex.magFilter = THREE.LinearFilter;
    waterTex.generateMipmaps = false;
    const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(GLASS_W, GLASS_H), waterMat);
    water.position.z = -0.016;
    glass.add(water);
    // canvas pixel of a point on the glass (the canvas is seen from inside, so +x is on the canvas' right)
    function toCanvas(x, y) {
      return [(x / GLASS_W + 0.5) * wc.width, (0.5 - y / GLASS_H) * wc.height];
    }
    // drops and smears; amount 0..1
    function splash(amount) {
      // a grey film of dirty water...
      if (amount > 0.5) {
        wx.fillStyle = 'rgba(70,76,82,' + (0.55 * amount).toFixed(2) + ')';
        wx.fillRect(0, 0, wc.width, wc.height);
      }
      // ...drops, and water running down the glass
      const n = Math.floor(amount * 420);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * wc.width, y = Math.random() * wc.height;
        const v = 90 + Math.random() * 50 | 0;
        wx.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + (v + 12) + ',' + (0.3 + Math.random() * 0.3).toFixed(2) + ')';
        wx.fillRect(x | 0, y | 0, Math.random() < 0.3 ? 2 : 1, 1);
        if (Math.random() < 0.12) wx.fillRect(x | 0, y | 0, 1, (3 + Math.random() * 8) | 0);
      }
      wetness = Math.min(1, wetness + amount);
      waterTex.needsUpdate = true;
    }
    let wetness = 0; // how much of the glass is covered (it drives the blur)

    // two wipers, parked along the bottom of the glass, pointing to the passenger side
    const wiperMat = new THREE.MeshBasicMaterial({ color: 0x101010 });
    const wiperGeo = new THREE.BoxGeometry(1, 0.03, 0.016);
    wiperGeo.translate(0.5, 0, 0);
    const PARK = Math.PI, SWEEP = 1.95;
    const wipers = [{ x: 0.66, len: 0.66 }, { x: -0.14, len: 0.6 }].map(w => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, -GLASS_H / 2 + 0.035, 0.03);
      pivot.rotation.z = PARK;
      glass.add(pivot);
      const arm = new THREE.Mesh(wiperGeo, wiperMat);
      arm.scale.x = w.len;
      pivot.add(arm);
      return { pivot: pivot, x: w.x, len: w.len, a: PARK };
    });
    let wipeT = -1, wipeSweeps = 0;
    // start the wipers: n sweeps across and back (each takes a second)
    function wipe(n) {
      if (wipeT >= 0) { wipeSweeps = Math.max(wipeSweeps, n); return; }
      wipeT = 0;
      wipeSweeps = n;
    }
    function updateWipers(dt) {
      if (wipeT < 0) return;
      const t0 = wipeT;
      wipeT += dt;
      const k = Math.min(wipeT, wipeSweeps);
      const phase = k % 1;
      const a = PARK - SWEEP * Math.sin(Math.PI * phase); // up and back down
      if (Math.floor(t0 * 2) !== Math.floor(wipeT * 2)) Sfx.wiper();
      wipers.forEach(w => {
        // clear the glass wherever the blade passes
        const from = w.a, to = a;
        w.a = a;
        w.pivot.rotation.z = a;
        const c = toCanvas(w.x, -GLASS_H / 2 + 0.035);
        const R = w.len / GLASS_W * wc.width;
        wx.save();
        wx.globalCompositeOperation = 'destination-out';
        wx.fillStyle = '#000';
        wx.beginPath();
        wx.moveTo(c[0], c[1]);
        // (the canvas' y runs down, so angles flip)
        wx.arc(c[0], c[1], R, -Math.max(from, to) - 0.05, -Math.min(from, to) + 0.05);
        wx.closePath();
        wx.fill();
        wx.restore();
      });
      waterTex.needsUpdate = true;
      // each sweep takes about half of it away
      wetness = Math.max(0, wetness - dt * 0.5);
      if (wipeT >= wipeSweeps) {
        wipeT = -1;
        wipers.forEach(w => { w.a = PARK; w.pivot.rotation.z = PARK; });
        wx.clearRect(0, 0, wc.width, wc.height);
        waterTex.needsUpdate = true;
        wetness = 0;
      }
    }

    // Where the windscreen is on the screen (for blurring what's behind wet glass): a CSS polygon, or null.
    // Only the part above the dashboard, so the wheel and your hands stay sharp.
    const corner = new THREE.Vector3();
    const CORNERS = [[-0.92, 1.84, 1.16], [0.92, 1.84, 1.16], [0.92, 1.4, 1.27], [-0.92, 1.4, 1.27]];
    function glassOnScreen(camera, w, h) {
      car.updateMatrixWorld();
      camera.updateMatrixWorld();
      const pts = [];
      for (let i = 0; i < 4; i++) {
        corner.set(CORNERS[i][0], CORNERS[i][1], CORNERS[i][2]).applyMatrix4(car.matrixWorld).project(camera);
        if (corner.z > 1) return null;
        pts.push(((corner.x + 1) / 2 * w).toFixed(0) + 'px ' + ((1 - corner.y) / 2 * h).toFixed(0) + 'px');
      }
      return 'polygon(' + pts.join(',') + ')';
    }

    // ---- dents in the bonnet ------------------------------------------------------
    const hood = finish.hood;
    const hpos = hood.geometry.attributes.position, hcol = hood.geometry.attributes.color;
    const rest = hood.userData.rest;
    function dent(power) {
      const px = (Math.random() * 2 - 1) * 0.75, pz = 0.6 - Math.random() * 0.9;
      const r = 0.22 + power * 0.25, depth = 0.05 + power * 0.07;
      for (let i = 0; i < hpos.count; i++) {
        const x = hpos.getX(i), y = hpos.getY(i), z = hpos.getZ(i);
        if (y < 0.05) continue;
        const d = Math.hypot(x - px, z - pz) / r;
        if (d >= 1) continue;
        const k = 1 - d * d;
        hpos.setY(i, y - depth * k);
        // scraped, darker paint
        const c = 1 - 0.45 * k;
        hcol.setXYZ(i, hcol.getX(i) * c, hcol.getY(i) * c, hcol.getZ(i) * c);
      }
      // the front edge crumples a little
      for (let i = 0; i < hpos.count; i++) {
        const x = hpos.getX(i), z = hpos.getZ(i);
        if (z > 0.55 && Math.abs(x - px) < 0.5) hpos.setZ(i, z - power * 0.05 * (1 - Math.abs(x - px) / 0.5));
      }
      hpos.needsUpdate = true;
      hcol.needsUpdate = true;
      hood.geometry.computeVertexNormals();
    }

    // ---- smoke (then steam) from under the bonnet when the engine is hurt -----------
    const smokeMat = new THREE.SpriteMaterial({ map: tex.glow, color: 0x6a6a66, transparent: true, depthWrite: false, opacity: 0.35 });
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(smokeMat);
      sp.visible = false;
      sp.userData = { life: 0 };
      root.add(sp);
      puffs.push(sp);
    }
    let smoke = 0, smokeAcc = 0;

    // fixing it all (a new run)
    function repair() {
      cx.clearRect(0, 0, cc.width, cc.height);
      wx.clearRect(0, 0, wc.width, wc.height);
      waterTex.needsUpdate = true;
      wetness = 0;
      wipeT = -1;
      wipers.forEach(w => { w.a = PARK; w.pivot.rotation.z = PARK; });
      crackTex.needsUpdate = true;
      hpos.array.set(rest);
      for (let i = 0; i < hcol.count; i++) hcol.setXYZ(i, 1, 1, 1);
      hpos.needsUpdate = true;
      hcol.needsUpdate = true;
      hood.geometry.computeVertexNormals();
      smoke = 0;
      puffs.forEach(p => { p.visible = false; p.userData.life = 0; });
    }

    // keep the forearms attached to the hands as the wheel turns; the smoke drifts back over the glass
    function update(dt) {
      car.updateMatrixWorld();
      hands.forEach(h => {
        h.grip.getWorldPosition(tmp);
        car.worldToLocal(tmp);
        h.arm.position.copy(tmp);
        h.arm.lookAt(car.localToWorld(h.elbow.clone()));
        h.arm.scale.z = tmp.distanceTo(h.elbow);
      });
      if (!dt) return;
      updateWipers(dt);
      smokeAcc += dt;
      if (smokeAcc < 1 / 12) return; // choppy, like everything else that moves
      const step = smokeAcc;
      smokeAcc = 0;
      puffs.forEach(p => {
        const u = p.userData;
        if (u.life > 0) {
          u.life -= step;
          p.position.y += step * 0.9;
          p.position.z -= step * 2.6;
          p.scale.multiplyScalar(1 + step * 1.6);
          p.visible = u.life > 0 && p.position.z > 0.9;
        } else if (Math.random() < smoke * step * 5) {
          u.life = 0.5 + Math.random() * 0.5;
          p.position.set((Math.random() - 0.5) * 1.2, 1.15, 2.2 + Math.random() * 0.4);
          p.scale.setScalar(0.25 + Math.random() * 0.2);
          p.visible = true;
        }
      });
    }

    return {
      root: root,
      update: update,
      setVisible: function (v) {
        root.visible = v;
        onWheel.visible = v;
      },
      tail: tail,
      renderMirror: renderMirror,
      splash: splash,
      wipe: wipe,
      wiping: () => wipeT >= 0,
      wetness: () => wetness,
      glassOnScreen: glassOnScreen,
      crack: crack,
      dent: dent,
      repair: repair,
      // 0: none, 1: thick smoke pouring out
      setSmoke: function (v) {
        smoke = v;
        smokeMat.color.setScalar(0.42 - v * 0.2);
        smokeMat.opacity = 0.25 + v * 0.25;
      },
      // speed and temperature 0..1, glow: how bright the dials are (they flicker with the lights)
      setGauges: function (speed, temp, glow) {
        needles[0].rotation.z = 2.36 - Math.min(1, speed) * 4.71;
        needles[1].rotation.z = 2.36 - Math.min(1, temp) * 4.71;
        gaugeMat.color.setScalar(0.25 + 0.75 * glow);
        needleMat.color.setRGB(glow, 0.35 * glow, 0.1 * glow);
      },
      // the hazard lights: on (1) or off (0)
      setHazard: function (on) {
        hazardLight.intensity = on ? 1.1 : 0;
        hazardMat.emissive.setRGB(on ? 0.9 : 0, on ? 0.45 : 0, on ? 0.08 : 0);
      }
    };
  }

  window.Cab = { create: create };
})();
