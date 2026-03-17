export const CONFIG = {
  title: "RagePuppy",
  tagline: "Tiny Dog. Huge Feelings.",
  world: { w: 960, h: 540 },

  gameplay: {
    deliveredToLose: 6,
    invulnAfterHitMs: 450,
    startSpawnMs: 1050,
    minSpawnMs: 360,
    difficultyRampPerSec: 0.015,
    maxThreats: 18,
    comboWindowMs: 1600,
  },

  player: {
    r: 14,
    baseSpeed: 260,
    accel: 1900,
    friction: 10.5,
    dashSpeed: 720,
    dashMs: 140,
    dashCooldownMs: 1200,
    barkCooldownMs: 420,
    barkRange: 110,
    barkArc: Math.PI * 0.75,
    barkKnock: 320,
    barkStunMs: 650,
  },

  chaos: {
    propFriction: 6.5,
    propBounce: 0.55,
    propMaxSpeed: 520,
  },

  ui: {
    shakeMs: 140,
    shakePx: 8,
  },

  unlocks: [
    { score: 0, id: "none", name: "No Hat", type: "accessory" },
    { score: 600, id: "cap", name: "Tiny Cap", type: "accessory" },
    { score: 1400, id: "sunnies", name: "Sunglasses", type: "accessory" },
    { score: 2600, id: "bee", name: "Bee Costume", type: "accessory" },
    { score: 4200, id: "dino", name: "Dino Hoodie", type: "accessory" },
  ],

  palette: {
    grassA: "#2bd36b",
    grassB: "#1aa85f",
    path: "#d8b892",
    porch: "#c9c4d6",
    fence: "#efe6d8",
    fenceLine: "rgba(20,30,55,.22)",
    shadow: "rgba(0,0,0,.22)",
    ink: "#0a0f1e",
    hot: "#ff4d6d",
    hot2: "#ffcc57",
    good: "#4dffb5",
  },
};

