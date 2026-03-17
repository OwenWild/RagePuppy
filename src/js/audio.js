// Lightweight oscillator-based sounds for RagePuppy, no external assets.

let ctx = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

function beep({ freq = 440, dur = 0.1, type = "square", gain = 0.2 }) {
  if (muted) return;
  const ac = ensureCtx();
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

export function playSound(name) {
  switch (name) {
    case "bark":
      beep({ freq: 520, dur: 0.07, type: "square", gain: 0.25 });
      beep({ freq: 880, dur: 0.05, type: "square", gain: 0.2 });
      break;
    case "dash":
      beep({ freq: 260, dur: 0.08, type: "sawtooth", gain: 0.22 });
      break;
    case "hit":
      beep({ freq: 180, dur: 0.09, type: "triangle", gain: 0.23 });
      break;
    case "combo":
      beep({ freq: 620, dur: 0.06, type: "square", gain: 0.18 });
      beep({ freq: 920, dur: 0.08, type: "square", gain: 0.18 });
      break;
    case "fail":
      beep({ freq: 260, dur: 0.14, type: "square", gain: 0.25 });
      beep({ freq: 160, dur: 0.22, type: "square", gain: 0.22 });
      break;
    default:
      break;
  }
}

export function setMuted(v) {
  muted = !!v;
}

export function isMuted() {
  return muted;
}

