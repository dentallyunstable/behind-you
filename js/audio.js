// All sound is synthesized with the Web Audio API: no files to download.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let windGain = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // 2 seconds of white noise, reused for everything noisy
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Wind: looping filtered noise, slowly swelling
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    src.connect(lp);
    lp.connect(windGain);
    windGain.connect(master);
    src.start();
    lfo.start();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function noise(dur, type, freq, q, vol, pan) {
    if (!ctx) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    let out = g;
    if (pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function tone(freq, endFreq, dur, vol, type) {
    if (!ctx) return;
    const t = now();
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  window.Sfx = {
    init: init,
    setWind: function (v) {
      if (windGain) windGain.gain.setTargetAtTime(v, now(), 0.5);
    },
    // Our own footstep on leaves
    step: function () {
      noise(0.09, 'bandpass', 900 + Math.random() * 600, 0.8, 0.10);
      noise(0.06, 'lowpass', 200, 1, 0.12);
    },
    // Its footsteps: heavier, lower, from behind
    chaserStep: function (vol) {
      if (vol < 0.01) return;
      tone(70, 38, 0.18, vol * 0.6);
      noise(0.14, 'lowpass', 260, 1, vol * 0.5, (Math.random() - 0.5) * 0.6);
    },
    // Twig snapping somewhere behind
    snap: function (vol) {
      noise(0.04, 'highpass', 2500, 1, vol, (Math.random() - 0.5) * 1.6);
      setTimeout(function () { noise(0.03, 'highpass', 3000, 1, vol * 0.6); }, 40 + Math.random() * 50);
    },
    heartbeat: function (vol) {
      tone(55, 40, 0.12, vol);
      setTimeout(function () { tone(50, 36, 0.14, vol * 0.75); }, 160);
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
