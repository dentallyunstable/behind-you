// Behind You: main loop, player, flashlight, the thing behind you, input and HUD.
(function () {
  'use strict';

  // ---- tuning ------------------------------------------------------------
  const RENDER_LINES = 400;     // internal vertical resolution (low = retro + fast)
  const EYE_HEIGHT = 1.6;
  const PLAYER_RADIUS = 0.35;
  const STRAFE_SPEED = 5.5;
  const START_GAP = 22;         // meters between you and it at the start
  const MAX_GAP = 32;
  const LOOK_PENALTY = 1.5;     // it closes in this much faster (m/s) while you look back
  const STICK_RADIUS = 55;      // pixels
  const SPRINT_RING = 276.5;    // length of the stamina ring around the sprint button (2 * PI * 44)
  const JUMP_SPEED = 4.4;
  const GRAVITY = 14;
  const SIT_EYE = 0.95;         // eye height sitting by the fire

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), distance: $('distance'), sprint: $('sprint'), sprintRing: $('sprintRing'),
    stick: $('stick'), knob: $('knob'), menu: $('menu'), over: $('over'),
    result: $('result'), best: $('best'), bestMenu: $('bestMenu'),
    danger: $('danger'), tunnel: $('tunnel'), staticCanvas: $('static'), hint: $('hint')
  };

  // ---- renderer / scene ----------------------------------------------------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x020306);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.fog = new THREE.Fog(0x020306, 3, 21);

  // The runner's body. The camera (head) is a child, so it can turn to look back.
  const body = new THREE.Object3D();
  body.rotation.order = 'YXZ';
  scene.add(body);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';
  body.add(camera);

  // Almost no light except the flashlight.
  const AMBIENT = 0.45;
  const ambient = new THREE.AmbientLight(0x2a3450, AMBIENT);
  scene.add(ambient);

  // The arm holds the flashlight. It turns together with the head when you look back.
  const arm = new THREE.Object3D();
  arm.rotation.order = 'YXZ';
  body.add(arm);

  const flashlight = new THREE.SpotLight(0xfff0cc, 2.4, 26, 0.5, 0.5, 1);
  flashlight.position.set(0.25, -0.25, 0);
  arm.add(flashlight);
  arm.add(flashlight.target);
  flashlight.target.position.set(0, -1.6, -10);

  const tex = Textures.build();
  const world = World.create(scene, tex);
  const camp = Camp.create(scene, tex);
  // the thing behind you, and a second one for the figures you sometimes see ahead
  const chaser = Monster.create(scene, tex);
  const watcher = Monster.create(scene, tex);

  // ---- first-person flashlight + hand (low-poly viewmodel) ---------------
  const viewmodel = new THREE.Group();
  const vmBase = { x: 0.24, y: -0.24 };
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  (function buildViewmodel() {
    const metal = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
    const skin = new THREE.MeshBasicMaterial({ map: tex.hand, color: 0x6a5a50 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), metal);
    barrel.rotation.x = Math.PI / 2;
    viewmodel.add(barrel);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.034, 0.07, 6), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.15;
    viewmodel.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 6), lensMat);
    lens.position.z = -0.186;
    viewmodel.add(lens);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.085, 0.11), skin);
    hand.position.set(0.01, -0.02, 0.03);
    viewmodel.add(hand);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), skin);
    thumb.position.set(-0.045, 0.02, 0.0);
    thumb.rotation.y = 0.3;
    viewmodel.add(thumb);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.3), new THREE.MeshBasicMaterial({ color: 0x1c2230 }));
    sleeve.position.set(0.03, -0.04, 0.22);
    viewmodel.add(sleeve);
    viewmodel.position.set(0.24, -0.24, -0.42);
    viewmodel.rotation.set(0.08, 0.12, 0);
    arm.add(viewmodel);
  })();

  // ---- sizing --------------------------------------------------------------
  let baseFov = 70;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, RENDER_LINES / h);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, true);
    const aspect = w / h;
    camera.aspect = aspect;
    // Keep at least ~75 degrees horizontally, so portrait phones still see enough.
    const hfov = 75 * Math.PI / 180;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
    baseFov = Math.min(Math.max(vfov, 62), 95);
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    // smaller hand on tall (portrait) screens so it doesn't cover the view
    viewmodel.scale.setScalar(aspect < 1 ? 0.7 : 1);
    vmBase.x = aspect < 1 ? 0.2 : 0.24;
    vmBase.y = aspect < 1 ? -0.26 : -0.24;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- best score ------------------------------------------------------------
  function loadBest() {
    try { return parseInt(localStorage.getItem('behindyou.best') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('behindyou.best', String(v)); } catch (e) { /* ignore */ }
  }
  let best = loadBest();
  function showBestMenu() {
    ui.bestMenu.textContent = best > 0 ? 'Furthest: ' + best + ' m' : '';
  }
  showBestMenu();

  // has the player ever jumped over a log? (until then, a hint shows when one is coming)
  let learnedJump = false;
  try { learnedJump = localStorage.getItem('behindyou.jumped') === '1'; } catch (e) { /* ignore */ }
  const touchScreen = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  ui.hint.textContent = touchScreen ? 'PUSH UP TO JUMP' : 'SPACE TO JUMP';

  // ---- input: a floating joystick and a sprint button (+ keyboard on computers) --
  // joystick: left/right steer, push up to jump, pull down to slow down
  const input = { x: 0, y: 0, sprint: false };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const sprintBtn = { id: null };
  let jumpBuffer = 0, jumpArmed = true;
  function requestJump() {
    if (state === 'play') jumpBuffer = 0.18;
  }
  const keys = {};

  function placeStickIdle() {
    ui.stick.style.left = '35%';
    ui.stick.style.top = 'auto';
    ui.stick.style.bottom = 'calc(14% - 60px)';
    ui.stick.style.opacity = '0.5';
    ui.knob.style.transform = 'translate(0px,0px)';
  }
  placeStickIdle();

  function onDown(e) {
    Sfx.init();
    if (state === 'menu' || (state === 'over' && stateTime > 0.8)) {
      startIntro();
    }
    // thumbs can already rest on the screen while you get up from the fire
    if (state !== 'play' && state !== 'intro') return;
    if (e.target.closest && e.target.closest('#sprint')) {
      if (sprintBtn.id === null) {
        sprintBtn.id = e.pointerId;
        ui.sprint.classList.add('on');
      }
      return;
    }
    if (stick.id !== null) return;
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    stick.x = stick.y = 0;
    ui.stick.style.left = e.clientX + 'px';
    ui.stick.style.top = e.clientY + 'px';
    ui.stick.style.bottom = 'auto';
    ui.stick.style.opacity = '1';
  }
  function onMove(e) {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
    ui.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    stick.x = dx / STICK_RADIUS;
    stick.y = -dy / STICK_RADIUS;
  }
  function releaseSprint() {
    sprintBtn.id = null;
    ui.sprint.classList.remove('on');
  }
  function onUp(e) {
    if (e.pointerId === sprintBtn.id) releaseSprint();
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.x = stick.y = 0;
    placeStickIdle();
  }
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if ((e.code === 'Space' || e.code === 'Enter') && (state === 'menu' || (state === 'over' && stateTime > 0.8))) {
      Sfx.init();
      startIntro();
    } else if (e.code === 'Space' && !e.repeat) {
      requestJump();
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  function readInput() {
    let kx = 0, ky = 0;
    if (keys.ArrowLeft || keys.KeyA) kx -= 1;
    if (keys.ArrowRight || keys.KeyD) kx += 1;
    if (keys.ArrowUp || keys.KeyW) ky += 1;
    if (keys.ArrowDown || keys.KeyS) ky -= 1;
    let x = stick.x + kx, y = stick.y + ky;
    // dead zone
    if (Math.abs(x) < 0.12) x = 0;
    if (Math.abs(y) < 0.12) y = 0;
    input.x = Math.max(-1, Math.min(1, x));
    input.y = Math.max(-1, Math.min(1, y));
    input.sprint = sprintBtn.id !== null || !!keys.ShiftLeft || !!keys.ShiftRight;
    // pushing up jumps once; come back down before the next jump
    if (input.y > 0.6 && jumpArmed) {
      requestJump();
      jumpArmed = false;
    } else if (input.y < 0.3) {
      jumpArmed = true;
    }
  }

  // ---- game state ------------------------------------------------------------
  let state = 'menu';
  let stateTime = 0;
  const player = { x: 0, d: 0, y: 0, vx: 0, vy: 0, speed: 0, stamina: 1, stumble: 0, hitCooldown: 0 };
  let gap = START_GAP;
  let bobPhase = 0, lastStep = 0, shake = 0, flicker = 0;
  let heartTimer = 0, cricketTimer = 2;
  let runTime = 0;
  let caughtYaw = 0, caughtFrom = 0, caughtDir = 1;
  let closeNow = 0, beatPulse = 0, lightCut = 0;
  // looking back
  let lookTimer = 0, lookT = -1, lookDir = 1, lookAmount = 0;
  let lookDur = 2, lookTurn = 0.35, closeCall = false, closeCallCooldown = 0;
  let chaserX = 0;
  // flashlight failures
  let blackoutTimer = 0, blackoutT = -1, blackoutOff = 1.5;
  // chase moods: normal / lull (it falls back) -> then suddenly much closer
  let paceState = 'normal', pace = 1, paceTimer = 0;
  // figures watching from between the trees ahead
  let watcherTimer = 0, watcherActive = false, watcherD = 0, watcherX = 0;
  // the camp: sitting by the fire, then the sound, then you run
  let introT = -1, introSide = 1, introLookYaw = Math.PI, introLookPitch = 0, introRunYaw = 0;
  let introBeats = 0, seat = 1, lightOn = false, vmRaise = 1, crackleTimer = 0;

  function setState(s) {
    state = s;
    stateTime = 0;
    ui.menu.classList.toggle('hidden', s !== 'menu' && s !== 'intro');
    ui.menu.classList.toggle('fade', s === 'intro');
    ui.over.classList.toggle('hidden', s !== 'over');
    ui.hud.classList.toggle('hidden', s !== 'play');
    ui.stick.classList.toggle('hidden', s !== 'play');
    ui.sprint.classList.toggle('hidden', s !== 'play' && s !== 'intro');
  }

  function resetRun() {
    player.x = 0; player.d = 0; player.y = 0; player.vx = 0; player.vy = 0; player.speed = 0;
    jumpBuffer = 0; jumpArmed = true;
    seat = 1; lightOn = false; vmRaise = 1; introT = -1;
    viewmodel.visible = false;
    ui.hint.classList.add('hidden');
    player.stamina = 1; player.stumble = 0; player.hitCooldown = 0;
    gap = START_GAP;
    bobPhase = 0; lastStep = 0; shake = 0; flicker = 0;
    heartTimer = 0;
    runTime = 0; caughtYaw = 0;
    lookTimer = 10 + Math.random() * 8; lookT = -1; lookAmount = 0; closeCall = false; closeCallCooldown = 0;
    closeNow = 0; beatPulse = 0; lightCut = 0; caughtFrom = 0;
    blackoutTimer = 25 + Math.random() * 20; blackoutT = -1;
    paceState = 'normal'; pace = 1; paceTimer = 20 + Math.random() * 10;
    watcherTimer = 40 + Math.random() * 30; watcherActive = false;
    chaser.root.visible = false;
    watcher.root.visible = false;
    ui.tunnel.style.transform = 'scale(2.4)';
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    world.reset();
    world.update(0);
    ui.staticCanvas.style.opacity = '0';
    ui.danger.style.opacity = '0';
  }

  // Tap: a branch snaps somewhere past the fire. You turn... two eyes. You get up and run.
  function startIntro() {
    if (state === 'over') resetRun();
    placeStickIdle();
    setState('intro');
    introT = 0;
    introBeats = 0;
    introSide = Math.random() < 0.5 ? -1 : 1;
    const e = World.CAMP.eyes[introSide > 0 ? 1 : 0];
    // which way to turn your head to look at it (seated, facing the fire = PI)
    introLookYaw = Math.atan2(-e.x, e.d);
    if (introLookYaw < 0) introLookYaw += Math.PI * 2;
    introLookPitch = Math.atan2(2.7 - SIT_EYE, Math.hypot(e.x, e.d));
    // then turn away from it to run (the forward direction is yaw 0, or a full turn)
    introRunYaw = introLookYaw > Math.PI ? Math.PI * 2 : 0;
    chaser.setMode('still');
    chaser.place(e.x, 0, -e.d, 0, 0, 3);
    chaser.root.visible = true;
  }

  function updateIntro(dt) {
    const t0 = introT;
    introT += dt;
    const at = time => t0 < time && introT >= time;
    if (at(0.15)) {
      // the sound comes from where it stands (seated facing the fire, your right is -x)
      Sfx.snap(-introSide * 0.75);
      Sfx.setAmbience(0); // the crickets go quiet
    }
    if (at(0.9) || at(1.3) || at(1.62) || at(1.9)) {
      Sfx.heartbeat(0.45 + introBeats * 0.08);
      introBeats++;
      beatPulse = 1;
    }
    if (at(1.0)) {
      Sfx.startBreathing();
      Sfx.setBreathing(0.75);
    }
    chaser.update(dt);
    if (at(2.05)) chaser.root.visible = false; // you've turned away: you never see it leave
    if (at(2.15)) {
      lightOn = true;
      viewmodel.visible = true;
      Sfx.click();
    }
    beatPulse = Math.max(0, beatPulse - dt * 4);
    if (introT >= 2.45) {
      setState('play');
      player.speed = 3;
      Sfx.setAmbience(0.9);
    }
  }

  function caught() {
    setState('caught');
    // whip around from wherever the head is now, and it's right there
    caughtFrom = lookDir * lookAmount * 2.7;
    caughtDir = lookAmount > 0 ? lookDir : (Math.random() < 0.5 ? 1 : -1);
    lookT = -1; lookAmount = 0; blackoutT = -1; flicker = 0; lightCut = 0;
    watcher.root.visible = false;
    watcherActive = false;
    chaser.setMode('lunge');
    chaser.root.visible = true;
    ui.hint.classList.add('hidden');
    Sfx.caught();
    Sfx.stopBreathing();
    Sfx.setAmbience(0);
    stick.id = null; stick.x = stick.y = 0;
    releaseSprint();
  }

  function finishCaught() {
    const dist = Math.max(0, Math.floor(player.d));
    if (dist > best) { best = dist; saveBest(best); }
    ui.result.textContent = 'You ran ' + dist + ' meters.';
    ui.best.textContent = 'Furthest: ' + best + ' m';
    showBestMenu();
    setState('over');
    chaser.root.visible = false;
    ui.tunnel.style.transform = 'scale(2.4)';
    Sfx.setAmbience(0.6);
  }

  // ---- static noise (only drawn while getting caught) ------------------------
  const sctx = ui.staticCanvas.getContext('2d', { willReadFrequently: true });
  const simg = sctx.createImageData(ui.staticCanvas.width, ui.staticCanvas.height);
  function drawStatic() {
    const d = simg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 200;
      d[i] = v; d[i + 1] = v * 0.9; d[i + 2] = v * 0.9; d[i + 3] = 255;
    }
    sctx.putImageData(simg, 0, 0);
  }

  // ---- update ----------------------------------------------------------------
  function updatePlay(dt) {
    readInput();
    runTime += dt;

    const diff = world.difficulty(player.d);
    const base = 6 + diff * 2.6;
    let want = base;
    const sprinting = input.sprint && player.stamina > 0.02;
    if (sprinting) {
      want = base * 1.4;
      player.stamina = Math.max(0, player.stamina - 0.3 * dt);
    } else {
      player.stamina = Math.min(1, player.stamina + 0.14 * dt);
      if (input.y < -0.35) want = base * 0.6;
    }
    if (player.stumble > 0) {
      player.stumble -= dt;
      want *= 0.3;
    }
    player.speed += (want - player.speed) * Math.min(1, dt * 2.5);

    const targetVx = input.x * STRAFE_SPEED;
    player.vx += (targetVx - player.vx) * Math.min(1, dt * 9);
    player.x += player.vx * dt;
    player.d += player.speed * dt;
    player.x = Math.max(-world.halfWidth, Math.min(world.halfWidth, player.x));

    world.update(player.d);

    // jumping (over fallen logs)
    jumpBuffer -= dt;
    if (jumpBuffer > 0 && player.y <= 0 && player.stumble <= 0) {
      player.vy = JUMP_SPEED;
      jumpBuffer = 0;
      Sfx.jump();
    }
    if (player.y > 0 || player.vy > 0) {
      player.vy -= GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        Sfx.land();
        shake = Math.max(shake, 0.15);
      }
    }
    const logAhead = world.logAhead(player.d);
    if (!learnedJump && Math.abs(logAhead) < 1 && player.y > 0.25) {
      learnedJump = true;
      try { localStorage.setItem('behindyou.jumped', '1'); } catch (e) { /* ignore */ }
    }
    ui.hint.classList.toggle('hidden', learnedJump || !(logAhead > 0.5 && logAhead < 16));

    player.hitCooldown -= dt;
    if (world.collide(player, PLAYER_RADIUS) && player.hitCooldown <= 0) {
      player.hitCooldown = 0.9;
      player.stumble = 0.7;
      player.speed *= 0.25;
      shake = 0.5;
      Sfx.hit();
      // Close call: you stumble, glance back... and it's right there. Then you keep running.
      if (lookT < 0 && gap < 14 && closeCallCooldown <= 0 && runTime > 5) {
        startLook(1.1, 0.15, true, true);
        closeCallCooldown = 18;
      }
    }
    closeCallCooldown -= dt;

    // Chase moods: sometimes it falls back and things calm down... then it's suddenly much closer.
    paceTimer -= dt;
    if (paceTimer <= 0) {
      if (paceState === 'normal' && player.d > 250 && Math.random() < 0.6) {
        paceState = 'lull';
        pace = 0.75;
        paceTimer = 7 + Math.random() * 4;
      } else if (paceState === 'lull') {
        paceState = 'normal';
        pace = 1;
        paceTimer = 14 + Math.random() * 10;
        if (gap > 9) {
          gap = 6.5 + Math.random() * 2.5;
          shake = 0.7;
          beatPulse = 1;
        }
      } else {
        paceTimer = 10 + Math.random() * 8;
      }
    }

    // The thing behind you. It waits a moment, then never stops.
    // Looking back costs you: it gains on you while you look.
    if (runTime > 2.5) {
      const chaserSpeed = base * (0.94 + diff * 0.14) * pace;
      const lookCost = closeCall ? 0 : lookAmount * LOOK_PENALTY;
      gap += (player.speed - chaserSpeed - lookCost) * dt;
      gap = Math.min(gap, MAX_GAP);
    }
    if (gap <= 0) {
      caught();
      return;
    }

    // closeness: 0 far away, 1 right behind you
    const close = Math.max(0, Math.min(1, 1 - gap / 26));
    closeNow = close;

    // sounds
    heartTimer -= dt;
    if (heartTimer <= 0) {
      heartTimer = 1.1 - close * 0.72;
      Sfx.heartbeat(0.08 + close * 0.55);
      beatPulse = 1;
    }
    beatPulse = Math.max(0, beatPulse - dt * 4);
    // Breathing gets louder and faster when it's close, you're sprinting, or you just hit a tree.
    const effort = Math.max(close, sprinting ? 0.6 : 0.2, player.stumble > 0 ? 0.9 : 0);
    Sfx.startBreathing();
    Sfx.setBreathing(effort);

    // the crickets stop when it's near
    Sfx.setAmbience(0.9 * Math.max(0.05, 1 - close * 1.3));

    // Every now and then you can't help it: you look back for about 2 seconds.
    // Sometimes it's there (more likely the closer it is), sometimes there's only the dark.
    if (lookT < 0) {
      lookTimer -= dt;
      if (lookTimer <= 0 && player.stumble <= 0) {
        startLook(2.0, 0.35, Math.random() < 0.3 + close * 0.7, false);
        Sfx.heartbeat(0.6);
      }
    } else {
      lookT += dt;
      const k = lookT < lookTurn ? lookT / lookTurn : lookT > lookDur - lookTurn ? (lookDur - lookT) / lookTurn : 1;
      lookAmount = Math.max(0, k * k * (3 - 2 * k));
      if (lookT >= lookDur) {
        lookT = -1;
        lookAmount = 0;
        chaser.root.visible = false;
        if (closeCall) lookTimer = Math.max(lookTimer, 5);
        else lookTimer = 10 + Math.random() * 12;
        closeCall = false;
      }
    }
    if (chaser.root.visible) {
      // during a close call it's right there, whatever the real distance
      const dist = closeCall ? 2.4 : Math.max(gap, 1.2);
      const tx = Math.max(-12, Math.min(12, player.x - lookDir * Math.min(dist, 14) * 0.3));
      chaserX += (tx - chaserX) * Math.min(1, dt * 2);
      chaser.place(chaserX, 0, -player.d + dist, player.x, -player.d);
      chaser.update(dt);
    }

    // The flashlight sometimes dies for a second or two: run blind and trust the path.
    if (blackoutT < 0) {
      blackoutTimer -= dt;
      if (blackoutTimer <= 0 && player.d > 150 && lookT < 0) {
        blackoutT = 0;
        blackoutOff = 1 + Math.random();
      }
    } else {
      blackoutT += dt;
      if (blackoutT > 0.35 + blackoutOff + 0.4) {
        blackoutT = -1;
        blackoutTimer = 22 + Math.random() * 25 - close * 10;
      }
    }

    // Fake-outs: a figure standing between the trees ahead, watching. The light flickers... gone.
    if (!watcherActive) {
      watcherTimer -= dt;
      if (watcherTimer <= 0 && player.d > 250 && lookT < 0 && blackoutT < 0) {
        watcherActive = true;
        watcherD = player.d + 22;
        watcherX = Math.max(-12, Math.min(12, player.x + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4)));
        watcher.setMode('still');
        watcher.root.visible = true;
      }
    } else {
      if (watcherD - player.d < 10 || lookT >= 0 || blackoutT >= 0) {
        watcher.root.visible = false;
        watcherActive = false;
        lightCut = 0.15;
        watcherTimer = 40 + Math.random() * 40;
      } else {
        watcher.place(watcherX, 0, -watcherD, player.x, -player.d);
        watcher.update(dt);
      }
    }

    // flashlight trouble when it gets close
    if (flicker > 0) flicker -= dt;
    else if (gap < 11 && Math.random() < dt * (11 - gap) * 0.25) flicker = 0.05 + Math.random() * 0.18;

    // panic: red edges, tunnel vision and the view pulsing with your heartbeat
    const danger = Math.max(0, (close - 0.35) / 0.65);
    ui.danger.style.opacity = (danger * 0.9 * (0.75 + 0.25 * beatPulse)).toFixed(3);
    const tunnel = 2.4 - Math.pow(close, 1.5) * 1.35 - beatPulse * close * 0.12;
    ui.tunnel.style.transform = 'scale(' + tunnel.toFixed(3) + ')';
    camera.fov = baseFov * (1 - close * 0.06 + beatPulse * close * 0.025);
    camera.updateProjectionMatrix();

    // HUD
    ui.distance.textContent = Math.max(0, Math.floor(player.d)) + ' m';
    // stamina: the ring around the sprint button
    ui.sprintRing.style.strokeDashoffset = (SPRINT_RING * (1 - player.stamina)).toFixed(1);
    ui.sprint.classList.toggle('low', player.stamina < 0.25);
  }

  function startLook(dur, turn, show, isCloseCall) {
    lookT = 0;
    lookDur = dur;
    lookTurn = turn;
    lookDir = Math.random() < 0.5 ? 1 : -1;
    closeCall = isCloseCall;
    if (show) {
      chaserX = Math.max(-12, Math.min(12, player.x - lookDir * Math.min(gap, 14) * 0.3));
      chaser.setMode(isCloseCall ? 'reach' : Math.random() < 0.65 ? 'run' : 'still');
      chaser.root.visible = true;
    }
  }

  // how much the flashlight is working right now (0 = dead)
  function lightLevel() {
    if (lightCut > 0) return 0;
    if (blackoutT < 0) return 1;
    if (blackoutT < 0.35) return Math.random() < 0.5 ? 0.05 : 0.6;
    if (blackoutT < 0.35 + blackoutOff) return 0;
    return Math.random() < 0.5 ? 0.1 : 0.8;
  }

  function updateCamera(dt) {
    const speedNorm = Math.min(player.speed / 8, 1.4);
    if (player.y <= 0) bobPhase += player.speed * dt * 1.3;
    const bob = Math.abs(Math.sin(bobPhase)) * 0.07 * speedNorm;
    const step = Math.floor(bobPhase / Math.PI);
    if (step !== lastStep) {
      lastStep = step;
      if (state === 'play' && player.speed > 1) Sfx.step();
    }

    shake = Math.max(0, shake - dt);
    lightCut = Math.max(0, lightCut - dt);
    // constant trembling when it's close
    const tremble = shake * 0.2 + closeNow * closeNow * 0.03;
    const sx = (Math.random() - 0.5) * tremble, sy = (Math.random() - 0.5) * tremble;

    body.position.set(player.x + sx, EYE_HEIGHT + bob - 0.03 + sy + player.y, -player.d);
    body.rotation.y = -player.vx * 0.03;
    body.rotation.x = -0.06 + Math.sin(bobPhase * 2) * 0.008 * speedNorm;
    body.rotation.z = -player.vx * 0.01 + Math.sin(bobPhase) * 0.012 * speedNorm;
    // head turn: looking back over the shoulder, or the last turn when it catches you
    camera.rotation.y = lookDir * lookAmount * 2.7 + caughtYaw;
    camera.rotation.x = lookAmount * -0.1 + (state === 'caught' ? 0.12 : 0);
    // the flashlight swings around with your head, so you see a little of what's behind
    arm.rotation.y = camera.rotation.y;
    arm.rotation.x = camera.rotation.x;
    ambient.intensity = AMBIENT * (1 - lookAmount * 0.5);

    // flashlight swings with your arm
    const swayX = Math.sin(bobPhase) * 0.012 * speedNorm;
    const swayY = Math.abs(Math.cos(bobPhase)) * 0.015 * speedNorm;
    // the hand comes up as you switch the light on, and swings up as you jump
    vmRaise = Math.max(0, vmRaise - dt * 3.5);
    viewmodel.position.set(vmBase.x + swayX, vmBase.y + swayY - bob * 0.3 - vmRaise * vmRaise * 0.3 + Math.min(player.vy, 0) * -0.012, -0.42);
    flashlight.target.position.set(swayX * 25 + player.vx * 0.15, -1.6 + swayY * 20, -10);
    // when caught, the light lands right on its face
    if (state === 'caught') flashlight.target.position.set(-3, 4, -10);

    let intensity = 2.4 * (0.97 + Math.random() * 0.03);
    if (flicker > 0) intensity *= Math.random() < 0.5 ? 0.05 : 0.4;
    intensity *= lightLevel() * (lightOn ? 1 : 0);
    // when it catches you, the light shows its face for a split second, then dies
    if (state === 'caught') intensity = stateTime < 0.55 ? 2.6 : 0;
    flashlight.intensity = intensity;
    lensMat.color.setScalar(0.15 + 0.85 * Math.min(1, intensity / 2.4));
  }

  function smooth(a, b, t) {
    const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return k * k * (3 - 2 * k);
  }

  // Sitting by the fire (menu), and the intro: look towards the sound, then get up and turn to run.
  function updateCampCamera(dt) {
    const t = performance.now() / 1000;
    let yaw = Math.PI + Math.sin(t * 0.31) * 0.05;
    let pitch = -0.13 + Math.sin(t * 0.47) * 0.012;
    seat = 1;
    if (state === 'intro') {
      const look = smooth(0.35, 0.8, introT), turn = smooth(1.75, 2.45, introT);
      yaw += (introLookYaw - yaw) * look;
      pitch += (introLookPitch - pitch) * look;
      yaw += (introRunYaw - yaw) * turn;
      pitch += (-0.06 - pitch) * turn;
      seat = 1 - smooth(1.7, 2.3, introT);
    }
    // frozen, trembling, heart pounding
    const tremble = state === 'intro' && introT > 0.8 ? 0.006 + beatPulse * 0.01 : 0;
    body.position.set(
      player.x + (Math.random() - 0.5) * tremble,
      SIT_EYE + (EYE_HEIGHT - SIT_EYE) * (1 - seat) + Math.sin(t * 1.7) * 0.006 + (Math.random() - 0.5) * tremble,
      -player.d
    );
    body.rotation.set(pitch, yaw, 0);
    camera.rotation.set(0, 0, 0);
    arm.rotation.set(0, 0, 0);
    if (camera.fov !== baseFov) {
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    }
    ambient.intensity = AMBIENT;

    vmRaise = viewmodel.visible ? Math.max(0, vmRaise - dt * 3.5) : 1;
    viewmodel.position.set(vmBase.x, vmBase.y - vmRaise * vmRaise * 0.3, -0.42);
    flashlight.target.position.set(0, -1.6, -10);
    flashlight.intensity = lightOn ? 2.4 : 0;
    lensMat.color.setScalar(lightOn ? 1 : 0.15);
  }

  // ---- main loop -------------------------------------------------------------
  let last = performance.now();
  let paused = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    stateTime += dt;

    if (state === 'play') {
      updatePlay(dt);
    } else if (state === 'caught') {
      // You whip around... and for a split second you see its face.
      player.speed *= 0.9;
      const k = Math.min(stateTime / 0.18, 1);
      caughtYaw = caughtFrom + (caughtDir * Math.PI - caughtFrom) * (1 - Math.pow(1 - k, 3));
      shake = 0.35;
      chaser.place(player.x, -0.45, -player.d + 1.75, player.x, -player.d);
      chaser.update(dt);
      if (stateTime > 0.55) {
        ui.staticCanvas.style.opacity = '1';
        drawStatic();
      }
      if (stateTime > 1.6) {
        ui.staticCanvas.style.opacity = '0';
        ui.danger.style.opacity = '0';
        finishCaught();
      }
    } else if (state === 'menu') {
      world.update(player.d);
    } else if (state === 'intro') {
      updateIntro(dt);
    }

    // the campfire: still burning back there after you've run
    camp.update(dt, body.position);
    Sfx.setFire(state === 'caught' || state === 'over' ? 0 : camp.loudness(body.position));
    crackleTimer -= dt;
    if (crackleTimer <= 0) {
      crackleTimer = 0.04 + Math.random() * 0.4;
      Sfx.crackle();
    }

    // now and then, one cricket far away
    cricketTimer -= dt;
    if (cricketTimer <= 0) {
      cricketTimer = 3 + Math.random() * 4;
      if (state !== 'caught') Sfx.cricket();
    }

    if (state === 'menu' || state === 'intro') updateCampCamera(dt);
    else if (state !== 'over') updateCamera(dt);
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) {
      stick.id = null; stick.x = stick.y = 0;
      releaseSprint();
      for (const k in keys) keys[k] = false;
    }
  });

  setState('menu');
  resetRun();
  requestAnimationFrame(frame);

  // handy for testing from the browser console
  window.__game = {
    lookNow: () => { lookTimer = 0; }, look: () => lookAmount,
    debug: () => ({ chaser: chaser.root.visible, watcher: watcher.root.visible, watcherActive: watcherActive, lookT: lookT, blackoutT: blackoutT, gap: gap }), setGap: v => { gap = v; },
    closeCall: () => { player.hitCooldown = 0; startLook(1.1, 0.15, true, true); },
    blackout: () => { blackoutTimer = 0; }, watcher: () => { watcherTimer = 0; player.d = Math.max(player.d, 260); },
    player: player, getGap: () => gap, getState: () => state, input: input, stick: stick,
    jump: requestJump, places: () => world.places(), logAhead: () => world.logAhead(player.d), introT: () => introT };
})();
