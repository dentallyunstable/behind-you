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
    const tail = new THREE.PointLight(0xff1a0c, 0, 10, 1.4);
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

    // keep the forearms attached to the hands as the wheel turns
    function update() {
      car.updateMatrixWorld();
      hands.forEach(h => {
        h.grip.getWorldPosition(tmp);
        car.worldToLocal(tmp);
        h.arm.position.copy(tmp);
        h.arm.lookAt(car.localToWorld(h.elbow.clone()));
        h.arm.scale.z = tmp.distanceTo(h.elbow);
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
