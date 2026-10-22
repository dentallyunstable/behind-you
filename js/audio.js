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
