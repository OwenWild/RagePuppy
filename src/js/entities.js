import { CONFIG } from "./config.js";
import { rand, randi, normalize } from "./util.js";

// Entity factories & small behavior helpers.

export function createThreat(kind, worldTime) {
  const { world } = CONFIG;
  if (kind === "mailman") {
    const x = world.w * 0.5 + rand(-140, 140);
    return {
      type: "mailman",
      x,
      y: -40,
      vx: 0,
      vy: 38,
      r: 18,
      hp: 1,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 120,
    };
  }
  if (kind === "leaf") {
    const side = randi(0, 1) === 0 ? -40 : world.w + 40;
    return {
      type: "leaf",
      x: side,
      y: rand(120, world.h - 60),
      vx: side < 0 ? rand(18, 40) : rand(-40, -18),
      vy: rand(-10, 10),
      r: 10,
      hp: 1,
      stunnedMs: 0,
      spawnAt: worldTime,
      score: 30,
    };
  }
  if (kind === "squirrel") {
    return {
      type: "squirrel",
      x: rand(80, world.w - 80),
      y: rand(130, world.h - 80),
      vx: 0,
      vy: 0,
      r: 14,
      hp: 1,
      stunnedMs: 0,
      dirTimer: rand(0.4, 1.2),
      score: 90,
    };
  }
  if (kind === "bike") {
    const y = rand(150, world.h - 80);
    const leftToRight = randi(0, 1) === 0;
    return {
      type: "bike",
      x: leftToRight ? -80 : world.w + 80,
      y,
      vx: leftToRight ? 220 : -220,
      vy: 0,
      r: 20,
      hp: 1,
      stunnedMs: 0,
      score: 160,
    };
  }
  if (kind === "box") {
    const side = randi(0, 1) ? world.w * 0.2 : world.w * 0.8;
    return {
      type: "box",
      x: side + rand(-30, 30),
      y: -30,
      vx: 0,
      vy: rand(30, 50),
      r: 16,
      hp: 3,
      stunnedMs: 0,
      score: 130,
    };
  }
  return null;
}

export function updateThreat(th, dt) {
  if (th.stunnedMs > 0) {
    th.stunnedMs -= dt * 1000;
  }
  switch (th.type) {
    case "leaf": {
      th.vx += Math.sin((th.spawnAt + dt) * 0.7) * 3;
      th.vy += Math.cos((th.spawnAt + dt) * 0.9) * 2;
      break;
    }
    case "squirrel": {
      th.dirTimer -= dt;
      if (th.dirTimer <= 0) {
        th.dirTimer = rand(0.4, 1.1);
        const a = rand(0, Math.PI * 2);
        const speed = rand(90, 130);
        th.vx = Math.cos(a) * speed;
        th.vy = Math.sin(a) * speed;
      }
      break;
    }
    default:
      break;
  }
  th.x += th.vx * dt;
  th.y += th.vy * dt;
}

export function createProp(kind, x, y) {
  const base = {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 10,
  };
  if (kind === "flower") base.r = 12;
  if (kind === "toy") base.r = 9;
  if (kind === "slipper") base.r = 11;
  return base;
}

export function applyKnock(entity, fromX, fromY, strength) {
  const dir = normalize(entity.x - fromX, entity.y - fromY);
  entity.vx += dir.x * strength;
  entity.vy += dir.y * strength;
}

