// The end of the forest: a dark highway under one orange streetlight, and your pickup truck
// parked on the shoulder. The truck has an inside (you sit in it at the end) and a driver's door that opens.
(function () {
  'use strict';

  const part = Geo.part, merge = Geo.merge, mat = Geo.mat;
  const FULL = [0, 0, 1, 1];

  function box(w, h, d, rect, m, sx, sy, sz) {
    return part(new THREE.BoxGeometry(w, h, d, sx || 1, sy || 1, sz || 1), rect, m);
  }

  function create(scene, tex) {
    const F = World.FINISH, P = Textures.PROPS;
    const root = new THREE.Group();
    scene.add(Geo.still(root));

    const paintMat = new THREE.MeshLambertMaterial({ map: tex.paint });
    const propsMat = new THREE.MeshLambertMaterial({ map: tex.props });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x5c5c5a });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x0c1218, transparent: true, opacity: 0.12, depthWrite: false });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x9a9480 });
    const tailMat = new THREE.MeshLambertMaterial({ color: 0x5a0808 });

    // ---- the highway -----------------------------------------------------------
    const roadW = F.roadD1 - F.roadD0;
    tex.road.repeat.set(10, 1);
    const roadGeo = new THREE.PlaneGeometry(80, roadW, 40, 4); // subdivided for per-vertex lighting
    roadGeo.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ map: tex.road }));
    road.position.set(0, 0.02, -(F.roadD0 + F.roadD1) / 2);
    root.add(Geo.still(road));

    // guardrail on the far side, broken where you'll cross it
    const rail = [];
    const railZ = -(F.roadD1 + 0.6);
    for (let x = -30; x <= 30; x += 2.5) {
      if (x > -7 && x < 3) continue;
      rail.push(box(0.12, 0.75, 0.12, FULL, mat(x, 0.37, railZ)));
    }
    rail.push(box(23.2, 0.22, 0.06, FULL, mat(-18.5, 0.62, railZ + 0.07)));
    rail.push(box(26.2, 0.22, 0.06, FULL, mat(16.6, 0.62, railZ + 0.07)));
    rail.push(box(2.6, 0.22, 0.06, FULL, mat(-7.6, 0.4, railZ + 0.3, 0.5, 0.5, -0.4))); // bent end
    root.add(Geo.still(new THREE.Mesh(merge(rail), metalMat)));

    // ---- the streetlight ------------------------------------------------------
    const lampZ = -F.lampD;
    const lampParts = [
      part(new THREE.CylinderGeometry(0.07, 0.11, 7, 6), FULL, mat(F.lampX, 3.5, lampZ)),
      box(0.07, 0.07, 2.3, FULL, mat(F.lampX, 6.95, lampZ - 1.1)),
      box(0.36, 0.14, 0.6, FULL, mat(F.lampX, 6.9, lampZ - 2.3))
    ];
    root.add(Geo.still(new THREE.Mesh(merge(lampParts), metalMat)));
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.42), bulbMat);
    bulb.position.set(F.lampX, 6.82, lampZ - 2.3);
    root.add(Geo.still(bulb));
    const lampLight = new THREE.PointLight(0xff9a40, 1.5, 17, 1);
    lampLight.position.set(F.lampX, 6.3, lampZ - 2.3);
    root.add(Geo.still(lampLight));
    // its glow, seen far off between the trees
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xff9a40, fog: false, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.position.copy(bulb.position);
    root.add(glow);

    // ---- the pickup: front faces +z, the driver's side is +x (local) ------------
    const car = new THREE.Group();
    car.position.set(F.carX, 0, -F.carD);
    car.rotation.order = 'YXZ';    // turn first, then tip and roll on its springs (when you drive it)
    car.rotation.y = -Math.PI / 2; // parked facing -x, driver's door towards the forest
    root.add(car);

    // (the pieces of the truck never move on it, apart from the wheel and the door)
    const fixed = m => car.add(Geo.still(m));
    fixed(new THREE.Mesh(merge([
      box(2.0, 0.5, 5.2, FULL, mat(0, 0.6, 0), 2, 1, 5),
      box(0.07, 0.25, 1.62, FULL, mat(-0.97, 0.97, 0.43)),
      box(1.92, 0.08, 1.45, FULL, mat(0, 1.86, 0.35), 2, 1, 2),
      box(0.07, 0.78, 0.07, FULL, mat(0.94, 1.47, 1.22)),
      box(0.07, 0.78, 0.07, FULL, mat(-0.94, 1.47, 1.22)),
      box(0.07, 0.78, 0.1, FULL, mat(-0.94, 1.47, -0.36)),
      // the back of the cab, around the rear window
      box(1.92, 0.45, 0.07, FULL, mat(0, 1.075, -0.42)),
      box(1.92, 0.15, 0.07, FULL, mat(0, 1.775, -0.42)),
      box(0.31, 0.4, 0.07, FULL, mat(0.805, 1.5, -0.42)),
      box(0.31, 0.4, 0.07, FULL, mat(-0.805, 1.5, -0.42)),
      box(0.08, 0.42, 2.1, FULL, mat(0.96, 1.06, -1.5)),
      box(0.08, 0.42, 2.1, FULL, mat(-0.96, 1.06, -1.5)),
      box(1.92, 0.42, 0.08, FULL, mat(0, 1.06, -2.56))
    ]), paintMat));

    // the bonnet on its own, finely divided, so it can take dents
    const hoodMat = new THREE.MeshLambertMaterial({ map: tex.paint, vertexColors: true });
    const hoodGeo = new THREE.BoxGeometry(1.96, 0.25, 1.3, 10, 1, 7).toNonIndexed();
    hoodGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(hoodGeo.attributes.position.count * 3).fill(1), 3));
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(0, 0.97, 1.95);
    hood.userData.rest = hoodGeo.attributes.position.array.slice();
    fixed(hood);

    const dark = [
      box(1.4, 0.3, 0.05, P.soot, mat(0, 0.75, 2.61)),
      box(2.04, 0.14, 0.18, P.soot, mat(0, 0.42, 2.62)),
      box(2.04, 0.14, 0.18, P.soot, mat(0, 0.42, -2.62)),
      box(1.84, 0.06, 2.1, P.soot, mat(0, 0.86, -1.5)),         // bed floor
      box(1.86, 0.05, 1.6, P.soot, mat(0, 0.86, 0.45)),         // cab floor
      box(1.86, 0.28, 0.35, P.soot, mat(0, 1.12, 1.08)),        // dashboard
      box(1.86, 0.02, 1.4, P.canvas, mat(0, 1.81, 0.38)),       // the roof lining
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), P.soot, mat(0.42, 1.24, 0.99, 1.1, 0, 0)),
      // seat
      box(1.8, 0.16, 0.55, P.canvas, mat(0, 0.82, 0.05)),
      box(1.8, 0.62, 0.14, P.canvas, mat(0, 1.17, -0.3, 0.12, 0, 0))
    ];
    [[0.92, 1.7], [-0.92, 1.7], [0.92, -1.7], [-0.92, -1.7]].forEach(w => {
      const g = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
      g.rotateZ(Math.PI / 2);
      dark.push(part(g, P.soot, mat(w[0], 0.42, w[1])));
    });
    fixed(new THREE.Mesh(merge(dark), propsMat));

    // the steering wheel: it turns (spin) when you steer
    const wheel = new THREE.Group();
    wheel.position.set(0.42, 1.3, 0.86);
    wheel.rotation.x = -0.45;
    fixed(wheel);
    const wheelSpin = new THREE.Group();
    wheel.add(wheelSpin);
    const spokes = [part(new THREE.TorusGeometry(0.17, 0.022, 4, 10), P.soot)];
    [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6].forEach(a => {
      spokes.push(box(0.025, 0.16, 0.015, P.soot, mat(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0, 0, 0, a - Math.PI / 2)));
    });
    spokes.push(part(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6), P.soot, mat(0, 0, 0, Math.PI / 2, 0, 0)));
    wheelSpin.add(Geo.still(new THREE.Mesh(merge(spokes), propsMat)));

    fixed(new THREE.Mesh(merge([
      box(0.3, 0.18, 0.05, FULL, mat(0.7, 0.85, 2.61)),
      box(0.3, 0.18, 0.05, FULL, mat(-0.7, 0.85, 2.61))
    ]), headMat));
    fixed(new THREE.Mesh(merge([
      box(0.08, 0.25, 0.12, FULL, mat(0.96, 1.05, -2.55)),
      box(0.08, 0.25, 0.12, FULL, mat(-0.96, 1.05, -2.55))
    ]), tailMat));
    fixed(new THREE.Mesh(merge([
      box(1.84, 0.74, 0.02, FULL, mat(0, 1.48, 1.25, -0.25, 0, 0)),
      box(0.02, 0.7, 1.55, FULL, mat(-0.96, 1.47, 0.45))
    ]), glassMat));

    // dashboard dials and the headlights: dark until the engine runs
    const dashMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    fixed(new THREE.Mesh(merge([
      box(0.12, 0.07, 0.01, FULL, mat(0.34, 1.2, 0.9)),
      box(0.12, 0.07, 0.01, FULL, mat(0.52, 1.2, 0.9)),
      box(0.3, 0.04, 0.01, FULL, mat(-0.1, 1.17, 0.9))
    ]), dashMat));
    const beams = new THREE.SpotLight(0xfff0d0, 0, 30, 0.45, 0.6, 1);
    beams.position.set(0, 0.9, 2.7);
    beams.target.position.set(0, 0, 14);
    car.add(beams, beams.target);
    // the dome light: on while the door is open
    const dome = new THREE.PointLight(0xffd9a0, 0, 3.2, 1);
    dome.position.set(0, 1.7, 0.4);
    fixed(dome);

    // the driver's door, hinged at its front edge; it swings out towards +x
    const door = new THREE.Group();
    door.position.set(0.98, 0, 1.22);
    car.add(door);
    door.add(Geo.still(new THREE.Mesh(merge([
      box(0.07, 0.6, 1.58, FULL, mat(0, 0.85, -0.79)),
      box(0.05, 0.05, 1.58, FULL, mat(0, 1.84, -0.79)),
      box(0.05, 0.7, 0.06, FULL, mat(0, 1.5, -1.55))
    ]), paintMat)));
    door.add(Geo.still(new THREE.Mesh(merge([
      box(0.02, 0.5, 1.5, P.canvas, mat(-0.045, 0.86, -0.79)),
      box(0.03, 0.04, 0.16, P.soot, mat(0.05, 1.05, -1.3))
    ]), propsMat)));
    door.add(Geo.still(new THREE.Mesh(box(0.02, 0.66, 1.5, FULL, mat(0, 1.5, -0.8)), glassMat)));

    // a point given in the truck's own coordinates, in the world
    function carPoint(x, y, z) {
      car.updateMatrixWorld();
      return new THREE.Vector3(x, y, z).applyMatrix4(car.matrixWorld);
    }

    let acc = 0, buzz = 0;
    // doorLight: the dome light follows the door (while you're driving, the drive decides when it's on)
    function update(dt, viewer, doorLight) {
      if (doorLight) dome.intensity = 0.9 * Math.min(1, Math.abs(door.rotation.y) / 0.5);
      // the old lamp buzzes and dips now and then
      acc += dt;
      if (acc > 1 / 12) {
        acc = 0;
        if (buzz > 0) buzz--;
        else if (Math.random() < 0.02) buzz = 2 + Math.floor(Math.random() * 4);
        const on = buzz > 0 ? (Math.random() < 0.5 ? 0.2 : 0.7) : 1;
        lampLight.intensity = 1.5 * on;
        bulbMat.color.setHex(on < 1 ? 0x7a5030 : 0xffb060);
        glow.userData.on = on;
      }
      const dist = Geo.placeGlow(glow, bulb.position, viewer, d => Math.max(3, d * 0.07));
      glow.material.opacity = Math.max(0, Math.min(0.45, 1.6 - dist / 160)) * (glow.userData.on || 1);
    }

    return {
      root: root,
      car: car,
      door: door,
      road: road,
      hood: hood,
      wheel: wheelSpin,
      beams: beams,
      dome: dome,
      headMat: headMat,
      tailMat: tailMat,
      dashMat: dashMat,
      paintMat: paintMat,
      propsMat: propsMat,
      carPoint: carPoint,
      update: update,
      DOOR_OPEN: -1.15,
      // 0..1: the dials glowing, and the headlights
      setPower: function (dash, lights) {
        dashMat.color.setRGB(0.9 * dash, 0.55 * dash, 0.15 * dash);
        beams.intensity = 2.2 * lights;
        headMat.emissive.setRGB(0.6 * lights, 0.57 * lights, 0.45 * lights);
      }
    };
  }

  window.Finish = { create: create };
})();
