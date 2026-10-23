// All sound is synthesized with the Web Audio API: no files to download.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let cricketGain = null;
  let ambience = 0;
  let breathBuf = null, breathSrc = null, breathGain = null;
  let chirpBufs = [];
  let fireGain = null, fireLevel = 0;
  let engine = null;
  let roadGain = null, roadFilter = null, screechGain = null, screechFilter = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    // A compressor keeps the loud close-up footsteps from distorting.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);

    // 2 seconds of white noise, reused for everything noisy
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // A few pre-made cricket chirps; one plays now and then, far away.
    for (let i = 0; i < 4; i++) chirpBufs.push(makeChirpBuffer());
    cricketGain = ctx.createGain();
    cricketGain.gain.value = 0;
    // far away = muffled
    const far = ctx.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 4500;
    cricketGain.connect(far);
    far.connect(master);

    // The campfire: a soft, low roar that loops. Crackles are played on top (Sfx.crackle).
    fireGain = ctx.createGain();
    fireGain.gain.value = 0;
    const roar = ctx.createBufferSource();
    roar.buffer = noiseBuf;
    roar.loop = true;
    const roarF = ctx.createBiquadFilter();
    roarF.type = 'lowpass';
    roarF.frequency.value = 380;
    roar.connect(roarF);
    roarF.connect(fireGain);
    fireGain.connect(master);
    roar.start();

    // Breathing recording (embedded in js/breathing-data.js so it also works from a local file)
    breathGain = ctx.createGain();
    breathGain.gain.value = 0.35;
    breathGain.connect(master);
    if (window.BREATHING_B64) {
      const bin = atob(window.BREATHING_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer, function (b) { breathBuf = b; }, function () {});
    }
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  // ---- pre-rendered sounds ---------------------------------------------------

  // One cricket chirp (a few quick pulses), with a faint echo from the trees.
  function makeChirpBuffer() {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.6);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const TAU = Math.PI * 2;
    const f = 4000 + Math.random() * 900;
    const pulses = 2 + Math.floor(Math.random() * 3);
    const pulseRate = 26 + Math.random() * 10;
    const pulseLen = Math.floor(sr * 0.6 / pulseRate);
    for (let p = 0; p < pulses; p++) {
      const start = Math.floor(p / pulseRate * sr);
      for (let i = 0; i < pulseLen; i++) {
        const env = Math.pow(Math.sin(Math.PI * i / pulseLen), 2);
        d[start + i] += Math.sin(TAU * f * (start + i) / sr) * env;
      }
    }
    const echo = Math.floor(sr * 0.11);
    for (let i = len - 1; i >= echo; i--) d[i] += d[i - echo] * 0.25;
    return buf;
  }

  // ---- small building blocks -------------------------------------------------

  function out(node, pan) {
    if (pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(master);
    } else {
      node.connect(master);
    }
  }

  function noise(dur, type, freq, q, vol, pan, delay) {
    if (!ctx || !(vol > 0.0005)) return;
    const t = now() + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    out(g, pan);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function tone(freq, endFreq, dur, vol, type, delay) {
    if (!ctx || !(vol > 0.0005)) return;
    const t = now() + (delay || 0);
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  window.Sfx = {
    init: init,
    // crickets volume (they go quiet when it's close)
    setAmbience: function (v) {
      if (!cricketGain || Math.abs(v - ambience) < 0.02) return;
      ambience = v;
      cricketGain.gain.setTargetAtTime(v, now(), 0.6);
    },
    // Our own footstep on leaves
    step: function () {
      noise(0.09, 'bandpass', 900 + Math.random() * 600, 0.8, 0.08);
      noise(0.06, 'lowpass', 200, 1, 0.1);
    },
    // Breathing: the supplied recording, looped. level 0..1 sets how loud/fast it is.
    startBreathing: function () {
      if (!ctx || !breathBuf || breathSrc) return;
      breathSrc = ctx.createBufferSource();
      breathSrc.buffer = breathBuf;
      breathSrc.loop = true;
      breathSrc.connect(breathGain);
      breathSrc.start(0, Math.random() * 5);
    },
    stopBreathing: function () {
      if (breathSrc) { try { breathSrc.stop(); } catch (e) { /* already stopped */ } breathSrc = null; }
    },
    setBreathing: function (level) {
      if (!breathGain) return;
      const t = now();
      breathGain.gain.setTargetAtTime(0.35 + level * 0.65, t, 0.3);
      if (breathSrc) breathSrc.playbackRate.setTargetAtTime(0.95 + level * 0.2, t, 0.5);
    },
    // A single cricket somewhere far off in the dark
    cricket: function () {
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = chirpBufs[Math.floor(Math.random() * chirpBufs.length)];
      const g = ctx.createGain();
      g.gain.value = 0.025 + Math.random() * 0.02;
      src.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = (Math.random() - 0.5) * 1.6;
        g.connect(p);
        p.connect(cricketGain);
      } else {
        g.connect(cricketGain);
      }
      src.start();
    },
    // the campfire's volume (0..1)
    setFire: function (v) {
      if (!fireGain || Math.abs(v - fireLevel) < 0.01) return;
      fireLevel = v;
      fireGain.gain.setTargetAtTime(v * 0.12, now(), 0.3);
    },
    // one pop of the fire
    crackle: function () {
      if (fireLevel < 0.02) return;
      const v = fireLevel * (0.05 + Math.random() * 0.12);
      noise(0.02 + Math.random() * 0.03, 'highpass', 1500 + Math.random() * 2500, 0.7, v, (Math.random() - 0.5) * 0.3);
      if (Math.random() < 0.3) noise(0.015, 'bandpass', 3000, 1, v * 0.8, 0, 0.03 + Math.random() * 0.05);
    },
    // a branch snapping somewhere in the dark (pan: -1 left .. 1 right)
    snap: function (pan) {
      noise(0.05, 'bandpass', 2200, 1.5, 0.55, pan);
      noise(0.03, 'bandpass', 3400, 2, 0.35, pan, 0.045);
      noise(0.08, 'bandpass', 1500, 1.2, 0.4, pan, 0.08);
      noise(0.2, 'lowpass', 300, 1, 0.25, pan, 0.02);
      // ...and leaves rustling as something shifts its weight
      noise(0.5, 'bandpass', 2400, 0.6, 0.06, pan, 0.25);
    },
    // the flashlight switch
    click: function () {
      noise(0.012, 'bandpass', 4200, 3, 0.35);
      noise(0.015, 'bandpass', 2600, 3, 0.25, 0, 0.07);
    },
    // pushing off for a jump, and landing on leaves
    jump: function () {
      noise(0.12, 'bandpass', 700, 1, 0.12);
    },
    land: function () {
      noise(0.14, 'bandpass', 1100, 0.8, 0.22);
      noise(0.12, 'lowpass', 180, 1, 0.3);
    },
    // ---- the truck ----------------------------------------------------------
    doorOpen: function () {
      noise(0.05, 'bandpass', 1800, 2, 0.3);                       // the latch
      tone(520, 380, 0.35, 0.05, 'sawtooth', 0.06);                // the hinge creaks
      tone(610, 450, 0.25, 0.03, 'sawtooth', 0.2);
    },
    slam: function () {
      tone(90, 40, 0.3, 0.6, 'triangle');
      noise(0.25, 'lowpass', 700, 1, 0.6);
      noise(0.06, 'bandpass', 2500, 2, 0.25, 0, 0.01);
    },
    // the flashlight landing on the seat
    drop: function () {
      noise(0.1, 'lowpass', 400, 1, 0.35);
      noise(0.03, 'bandpass', 2000, 2, 0.12, 0, 0.02);
    },
    key: function () {
      noise(0.015, 'bandpass', 3500, 3, 0.3);
      noise(0.02, 'bandpass', 2800, 3, 0.25, 0, 0.12);
    },
    // the starter turning the engine over: rr-rr-rr. dur in seconds.
    // catches: the engine starts at the end. If not, it coughs and dies.
    crank: function (dur, catches) {
      if (!ctx) return;
      const n = Math.floor(dur / 0.13);
      for (let i = 0; i < n; i++) {
        const t = i * 0.13 + (catches ? 0 : Math.random() * 0.04);
        noise(0.1, 'lowpass', 520, 1.2, 0.32, 0, t);
        tone(95, 70, 0.09, 0.18, 'sawtooth', t);
      }
      if (catches) {
        window.Sfx.engineStart(dur);
      } else {
        // a couple of sputters, then nothing
        tone(55, 35, 0.18, 0.4, 'square', dur + 0.05);
        noise(0.12, 'lowpass', 300, 1, 0.4, 0, dur + 0.05);
        tone(50, 30, 0.25, 0.3, 'square', dur + 0.35);
        noise(0.08, 'bandpass', 1200, 1, 0.12, 0, dur + 0.7);
      }
    },
    // the engine running: a low, rough rumble
    engineStart: function (delay) {
      if (!ctx || engine) return;
      const t = now() + (delay || 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.9);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const oscs = [36, 72.5, 18.2].map((fr, i) => {
        const o = ctx.createOscillator();
        o.type = i === 1 ? 'square' : 'sawtooth';
        o.frequency.setValueAtTime(fr * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(fr, t + 0.9); // revs, then settles
        o.connect(f);
        o.start(t);
        return o;
      });
      f.connect(g);
      g.connect(master);
      engine = { g: g, f: f, oscs: oscs, base: [36, 72.5, 18.2] };
    },
    // the engine while driving: rpm 0..1, rough 0..1 (choking: it misses and stutters)
    setEngine: function (rpm, rough) {
      if (!engine) return;
      const t = now();
      const miss = rough > 0 && Math.random() < rough * 0.5;
      const k = (0.8 + rpm * 1.25) * (miss ? 0.55 : 1);
      engine.oscs.forEach((o, i) => {
        o.frequency.cancelScheduledValues(t);
        o.frequency.setTargetAtTime(engine.base[i] * k, t, miss ? 0.02 : 0.08);
      });
      engine.g.gain.cancelScheduledValues(t);
      engine.g.gain.setTargetAtTime((0.13 + rpm * 0.13) * (miss ? 0.2 : 1), t, 0.04);
      engine.f.frequency.setTargetAtTime(220 + rpm * 260, t, 0.1);
    },
    // the engine choking: a few hard coughs
    sputter: function () {
      tone(55, 35, 0.18, 0.45, 'square');
      noise(0.14, 'lowpass', 300, 1, 0.45);
      tone(48, 30, 0.22, 0.35, 'square', 0.32);
      noise(0.1, 'lowpass', 260, 1, 0.35, 0, 0.32);
      tone(60, 40, 0.15, 0.3, 'square', 0.7);
    },
    // ...and catching again: a quick rev
    engineCatch: function () {
      tone(50, 95, 0.35, 0.25, 'sawtooth');
      noise(0.2, 'lowpass', 400, 1, 0.2);
    },
    // tyres on the road (speed 0..1); rough: off the road, on the bumpy verge (0..1)
    setRoad: function (speed, rough) {
      if (!ctx) return;
      if (!roadGain) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        roadFilter = ctx.createBiquadFilter();
        roadFilter.type = 'lowpass';
        roadFilter.frequency.value = 300;
        roadGain = ctx.createGain();
        roadGain.gain.value = 0;
        src.connect(roadFilter);
        roadFilter.connect(roadGain);
        roadGain.connect(master);
        src.start();
      }
      const t = now();
      roadGain.gain.setTargetAtTime(speed * 0.09 + rough * 0.22, t, 0.1);
      roadFilter.frequency.setTargetAtTime(160 + speed * 260 + rough * 500, t, 0.1);
      if (rough > 0 && Math.random() < rough * 0.15) noise(0.08, 'lowpass', 200, 1, 0.3 * rough);
    },
    // tyres screeching under hard braking (0..1)
    setScreech: function (v) {
      if (!ctx) return;
      if (!screechGain) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        screechFilter = ctx.createBiquadFilter();
        screechFilter.type = 'bandpass';
        screechFilter.frequency.value = 2300;
        screechFilter.Q.value = 6;
        screechGain = ctx.createGain();
        screechGain.gain.value = 0;
        src.connect(screechFilter);
        screechFilter.connect(screechGain);
        screechGain.connect(master);
        src.start();
      }
      const t = now();
      screechGain.gain.setTargetAtTime(v * 0.35, t, 0.06);
      screechFilter.frequency.setTargetAtTime(2100 + Math.random() * 500, t, 0.05);
    },
    engineStop: function (fade) {
      if (!engine) return;
      const t = now();
      engine.g.gain.cancelScheduledValues(t);
      engine.g.gain.setTargetAtTime(0.0001, t, (fade || 1) / 4);
      engine.oscs.forEach(o => o.stop(t + (fade || 1) + 0.1));
      engine = null;
    },
    // something heavy landing in the back of the truck
    thump: function () {
      tone(70, 30, 0.45, 0.8, 'triangle');
      noise(0.4, 'lowpass', 500, 1, 0.8);
      noise(0.15, 'bandpass', 900, 1, 0.3, 0, 0.03);
      noise(0.5, 'lowpass', 300, 1, 0.25, 0, 0.35); // the springs settling
    },
    // a lorry going by on the highway, somewhere ahead
    passingTruck: function () {
      if (!ctx) return;
      const t = now();
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 2.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      src.connect(f);
      f.connect(g);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(-0.8, t);
        p.pan.linearRampToValueAtTime(0.8, t + 6);
        g.connect(p);
        p.connect(master);
      } else {
        g.connect(master);
      }
      src.start(t);
      src.stop(t + 6.2);
      tone(58, 52, 5, 0.06, 'sawtooth', 0.5);
    },
    // it slams into the truck: a heavy bang, bent metal, rattling glass (pan: -1 left .. 1 right)
    crunch: function (pan) {
      tone(80, 32, 0.5, 0.9, 'triangle');
      noise(0.45, 'lowpass', 900, 1, 0.9, pan);
      noise(0.3, 'bandpass', 1400, 3, 0.35, pan, 0.02);
      tone(340, 210, 0.35, 0.08, 'square', 0.03);
      tone(510, 330, 0.3, 0.05, 'square', 0.06);
      noise(0.25, 'highpass', 5000, 1, 0.12, pan, 0.1);
    },
    // branches scraping down the side of the truck
    scrape: function () {
      for (let i = 0; i < 5; i++) noise(0.07, 'bandpass', 1800 + Math.random() * 1600, 2, 0.12, 0, i * 0.06 + Math.random() * 0.03);
    },
    heartbeat: function (vol) {
      tone(55, 40, 0.12, vol);
      tone(50, 36, 0.14, vol * 0.75, 'sine', 0.16);
    },
    hit: function () {
      tone(120, 45, 0.25, 0.5, 'triangle');
      noise(0.25, 'lowpass', 600, 1, 0.5);
      noise(0.15, 'bandpass', 1800, 2, 0.2);
    },
    caught: function () {
      noise(1.4, 'lowpass', 4000, 0.5, 0.9);
      tone(180, 30, 1.4, 0.5, 'sawtooth');
      tone(93, 25, 1.6, 0.5, 'square');
    }
  };
})();
