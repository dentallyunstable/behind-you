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
  const STICK_RADIUS = 55;      // pixels

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), distance: $('distance'), staminaFill: $('staminaFill'),
    stick: $('stick'), knob: $('knob'), menu: $('menu'), over: $('over'),
    result: $('result'), best: $('best'), bestMenu: $('bestMenu'),
    danger: $('danger'), staticCanvas: $('static')
  };

  // ---- renderer / scene ----------------------------------------------------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x020306);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.fog = new THREE.Fog(0x020306, 3, 21);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // Almost no light except the flashlight.
  scene.add(new THREE.AmbientLight(0x2a3450, 0.45));

  const flashlight = new THREE.SpotLight(0xfff0cc, 2.4, 26, 0.5, 0.5, 1);
  flashlight.position.set(0.25, -0.25, 0);
  camera.add(flashlight);
  camera.add(flashlight.target);
  flashlight.target.position.set(0, -1.6, -10);

  const tex = Textures.build();
  const world = World.create(scene, tex);

  // ---- first-person flashlight + hand (low-poly viewmodel) ---------------
  const viewmodel = new THREE.Group();
  const vmBase = { x: 0.24, y: -0.24 };
  (function buildViewmodel() {
    const metal = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
    const skin = new THREE.MeshBasicMaterial({ map: tex.hand, color: 0x6a5a50 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), metal);
    body.rotation.x = Math.PI / 2;
    viewmodel.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.034, 0.07, 6), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.15;
    viewmodel.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 6), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
    lens.position.z = -0.186;
    viewmodel.add(lens);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.085, 0.11), skin);
    hand.position.set(0.01, -0.02, 0.03);
    viewmodel.add(hand);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), skin);
    thumb.position.set(-0.045, 0.02, 0.0);
    thumb.rotation.y = 0.3;
    viewmodel.add(thumb);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.3), new THREE.MeshBasicMaterial({ color: 0x1c2230 }));
    arm.position.set(0.03, -0.04, 0.22);
    viewmodel.add(arm);
    viewmodel.position.set(0.24, -0.24, -0.42);
    viewmodel.rotation.set(0.08, 0.12, 0);
    camera.add(viewmodel);
  })();

  // ---- sizing --------------------------------------------------------------
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
    camera.fov = Math.min(Math.max(vfov, 62), 95);
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

  // ---- input: one floating joystick (+ keyboard on computers) ----------------
  const input = { x: 0, y: 0 };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const keys = {};

  function placeStickIdle() {
    ui.stick.style.left = '50%';
    ui.stick.style.top = 'auto';
    ui.stick.style.bottom = 'calc(14% - 60px)';
    ui.stick.style.opacity = '0.5';
    ui.knob.style.transform = 'translate(0px,0px)';
  }
  placeStickIdle();

  function onDown(e) {
    Sfx.init();
    if (state === 'menu' || (state === 'over' && stateTime > 0.8)) {
      startGame();
    }
    if (state !== 'play' || stick.id !== null) return;
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
  function onUp(e) {
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
      startGame();
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
  }

  // ---- game state ------------------------------------------------------------
  let state = 'menu';
  let stateTime = 0;
  const player = { x: 0, d: 0, vx: 0, speed: 0, stamina: 1, stumble: 0, hitCooldown: 0 };
  let gap = START_GAP;
  let bobPhase = 0, lastStep = 0, shake = 0, flicker = 0;
  let heartTimer = 0, chaserTimer = 0, snapTimer = 3;
  let runTime = 0;
  let caughtYaw = 0;

  function setState(s) {
    state = s;
    stateTime = 0;
    ui.menu.classList.toggle('hidden', s !== 'menu');
    ui.over.classList.toggle('hidden', s !== 'over');
    ui.hud.classList.toggle('hidden', s !== 'play');
    ui.stick.classList.toggle('hidden', s !== 'play');
  }

  function resetRun() {
    player.x = 0; player.d = 0; player.vx = 0; player.speed = 0;
    player.stamina = 1; player.stumble = 0; player.hitCooldown = 0;
    gap = START_GAP;
    bobPhase = 0; lastStep = 0; shake = 0; flicker = 0;
    heartTimer = 0; chaserTimer = 0; snapTimer = 2;
    runTime = 0; caughtYaw = 0;
    world.reset();
    world.update(0);
    ui.staticCanvas.style.opacity = '0';
    ui.danger.style.opacity = '0';
  }

  function startGame() {
    resetRun();
    placeStickIdle();
    setState('play');
    Sfx.setWind(0.05);
  }

  function caught() {
    setState('caught');
    Sfx.caught();
    stick.id = null; stick.x = stick.y = 0;
  }

  function finishCaught() {
    const dist = Math.floor(player.d);
    if (dist > best) { best = dist; saveBest(best); }
    ui.result.textContent = 'You ran ' + dist + ' meters.';
    ui.best.textContent = 'Furthest: ' + best + ' m';
    showBestMenu();
    setState('over');
    Sfx.setWind(0.02);
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
    const sprinting = input.y > 0.35 && player.stamina > 0.02;
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

    player.hitCooldown -= dt;
    if (world.collide(player, PLAYER_RADIUS) && player.hitCooldown <= 0) {
      player.hitCooldown = 0.9;
      player.stumble = 0.7;
      player.speed *= 0.25;
      shake = 0.5;
      Sfx.hit();
    }

    // The thing behind you. It waits a moment, then never stops.
    if (runTime > 2.5) {
      const chaserSpeed = base * (0.94 + diff * 0.14);
      gap += (player.speed - chaserSpeed) * dt;
      gap = Math.min(gap, MAX_GAP);
    }
    if (gap <= 0) {
      caught();
      return;
    }

    // closeness: 0 far away, 1 right behind you
    const close = Math.max(0, Math.min(1, 1 - gap / 26));

    // sounds
    heartTimer -= dt;
    if (heartTimer <= 0) {
      heartTimer = 1.1 - close * 0.72;
      Sfx.heartbeat(0.08 + close * 0.55);
    }
    chaserTimer -= dt;
    if (chaserTimer <= 0 && runTime > 2.5) {
      chaserTimer = 0.3 + Math.random() * 0.06;
      Sfx.chaserStep(Math.pow(close, 1.6) * 0.9 + 0.02);
    }
    snapTimer -= dt;
    if (snapTimer <= 0) {
      snapTimer = 1.5 + Math.random() * 5 * (1 - close * 0.8);
      Sfx.snap(0.08 + close * 0.4);
    }

    // flashlight trouble when it gets close
    if (flicker > 0) flicker -= dt;
    else if (gap < 11 && Math.random() < dt * (11 - gap) * 0.25) flicker = 0.05 + Math.random() * 0.18;

    const pulse = 0.85 + 0.15 * Math.sin(runTime * (6 + close * 8));
    ui.danger.style.opacity = (Math.max(0, (close - 0.35) / 0.65) * 0.9 * pulse).toFixed(3);

    // HUD
    ui.distance.textContent = Math.floor(player.d) + ' m';
    ui.staminaFill.style.width = (player.stamina * 100).toFixed(1) + '%';
    ui.staminaFill.style.background = player.stamina < 0.25 ? '#a04030' : '#c8b878';
  }

  function updateCamera(dt) {
    const speedNorm = Math.min(player.speed / 8, 1.4);
    bobPhase += player.speed * dt * 1.3;
    const bob = Math.abs(Math.sin(bobPhase)) * 0.07 * speedNorm;
    const step = Math.floor(bobPhase / Math.PI);
    if (step !== lastStep) {
      lastStep = step;
      if (state === 'play' && player.speed > 1) Sfx.step();
    }

    shake = Math.max(0, shake - dt);
    const sx = (Math.random() - 0.5) * shake * 0.2, sy = (Math.random() - 0.5) * shake * 0.2;

    camera.position.set(player.x + sx, EYE_HEIGHT + bob - 0.03 + sy, -player.d);
    camera.rotation.y = -player.vx * 0.03 + caughtYaw;
    camera.rotation.x = -0.06 + Math.sin(bobPhase * 2) * 0.008 * speedNorm;
    camera.rotation.z = -player.vx * 0.01 + Math.sin(bobPhase) * 0.012 * speedNorm;

    // flashlight swings with your arm
    const swayX = Math.sin(bobPhase) * 0.012 * speedNorm;
    const swayY = Math.abs(Math.cos(bobPhase)) * 0.015 * speedNorm;
    viewmodel.position.set(vmBase.x + swayX, vmBase.y + swayY - bob * 0.3, -0.42);
    flashlight.target.position.set(swayX * 25 + player.vx * 0.15, -1.6 + swayY * 20, -10);

    let intensity = 2.4 * (0.97 + Math.random() * 0.03);
    if (flicker > 0) intensity *= Math.random() < 0.5 ? 0.05 : 0.4;
    if (state === 'caught') intensity = stateTime > 0.12 ? 0 : intensity * 0.3;
    flashlight.intensity = intensity;
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
      // You start to turn around... and that's all you ever see.
      player.speed *= 0.9;
      caughtYaw = Math.min(stateTime / 0.35, 1) * 2.4;
      shake = 0.6;
      if (stateTime > 0.25) {
        ui.staticCanvas.style.opacity = '1';
        drawStatic();
      }
      if (stateTime > 1.5) {
        ui.staticCanvas.style.opacity = '0';
        ui.danger.style.opacity = '0';
        finishCaught();
      }
    } else if (state === 'menu') {
      world.update(player.d);
      bobPhase += dt * 0.6;
    }

    if (state !== 'over') updateCamera(dt);
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) {
      stick.id = null; stick.x = stick.y = 0;
      for (const k in keys) keys[k] = false;
    }
  });

  setState('menu');
  resetRun();
  requestAnimationFrame(frame);

  // handy for testing from the browser console
  window.__game = { player: player, getGap: () => gap, getState: () => state, input: input, stick: stick };
})();
