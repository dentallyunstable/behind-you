// Level 2: The Highway. You drive your truck down an endless dark road while it chases you on all fours.
// Steer with the wheel (the joystick), hold BRAKE to slow down. The truck picks up speed again on its own.
(function () {
  'use strict';

  // ---- tuning ------------------------------------------------------------------
  const SEAT_EYE = [0.42, 1.58, 0.1];
  const CRUISE_MIN = 17, CRUISE_MAX = 26; // the truck's own speed in m/s (about 60 to 95 km/h)
  const ACCEL = 3.2;            // how quickly it picks up speed again (m/s per second)
  const STEER = 0.34;           // full lock: sideways speed = this x your speed
  const BRAKE_RAMP = 0.9;       // seconds of holding until the brakes bite their hardest
  const STALL_AFTER = 2.6;      // hold the brake longer than this and the engine chokes...
  const STALL_TIME = 2.2;       // ...stuttering along for this long before it picks up again
  const GRASS = 6.2;            // past the shoulder: rough ground (from the middle of the road)
  const WALL = 7.4;             // the edge of the woods
  const BRAKE_RING = 276.5;     // length of the ring around the brake button

  function create(ctx) {
    const finish = ctx.finish, cab = ctx.cab, hw = ctx.hw, body = ctx.body, camera = ctx.camera, ui = ctx.ui;
    const car = finish.car;
    const input = { x: 0, brake: false };
    const truck = {
      x: 0, d: 0, speed: 0, vx: 0, steer: 0, yaw: 0, drift: 0, driftSide: 1,
      held: 0, heat: 0, brake: 0, stall: 0, health: 1, wallCooldown: 0
    };
    let shake = 0, rumble = 0, pitch = 0, roll = 0;
    let engineAcc = 0;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function readInput() {
      const k = ctx.keys;
      let x = ctx.stick.x;
      if (k.ArrowLeft || k.KeyA) x -= 1;
      if (k.ArrowRight || k.KeyD) x += 1;
      if (Math.abs(x) < 0.08) x = 0;
      input.x = clamp(x, -1, 1);
      input.brake = ctx.sprintBtn.id !== null || !!(k.Space || k.ShiftLeft || k.ShiftRight || k.ArrowDown || k.KeyS);
    }

    // ---- placing the truck and you in it -------------------------------------------
    function placeTruck() {
      car.position.set(truck.x, 0, -truck.d);
      car.rotation.set(pitch, Math.PI - truck.yaw, roll);
    }

    // back to where it was parked, everything as new
    function reset() {
      truck.x = 0; truck.d = 0; truck.speed = 0; truck.vx = 0; truck.steer = 0; truck.yaw = 0;
      truck.drift = 0; truck.held = 0; truck.heat = 0; truck.brake = 0; truck.stall = 0;
      truck.health = 1; truck.wallCooldown = 0;
      shake = 0; rumble = 0; pitch = 0; roll = 0;
      hw.reset();
      hw.update(0);
      placeTruck();
      finish.wheel.rotation.z = 0;
      cab.update();
    }

    // ---- driving -------------------------------------------------------------------
    function drive(dt) {
      readInput();
      const diff = hw.difficulty(truck.d);
      const cruise = CRUISE_MIN + (CRUISE_MAX - CRUISE_MIN) * diff;
      const cx = hw.centerAt(truck.d);
      let off = truck.x - cx;
      const rough = Math.abs(off) > GRASS;

      // The brake: the longer you hold it, the harder it bites. Hold it too long and the engine chokes.
      if (input.brake && truck.stall <= 0) {
        if (truck.held === 0) truck.driftSide = Math.abs(truck.steer) > 0.15 ? Math.sign(truck.steer) : (Math.random() < 0.5 ? -1 : 1);
        truck.held += dt;
        truck.heat += dt;
        truck.brake = Math.min(1, 0.3 + 0.7 * truck.held / BRAKE_RAMP);
        if (truck.heat >= STALL_AFTER) stall();
      } else {
        truck.held = 0;
        truck.brake = 0;
        truck.heat = Math.max(0, truck.heat - dt * 1.3);
      }

      if (truck.stall > 0) {
        // choking: it crawls along, jerking and coughing, then catches again
        truck.stall -= dt;
        truck.speed += (2.5 - truck.speed) * Math.min(1, dt * 2.2);
        if (Math.random() < dt * 5) { truck.speed *= 0.82; shake = Math.max(shake, 0.18); }
        if (truck.stall <= 0) Sfx.engineCatch();
      } else if (truck.brake > 0) {
        truck.speed = Math.max(0, truck.speed - (5 + truck.brake * 13) * dt);
      } else {
        const want = rough ? cruise * 0.55 : cruise;
        truck.speed += clamp(want - truck.speed, -7 * dt, ACCEL * dt);
      }

      // Steering. Braking hard at speed makes the back step out a little.
      truck.steer += (input.x - truck.steer) * Math.min(1, dt * 6);
      const speedNorm = Math.min(1, truck.speed / 20);
      const driftWant = truck.brake * speedNorm * 0.2 * truck.driftSide;
      truck.drift += (driftWant - truck.drift) * Math.min(1, dt * (truck.brake > 0 ? 4 : 2.2));
      const targetVx = truck.steer * STEER * truck.speed + truck.drift * truck.speed * 0.18;
      truck.vx += (targetVx - truck.vx) * Math.min(1, dt * 5);
      truck.x += truck.vx * dt;
      truck.d += truck.speed * dt;
      truck.yaw = Math.atan2(truck.vx, Math.max(truck.speed, 1)) + truck.drift;

      // the edge of the road: rough ground, then the trees
      off = truck.x - hw.centerAt(truck.d);
      const wallR = truck.d < 31 ? 3.25 : WALL; // the guardrail where you got out of the forest
      truck.wallCooldown -= dt;
      if (off > wallR || off < -WALL) {
        const side = Math.sign(off);
        truck.x = hw.centerAt(truck.d) + side * (side > 0 ? wallR : WALL);
        truck.vx = -side * 2.5;
        if (truck.wallCooldown <= 0) {
          truck.wallCooldown = 0.7;
          truck.speed *= 0.7;
          shake = 0.5;
          roll = side * 0.04;
          Sfx.hit();
        }
      }
      rumble = Math.abs(off) > GRASS ? Math.min(1, truck.speed / 12) : 0;

      hw.update(truck.d);

      // how the truck sits on its springs: nose down when braking, rolling over bumps
      pitch += ((truck.brake > 0 ? 0.025 * truck.brake : -0.006 * (truck.speed < cruise ? 1 : 0)) - pitch) * Math.min(1, dt * 5);
      roll += ((-truck.steer * speedNorm * 0.02) - roll) * Math.min(1, dt * 4);
      placeTruck();

      // sounds: the engine, the road, the tyres
      engineAcc -= dt;
      if (engineAcc <= 0) {
        engineAcc = 0.05;
        const rpm = truck.stall > 0 ? 0.15 : 0.25 + 0.75 * truck.speed / CRUISE_MAX;
        Sfx.setEngine(rpm, truck.stall > 0 ? 0.6 : 0);
      }
      Sfx.setRoad(Math.min(1, truck.speed / CRUISE_MAX), rumble);
      Sfx.setScreech(truck.brake > 0.5 && truck.speed > 6 ? (truck.brake - 0.5) * 2 * speedNorm : 0);

      // HUD: how far, and how close the brakes are to choking the engine
      ui.distance.textContent = distance() + ' m';
      const heat = truck.stall > 0 ? 1 : truck.heat / STALL_AFTER;
      ui.sprintRing.style.strokeDashoffset = (BRAKE_RING * (1 - heat)).toFixed(1);
      ui.sprint.classList.toggle('low', heat > 0.6);
      ui.sprint.classList.toggle('tired', truck.stall > 0);
      ui.wheelArt.style.transform = 'rotate(' + (truck.steer * 110).toFixed(1) + 'deg)';
    }

    function stall() {
      truck.stall = STALL_TIME;
      truck.heat = 0;
      truck.held = 0;
      truck.brake = 0;
      shake = 0.4;
      Sfx.sputter();
    }

    // ---- the view from the seat ------------------------------------------------------
    function updateView(dt) {
      shake = Math.max(0, shake - dt);
      const tr = shake * 0.05 + rumble * 0.012 + (truck.stall > 0 ? 0.006 : 0) + truck.brake * truck.speed * 0.0004;
      body.position.set(
        SEAT_EYE[0] + (Math.random() - 0.5) * tr,
        SEAT_EYE[1] + (Math.random() - 0.5) * tr,
        SEAT_EYE[2]
      );
      // you lean with the road a little, and look down it
      body.rotation.set(-0.05 - truck.brake * 0.02, Math.PI - truck.steer * 0.06, -truck.steer * 0.015);
      camera.rotation.set(0, 0, 0);
      // the wheel turns with your steering (and catches the slide when the back steps out)
      finish.wheel.rotation.z = truck.steer * 1.7 - truck.drift * 2;
      cab.update();

      // the headlights and the dials
      const lights = truck.stall > 0 ? (Math.random() < 0.35 ? 0.3 : 0.85) : 1;
      finish.beams.intensity = 2.6 * lights;
      finish.headMat.emissive.setRGB(0.6 * lights, 0.57 * lights, 0.45 * lights);
      finish.dashMat.color.setRGB(0.9 * lights, 0.55 * lights, 0.15 * lights);
      cab.setGauges(truck.speed / 36, truck.stall > 0 ? 1 : 0.35 + 0.6 * truck.heat / STALL_AFTER, lights);
    }

    function distance() {
      return Math.max(0, Math.floor(truck.d));
    }

    // ---- states ---------------------------------------------------------------------
    // straight into driving (for now: no scene before it)
    function startPlay() {
      reset();
      ctx.setState('play');
      truck.speed = 0;
      Sfx.engineStart(0);
      Sfx.setAmbience(0);
    }

    function update(dt) {
      const state = ctx.state();
      if (state === 'play') drive(dt);
      updateView(dt);
    }

    // leaving the level: silence the road
    function stop() {
      Sfx.setRoad(0, 0);
      Sfx.setScreech(0);
    }

    // the headlights reach much further than a flashlight
    function setupLights() {
      finish.beams.distance = 48;
      finish.beams.angle = 0.5;
      finish.beams.penumbra = 0.5;
      finish.beams.position.set(0, 0.9, 2.7);
      finish.beams.target.position.set(0, -1.2, 22);
    }

    return {
      reset: reset,
      startPlay: startPlay,
      update: update,
      stop: stop,
      setupLights: setupLights,
      distance: distance,
      truck: truck,
      input: input
    };
  }

  window.Drive = { create: create };
})();
