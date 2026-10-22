// All sound is synthesized with the Web Audio API: no files to download.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let cricketGain = null;
  let ambience = 0;
  let crackBufs = [];

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

    // A few pre-made twig cracks, so playing one costs nothing.
    for (let i = 0; i < 5; i++) crackBufs.push(makeCrackBuffer());

    // Midnight crickets: one looping stereo recording made at startup.
    const src = ctx.createBufferSource();
    src.buffer = makeCricketBuffer(12);
    src.loop = true;
    cricketGain = ctx.createGain();
    cricketGain.gain.value = 0;
    src.connect(cricketGain);
    cricketGain.connect(master);
    src.start();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  // ---- pre-rendered sounds ---------------------------------------------------

  // Several crickets at different pitches, places and rhythms.
  function makeCricketBuffer(seconds) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const TAU = Math.PI * 2;

    for (let c = 0; c < 7; c++) {
      const f = 3800 + Math.random() * 1600;
      const pan = Math.random() * 2 - 1;
      const amp = 0.05 + Math.random() * 0.13;   // near or far
      const gl = amp * Math.sqrt((1 - pan) / 2), gr = amp * Math.sqrt((1 + pan) / 2);
      const period = 0.55 + Math.random() * 0.9;  // time between chirps
      const pulses = 2 + Math.floor(Math.random() * 3);
      const pulseRate = 24 + Math.random() * 16;  // pulses per second inside a chirp
      const pulseLen = Math.floor(sr * 0.65 / pulseRate);

      let t = Math.random() * period;
      while (t < seconds - 0.3) {
        for (let p = 0; p < pulses; p++) {
          const start = Math.floor((t + p / pulseRate) * sr);
          for (let i = 0; i < pulseLen; i++) {
            const k = start + i;
            const time = k / sr;
            const env = Math.pow(Math.sin(Math.PI * i / pulseLen), 2);
            const s = (Math.sin(TAU * f * time) + 0.2 * Math.sin(TAU * f * 2 * time)) * env;
            L[k] += s * gl;
            R[k] += s * gr;
          }
        }
        t += period * (0.85 + Math.random() * 0.3);
        // crickets sometimes pause
        if (Math.random() < 0.08) t += 1 + Math.random() * 2;
      }
    }
    return buf;
  }

  // A real twig crack: a sharp break, splinters, a woody knock, then crackling.
  function makeCrackBuffer() {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.4);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const TAU = Math.PI * 2;

    function snapAt(time, amp) {
      const start = Math.floor(time * sr);
      // the break itself: a very short burst of noise
      const burst = Math.floor(sr * (0.002 + Math.random() * 0.005));
      for (let i = 0; i < burst && start + i < len; i++) {
        d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-4 * i / burst);
      }
      // the wood rings for a moment (two quick-dying tones)
      const f1 = 1100 + Math.random() * 1400, f2 = 2600 + Math.random() * 2200;
      const ring = Math.floor(sr * 0.05);
      const k1 = 1 / (sr * (0.008 + Math.random() * 0.012)), k2 = 1 / (sr * 0.006);
      for (let i = 0; i < ring && start + i < len; i++) {
        d[start + i] += amp * (0.55 * Math.sin(TAU * f1 * i / sr) * Math.exp(-i * k1) +
                               0.3 * Math.sin(TAU * f2 * i / sr) * Math.exp(-i * k2));
      }
    }

    // main crack + splinters
    snapAt(0, 1);
    const splinters = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < splinters; i++) snapAt(0.004 + Math.random() * 0.05, 0.2 + Math.random() * 0.4);
    // often the branch gives way a second time
    if (Math.random() < 0.75) {
      const t2 = 0.07 + Math.random() * 0.1;
      snapAt(t2, 0.6 + Math.random() * 0.4);
      for (let i = 0; i < 3; i++) snapAt(t2 + Math.random() * 0.04, 0.15 + Math.random() * 0.3);
    }
    // fading crackle
    for (let i = 0; i < 10; i++) {
      const t = 0.03 + Math.pow(Math.random(), 1.5) * 0.3;
      snapAt(t, (0.25 - t * 0.6) * Math.random());
    }

    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
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

  // One breath (in or out). "fear" 0..1 makes it shakier, and adds a whimper.
  function breath(inhale, dur, vol, fear) {
    if (!ctx || !(vol > 0.0005)) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = inhale ? 1.4 : 0.9;
    if (inhale) {
      bp.frequency.setValueAtTime(1300, t);
      bp.frequency.linearRampToValueAtTime(2100, t + dur);
    } else {
      bp.frequency.setValueAtTime(1000, t);
      bp.frequency.linearRampToValueAtTime(650, t + dur);
    }

    // envelope: inhales swell slowly, exhales push out fast
    const env = ctx.createGain();
    const peakAt = t + dur * (inhale ? 0.6 : 0.2);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, peakAt);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // the shake: the breath trembles in uneven little pulses
    const shake = ctx.createGain();
    shake.gain.setValueAtTime(1, t);
    const depth = 0.35 + fear * 0.55;
    for (let s = t; s < t + dur; s += 0.03 + Math.random() * 0.04) {
      shake.gain.linearRampToValueAtTime(1 - depth * Math.random(), s);
    }

    src.connect(hp);
    hp.connect(bp);
    bp.connect(env);
    env.connect(shake);
    shake.connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.05);

    // a quiet, trembling whimper in some of the scared exhales
    if (!inhale && fear > 0.45 && Math.random() < 0.5) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 210 + Math.random() * 60;
      o.frequency.setValueAtTime(f0, t);
      for (let s = t; s < t + dur; s += 0.04) {
        o.frequency.linearRampToValueAtTime(f0 * (0.94 + Math.random() * 0.1), s);
      }
      o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
      const vf = ctx.createBiquadFilter();
      vf.type = 'bandpass';
      vf.frequency.value = 750;
      vf.Q.value = 3;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.exponentialRampToValueAtTime(vol * 0.35 * fear, t + dur * 0.25);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(vf);
      vf.connect(vg);
      vg.connect(shake);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
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
    // Its footsteps: heavy, and louder + sharper the closer it is (close: 0 far .. 1 right behind)
    chaserStep: function (vol, close) {
      if (!ctx) return;
      const pan = (Math.random() - 0.5) * 0.5;
      tone(95, 34, 0.32, vol * 0.9);                                  // body thud
      tone(52, 28, 0.42, vol * 0.8);                                  // weight
      noise(0.2, 'lowpass', 220 + close * 500, 1, vol * 0.9, pan);    // impact on the ground
      noise(0.16, 'bandpass', 900 + close * 900, 0.7, vol * (0.25 + close * 0.45), pan, 0.012); // leaves crushed
    },
    breathIn: function (dur, vol, fear) { breath(true, dur, vol, fear); },
    breathOut: function (dur, vol, fear) { breath(false, dur, vol, fear); },
    gasp: function () { breath(true, 0.28, 0.5, 1); },
    // Twig cracking somewhere behind (dist 0 near .. 1 far: far ones sound more muffled)
    snap: function (vol, dist) {
      if (!ctx) return;
      const t = now();
      const src = ctx.createBufferSource();
      src.buffer = crackBufs[Math.floor(Math.random() * crackBufs.length)];
      src.playbackRate.value = 0.85 + Math.random() * 0.35;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000 - dist * 6000;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(lp);
      lp.connect(g);
      out(g, (Math.random() - 0.5) * 1.4);
      src.start(t);
      // the weight that broke it, and leaves shuffling
      tone(140, 60, 0.08, vol * 0.25);
      noise(0.22, 'bandpass', 1400, 0.6, vol * 0.18, 0, 0.03);
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
