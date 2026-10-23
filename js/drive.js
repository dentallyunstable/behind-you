// Level 2: The Highway. You drive your truck down an endless dark road while it chases you on all fours.
// Steer with the wheel (the joystick), hold BRAKE to slow down. The truck picks up speed again on its own.
// The truck's health decides it: if the truck gives out, it gets you.
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
  const START_GAP = 16;         // meters between it and your tailgate when you set off
  const MAX_GAP = 30;
  const CHASER_PACE = 0.965;    // its speed, compared with the truck's own cruising speed
  const LUNGE_SPEED = 13;       // a sudden surge: it gains this much faster (m/s)
  const REAR = 2.7;             // from the middle of the truck to its back bumper
  // damage: the truck's health is 1 when it's in one piece
  const HIT_REAR = 0.1;         // it rams you because you braked too much
  const HIT_LUNGE = 0.07;       // it comes out of nowhere
  const HIT_SIDE = 0.08;        // it slams into a door
  const HIT_WALL = 0.06;        // you scrape into the trees
  const CRASH_LIMIT = 3, CRASH_WINDOW = 8; // this many crashes in this many seconds and it gets you

  function create(ctx) {
    const finish = ctx.finish, cab = ctx.cab, hw = ctx.hw, body = ctx.body, camera = ctx.camera, ui = ctx.ui;
    const chaser = ctx.chaser;
    const car = finish.car;
    const input = { x: 0, brake: false };
    const truck = {
      x: 0, d: 0, speed: 0, vx: 0, steer: 0, yaw: 0, drift: 0, driftSide: 1,
      held: 0, heat: 0, brake: 0, stall: 0, health: 1, wallCooldown: 0
    };
    let shake = 0, rumble = 0, pitch = 0, roll = 0, jolt = 0, blur = 0, shownBlur = -1;
    let engineAcc = 0, runTime = 0;
    // the thing behind you
    let gap = START_GAP, chaserX = 0, lungeTimer = 0, lunge = null;
    let crashes = [];
    // a glance out of a side window: -1 your side, 1 the other side
    let glanceT = -1, glanceSide = 0, glanceAmount = 0;
    // panic
    let closeNow = 0, beatPulse = 0, heartTimer = 0, flicker = 0;
    // the end: the truck gives out
    let caughtT = -1;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function smooth(a, b, t) {
      const k = clamp((t - a) / (b - a), 0, 1);
      return k * k * (3 - 2 * k);
    }

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
      shake = 0; rumble = 0; pitch = 0; roll = 0; jolt = 0; blur = 0;
      runTime = 0;
      gap = START_GAP; chaserX = 0; lunge = null; lungeTimer = 30 + Math.random() * 15;
      crashes = [];
      glanceT = -1; glanceAmount = 0;
      closeNow = 0; beatPulse = 0; heartTimer = 0; flicker = 0;
      caughtT = -1;
      chaser.root.visible = false;
      cab.repair();
      cab.setSmoke(0);
      hw.reset();
      hw.update(0);
      placeTruck();
      finish.wheel.rotation.z = 0;
      cab.update();
      showHealth();
      ui.staticCanvas.style.opacity = '0';
      ui.danger.style.opacity = '0';
      ui.tunnel.style.transform = 'scale(2.4)';
    }

    // ---- the truck's health ---------------------------------------------------------
    function showHealth() {
      const n = Math.ceil(truck.health * 10 - 0.001);
      const segs = ui.healthBar.children;
      for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('gone', i >= n);
      ui.healthBar.classList.toggle('low', truck.health < 0.35);
      ui.healthBar.classList.toggle('critical', truck.health > 0 && truck.health < 0.15);
      // a hurt engine smokes, and later pours out smoke
      cab.setSmoke(truck.health < 0.5 ? (0.5 - truck.health) * 2 : 0);
    }
    function damage(amount) {
      truck.health = Math.max(0, truck.health - amount);
      showHealth();
      if (truck.health <= 0) breakDown();
    }
    // running into something: damage, and too many in a row and it gets you
    function crash(amount) {
      crashes.push(runTime);
      crashes = crashes.filter(t => runTime - t < CRASH_WINDOW);
      damage(amount);
      if (ctx.state() === 'play' && crashes.length >= CRASH_LIMIT) breakDown();
    }

    // ---- driving -------------------------------------------------------------------
    function cruiseSpeed() {
      return CRUISE_MIN + (CRUISE_MAX - CRUISE_MIN) * hw.difficulty(truck.d);
    }

    function drive(dt) {
      readInput();
      runTime += dt;
      const cruise = cruiseSpeed();
      let off = truck.x - hw.centerAt(truck.d);
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

      steerAndMove(dt, input.x);

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
          Sfx.scrape();
          if (Math.random() < 0.6) cab.crack(0.3);
          if (Math.random() < 0.5) cab.dent(0.3);
          crash(HIT_WALL);
        }
      }
      rumble = Math.abs(off) > GRASS ? Math.min(1, truck.speed / 12) : 0;

      hw.update(truck.d);
      chase(dt, cruise);
      panic(dt);

      // sounds: the engine, the road, the tyres
      engineAcc -= dt;
      if (engineAcc <= 0) {
        engineAcc = 0.05;
        const rpm = truck.stall > 0 ? 0.15 : 0.25 + 0.75 * truck.speed / CRUISE_MAX;
        Sfx.setEngine(rpm, truck.stall > 0 ? 0.6 : truck.health < 0.25 ? 0.12 : 0);
      }
      const speedNorm = Math.min(1, truck.speed / 20);
      Sfx.setRoad(Math.min(1, truck.speed / CRUISE_MAX), rumble);
      Sfx.setScreech(truck.brake > 0.5 && truck.speed > 6 ? (truck.brake - 0.5) * 2 * speedNorm : 0);

      // HUD: how far, and how close the brakes are to choking the engine
      ui.distance.textContent = distance() + ' m';
      const heat = truck.stall > 0 ? 1 : truck.heat / STALL_AFTER;
      ui.sprintRing.style.strokeDashoffset = (BRAKE_RING * (1 - heat)).toFixed(1);
      ui.sprint.classList.toggle('low', heat > 0.6);
      ui.sprint.classList.toggle('tired', truck.stall > 0);
    }

    // turn the wheel (steer -1..1) and roll on down the road
    function steerAndMove(dt, steer) {
      truck.steer += (steer - truck.steer) * Math.min(1, dt * 6);
      const speedNorm = Math.min(1, truck.speed / 20);
      // braking hard at speed makes the back step out a little
      const driftWant = truck.brake * speedNorm * 0.2 * truck.driftSide;
      truck.drift += (driftWant - truck.drift) * Math.min(1, dt * (truck.brake > 0 ? 4 : 2.2));
      const targetVx = truck.steer * STEER * truck.speed + truck.drift * truck.speed * 0.18;
      truck.vx += (targetVx - truck.vx) * Math.min(1, dt * 5);
      truck.x += truck.vx * dt;
      truck.d += truck.speed * dt;
      truck.yaw = Math.atan2(truck.vx, Math.max(truck.speed, 1)) + truck.drift;
      // how the truck sits on its springs: nose down when braking, leaning into turns
      pitch += ((truck.brake > 0 ? 0.025 * truck.brake : 0) - pitch) * Math.min(1, dt * 5);
      roll += ((-truck.steer * speedNorm * 0.02) - roll) * Math.min(1, dt * 4);
      placeTruck();
    }

    function stall() {
      truck.stall = STALL_TIME;
      truck.heat = 0;
      truck.held = 0;
      truck.brake = 0;
      shake = 0.4;
      Sfx.sputter();
    }

    // ---- it: always behind you, on all fours ------------------------------------------
    function chase(dt, cruise) {
      // it waits a moment, then keeps up a little slower than the truck at full speed:
      // every time you brake, it gains on you
      if (runTime > 1.5) gap += (truck.speed - cruise * CHASER_PACE) * dt;
      gap = Math.min(gap, MAX_GAP);

      // now and then, for no reason, it surges: from behind, or up alongside a door
      lungeTimer -= dt;
      if (!lunge && lungeTimer <= 0 && runTime > 25) startLunge(Math.random() < 0.5 ? 0 : (Math.random() < 0.6 ? -1 : 1));
      if (lunge) {
        if (lunge.phase === 'close') {
          gap -= LUNGE_SPEED * dt;
          if (lunge.side !== 0 && gap <= 3.5) {
            lunge.phase = 'side';
            lunge.t = 0;
            startGlance(lunge.side);
            Sfx.heartbeat(0.8);
            beatPulse = 1;
          }
        } else {
          lunge.t += dt;
          // the jolt switches the cab light on for a moment: you see it
          finish.dome.intensity = lunge.t > 0.5 ? (Math.random() < 0.3 ? 0.4 : 1.3) : 0;
          if (lunge.t >= 0.85) sideHit(lunge.side);
        }
      }
      if (gap <= 0.4 && !(lunge && lunge.phase === 'side')) rearHit();
      placeChaser(dt);
    }

    function startLunge(side) {
      lunge = { side: side, phase: 'close', t: 0 };
    }

    function placeChaser(dt) {
      chaser.root.visible = true;
      chaserX += (truck.x - chaserX) * Math.min(1, dt * 1.6);
      if (lunge && lunge.phase === 'side') {
        // up alongside the cab, then at the window
        const k = smooth(0, 0.5, lunge.t);
        const x = truck.x + lunge.side * (0.6 + 1.6 * k);
        const d = truck.d - REAR - 3.5 + (REAR + 3.3) * k;
        if (lunge.t < 0.5) {
          chaser.setModeOnce('crawl');
          chaser.place(x, 0, -d, x, -(d + 10), 3);
        } else {
          atWindow(lunge.side);
        }
      } else {
        chaser.setModeOnce(gap < 3 ? 'reach' : 'crawl');
        const d = truck.d - REAR - Math.max(gap, 0.3);
        // (its eyes made bigger, or they'd be lost in the little mirror)
        chaser.place(chaserX, 0, -d, truck.x, -truck.d, 3);
      }
      chaser.update(dt);
    }

    // bent down to the side window, its face right there (side: -1 your door, 1 the other one)
    function atWindow(side) {
      const ex = truck.x - 0.42, ed = truck.d + 0.1; // your eyes
      chaser.setModeOnce('lunge');
      chaser.place(ex + side * (side < 0 ? 2.0 : 2.6), -0.72, -ed, ex, -ed);
    }

    function rearHit() {
      const surprise = !!lunge;
      damage(surprise ? HIT_LUNGE : HIT_REAR);
      Sfx.crunch(0);
      shake = 0.9;
      jolt = 1;
      blur = 0.7;
      beatPulse = 1;
      truck.speed += 3;
      gap = 7 + Math.random() * 3;
      lunge = null;
      lungeTimer = 35 + Math.random() * 25;
    }

    function sideHit(side) {
      finish.dome.intensity = 0;
      damage(HIT_SIDE);
      Sfx.crunch(-side);
      shake = 1;
      blur = 0.6;
      beatPulse = 1;
      // it shoves the truck sideways, towards the trees
      truck.vx -= side * 7;
      roll = -side * 0.06;
      gap = 9 + Math.random() * 3;
      lunge = null;
      lungeTimer = 35 + Math.random() * 25;
    }

    // you can't help looking out of the side window
    function startGlance(side) {
      glanceT = 0;
      glanceSide = side;
    }
    function updateGlance(dt) {
      if (glanceT < 0) { glanceAmount = 0; return; }
      glanceT += dt;
      const DUR = 1.25;
      glanceAmount = smooth(0, 0.22, glanceT) * (1 - smooth(DUR - 0.3, DUR, glanceT));
      if (glanceT >= DUR) { glanceT = -1; glanceAmount = 0; }
    }

    // ---- fear: heartbeat, breathing, red edges, tunnel vision ---------------------------
    function panic(dt) {
      const close = clamp(1 - gap / 24, 0, 1);
      closeNow = close;
      heartTimer -= dt;
      if (heartTimer <= 0) {
        heartTimer = 1.1 - close * 0.72;
        Sfx.heartbeat(0.08 + close * 0.55);
        beatPulse = 1;
      }
      Sfx.startBreathing();
      Sfx.setBreathing(Math.max(close, truck.stall > 0 ? 0.75 : 0.25, truck.health < 0.3 ? 0.6 : 0));
      // the headlights stutter when it's close
      if (flicker > 0) flicker -= dt;
      else if (gap < 9 && Math.random() < dt * (9 - gap) * 0.25) flicker = 0.05 + Math.random() * 0.18;
    }

    function effects(dt) {
      beatPulse = Math.max(0, beatPulse - dt * 4);
      const close = ctx.state() === 'play' ? closeNow : 0;
      const danger = Math.max(0, (close - 0.35) / 0.65);
      ui.danger.style.opacity = (danger * 0.9 * (0.75 + 0.25 * beatPulse)).toFixed(3);
      const tunnel = 2.4 - Math.pow(close, 1.5) * 1.35 - beatPulse * close * 0.12;
      ui.tunnel.style.transform = 'scale(' + tunnel.toFixed(3) + ')';
      camera.fov = ctx.baseFov() * (1 - close * 0.06 + beatPulse * close * 0.025);
      camera.updateProjectionMatrix();
      // a hard knock blurs everything for a moment
      blur = Math.max(0, blur - dt);
      const b = Math.round(blur * 6) / 2;
      if (b !== shownBlur) {
        shownBlur = b;
        ctx.canvas.style.filter = b > 0 ? 'blur(' + b + 'px)' : '';
      }
    }

    // ---- the view from the seat ------------------------------------------------------
    function updateView(dt) {
      shake = Math.max(0, shake - dt);
      jolt = Math.max(0, jolt - dt * 3);
      if (caughtT < 1.75) updateGlance(dt);
      const tr = shake * 0.05 + rumble * 0.012 + (truck.stall > 0 ? 0.006 : 0) + truck.brake * truck.speed * 0.0004 +
        closeNow * closeNow * 0.006;
      body.position.set(
        SEAT_EYE[0] + (Math.random() - 0.5) * tr,
        SEAT_EYE[1] + (Math.random() - 0.5) * tr,
        SEAT_EYE[2] - jolt * 0.06
      );
      // you lean with the road a little, and look down it (or out of a side window)
      const glanceYaw = -glanceSide * 1.38 * glanceAmount;
      body.rotation.set(-0.05 - truck.brake * 0.02 + jolt * 0.08, Math.PI - truck.steer * 0.06 + glanceYaw, -truck.steer * 0.015);
      camera.rotation.set(0, 0, 0);
      // the wheel turns with your steering (and catches the slide when the back steps out)
      finish.wheel.rotation.z = truck.steer * 1.7 - truck.drift * 2;
      cab.update(dt);
      ui.wheelArt.style.transform = 'rotate(' + (truck.steer * 110).toFixed(1) + 'deg)';

      // the headlights and the dials
      let lights = truck.stall > 0 ? (Math.random() < 0.35 ? 0.3 : 0.85) : 1;
      if (flicker > 0) lights *= Math.random() < 0.5 ? 0.05 : 0.4;
      if (caughtT >= 0) lights *= 1 - smooth(0.5, 1.3, caughtT) * (Math.random() < 0.3 ? 0.5 : 1);
      finish.beams.intensity = 2.6 * lights;
      finish.headMat.emissive.setRGB(0.6 * lights, 0.57 * lights, 0.45 * lights);
      finish.dashMat.color.setRGB(0.9 * lights, 0.55 * lights, 0.15 * lights);
      cab.setGauges(truck.speed / 36, truck.stall > 0 ? 1 : 0.35 + 0.6 * truck.heat / STALL_AFTER, lights);
      cab.tail.intensity = 1.3 * Math.max(lights, 0.2);
    }

    // ---- the truck gives out, and it gets you -----------------------------------------
    function breakDown() {
      if (caughtT >= 0) return;
      ctx.setState('caught');
      caughtT = 0;
      lunge = null;
      glanceT = -1;
      truck.brake = 0;
      ctx.releaseInput();
      Sfx.sputter();
      Sfx.engineStop(1.4);
      Sfx.setScreech(0);
    }

    function updateCaught(dt) {
      const t0 = caughtT;
      caughtT += dt;
      const at = time => t0 < time && caughtT >= time;
      // the engine dies, the truck rolls to a stop... it's coming, in the mirror
      truck.speed = Math.max(0, truck.speed - 9 * dt);
      truck.brake = 0;
      steerAndMove(dt, 0);
      hw.update(truck.d);
      Sfx.setRoad(Math.min(1, truck.speed / CRUISE_MAX), 0);
      gap = Math.max(0.5, gap - Math.max(6, gap) * dt * 1.2);
      if (caughtT < 1.75) placeChaser(dt);
      if (at(0.9)) { Sfx.heartbeat(0.7); beatPulse = 1; }
      if (at(1.35)) { Sfx.heartbeat(0.8); beatPulse = 1; }
      // and then it's at your window
      if (at(1.75)) {
        Sfx.caught();
        Sfx.stopBreathing();
        glanceSide = -1;
        chaser.setModeOnce('lunge');
        shake = 0.6;
      }
      if (caughtT >= 1.75) {
        glanceAmount = 1 - Math.pow(1 - Math.min(1, (caughtT - 1.75) / 0.15), 3);
        atWindow(-1);
        chaser.update(dt);
        finish.dome.intensity = caughtT < 2.3 ? 1.6 : 0; // its face, for a split second
      }
      if (caughtT > 2.3) {
        ui.staticCanvas.style.opacity = '1';
        ctx.drawStatic();
      }
      if (caughtT > 3.3) {
        ui.staticCanvas.style.opacity = '0';
        ui.danger.style.opacity = '0';
        finish.dome.intensity = 0;
        chaser.root.visible = false;
        ctx.onCaught(distance());
      }
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
      chaser.setMode('crawl');
      Sfx.engineStart(0);
      Sfx.setAmbience(0);
    }

    function update(dt) {
      const state = ctx.state();
      if (state === 'play') drive(dt);
      else if (state === 'caught') updateCaught(dt);
      updateView(dt);
      effects(dt);
      cab.renderMirror(ctx.renderer, ctx.scene);
    }

    // leaving the level: silence the road, clear the screen
    function stop() {
      Sfx.setRoad(0, 0);
      Sfx.setScreech(0);
      ctx.canvas.style.filter = '';
      shownBlur = -1;
      cab.tail.intensity = 0;
      chaser.root.visible = false;
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
      input: input,
      // for testing from the console
      debug: {
        gap: v => { if (v !== undefined) gap = v; return gap; },
        lunge: side => { lungeTimer = 0; runTime = Math.max(runTime, 26); startLunge(side || 0); },
        damage: v => damage(v),
        crash: v => crash(v || 0),
        now: () => ({ lunge: lunge && { phase: lunge.phase, t: lunge.t, side: lunge.side }, caughtT: caughtT, gap: gap, health: truck.health })
      }
    };
  }

  window.Drive = { create: create };
})();
