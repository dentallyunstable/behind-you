// The camp where every run starts: a small fire, a tent, an empty seat across the fire.
// Once you've run away, the fire stays behind as a small orange glow in the dark.
(function () {
  'use strict';

  const part = Geo.part, merge = Geo.merge, mat = Geo.mat;

  function create(scene, tex) {
    const A = Textures.ATLAS, P = Textures.PROPS;
    const fireZ = -World.CAMP.fireD;
    const root = new THREE.Group();
    scene.add(root);

    // ring of stones, firewood, the tent, a log to sit on
    const treeMat = new THREE.MeshLambertMaterial({ map: tex.atlas });
    const ring = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      ring.push(part(new THREE.IcosahedronGeometry(0.16, 0), A.rock, mat(Math.cos(a) * 0.62, 0.06, fireZ + Math.sin(a) * 0.62, a, a * 2, 0, 1.2, 0.7, 1)));
    }
    [0.2, 1.3, 2.4].forEach(a => {
      const g = new THREE.CylinderGeometry(0.06, 0.07, 0.95, 5);
      g.rotateZ(Math.PI / 2);
      ring.push(part(g, A.bark, mat(0, 0.12, fireZ, 0, a, 0.25)));
    });
    // the seat across the fire. Nobody is sitting on it.
    const seat = new THREE.CylinderGeometry(0.2, 0.22, 1.8, 6, 3);
    seat.rotateZ(Math.PI / 2);
    ring.push(part(seat, A.bark, mat(0.4, 0.2, fireZ + 2.0, 0, 0.35, 0)));
    // a few split logs stacked by the tent
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5);
      g.rotateX(Math.PI / 2);
      ring.push(part(g, A.bark, mat(1.9 + (i % 2) * 0.2 + (i > 1 ? 0.1 : 0), 0.09 + (i > 1 ? 0.16 : 0), fireZ + 1.2 + (i % 2) * 0.19, 0, 0.2, 0)));
    }
    root.add(new THREE.Mesh(merge(ring), treeMat));

    const tent = new THREE.Mesh(Props.tent(P, false), new THREE.MeshLambertMaterial({ map: tex.props }));
    tent.position.set(-2.7, 0, fireZ + 2.3);
    tent.rotation.y = 2.3; // its opening looks at the fire
    root.add(tent);

    // the flames: a few crude cones, re-shaped a few times a second
    const flames = new THREE.Group();
    flames.position.set(0, 0.1, fireZ);
    root.add(flames);
    const flameParts = [
      { color: 0xd8461a, r: 0.32, h: 0.75, x: 0, z: 0 },
      { color: 0xf07a22, r: 0.22, h: 0.65, x: 0.12, z: 0.06 },
      { color: 0xf07a22, r: 0.2, h: 0.55, x: -0.12, z: -0.05 },
      { color: 0xffc85a, r: 0.13, h: 0.45, x: 0.02, z: 0.02 }
    ].map(f => {
      const g = new THREE.ConeGeometry(f.r, f.h, 5, 1);
      g.translate(0, f.h / 2, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: f.color }));
      m.position.set(f.x, 0, f.z);
      m.userData = f;
      flames.add(m);
      return m;
    });

    // embers drifting up
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff9a40 });
    const emberGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    const embers = [];
    for (let i = 0; i < 10; i++) {
      const e = new THREE.Mesh(emberGeo, emberMat);
      e.userData = { life: Math.random() * 2, vx: 0, vz: 0, vy: 0 };
      root.add(e);
      embers.push(e);
    }

    // firelight
    const light = new THREE.PointLight(0xff8a3a, 1.6, 12, 1);
    light.position.set(0, 0.7, fireZ);
    root.add(light);

    // the glow you still see from far away, after you've run
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.glow, color: 0xff7a30, fog: false, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const glowAt = new THREE.Vector3(0, 0.5, fireZ);
    glow.position.copy(glowAt);
    root.add(glow);

    let acc = 1, t = 0;

    // viewer: where the camera is (to keep the glow a visible size far away)
    function update(dt, viewer) {
      t += dt;
      acc += dt;
      // like the monster, the fire only updates 12 times a second: choppy and old-school
      if (acc > 1 / 12) {
        acc = 0;
        flameParts.forEach(m => {
          const f = m.userData;
          m.scale.set(0.8 + Math.random() * 0.4, 0.7 + Math.random() * 0.6, 0.8 + Math.random() * 0.4);
          m.rotation.y = Math.random() * Math.PI;
          m.rotation.z = (Math.random() - 0.5) * 0.25;
          m.position.x = f.x + (Math.random() - 0.5) * 0.05;
        });
        light.intensity = 1.35 + Math.random() * 0.5 + Math.sin(t * 1.3) * 0.15;
      }
      embers.forEach(e => {
        const u = e.userData;
        u.life -= dt;
        if (u.life <= 0) {
          u.life = 1 + Math.random() * 1.6;
          e.position.set((Math.random() - 0.5) * 0.4, 0.4, fireZ + (Math.random() - 0.5) * 0.4);
          u.vx = (Math.random() - 0.5) * 0.3;
          u.vz = (Math.random() - 0.5) * 0.3;
          u.vy = 0.6 + Math.random() * 0.7;
        }
        u.vx += (Math.random() - 0.5) * dt * 2;
        e.position.x += u.vx * dt;
        e.position.y += u.vy * dt;
        e.position.z += u.vz * dt;
        e.visible = u.life > 0.15 || Math.random() < 0.5;
      });

      const dist = Geo.placeGlow(glow, glowAt, viewer, d => Math.max(1.6, d * 0.06));
      glow.material.opacity = Math.max(0, Math.min(0.35, 1.15 - dist / 100)) * (0.85 + Math.random() * 0.15);
    }

    // how loud the fire is from here (0..1)
    function loudness(viewer) {
      return Math.max(0, 1 - viewer.distanceTo(light.position) / 16);
    }

    return { root: root, update: update, loudness: loudness, fireZ: fireZ };
  }

  window.Camp = { create: create };
})();
