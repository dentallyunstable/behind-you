// The thing that follows you: a tall, thin, crude low-poly figure.
// It is animated in a deliberately wrong way: its pose only updates a few times a second
// (like stop-motion), with sudden head twitches.
(function () {
  'use strict';

  const FULL = [0, 0, 1, 1];

  function boxGeo(w, h, d, y) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, y, 0);
    return g;
  }
  function box(w, h, d, mat, y) {
    return Geo.still(new THREE.Mesh(boxGeo(w, h, d, y), mat));
  }

  function create(scene, tex) {
    const skin = new THREE.MeshLambertMaterial({ map: tex.monsterSkin });
    const faceMat = new THREE.MeshLambertMaterial({ map: tex.monsterFace });
    // the eyes ignore fog and light: far away in the dark, they're all you see
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2eed6, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = 1.35;
    root.add(hips);

    // legs: thigh + shin
    const legs = [-1, 1].map(side => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0, 0);
      hips.add(leg);
      leg.add(box(0.1, 0.75, 0.1, skin, -0.375));
      const knee = new THREE.Group();
      knee.position.y = -0.72;
      leg.add(knee);
      knee.add(box(0.07, 0.66, 0.07, skin, -0.33));
      return { leg: leg, knee: knee };
    });

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.12, 1.0, 5), skin);
    chest.position.y = 0.5;
    torso.add(Geo.still(chest));

    // arms: far too long, with long fingers
    const arms = [-1, 1].map(side => {
      const a = new THREE.Group();
      a.position.set(side * 0.25, 0.94, 0);
      torso.add(a);
      a.add(box(0.07, 0.7, 0.07, skin, -0.35));
      const elbow = new THREE.Group();
      elbow.position.y = -0.68;
      a.add(elbow);
      // the forearm and its long fingers are one piece
      const fore = [Geo.part(boxGeo(0.055, 0.65, 0.055, -0.32), FULL)];
      for (let f = -1; f <= 1; f++) fore.push(Geo.part(boxGeo(0.018, 0.24, 0.018, -0.12), FULL, Geo.mat(f * 0.025, -0.64, 0, 0, 0, f * 0.12)));
      elbow.add(Geo.still(new THREE.Mesh(Geo.merge(fore), skin)));
      return { a: a, elbow: elbow, side: side };
    });

    const neck = new THREE.Group();
    neck.position.y = 1.0;
    torso.add(neck);
    neck.add(box(0.06, 0.16, 0.06, skin, 0.08));
    const head = new THREE.Group();
    head.position.y = 0.14;
    neck.add(head);
    const headGeo = new THREE.BoxGeometry(0.26, 0.4, 0.28);
    headGeo.translate(0, 0.2, 0);
    // box sides: +x, -x, +y, -y, +z (the face), -z
    head.add(Geo.still(new THREE.Mesh(headGeo, [skin, skin, skin, skin, faceMat, skin])));
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.25, 0.155); // a little in front of the face, so far away it never covers them
    head.add(eyes);
    eyes.add(Geo.still(new THREE.Mesh(Geo.merge([-1, 1].map(side => Geo.part(new THREE.PlaneGeometry(0.035, 0.03), FULL, Geo.mat(side * 0.049, 0, 0)))), eyeMat)));

    root.visible = false;
    Geo.skipWhileHidden(root);
    scene.add(root);

    // ---- posing ------------------------------------------------------------
    let mode = 'run';
    let t = 0, acc = 0, twitch = 0;
    const tilt = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.3);

    function jit(a) { return (Math.random() - 0.5) * a; }

    function applyPose() {
      if (Math.random() < 0.1) twitch = jit(1.8); // sudden head snap
      twitch *= 0.6;
      hips.position.y = 1.35;

      if (mode === 'run') {
        const p = t * 8;
        legs.forEach((l, i) => {
          const s = Math.sin(p + i * Math.PI);
          l.leg.rotation.x = s * 0.85;
          l.knee.rotation.x = Math.max(0, Math.sin(p + i * Math.PI + 1)) * 1.1;
        });
        hips.position.y = 1.35 + Math.abs(Math.sin(p)) * 0.07;
        torso.rotation.x = 0.45 + jit(0.15);
        // one arm pumps, the other hangs forward, swinging loosely
        arms[0].a.rotation.set(-Math.sin(p) * 0.9 - 0.3, 0, arms[0].side * 0.25);
        arms[1].a.rotation.set(Math.sin(p * 1.3) * 0.4 - 0.7, 0, arms[1].side * 0.3);
        arms.forEach(a => { a.elbow.rotation.x = -0.4 + jit(0.3); });
        neck.rotation.x = -0.35 + jit(0.2);
        head.rotation.z = tilt * 0.4 + twitch;
      } else if (mode === 'still') {
        // standing perfectly still, head tilted, staring
        legs.forEach(l => { l.leg.rotation.x = 0; l.knee.rotation.x = 0.05; });
        torso.rotation.x = 0.08;
        arms.forEach(a => { a.a.rotation.set(0, 0, a.side * 0.06); a.elbow.rotation.x = 0; });
        neck.rotation.x = 0;
        head.rotation.z = tilt + twitch * 0.5;
      } else if (mode === 'reach') {
        // right behind you, both arms reaching out
        const p = t * 5;
        legs.forEach((l, i) => {
          l.leg.rotation.x = Math.sin(p + i * Math.PI) * 0.7;
          l.knee.rotation.x = 0.5;
        });
        torso.rotation.x = 0.55 + jit(0.1);
        arms.forEach(a => { a.a.rotation.set(-1.35 + jit(0.25), 0, a.side * 0.12); a.elbow.rotation.x = -0.1 + jit(0.2); });
        neck.rotation.x = -0.5;
        head.rotation.z = tilt * 0.5 + twitch;
      } else if (mode === 'crawl') {
        // on all fours down the road, galloping, the long arms as front legs
        const p = t * 11;
        hips.position.y = 0.9 + Math.abs(Math.sin(p)) * 0.14;
        torso.rotation.x = 1.25 + jit(0.12);
        legs.forEach((l, i) => {
          const s = Math.sin(p + i * 0.7);
          l.leg.rotation.x = -0.65 + s * 0.6;
          l.knee.rotation.x = 1.35 + Math.max(0, -s) * 0.5;
        });
        arms.forEach((a, i) => {
          const s = Math.sin(p + Math.PI + i * 0.6);
          a.a.rotation.set(-1.5 + s * 0.75, 0, a.side * 0.18);
          a.elbow.rotation.x = -0.25 + jit(0.25);
        });
        neck.rotation.x = -1.15 + jit(0.15);
        head.rotation.z = tilt * 0.5 + twitch;
      } else if (mode === 'lunge') {
        // bent down to your face, arms spread wide
        legs.forEach(l => { l.leg.rotation.x = -0.9; l.knee.rotation.x = 1.6; });
        torso.rotation.x = 1.0;
        arms.forEach(a => { a.a.rotation.set(-1.6 + jit(0.2), 0, a.side * 0.9); a.elbow.rotation.x = -0.5; });
        neck.rotation.x = -1.0 + jit(0.08);
        head.rotation.z = tilt * 0.3 + jit(0.15);
      }
    }

    return {
      root: root,
      setMode: function (m) {
        mode = m;
        acc = 1;
        twitch = 0;
      },
      // the same, but only if it's doing something else now (safe to call every frame)
      setModeOnce: function (m) {
        if (m !== mode) this.setMode(m);
      },
      // move to (x, z) and face the point (tx, tz). eyeBoost: make the eyes stand out even more
      place: function (x, y, z, tx, tz, eyeBoost) {
        root.position.set(x, y, z);
        root.rotation.y = Math.atan2(tx - x, tz - z);
        // far away the body is lost in the dark; keep the eyes big enough to still be seen
        const dist = Math.hypot(tx - x, tz - z);
        const s = Math.max(1, (dist - 8) / 2.5) * (eyeBoost || 1);
        eyes.scale.set(s, s, 1);
      },
      update: function (dt) {
        t += dt;
        acc += dt;
        // stop-motion: only a few new poses per second (faster when it lunges or gallops)
        if (acc >= (mode === 'lunge' ? 1 / 24 : mode === 'crawl' ? 1 / 12 : 1 / 9)) {
          acc = 0;
          applyPose();
        }
      }
    };
  }

  window.Monster = { create: create };
})();
