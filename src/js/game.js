import { CONFIG } from "./config.js";
import { clamp, normalize, circleHit, angleOf, wrapAngle } from "./util.js";
import { createThreat, updateThreat, createProp, applyKnock } from "./entities.js";
import { recordRun } from "./storage.js";
import { playSound } from "./audio.js";

// Core game state & update loop: movement, threats, scoring, combos.

export function createGame() {
  const { world, player: pc, gameplay } = CONFIG;

  const state = {
    mode: "menu", // menu | running | paused | gameOver
    time: 0,
    player: {
      x: world.w * 0.5,
      y: world.h * 0.65,
      vx: 0,
      vy: 0,
      r: pc.r,
      state: "idle",
      faceAngle: -Math.PI / 2,
      furColor: "#f6bf6b",
      collarColor: "#ff4d6d",
    },
    barkCooldown: 0,
    dashCooldown: 0,
    dashTime: 0,
    // gameplay
    threats: [],
    props: [],
    score: 0,
    combo: 1,
    comboTimer: 0,
    delivered: 0,
    spawnTimer: 0,
    spawnInterval: gameplay.startSpawnMs,
    justEnded: false,
    saveData: null,
  };

  function resetForRun() {
    state.time = 0;
    state.player.x = world.w * 0.5;
    state.player.y = world.h * 0.65;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.state = "idle";
    state.barkCooldown = 0;
    state.dashCooldown = 0;
    state.dashTime = 0;
    state.threats = [];
    state.props = [
      createProp("flower", world.w * 0.3, world.h * 0.7),
      createProp("slipper", world.w * 0.7, world.h * 0.72),
      createProp("toy", world.w * 0.55, world.h * 0.8),
    ];
    state.score = 0;
    state.combo = 1;
    state.comboTimer = 0;
    state.delivered = 0;
    state.spawnTimer = 0;
    state.spawnInterval = gameplay.startSpawnMs;
    state.justEnded = false;
  }

  function startRun() {
    state.mode = "running";
    resetForRun();
  }

  function applyScore(base, label) {
    const gained = base * state.combo;
    state.score += gained;
    state.combo = Math.min(state.combo + 0.2, 6);
    state.comboTimer = CONFIG.gameplay.comboWindowMs;
    // label currently only affects potential future VFX; kept for extension.
    void label;
  }

  function endRun(save) {
    state.mode = "gameOver";
    state.justEnded = true;
    if (save) {
      recordRun(save, state.score);
    }
  }

  function spawnThreat(t) {
    if (t) state.threats.push(t);
  }

  function maybeSpawn(dtMs) {
    state.spawnTimer += dtMs;
    if (state.spawnTimer < state.spawnInterval) return;
    state.spawnTimer = 0;
    if (state.threats.length >= CONFIG.gameplay.maxThreats) return;

    const t = state.time;
    const choices = ["mailman", "leaf"];
    if (t > 10) choices.push("squirrel");
    if (t > 18) choices.push("box");
    if (t > 25) choices.push("bike");
    const kind = choices[Math.floor(Math.random() * choices.length)];
    spawnThreat(createThreat(kind, state.time));

    const min = CONFIG.gameplay.minSpawnMs;
    const ramp = CONFIG.gameplay.difficultyRampPerSec;
    state.spawnInterval = Math.max(min, state.spawnInterval - ramp * dtMs);
  }

  function handleBark(p) {
    const range = CONFIG.player.barkRange;
    const arc = CONFIG.player.barkArc;
    const originX = p.x;
    const originY = p.y;
    const face = p.faceAngle;

    let any = false;
    state.threats.forEach((th) => {
      if (!circleHit(originX, originY, range, th.x, th.y, th.r)) return;
      const ang = angleOf(th.x - originX, th.y - originY);
      const diff = Math.abs(wrapAngle(ang - face));
      if (diff > arc * 0.5) return;
      applyKnock(th, originX, originY, CONFIG.player.barkKnock);
      th.stunnedMs = Math.max(th.stunnedMs || 0, CONFIG.player.barkStunMs);
      th.hp -= 1;
      any = true;
    });
    if (any) {
      playSound("bark");
      applyScore(40, "BORK!");
    }
  }

  function handleDashCollisions(p) {
    const r = p.r + 6;
    let hit = false;
    state.threats.forEach((th) => {
      if (circleHit(p.x, p.y, r, th.x, th.y, th.r)) {
        applyKnock(th, p.x, p.y, CONFIG.player.barkKnock * 0.9);
        th.hp -= 1;
        hit = true;
      }
    });
    state.props.forEach((pr) => {
      if (circleHit(p.x, p.y, r, pr.x, pr.y, pr.r)) {
        applyKnock(pr, p.x, p.y, 280);
        hit = true;
      }
    });
    if (hit) {
      playSound("dash");
      applyScore(30, "Zoomies!");
    }
  }

  function update(dt, input) {
    const dtMs = dt * 1000;
    state.time += dt;
    state.justEnded = false;
    if (state.mode !== "running") return;

    const p = state.player;
    const { moveX, moveY, barkPressed, dashPressed, pausePressed } = input || {};

    if (pausePressed) {
      state.mode = "paused";
      return;
    }

    // Cooldowns & combo timer
    state.barkCooldown = Math.max(0, state.barkCooldown - dtMs);
    state.dashCooldown = Math.max(0, state.dashCooldown - dtMs);
    state.dashTime = Math.max(0, state.dashTime - dtMs);
    if (state.comboTimer > 0) {
      state.comboTimer -= dtMs;
      if (state.comboTimer <= 0) state.combo = 1;
    }

    const isDashing = state.dashTime > 0;
    const cfg = CONFIG.player;

    // Move intent
    let mx = moveX || 0;
    let my = moveY || 0;
    const n = normalize(mx, my);
    mx = n.x;
    my = n.y;

    if (mx !== 0 || my !== 0) {
      p.faceAngle = Math.atan2(my, mx);
    }

    // Bark
    if (barkPressed && state.barkCooldown === 0) {
      state.barkCooldown = cfg.barkCooldownMs;
      p.state = "bark";
      handleBark(p);
    }

    // Dash
    if (dashPressed && state.dashCooldown === 0) {
      state.dashCooldown = cfg.dashCooldownMs;
      state.dashTime = cfg.dashMs;
      p.state = "dash";
      if (mx === 0 && my === 0) {
        mx = Math.cos(p.faceAngle);
        my = Math.sin(p.faceAngle);
      }
      p.vx = mx * cfg.dashSpeed;
      p.vy = my * cfg.dashSpeed;
      handleDashCollisions(p);
    }

    // Movement physics
    if (!isDashing) {
      const accel = cfg.accel;
      p.vx += mx * accel * dt;
      p.vy += my * accel * dt;

      const speed = Math.hypot(p.vx, p.vy);
      const max = cfg.baseSpeed;
      if (speed > max) {
        const s = max / speed;
        p.vx *= s;
        p.vy *= s;
      }

      const fr = Math.exp(-cfg.friction * dt);
      p.vx *= fr;
      p.vy *= fr;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.x = clamp(p.x, 40, world.w - 40);
    p.y = clamp(p.y, 80, world.h - 40);

    if (!barkPressed && !isDashing && (mx !== 0 || my !== 0)) {
      p.state = "run";
    } else if (!barkPressed && !isDashing && mx === 0 && my === 0) {
      p.state = "idle";
    }

    // Threats & props
    maybeSpawn(dtMs);
    state.threats.forEach((th) => updateThreat(th, dt));
    state.props.forEach((pr) => {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.vx *= Math.exp(-CONFIG.chaos.propFriction * dt);
      pr.vy *= Math.exp(-CONFIG.chaos.propFriction * dt);
      pr.x = clamp(pr.x, 36, world.w - 36);
      pr.y = clamp(pr.y, 96, world.h - 36);
    });

    // Resolve dead threats & delivery
    const porchY = world.h * 0.34;
    state.threats = state.threats.filter((th) => {
      // If \"killed\" (hp <= 0), never counts as delivered.
      if (th.hp <= 0) {
        applyScore(th.score || 60, "Hit!");
        playSound("hit");
        return false;
      }
      // Delivered only if mail-related threats actually reach porch/mailbox zone.
      if (th.y > porchY && (th.type === "mailman" || th.type === "box")) {
        state.delivered += 1;
        return false;
      }
      // Leaves count when they drift fully across screen untouched.
      if (th.type === "leaf" && (th.x < -80 || th.x > world.w + 80)) {
        state.delivered += 1;
        return false;
      }
      return true;
    });

    if (state.delivered >= gameplay.deliveredToLose) {
      endRun(state.saveData);
      playSound("fail");
    }
  }

  return {
    state,
    update,
    startRun,
    endRun,
  };
}

