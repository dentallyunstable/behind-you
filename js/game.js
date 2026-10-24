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
  const TIRED_AT = 0.15;        // sprint stamina below this and you're out of breath...
  const RECOVERED_AT = 0.5;     // ...until it's back up to this
  const TIRED_SPEED = 0.7;      // out of breath: slower than your normal run
  const SPRINT_RING = 276.5;    // length of the stamina ring around the sprint button (2 * PI * 44)
  const JUMP_SPEED = 4.4;
  const GRAVITY = 14;
  const SIT_EYE = 0.95;         // eye height sitting by the fire

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), distance: $('distance'), sprint: $('sprint'), sprintRing: $('sprintRing'),
    stick: $('stick'), knob: $('knob'), menu: $('menu'), over: $('over'),
    result: $('result'), best: $('best'), lookText: $('lookText'),
    settings: $('settings'), settingsBtn: $('settingsBtn'), settingsClose: $('settingsClose'),
    againBtn: $('againBtn'), menuBtn: $('menuBtn'), fade: $('fade'), toast: $('toast'),
    levels: $('levels'), levelsBtn: $('levelsBtn'), levelsClose: $('levelsClose'),
    lvlForest: $('lvlForest'), lvlEndless: $('lvlEndless'), forestShot: $('forestShot'),
    escaped: $('escaped'), nextBtn: $('nextBtn'), comingSoon: $('comingSoon'),
    endlessBtn: $('endlessBtn'), escMenuBtn: $('escMenuBtn'),
    danger: $('danger'), tunnel: $('tunnel'), staticCanvas: $('static'), hint: $('hint'),
    healthBar: $('healthBar'), wheelArt: $('wheelArt'), wet: $('wet'),
    lvlHighway: $('lvlHighway'), highwayShot: $('highwayShot'), unlockNote3: $('unlockNote3'), escapedSub: $('escapedSub')
  };
  for (let i = 0; i < 10; i++) ui.healthBar.appendChild(document.createElement('i'));
  // Only touch the page when something on it actually changes: every change makes the browser work
  // the page out again. (Every change to these goes through here, so it always knows what's showing.)
  const shown = new Map();
  function changed(el, key, v) {
    let s = shown.get(el);
    if (!s) shown.set(el, s = {});
    if (s[key] === v) return false;
    s[key] = v;
    return true;
  }
  ui.set = (el, prop, v) => { if (changed(el, prop, v)) el.style[prop] = v; };
  ui.text = (el, v) => { if (changed(el, '#text', v)) el.textContent = v; };

  // ---- renderer / scene ----------------------------------------------------
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x020306);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  // where everything is gets worked out once per frame, right before drawing (see the main loop):
  // the rear-view mirror and the windscreen then share it instead of each working it all out again
  scene.autoUpdate = false;
  scene.fog = new THREE.Fog(0x020306, 3, 21);

  // The runner's body. The camera (head) is a child, so it can turn to look back.
  const body = new THREE.Object3D();
  body.rotation.order = 'YXZ';
  scene.add(body);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';
  camera.layers.enable(1); // the highway's trees that can be seen through the windscreen (the mirror sees layer 2)
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
  const finish = Finish.create(scene, tex);
  const F = World.FINISH;
  // Level 2: the highway, and the inside of the truck you drive down it
  const hw = Highway.create(scene, tex);
  const cab = Cab.create(finish, tex);
  // the thing behind you, and a second one for the figures you sometimes see ahead
  const chaser = Monster.create(scene, tex);
  const watcher = Monster.create(scene, tex);

  // ---- first-person flashlight + hand (low-poly viewmodel) ---------------
  const viewmodel = new THREE.Group();
  const torch = new THREE.Group();     // the flashlight itself (you can put it down)
  const handParts = new THREE.Group(); // the hand holding it
  viewmodel.add(torch, handParts);
  const vmBase = { x: 0.24, y: -0.24 };
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  (function buildViewmodel() {
    const metal = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
    const skin = new THREE.MeshBasicMaterial({ map: tex.hand, color: 0x6a5a50 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), metal);
    barrel.rotation.x = Math.PI / 2;
    torch.add(Geo.still(barrel));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.034, 0.07, 6), metal);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.15;
    torch.add(Geo.still(head));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 6), lensMat);
    lens.position.z = -0.186;
    torch.add(Geo.still(lens));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.085, 0.11), skin);
    hand.position.set(0.01, -0.02, 0.03);
    handParts.add(Geo.still(hand));
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), skin);
    thumb.position.set(-0.045, 0.02, 0.0);
    thumb.rotation.y = 0.3;
    handParts.add(Geo.still(thumb));
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.3), new THREE.MeshBasicMaterial({ color: 0x1c2230 }));
    sleeve.position.set(0.03, -0.04, 0.22);
    handParts.add(Geo.still(sleeve));
    viewmodel.position.set(0.24, -0.24, -0.42);
    viewmodel.rotation.set(0.08, 0.12, 0);
    arm.add(Geo.skipWhileHidden(viewmodel));
  })();

  // which level you're in. 1: The Forest, 2: The Highway
  let level = 1;

  // ---- sizing --------------------------------------------------------------
  let baseFov = 70, baseFov2 = 60;
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
    // in the truck: the windscreen matters, not the roof and the floor
    const vfov2 = 2 * Math.atan(Math.tan(35 * Math.PI / 180) / aspect) * 180 / Math.PI;
    baseFov2 = Math.min(Math.max(vfov2, 45), 74);
    camera.fov = level === 2 ? baseFov2 : baseFov;
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
  function flag(name, set) {
    try {
      if (set) localStorage.setItem('behindyou.' + name, '1');
      return localStorage.getItem('behindyou.' + name) === '1';
    } catch (e) { return !!set; }
  }
  let bestEndless = 0;
  try { bestEndless = parseInt(localStorage.getItem('behindyou.bestEndless') || '0', 10) || 0; } catch (e) { /* ignore */ }
  let endlessUnlocked = flag('escaped');
  let best2 = 0;
  try { best2 = parseInt(localStorage.getItem('behindyou.best2') || '0', 10) || 0; } catch (e) { /* ignore */ }

  // has the player ever jumped over a log? (until then, a hint shows when one is coming)
  let learnedJump = false;
  try { learnedJump = localStorage.getItem('behindyou.jumped') === '1'; } catch (e) { /* ignore */ }
  const touchScreen = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  ui.hint.textContent = touchScreen ? 'PUSH UP TO JUMP' : 'SPACE TO JUMP';
  ui.lookText.textContent = touchScreen ? 'Tap to look around.' : 'Press any key to look around.';

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
    // buttons and panels handle their own taps
    if (e.target.closest && e.target.closest('.btn, .panel')) return;
    if (state === 'menu' && panelOpen()) return;
    if (state === 'menu') startIntro();
    // thumbs can already rest on the screen while you get up from the fire (or out of the truck)
    if (state !== 'play' && state !== 'intro' && state !== 'endlessIntro') return;
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
    if (e.repeat) return;
    Sfx.init();
    if (state === 'menu') {
      if (panelOpen()) {
        if (e.code === 'Escape') { showSettings(false); showLevels(false); }
      } else {
        startIntro(); // any key
      }
    } else if (state === 'over' && stateTime > 0.8) {
      if (e.code === 'Space' || e.code === 'Enter') runAgain();
      else if (e.code === 'Escape' || e.code === 'KeyM') toMenu();
    } else if (state === 'escaped' && stateTime > 0.8) {
      if ((e.code === 'Space' || e.code === 'Enter') && level === 1) startEndless();
      else if (e.code === 'Escape' || e.code === 'KeyM') toMenu();
    } else if (e.code === 'Space') {
      requestJump();
    }
  });

  // ---- buttons ---------------------------------------------------------------
  function panelOpen() {
    return !ui.settings.classList.contains('hidden') || !ui.levels.classList.contains('hidden');
  }
  function showSettings(open) {
    ui.settings.classList.toggle('hidden', !open);
  }
  function shakeEl(el) {
    el.classList.remove('shake');
    void el.offsetWidth; // restart the animation
    el.classList.add('shake');
  }
  ui.settingsBtn.addEventListener('click', () => showSettings(true));
  ui.settingsClose.addEventListener('click', () => showSettings(false));
  ui.againBtn.addEventListener('click', () => { if (state === 'over') runAgain(); });
  ui.menuBtn.addEventListener('click', () => { if (state === 'over') toMenu(); });

  // levels
  function showLevels(open) {
    ui.levels.classList.toggle('hidden', !open);
    if (!open) return;
    ui.lvlEndless.classList.toggle('locked', !endlessUnlocked);
    // escaping The Forest unlocks The Highway
    ui.lvlHighway.classList.toggle('locked', !endlessUnlocked);
    // the level after it: tell the player how to unlock it (once they have, it just isn't made yet)
    ui.unlockNote3.textContent = flag('escaped2') ? 'Coming soon' : 'Reach ' + Highway.LENGTH + ' m on The Highway to unlock';
  }
  ui.levelsBtn.addEventListener('click', () => { if (state === 'menu') showLevels(true); });
  ui.levelsClose.addEventListener('click', () => showLevels(false));
  ui.lvlForest.addEventListener('click', e => {
    if (e.target.closest('#lvlEndless') || state !== 'menu') return;
    showLevels(false);
    if (level !== 1) toLevel1Menu();
    startIntro();
  });
  ui.lvlHighway.addEventListener('click', () => {
    if (!endlessUnlocked) { shakeEl(ui.lvlHighway); return; }
    if (state !== 'menu') return;
    showLevels(false);
    if (level !== 2) useLevel(2);
    drive.startIntro();
  });
  ui.lvlEndless.addEventListener('click', () => {
    if (!endlessUnlocked) { shakeEl(ui.lvlEndless); return; }
    showLevels(false);
    if (level !== 1) toLevel1Menu();
    startEndless();
  });
  document.querySelectorAll('.level-card.locked').forEach(card => {
    Art.lockedCard(card.querySelector('canvas'));
    card.addEventListener('click', () => shakeEl(card));
  });
  Art.lockedCard(ui.lvlHighway.querySelector('.lock-cover canvas'));
  Art.lockedMini(ui.lvlEndless.querySelector('canvas'));

  // the end of the level
  ui.nextBtn.addEventListener('click', () => {
    if (state !== 'escaped') return;
    if (level === 1) {
      // on to The Highway: back in the truck where you left it
      useLevel(2);
      drive.toMenu();
      return;
    }
    shakeEl(ui.nextBtn);
    ui.comingSoon.classList.add('show');
  });
  ui.endlessBtn.addEventListener('click', () => { if (state === 'escaped') startEndless(); });
  ui.escMenuBtn.addEventListener('click', () => { if (state === 'escaped') toMenu(); });

  // The Forest's picture on its level card: the camp, rendered small, from the side.
  function snapshotCamp(target) {
    const cam = new THREE.PerspectiveCamera(32, target.width / target.height, 0.05, 40);
    cam.position.set(1.4, 1.2, -0.6);
    cam.lookAt(0.9, 0.5, camp.fireZ + 1.8); // fire and tent on the right, the name on the left
    snapshot(target, cam);
  }
  // The Highway's: your truck on the roadside in the rain, under the streetlight, hazards on.
  function snapshotHighway(target) {
    useLevel(2);
    drive.dress();
    scene.updateMatrixWorld(); // (where the highway is, before aiming at the truck on it)
    const cam = new THREE.PerspectiveCamera(30, target.width / target.height, 0.05, 60);
    cam.layers.enable(1); // (from out here: the trees in front of the truck and behind it)
    cam.layers.enable(2);
    hw.root.add(cam);
    cam.position.set(3.4, 1.2, -6.6);
    cam.lookAt(hw.root.localToWorld(new THREE.Vector3(-0.9, 1.5, 0.5)));
    cab.showHands(false); // (nobody in the driver's seat yet)
    snapshot(target, cam);
    cab.showHands(true);
    hw.root.remove(cam);
    useLevel(1);
  }
  // render a picture for a level card
  function snapshot(target, cam) {
    const w = target.width, h = target.height;
    const rt = new THREE.WebGLRenderTarget(w, h);
    const vmWasVisible = viewmodel.visible;
    viewmodel.visible = false;
    scene.updateMatrixWorld();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
    renderer.setRenderTarget(null);
    rt.dispose();
    viewmodel.visible = vmWasVisible;
    const ctx = target.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      img.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // it comes out upside down
    }
    ctx.putImageData(img, 0, 0);
    // darker at the bottom left, for the name
    const g = ctx.createLinearGradient(0, h, w * 0.7, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
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
  const player = { x: 0, d: 0, y: 0, vx: 0, vy: 0, speed: 0, stamina: 1, tired: false, stumble: 0, hitCooldown: 0 };
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
  // 'level': from the camp to the truck. 'endless': on from the truck, forever.
  let mode = 'level';
  let heardTruck = false;
  // the truck scenes
  let carT = -1, carScene = null, toastTime = 0;

  function setState(s) {
    state = s;
    stateTime = 0;
    // the next time the game opens, it opens where you last played
    if (s === 'menu' || s === 'intro') {
      try { localStorage.setItem('behindyou.lastLevel', String(level)); } catch (e) { /* ignore */ }
    }
    ui.menu.classList.toggle('hidden', s !== 'menu' && s !== 'intro');
    ui.menu.classList.toggle('fade', s === 'intro');
    ui.over.classList.toggle('hidden', s !== 'over');
    ui.escaped.classList.toggle('hidden', s !== 'escaped');
    ui.hud.classList.toggle('hidden', s !== 'play');
    ui.stick.classList.toggle('hidden', s !== 'play');
    ui.sprint.classList.toggle('hidden', s !== 'play' && s !== 'intro' && s !== 'endlessIntro');
  }

  // where endless runs start: in front of the truck
  const ENDLESS_X = -2.3, ENDLESS_D = 1998;

  function resetRun(newMode) {
    mode = newMode || 'level';
    const endless = mode === 'endless';
    player.x = endless ? ENDLESS_X : 0;
    player.d = endless ? ENDLESS_D : 0;
    player.y = 0; player.vx = 0; player.vy = 0; player.speed = 0;
    heardTruck = false;
    carT = -1; carScene = null;
    restoreTorch();
    finish.door.rotation.y = endless ? finish.DOOR_OPEN : 0;
    finish.car.rotation.z = 0;
    finish.setPower(0, 0);
    ui.set(ui.fade, 'opacity', '0');
    ui.toast.classList.add('hidden');
    jumpBuffer = 0; jumpArmed = true;
    seat = 1; lightOn = false; vmRaise = 1; introT = -1;
    viewmodel.visible = false;
    ui.hint.classList.add('hidden');
    player.stamina = 1; player.tired = false; player.stumble = 0; player.hitCooldown = 0;
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
    ui.set(ui.tunnel, 'transform', 'scale(2.4)');
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    world.reset(mode, player.d);
    world.update(player.d);
    ui.set(ui.staticCanvas, 'opacity', '0');
    ui.set(ui.danger, 'opacity', '0');
  }

  // The camp scene, timed in seconds from the tap:
  // you sit a while... a twig cracks... you look towards it, nothing... the other way, nothing...
  // you turn back, and there are two eyes where you just looked. Then you get up and run.
  const INTRO = {
    snap: 2.0,
    look1: [2.25, 2.6], look2: [2.9, 3.35], find: [3.6, 4.0],
    stand: [5.05, 5.65], turn: [5.1, 5.8], hide: 5.3, light: 5.45, run: 5.8
  };
  let introLook1 = 0, introLook2 = 0;

  function startIntro() {
    if (level === 2) {
      placeStickIdle();
      showSettings(false);
      showLevels(false);
      drive.startIntro();
      return;
    }
    if (mode !== 'level') resetRun('level');
    placeStickIdle();
    showSettings(false);
    showLevels(false);
    setState('intro');
    introT = 0;
    introBeats = 0;
    // where it stands; the crack comes from there
    introSide = Math.random() < 0.5 ? -1 : 1;
    const e = World.CAMP.eyes[introSide > 0 ? 1 : 0];
    // seated, facing the fire = yaw PI; turning towards +x makes the yaw bigger
    introLookYaw = Math.atan2(-e.x, e.d);
    if (introLookYaw < 0) introLookYaw += Math.PI * 2;
    // look towards the sound (it's too dark, you miss it), then the other way, then back: there it is
    introLook1 = Math.PI + (introLookYaw - Math.PI) * 0.8;
    introLook2 = Math.PI - introSide * 0.9;
    introLookPitch = Math.atan2(2.7 - SIT_EYE, Math.hypot(e.x, e.d));
    // then turn away from it to run (the forward direction is yaw 0, or a full turn)
    introRunYaw = introLookYaw > Math.PI ? Math.PI * 2 : 0;
    chaser.setMode('still');
    chaser.place(e.x, 0, -e.d, 0, 0, 3);
    chaser.root.visible = false;
  }

  function updateIntro(dt) {
    const t0 = introT;
    introT += dt;
    const at = time => t0 < time && introT >= time;
    if (at(INTRO.snap)) {
      // seated facing the fire, +x is on your left
      Sfx.snap(-introSide * 0.8);
      Sfx.setAmbience(0); // the crickets go quiet
    }
    if (at(INTRO.snap + 0.45)) {
      Sfx.heartbeat(0.3);
      Sfx.startBreathing();
      Sfx.setBreathing(0.35);
    }
    // it was there all along, somewhere you'd just looked
    if (at(INTRO.find[0])) chaser.root.visible = true;
    const beats = [4.0, 4.4, 4.75, 5.05, 5.32];
    if (beats.some(b => at(b))) {
      Sfx.heartbeat(0.45 + introBeats * 0.06);
      introBeats++;
      beatPulse = 1;
    }
    if (at(4.1)) Sfx.setBreathing(0.8);
    chaser.update(dt);
    if (at(INTRO.hide)) chaser.root.visible = false; // you've turned away: you never see it leave
    if (at(INTRO.light)) {
      lightOn = true;
      viewmodel.visible = true;
      Sfx.click();
    }
    beatPulse = Math.max(0, beatPulse - dt * 4);
    if (introT >= INTRO.run) {
      setState('play');
      player.speed = 3;
      Sfx.setAmbience(0.9);
    }
  }

  // After you've been caught: straight back on your feet and running, no camp scene.
  function runAgain() {
    if (level === 2) {
      placeStickIdle();
      drive.startPlay();
      return;
    }
    resetRun(mode);
    seat = 0;
    lightOn = true;
    viewmodel.visible = true;
    vmRaise = 0.6;
    placeStickIdle();
    setState('play');
    player.speed = 3;
    Sfx.setAmbience(0.9);
  }

  // Back to sitting by the fire.
  function toMenu() {
    if (level === 2) {
      drive.toMenu();
      return;
    }
    resetRun('level');
    setState('menu');
    Sfx.stopBreathing();
    Sfx.engineStop(0.5);
    Sfx.setAmbience(0.9);
  }

  // from The Highway back to sitting by the fire
  function toLevel1Menu() {
    useLevel(1);
    Sfx.engineStop(0.5);
    resetRun('level');
    setState('menu');
  }

  // the end of The Highway (for now: it fades out, and that's it)
  function finishHighway() {
    flag('escaped2', true);
    if (Highway.LENGTH > best2) {
      best2 = Highway.LENGTH;
      try { localStorage.setItem('behindyou.best2', String(best2)); } catch (e) { /* ignore */ }
    }
    showEscaped();
  }

  // the YOU ESCAPED screen, for whichever level you just finished
  function showEscaped() {
    ui.escapedSub.textContent = level === 2 ? 'The Highway \u00b7 ' + Highway.LENGTH + ' m' : 'The Forest \u00b7 ' + F.length + ' m';
    // after The Forest the next level is open; after The Highway it isn't made yet
    ui.nextBtn.classList.toggle('locked-btn', level === 2);
    ui.comingSoon.classList.remove('show');
    setState('escaped');
  }

  // ---- the truck ---------------------------------------------------------------
  // points in the truck's own coordinates (front +z, driver's side +x)
  const SEAT_EYE = [0.42, 1.58, 0.1];
  const DOOR_STAND = [1.9, 1.6, -0.3];   // outside, clear of the door as it swings open
  const PASSENGER_SEAT = [-0.45, 0.93, 0.05];
  const FACE_FRONT = Math.PI / 2;        // the yaw that looks out of the windscreen
  function carPos(p) { return finish.carPoint(p[0], p[1], p[2]); }

  // the flashlight back in your hand, its light back on your arm
  function restoreTorch() {
    viewmodel.add(torch);
    torch.position.set(0, 0, 0);
    torch.quaternion.identity();
    torch.scale.setScalar(1);
    arm.add(flashlight);
    flashlight.position.set(0.25, -0.25, 0);
    arm.add(flashlight.target);
    flashlight.target.position.set(0, -1.6, -10);
    handParts.visible = true;
  }
  // the light now comes from the flashlight itself, wherever it is
  function lightFromTorch() {
    torch.attach(flashlight);
    torch.attach(flashlight.target);
    flashlight.position.set(0, 0, -0.2);
    flashlight.target.position.set(0, -0.5, -4);
  }
  // lying on the passenger seat, shining at the dashboard
  const seatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 2.03, 0.35, 'YXZ'));
  function torchOnSeat() {
    scene.attach(torch);
    torch.position.copy(carPos(PASSENGER_SEAT));
    torch.quaternion.copy(seatQuat);
    torch.scale.setScalar(viewmodel.scale.x);
    lightFromTorch();
  }
  // the flashlight flying from one place to another (in its parent's coordinates)
  function flyTorch(t0, t1, to, toQuat, arc) {
    carScene.flight = {
      t0: t0, t1: t1, arc: arc,
      from: torch.position.clone(), fromQ: torch.quaternion.clone(), to: to, toQ: toQuat
    };
  }

  // Made it. Walk to the door, get in, the flashlight goes on the seat, door shut, start her up.
  function startEscape() {
    setState('escape');
    carT = 0;
    stick.id = null; stick.x = stick.y = 0;
    releaseSprint();
    lookT = -1; lookAmount = 0; caughtYaw = 0; closeCall = false;
    blackoutT = -1; flicker = 0; lightCut = 0;
    chaser.root.visible = false;
    watcher.root.visible = false;
    watcherActive = false;
    ui.hint.classList.add('hidden');
    ui.set(ui.danger, 'opacity', '0');
    ui.set(ui.tunnel, 'transform', 'scale(2.4)');
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    Sfx.setBreathing(0.9);

    const from = new THREE.Vector3(player.x, EYE_HEIGHT, -player.d);
    const stand = carPos(DOOR_STAND);
    const w = Math.max(0.6, Math.min(2.2, from.distanceTo(stand) / 4.5)); // walking to the door
    const Y = FACE_FRONT;
    carScene = {
      from: from, yaw: body.rotation.y, pitch: -0.06, walk: w, door0: 0,
      keys: [
        { t: [0, w], pos: stand, yaw: 0, pitch: -0.12 },
        { t: [w + 0.55, w + 1.3], pos: carPos(SEAT_EYE), yaw: Y, pitch: -0.05 },
        { t: [w + 1.3, w + 1.6], yaw: Y - 1.15, pitch: -0.55 }, // watch it land on the seat
        { t: [w + 2.0, w + 2.25], yaw: Y + 0.35, pitch: -0.05 }, // reach for the door
        { t: [w + 2.5, w + 2.8], yaw: Y, pitch: -0.02 }
      ],
      door: [[w + 0.05, w + 0.5, finish.DOOR_OPEN], [w + 2.05, w + 2.3, 0]],
      events: [
        [w + 0.05, () => Sfx.doorOpen()],
        [w + 1.45, () => {
          scene.attach(torch);
          lightFromTorch();
          vmRaise = 0;
          flyTorch(w + 1.45, w + 1.9, carPos(PASSENGER_SEAT), seatQuat, 0.25);
        }],
        [w + 1.6, () => { handParts.visible = false; }],
        [w + 1.9, () => Sfx.drop()],
        [w + 2.3, () => { Sfx.slam(); shake = 0.35; Sfx.setBreathing(0.6); }],
        [w + 2.7, () => Sfx.key()],
        [w + 2.9, () => { Sfx.crank(1.1, true); carScene.power = [0.3, 0]; }],
        [w + 4.0, () => { carScene.rumble = true; shake = 0.25; carScene.power = [1, 1]; }]
      ],
      fadeOut: [w + 4.3, w + 5.6],
      end: w + 6.1,
      done: finishEscape
    };
  }

  function finishEscape() {
    flag('escaped', true);
    endlessUnlocked = true;
    if (F.length > best) { best = F.length; saveBest(best); }
    showEscaped();
    Sfx.engineStop(2.5);
    Sfx.stopBreathing();
  }

  // Endless: you're back in the truck. It won't start. Something lands in the back. Run.
  function startEndless() {
    const first = !flag('endlessSeen');
    resetRun('endless');
    setState('endlessIntro');
    carT = 0;
    finish.door.rotation.y = 0;
    lightOn = true;
    viewmodel.visible = true;
    vmRaise = 1;
    torchOnSeat();
    handParts.visible = false;
    ui.set(ui.fade, 'opacity', '1');
    Sfx.engineStop(0.2);
    Sfx.setAmbience(0.6);
    Sfx.startBreathing();
    Sfx.setBreathing(0.5);
    placeStickIdle();

    const Y = FACE_FRONT;
    const seatEye = carPos(SEAT_EYE), stand = carPos(DOOR_STAND);
    const backOff = new THREE.Vector3(stand.x, EYE_HEIGHT, -(ENDLESS_D));
    const exit = new THREE.Vector3(ENDLESS_X, EYE_HEIGHT, -ENDLESS_D);
    carScene = {
      from: seatEye, yaw: Y, pitch: -0.04, door0: 0,
      keys: [
        { t: [4.85, 5.1], yaw: Y + 2.0, pitch: 0.05 },          // what was that? (towards the back)
        { t: [5.3, 5.55], yaw: Y - 1.15, pitch: -0.55 },        // the flashlight
        { t: [5.95, 6.35], pos: stand, yaw: 0.3, pitch: -0.05 }, // out
        { t: [6.35, 6.6], pos: backOff },                        // round the open door
        { t: [6.55, 7.1], pos: exit, yaw: 0, pitch: -0.06 }      // and across the road
      ],
      door: [[5.8, 6.05, finish.DOOR_OPEN]],
      events: [
        [0.7, () => Sfx.key()],
        [0.9, () => { Sfx.crank(1.3, false); carScene.power = [0.3, 0]; carScene.sputter = true; }],
        [2.6, () => { carScene.power = [0, 0]; carScene.sputter = false; }],
        [3.1, () => Sfx.key()],
        [3.3, () => { Sfx.crank(0.8, false); carScene.power = [0.25, 0]; carScene.sputter = true; }],
        [4.45, () => { carScene.power = [0, 0]; carScene.sputter = false; }],
        [4.8, () => {
          Sfx.thump();
          Sfx.setAmbience(0);
          Sfx.heartbeat(0.7);
          Sfx.setBreathing(0.95);
          shake = 0.5;
          beatPulse = 1;
          carScene.rockAt = 4.8;
        }],
        [5.2, () => Sfx.heartbeat(0.6)],
        [5.55, () => {
          handParts.visible = true;
          viewmodel.attach(torch);
          flyTorch(5.55, 5.85, new THREE.Vector3(), new THREE.Quaternion(), 0.1);
        }],
        [5.6, () => Sfx.heartbeat(0.6)],
        [5.8, () => Sfx.doorOpen()]
      ],
      fadeIn: [0, 1.0],
      end: 7.1,
      done: () => {
        restoreTorch();
        setState('play');
        player.speed = 3;
        Sfx.setAmbience(0.9);
        if (first) {
          flag('endlessSeen', true);
          ui.toast.classList.remove('hidden');
          toastTime = 4.6;
        }
      }
    };
  }

  // Plays whichever truck scene is on: moves your head, the door, the flashlight, the fade.
  function updateCarScene(dt) {
    const sc = carScene;
    const t0 = carT;
    carT += dt;
    sc.events.forEach(ev => { if (t0 < ev[0] && carT >= ev[0]) ev[1](); });

    const pos = sc.from.clone();
    let yaw = sc.yaw, pitch = sc.pitch;
    sc.keys.forEach(k => {
      const a = smooth(k.t[0], k.t[1], carT);
      if (k.pos) pos.lerp(k.pos, a);
      if (k.yaw !== undefined) yaw += (k.yaw - yaw) * a;
      if (k.pitch !== undefined) pitch += (k.pitch - pitch) * a;
    });
    if (sc.walk && carT < sc.walk) pos.y += Math.abs(Math.sin(carT * 9)) * 0.05; // hurrying to the door
    shake = Math.max(0, shake - dt);
    const tr = shake * 0.12 + (sc.rumble ? 0.005 : 0);
    body.position.set(pos.x + (Math.random() - 0.5) * tr, pos.y + (Math.random() - 0.5) * tr, pos.z);
    body.rotation.set(pitch, yaw, 0);
    camera.rotation.set(0, 0, 0);
    arm.rotation.set(0, 0, 0);
    ambient.intensity = AMBIENT;

    if (sc.power) {
      const flick = sc.sputter && Math.random() < 0.4 ? 0.3 : 1;
      finish.setPower(sc.power[0] * flick, sc.power[1]);
    }

    let door = sc.door0;
    sc.door.forEach(d => { door += (d[2] - door) * smooth(d[0], d[1], carT); });
    finish.door.rotation.y = door;
    if (sc.rockAt !== undefined) {
      const k = carT - sc.rockAt;
      finish.car.rotation.z = k > 0 ? Math.sin(k * 16) * 0.045 * Math.exp(-k * 2.5) : 0;
    }

    const f = sc.flight;
    if (f) {
      const a = smooth(f.t0, f.t1, carT);
      torch.position.lerpVectors(f.from, f.to, a);
      torch.position.y += Math.sin(Math.PI * a) * f.arc;
      torch.quaternion.slerpQuaternions(f.fromQ, f.toQ, a);
    }

    vmRaise = handParts.visible ? Math.max(0, vmRaise - dt * 3) : Math.min(1, vmRaise + dt * 3);
    viewmodel.position.set(vmBase.x, vmBase.y - vmRaise * vmRaise * 0.3, -0.42);
    flashlight.intensity = 2.4 * (0.97 + Math.random() * 0.03);
    lensMat.color.setScalar(1);

    if (sc.fadeOut) ui.set(ui.fade, 'opacity', smooth(sc.fadeOut[0], sc.fadeOut[1], carT).toFixed(3));
    if (sc.fadeIn) ui.set(ui.fade, 'opacity', (1 - smooth(sc.fadeIn[0], sc.fadeIn[1], carT)).toFixed(3));
    beatPulse = Math.max(0, beatPulse - dt * 4);

    if (carT >= sc.end) {
      carScene = null;
      sc.done();
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

  function finishCaught(driven) {
    const dist = level === 2 ? driven : runDistance();
    if (level === 2) {
      if (dist > best2) {
        best2 = dist;
        try { localStorage.setItem('behindyou.best2', String(dist)); } catch (e) { /* ignore */ }
      }
      ui.result.textContent = 'You drove ' + dist + ' of ' + Highway.LENGTH + ' meters.';
      ui.best.textContent = 'Furthest: ' + best2 + ' m';
    } else if (mode === 'endless') {
      if (dist > bestEndless) {
        bestEndless = dist;
        try { localStorage.setItem('behindyou.bestEndless', String(dist)); } catch (e) { /* ignore */ }
      }
      ui.result.textContent = 'You ran ' + dist + ' meters past the truck.';
      ui.best.textContent = 'Furthest (endless): ' + bestEndless + ' m';
    } else {
      if (dist > best) { best = dist; saveBest(best); }
      ui.result.textContent = 'You ran ' + dist + ' of ' + F.length + ' meters.';
      ui.best.textContent = 'Furthest: ' + best + ' m';
    }
    setState('over');
    chaser.root.visible = false;
    ui.set(ui.tunnel, 'transform', 'scale(2.4)');
    Sfx.setAmbience(0.6);
  }

  function runDistance() {
    return Math.max(0, Math.floor(player.d - (mode === 'endless' ? ENDLESS_D : 0)));
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
    // Sprint until you're nearly empty and you're out of breath: no sprinting,
    // and slower than your normal run until you've got your breath back.
    const sprinting = input.sprint && !player.tired;
    if (sprinting) {
      want = base * 1.4;
      player.stamina = Math.max(0, player.stamina - 0.3 * dt);
      if (player.stamina < TIRED_AT) player.tired = true;
    } else {
      player.stamina = Math.min(1, player.stamina + 0.14 * dt);
      if (player.tired && player.stamina >= RECOVERED_AT) player.tired = false;
      if (input.y < -0.35) want = base * 0.6;
      else if (player.tired) want = base * TIRED_SPEED;
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

    // made it: the truck
    if (mode === 'level' && player.d >= F.carD - 3.3) {
      startEscape();
      return;
    }
    // almost there: a lorry goes by on the highway somewhere ahead
    if (mode === 'level' && !heardTruck && player.d > 1850) {
      heardTruck = true;
      Sfx.passingTruck();
    }
    const finale = mode === 'level' && player.d > 1700;

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
      if (paceState === 'normal' && player.d > 250 && !finale && Math.random() < 0.6) {
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
      const chaserSpeed = base * (0.94 + Math.min(diff, 1) * 0.14) * pace;
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
    const effort = Math.max(close, sprinting ? 0.6 : 0.2, player.stumble > 0 || player.tired ? 0.9 : 0);
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
      if (blackoutTimer <= 0 && player.d > 150 && lookT < 0 && !(mode === 'level' && player.d > 1900)) {
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
      if (watcherTimer <= 0 && player.d > 250 && lookT < 0 && blackoutT < 0 && !(mode === 'level' && player.d > 1880)) {
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
    ui.set(ui.danger, 'opacity', (danger * 0.9 * (0.75 + 0.25 * beatPulse)).toFixed(3));
    const tunnel = 2.4 - Math.pow(close, 1.5) * 1.35 - beatPulse * close * 0.12;
    ui.set(ui.tunnel, 'transform', 'scale(' + tunnel.toFixed(3) + ')');
    camera.fov = baseFov * (1 - close * 0.06 + beatPulse * close * 0.025);
    camera.updateProjectionMatrix();

    // HUD
    ui.text(ui.distance, runDistance() + ' m');
    // stamina: the ring around the sprint button
    ui.set(ui.sprintRing, 'strokeDashoffset', (SPRINT_RING * (1 - player.stamina)).toFixed(1));
    ui.sprint.classList.toggle('low', player.stamina < 0.25 || player.tired);
    ui.sprint.classList.toggle('tired', player.tired);
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
    // out of breath: head hangs a little and sways heavily
    const tired = state === 'play' && player.tired ? 1 : 0;
    body.rotation.x = -0.06 - tired * 0.07 + Math.sin(bobPhase * 2) * (0.008 + tired * 0.012) * speedNorm;
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
      // each turn starts from wherever the last one ended
      const steps = [
        [INTRO.look1, introLook1, -0.03],
        [INTRO.look2, introLook2, 0],
        [INTRO.find, introLookYaw, introLookPitch],
        [INTRO.turn, introRunYaw, -0.06]
      ];
      steps.forEach(st => {
        const k = smooth(st[0][0], st[0][1], introT);
        yaw += (st[1] - yaw) * k;
        pitch += (st[2] - pitch) * k;
      });
      seat = 1 - smooth(INTRO.stand[0], INTRO.stand[1], introT);
    }
    // frozen, trembling, heart pounding
    const tremble = state === 'intro' && introT > INTRO.find[1] ? 0.006 + beatPulse * 0.01 : 0;
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

  // ---- Level 2: The Highway ----------------------------------------------------------
  // it, on all fours this time: it lives on the highway, behind your truck
  const crawler = Monster.create(scene, tex);
  hw.root.add(crawler.root);
  const drive = Drive.create({
    finish: finish, cab: cab, hw: hw, body: body, camera: camera, ui: ui, chaser: crawler,
    renderer: renderer, scene: scene, canvas: canvas,
    keys: keys, stick: stick, sprintBtn: sprintBtn,
    setState: setState, state: () => state, stateTime: () => stateTime, baseFov: () => baseFov2,
    drawStatic: drawStatic, flag: flag,
    releaseInput: () => { stick.id = null; stick.x = stick.y = 0; releaseSprint(); },
    onCaught: dist => finishCaught(dist),
    onEscaped: () => finishHighway()
  });

  // Which level's world is out there. The highway starts where your truck was parked,
  // so switching only hides the forest and puts you in the driver's seat.
  const FOG = { 1: [3, 21, 40], 2: [4, 46, 60] }; // fog from, fog to, how far the camera sees
  function useLevel(n) {
    level = n;
    document.body.classList.toggle('lvl2', n === 2);
    world.setVisible(n === 1);
    hw.root.visible = n === 2;
    finish.road.visible = n === 1;
    cab.setVisible(n === 2);
    // Every light in the scene costs something on every surface, even switched off. The campfire is far
    // behind the highway, so it's left out there. Both levels end up with the same set of lights
    // (2 spot lights, 4 others), so every surface needs getting ready only once (see the end of the file).
    camp.root.visible = n === 1;
    scene.fog.near = FOG[n][0];
    scene.fog.far = FOG[n][1];
    camera.far = FOG[n][2];
    camera.fov = n === 2 ? baseFov2 : baseFov;
    camera.updateProjectionMatrix();
    if (n === 2) {
      ui.hint.textContent = touchScreen ? 'HOLD BRAKE' : 'HOLD SPACE TO BRAKE';
      ui.lookText.textContent = touchScreen ? 'Tap to drive.' : 'Press any key to drive.';
    } else {
      ui.hint.textContent = touchScreen ? 'PUSH UP TO JUMP' : 'SPACE TO JUMP';
      ui.lookText.textContent = touchScreen ? 'Tap to look around.' : 'Press any key to look around.';
    }
    if (n === 2) {
      hw.root.add(finish.car);
      finish.car.add(body);
      drive.setupLights();
      // (the flashlight you tossed on the seat would otherwise stay floating where the truck was parked)
      restoreTorch();
      viewmodel.visible = false;
      lightOn = false;
      flashlight.intensity = 0;
    } else {
      drive.stop();
      finish.root.add(finish.car);
      finish.car.position.set(F.carX, 0, -F.carD);
      finish.car.rotation.set(0, -Math.PI / 2, 0);
      scene.add(body);
      finish.beams.distance = 30;
      finish.beams.angle = 0.45;
      finish.beams.penumbra = 0.6;
      finish.beams.target.position.set(0, 0, 14);
      finish.wheel.rotation.z = 0;
    }
  }

  // ---- main loop -------------------------------------------------------------
  let last = performance.now();
  let paused = false;
  const viewer = new THREE.Vector3();
  // On a very fast screen (120 times a second and more) every other frame is skipped, so the game runs
  // at about 60 there as everywhere else: plenty for its choppy look, half the work, a cooler phone.
  // (A 90 Hz screen still gets every frame.)
  const SHORTEST_FRAME = 9.5; // ms

  function frame(now) {
    requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    if (now - last < SHORTEST_FRAME) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    stateTime += dt;

    if (level === 2) {
      drive.update(dt);
    } else if (state === 'play') {
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
        ui.set(ui.staticCanvas, 'opacity', '1');
        drawStatic();
      }
      if (stateTime > 1.6) {
        ui.set(ui.staticCanvas, 'opacity', '0');
        ui.set(ui.danger, 'opacity', '0');
        finishCaught();
      }
    } else if (state === 'menu') {
      world.update(player.d);
    } else if (state === 'intro') {
      updateIntro(dt);
    } else if (state === 'escape' || state === 'endlessIntro') {
      updateCarScene(dt);
    }
    if (toastTime > 0) {
      toastTime -= dt;
      if (toastTime <= 0) ui.toast.classList.add('hidden');
    }

    // the highway lamp, glowing through the trees
    body.getWorldPosition(viewer);
    finish.update(dt, viewer, level === 1);

    // the campfire: still burning back there after you've run (on the highway it's far out of sight)
    if (level === 1) camp.update(dt, viewer);
    Sfx.setFire(state === 'caught' || state === 'over' ? 0 : camp.loudness(viewer));
    crackleTimer -= dt;
    if (crackleTimer <= 0) {
      crackleTimer = 0.04 + Math.random() * 0.4;
      Sfx.crackle();
    }

    // now and then, one cricket far away
    cricketTimer -= dt;
    if (cricketTimer <= 0) {
      cricketTimer = 3 + Math.random() * 4;
      if (state !== 'caught' && level === 1) Sfx.cricket();
    }

    if (level === 2) { /* the truck places the view */ }
    else if (state === 'menu' || state === 'intro') updateCampCamera(dt);
    else if (state === 'play' || state === 'caught') updateCamera(dt);
    // running ahead, the trees behind you can't be seen; any other time they can
    if (level === 1) world.setLookingBack(state !== 'play' || lookT >= 0);
    scene.updateMatrixWorld();
    // on the highway: what's behind you, in the rear-view mirror (it uses the same frame's positions)
    if (level === 2 && state !== 'over' && state !== 'escaped') cab.renderMirror(renderer, scene);
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

  // you open the game where you last played
  let lastLevel = '1';
  try { lastLevel = localStorage.getItem('behindyou.lastLevel') || '1'; } catch (e) { /* ignore */ }
  state = 'menu';
  resetRun();
  // the pictures on the level cards
  snapshotHighway(ui.highwayShot);
  snapshotCamp(ui.forestShot);
  // Get every surface ready now, while loading (the hidden ones too). Getting one ready the first time
  // it shows up (the deer, the smoke, its eyes) freezes the picture for a moment on a phone.
  renderer.compile(scene, camera);
  if (lastLevel === '2' && endlessUnlocked) {
    useLevel(2);
    drive.toMenu();
  } else {
    setState('menu');
  }
  requestAnimationFrame(frame);

  // handy for testing from the browser console
  window.__game = {
    lookNow: () => { lookTimer = 0; }, look: () => lookAmount,
    debug: () => ({ chaser: chaser.root.visible, watcher: watcher.root.visible, watcherActive: watcherActive, lookT: lookT, blackoutT: blackoutT, gap: gap }), setGap: v => { gap = v; },
    closeCall: () => { player.hitCooldown = 0; startLook(1.1, 0.15, true, true); },
    blackout: () => { blackoutTimer = 0; }, watcher: () => { watcherTimer = 0; player.d = Math.max(player.d, 260); },
    player: player, getGap: () => gap, getState: () => state, input: input, stick: stick,
    jump: requestJump, escape: () => { player.d = 1990; player.x = 1; },
    level2: () => { useLevel(2); drive.startPlay(); }, drive: drive, hw: hw, cab: cab,
    freeze: v => { paused = v; },
    endless: () => startEndless(), state: () => state, carT: () => carT, places: () => world.places(), logAhead: () => world.logAhead(player.d), introT: () => introT };
})();
