import { CONFIG } from "./config.js";
import { rand, randi } from "./util.js";

// Entity factories & behavior helpers.
// To replace with sprites later: swap drawThreat/drawProp calls in render.js.

export function createThreat(kind, worldTime) {
  const { world } = CONFIG;
  const cx = world.w * 0.5;

  if (kind === "mailman") {
    // Spawns at top, walks toward mailbox area
    return {
      type: "mailman",
      x: cx + rand(-200, 200),
      y: -45,
      vx: 0,
      vy: 55,
      r: 18,
      hp: 1,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 120,
    };
  }

  if (kind === "leaf") {
    // Blows across the yard from a random side
    const fromLeft = randi(0, 1) === 0;
    return {
      type: "leaf",
      x: fromLeft ? -40 : world.w + 40,
      y: rand(100, world.h - 80),
      vx: fromLeft ? rand(28, 55) : rand(-55, -28),
      vy: rand(-14, 14),
      r: 10,
      hp: 1,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 35,
    };
  }

  if (kind === "squirrel") {
    return {
      type: "squirrel",
      x: rand(100, world.w - 100),
      y: rand(140, world.h - 80),
      vx: rand(-70, 70),
      vy: rand(-70, 70),
      r: 14,
      hp: 1,
      stunnedMs: 0,
      dirTimer: rand(0.5, 1.3),
      spawnAt: worldTime,
      score: 90,
    };
  }

  if (kind === "bike") {
    const y = rand(140, world.h - 80);
    const fromLeft = randi(0, 1) === 0;
    return {
      type: "bike",
      x: fromLeft ? -90 : world.w + 90,
      y,
      vx: fromLeft ? 260 : -260,
      vy: 0,
      r: 22,
      hp: 1,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 180,
    };
  }

  if (kind === "box") {
    // Drops from top; needs multiple barks to destroy
    const side = randi(0, 1) ? world.w * 0.25 : world.w * 0.75;
    return {
      type: "box",
      x: side + rand(-40, 40),
      y: -35,
      vx: 0,
      vy: rand(40, 60),
      r: 16,
      hp: 3,
      maxHp: 3,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 140,
    };
  }

  return null;
}

export function updateThreat(th, dt) {
  const { world } = CONFIG;

  // While stunned: slow down, apply velocity but with heavy damping
  if (th.stunnedMs > 0) {
    th.stunnedMs -= dt * 1000;
    th.vx *= Math.exp(-5 * dt);
    th.vy *= Math.exp(-5 * dt);
    th.x += th.vx * dt;
    th.y += th.vy * dt;
    return;
  }

  switch (th.type) {
    case "mailman": {
      // Steer toward the mailbox x (center-right of porch)
      const targetX = world.w * 0.5 + 60;
      const dx = targetX - th.x;
      th.vx = dx * 0.8; // gentle lateral steer
      break;
    }

    case "leaf": {
      // Sinusoidal flutter; cap speed
      const t = th.spawnAt + performance.now() * 0.001;
      th.vx += Math.sin(t * 1.1) * 5;
      th.vy += Math.cos(t * 0.8) * 3;
      const s = Math.hypot(th.vx, th.vy);
      const maxS = 65;
      if (s > maxS) { th.vx *= maxS / s; th.vy *= maxS / s; }
      break;
    }

    case "squirrel": {
      th.dirTimer -= dt;
      if (th.dirTimer <= 0) {
        th.dirTimer = rand(0.35, 1.0);
        const a = Math.random() * Math.PI * 2;
        const speed = rand(100, 150);
        th.vx = Math.cos(a) * speed;
        th.vy = Math.sin(a) * speed;
      }
      // Bounce off yard boundaries so squirrels stay in play
      if (th.x < 60)          { th.x = 60;           th.vx =  Math.abs(th.vx); }
      if (th.x > world.w - 60){ th.x = world.w - 60; th.vx = -Math.abs(th.vx); }
      if (th.y < 80)           { th.y = 80;           th.vy =  Math.abs(th.vy); }
      if (th.y > world.h - 60) { th.y = world.h - 60; th.vy = -Math.abs(th.vy); }
      break;
    }

    default:
      break;
  }

  th.x += th.vx * dt;
  th.y += th.vy * dt;
}

export function createProp(kind, x, y) {
  const radii = { flower: 12, slipper: 11, toy: 9 };
  return { kind, x, y, vx: 0, vy: 0, r: radii[kind] || 10 };
}

export function applyKnock(entity, fromX, fromY, strength) {
  const dx = entity.x - fromX;
  const dy = entity.y - fromY;
  const m = Math.hypot(dx, dy) || 1;
  entity.vx += (dx / m) * strength;
  entity.vy += (dy / m) * strength;
}
