import { CONFIG } from "./config.js";
import { clamp, normalize } from "./util.js";

// Core game state & update loop: movement + action timers (no threats yet).

export function createGame() {
  const { world, player: pc } = CONFIG;

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
  };

  function startRun() {
    state.mode = "running";
    state.time = 0;
    state.player.x = world.w * 0.5;
    state.player.y = world.h * 0.65;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.state = "idle";
    state.barkCooldown = 0;
    state.dashCooldown = 0;
    state.dashTime = 0;
  }

  function update(dt, input) {
    state.time += dt;
    if (state.mode !== "running") return;

    const p = state.player;
    const { moveX, moveY, barkPressed, dashPressed, pausePressed } = input || {};

    if (pausePressed) {
      state.mode = "paused";
      return;
    }

    // Cooldowns
    state.barkCooldown = Math.max(0, state.barkCooldown - dt * 1000);
    state.dashCooldown = Math.max(0, state.dashCooldown - dt * 1000);
    state.dashTime = Math.max(0, state.dashTime - dt * 1000);

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
  }

  return {
    state,
    update,
    startRun,
  };
}

