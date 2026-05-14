// Pure simulation module. Runs identically in Node (server) and the browser
// (client fallback / prediction). Must not touch DOM, window, document, etc.
//
// The sim owns:
//   - players  (id -> player)
//   - threats  (array of npcs)
//   - blocks   (grid of placed solid/soft blocks, keyed by `${gx}_${gy}`)
//   - props    (array of free-moving knockable items)
//   - effects  (transient FX echoed to clients so they can play sounds)
//
// External code drives the sim by:
//   sim.addPlayer(id, opts)        → creates a player
//   sim.removePlayer(id)
//   sim.applyInput(id, input)      → sets latest move/face + edge actions
//   sim.applyAction(id, action)    → spawn / place / remove / clear
//   sim.step(dt)                   → advances world by dt seconds
//   sim.snapshot()                 → returns a JSON-safe state dump

import { WORLD, SPAWN_TOOLS, BLOCK_TOOLS } from "./protocol.js";

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function hypot(x, y) { return Math.sqrt(x * x + y * y); }
function wrapAngle(a) { while (a < -Math.PI) a += TAU; while (a > Math.PI) a -= TAU; return a; }
function circleHit(ax, ay, ar, bx, by, br) {
  const dx = bx - ax, dy = by - ay, r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export const TUNING = {
  player: {
    r: 16,
    baseSpeed: 280,
    accel: 2200,
    friction: 11,
    dashSpeed: 760,
    dashMs: 150,
    dashCooldownMs: 1100,
    barkCooldownMs: 380,
    barkRange: 130,
    barkArc: Math.PI * 0.8,
    barkKnock: 360,
    barkKnockPlayer: 220,
    barkStunMs: 700,
    nameOffset: 38,
  },
  threats: {
    maxAlive: 64,
  },
  blocks: {
    stoneHp: 6,   // bark hits to destroy
    bushHp: 2,
    propFriction: 7,
  },
};

// ─── Entity factories ────────────────────────────────────────────────────────

function makePlayer(id, opts = {}) {
  return {
    id,
    name: opts.name || "Pup",
    x: clamp(opts.x ?? WORLD.w * 0.5, 40, WORLD.w - 40),
    y: clamp(opts.y ?? WORLD.h * 0.5, 40, WORLD.h - 40),
    vx: 0, vy: 0,
    r: TUNING.player.r,
    faceAngle: -Math.PI / 2,
    state: "idle", // idle | run | dash | bark
    barkFaceMs: 0,
    barkCooldown: 0,
    dashCooldown: 0,
    dashTime: 0,
    furColor: opts.furColor || "#f6bf6b",
    collarColor: opts.collarColor || "#ff4d6d",
    accessoryId: opts.accessoryId || "none",
    tool: opts.tool || "move",
    score: 0,
    inputSeq: 0,
    lastSeen: Date.now(),
  };
}

let _threatNo = 1;
function makeThreat(kind, x, y, now) {
  const base = {
    id: `t${_threatNo++}`,
    type: kind,
    x, y,
    vx: 0, vy: 0,
    hp: 1,
    stunnedMs: 0,
    spawnAt: now,
  };
  switch (kind) {
    case "mailman":
      return { ...base, r: 18, vy: 55, score: 120 };
    case "leaf": {
      const fromLeft = x < WORLD.w / 2;
      return { ...base, r: 10,
        vx: fromLeft ? rand(28, 55) : rand(-55, -28),
        vy: rand(-14, 14), score: 35 };
    }
    case "squirrel":
      return { ...base, r: 14, vx: rand(-70, 70), vy: rand(-70, 70),
        dirTimer: rand(0.4, 1.2), score: 90 };
    case "bike": {
      const fromLeft = x < WORLD.w / 2;
      return { ...base, r: 22,
        vx: fromLeft ? 260 : -260, vy: 0, score: 180 };
    }
    case "box":
      return { ...base, r: 16, vy: rand(40, 60), hp: 3, maxHp: 3, score: 140 };
    default:
      return null;
  }
}

let _propNo = 1;
function makeProp(kind, x, y) {
  const radii = { flower: 12, slipper: 11, toy: 9 };
  return { id: `p${_propNo++}`, kind, x, y, vx: 0, vy: 0, r: radii[kind] || 10 };
}

function blockKey(gx, gy) { return `${gx}_${gy}`; }
function makeBlock(kind, gx, gy) {
  const hp = kind === "bush" ? TUNING.blocks.bushHp : TUNING.blocks.stoneHp;
  return { kind, gx, gy, hp, maxHp: hp };
}

// ─── Sim factory ─────────────────────────────────────────────────────────────

export function createSim() {
  const state = {
    t: 0,                          // seconds since sim start
    players: new Map(),            // id -> player
    threats: [],
    props: [
      makeProp("flower", WORLD.w * 0.28, WORLD.h * 0.30),
      makeProp("slipper", WORLD.w * 0.72, WORLD.h * 0.65),
      makeProp("toy",     WORLD.w * 0.55, WORLD.h * 0.82),
    ],
    blocks: new Map(),             // key -> block
    effects: [],                   // {kind, x, y, color?, life} for transient FX (client-only render)
    events: [],                    // queued one-shot events to broadcast (sounds, banners)
    // Per-player pending input. We store edge presses here so the next step()
    // consumes them exactly once.
    _pending: new Map(),           // id -> { bark:bool, dash:bool, moveX, moveY, faceAngle, tool }
  };

  function pushEvent(ev) { state.events.push(ev); }
  function pushEffect(eff) { state.effects.push(eff); }

  // ── Players ───────────────────────────────────────────────────────────────

  function addPlayer(id, opts) {
    const p = makePlayer(id, opts);
    state.players.set(id, p);
    pushEvent({ kind: "join", id, name: p.name });
    return p;
  }

  function removePlayer(id) {
    const p = state.players.get(id);
    if (!p) return;
    state.players.delete(id);
    state._pending.delete(id);
    pushEvent({ kind: "leave", id, name: p.name });
  }

  function applyInput(id, inp) {
    const p = state.players.get(id);
    if (!p) return;
    const prev = state._pending.get(id) || { bark: false, dash: false };
    state._pending.set(id, {
      moveX: clamp(inp.mx ?? 0, -1, 1),
      moveY: clamp(inp.my ?? 0, -1, 1),
      faceAngle: typeof inp.faceAngle === "number" ? inp.faceAngle : p.faceAngle,
      bark: prev.bark || !!inp.bark,
      dash: prev.dash || !!inp.dash,
      tool: inp.tool || p.tool,
    });
    if (typeof inp.seq === "number") p.inputSeq = inp.seq;
    if (inp.tool && inp.tool !== p.tool) p.tool = inp.tool;
    p.lastSeen = Date.now();
  }

  function applyAction(id, act) {
    const p = state.players.get(id);
    if (!p) return;
    if (!act || typeof act !== "object") return;

    if (act.type === "spawn" && SPAWN_TOOLS.has(act.kind)) {
      if (state.threats.length >= TUNING.threats.maxAlive) return;
      const x = clamp(+act.x || 0, 20, WORLD.w - 20);
      const y = clamp(+act.y || 0, 20, WORLD.h - 20);
      const th = makeThreat(act.kind, x, y, state.t);
      if (th) state.threats.push(th);
      return;
    }

    if (act.type === "place" && BLOCK_TOOLS.has(act.kind)) {
      const gx = Math.floor((+act.x || 0) / WORLD.blockSize);
      const gy = Math.floor((+act.y || 0) / WORLD.blockSize);
      if (gx < 0 || gy < 0 || gx >= Math.floor(WORLD.w / WORLD.blockSize) ||
          gy >= Math.floor(WORLD.h / WORLD.blockSize)) return;
      const k = blockKey(gx, gy);
      if (state.blocks.has(k)) return;
      state.blocks.set(k, makeBlock(act.kind, gx, gy));
      return;
    }

    if (act.type === "prop") {
      const kind = (act.kind === "slipper" || act.kind === "flower") ? act.kind : "toy";
      const x = clamp(+act.x || 0, 20, WORLD.w - 20);
      const y = clamp(+act.y || 0, 20, WORLD.h - 20);
      state.props.push(makeProp(kind, x, y));
      return;
    }

    if (act.type === "remove") {
      const x = +act.x || 0, y = +act.y || 0;
      // try blocks first
      const gx = Math.floor(x / WORLD.blockSize);
      const gy = Math.floor(y / WORLD.blockSize);
      const bk = blockKey(gx, gy);
      if (state.blocks.has(bk)) { state.blocks.delete(bk); return; }
      // then nearest threat within radius
      let idx = -1, best = 64 * 64;
      for (let i = 0; i < state.threats.length; i++) {
        const th = state.threats[i];
        const d = (th.x - x) * (th.x - x) + (th.y - y) * (th.y - y);
        if (d < best) { best = d; idx = i; }
      }
      if (idx >= 0) { state.threats.splice(idx, 1); return; }
      // then nearest prop
      let pidx = -1, pbest = 48 * 48;
      for (let i = 0; i < state.props.length; i++) {
        const pr = state.props[i];
        const d = (pr.x - x) * (pr.x - x) + (pr.y - y) * (pr.y - y);
        if (d < pbest) { pbest = d; pidx = i; }
      }
      if (pidx >= 0) state.props.splice(pidx, 1);
      return;
    }

    if (act.type === "tool") {
      if (typeof act.tool === "string") p.tool = act.tool;
      return;
    }

    if (act.type === "clear") {
      if (act.what === "threats" || act.what === "all") state.threats.length = 0;
      if (act.what === "blocks"  || act.what === "all") state.blocks.clear();
      if (act.what === "props"   || act.what === "all") state.props.length = 0;
    }
  }

  // ── Bark / Dash resolution ────────────────────────────────────────────────

  function handleBark(p) {
    const range = TUNING.player.barkRange;
    const halfArc = TUNING.player.barkArc * 0.5;
    let hits = 0;

    state.threats.forEach((th) => {
      if (!circleHit(p.x, p.y, range, th.x, th.y, th.r)) return;
      const ang = Math.atan2(th.y - p.y, th.x - p.x);
      if (Math.abs(wrapAngle(ang - p.faceAngle)) > halfArc) return;
      knock(th, p.x, p.y, TUNING.player.barkKnock);
      th.stunnedMs = Math.max(th.stunnedMs || 0, TUNING.player.barkStunMs);
      th.hp -= 1;
      hits++;
    });

    state.players.forEach((other) => {
      if (other.id === p.id) return;
      if (!circleHit(p.x, p.y, range, other.x, other.y, other.r)) return;
      const ang = Math.atan2(other.y - p.y, other.x - p.x);
      if (Math.abs(wrapAngle(ang - p.faceAngle)) > halfArc) return;
      knock(other, p.x, p.y, TUNING.player.barkKnockPlayer);
    });

    state.props.forEach((pr) => {
      if (!circleHit(p.x, p.y, range, pr.x, pr.y, pr.r)) return;
      const ang = Math.atan2(pr.y - p.y, pr.x - p.x);
      if (Math.abs(wrapAngle(ang - p.faceAngle)) > halfArc) return;
      knock(pr, p.x, p.y, 240);
    });

    // Damage soft/solid blocks in cone
    const reach = range;
    state.blocks.forEach((b, key) => {
      const cx = (b.gx + 0.5) * WORLD.blockSize;
      const cy = (b.gy + 0.5) * WORLD.blockSize;
      const dx = cx - p.x, dy = cy - p.y;
      const d = hypot(dx, dy);
      if (d > reach) return;
      const ang = Math.atan2(dy, dx);
      if (Math.abs(wrapAngle(ang - p.faceAngle)) > halfArc) return;
      b.hp -= 1;
      if (b.hp <= 0) state.blocks.delete(key);
    });

    if (hits > 0) {
      p.score += 50 + hits * 25;
      pushEvent({ kind: "score", id: p.id, gained: 50 + hits * 25, x: p.x, y: p.y });
    }
    pushEvent({ kind: "bark", id: p.id, x: p.x, y: p.y, angle: p.faceAngle });
  }

  function handleDashHit(p) {
    const r = p.r + 12;
    let hits = 0;
    state.threats.forEach((th) => {
      if (!circleHit(p.x, p.y, r, th.x, th.y, th.r)) return;
      knock(th, p.x, p.y, TUNING.player.barkKnock * 1.2);
      th.hp -= 1;
      hits++;
    });
    state.players.forEach((other) => {
      if (other.id === p.id) return;
      if (!circleHit(p.x, p.y, r, other.x, other.y, other.r)) return;
      knock(other, p.x, p.y, 320);
    });
    state.props.forEach((pr) => {
      if (!circleHit(p.x, p.y, r, pr.x, pr.y, pr.r)) return;
      knock(pr, p.x, p.y, 340);
    });
    if (hits > 0) { p.score += 40 * hits; }
    pushEvent({ kind: "dash", id: p.id, x: p.x, y: p.y });
  }

  function knock(e, fromX, fromY, strength) {
    const dx = e.x - fromX, dy = e.y - fromY;
    const m = hypot(dx, dy) || 1;
    e.vx += (dx / m) * strength;
    e.vy += (dy / m) * strength;
  }

  // ── Blocks collision ──────────────────────────────────────────────────────

  function resolveBlockCollision(e, prevX, prevY) {
    if (state.blocks.size === 0) return;
    const bs = WORLD.blockSize;
    const minGX = Math.floor((e.x - e.r) / bs) - 1;
    const maxGX = Math.floor((e.x + e.r) / bs) + 1;
    const minGY = Math.floor((e.y - e.r) / bs) - 1;
    const maxGY = Math.floor((e.y + e.r) / bs) + 1;
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const k = blockKey(gx, gy);
        const b = state.blocks.get(k);
        if (!b) continue;
        // AABB - circle
        const bx = gx * bs, by = gy * bs;
        const cx = clamp(e.x, bx, bx + bs);
        const cy = clamp(e.y, by, by + bs);
        const dx = e.x - cx, dy = e.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < e.r * e.r) {
          // Push out along the dominant axis
          const dxPrev = prevX - cx;
          const dyPrev = prevY - cy;
          if (Math.abs(dxPrev) > Math.abs(dyPrev)) {
            e.x = cx + (dxPrev >= 0 ? e.r : -e.r);
            e.vx = b.kind === "bush" ? e.vx * 0.6 : 0;
          } else {
            e.y = cy + (dyPrev >= 0 ? e.r : -e.r);
            e.vy = b.kind === "bush" ? e.vy * 0.6 : 0;
          }
        }
      }
    }
  }

  // ── Step ──────────────────────────────────────────────────────────────────

  function step(dt) {
    state.t += dt;
    const dtMs = dt * 1000;

    // Players
    state.players.forEach((p) => {
      const pending = state._pending.get(p.id) || { moveX: 0, moveY: 0, bark: false, dash: false };
      p.barkCooldown = Math.max(0, p.barkCooldown - dtMs);
      p.dashCooldown = Math.max(0, p.dashCooldown - dtMs);
      p.dashTime     = Math.max(0, p.dashTime - dtMs);
      if (p.barkFaceMs > 0) {
        p.barkFaceMs -= dtMs;
        if (p.barkFaceMs <= 0 && p.state === "bark") p.state = "idle";
      }

      let mx = pending.moveX || 0;
      let my = pending.moveY || 0;
      const m = hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
      if (mx !== 0 || my !== 0) p.faceAngle = Math.atan2(my, mx);
      if (typeof pending.faceAngle === "number") p.faceAngle = pending.faceAngle;

      const isDashing = p.dashTime > 0;

      if (pending.bark && p.barkCooldown === 0) {
        p.barkCooldown = TUNING.player.barkCooldownMs;
        p.state = "bark";
        p.barkFaceMs = 230;
        handleBark(p);
      }
      if (pending.dash && p.dashCooldown === 0) {
        p.dashCooldown = TUNING.player.dashCooldownMs;
        p.dashTime = TUNING.player.dashMs;
        p.state = "dash";
        const dx = (mx !== 0 || my !== 0) ? mx : Math.cos(p.faceAngle);
        const dy = (mx !== 0 || my !== 0) ? my : Math.sin(p.faceAngle);
        p.vx = dx * TUNING.player.dashSpeed;
        p.vy = dy * TUNING.player.dashSpeed;
        handleDashHit(p);
      }

      if (!isDashing) {
        p.vx += mx * TUNING.player.accel * dt;
        p.vy += my * TUNING.player.accel * dt;
        const spd = hypot(p.vx, p.vy);
        if (spd > TUNING.player.baseSpeed) {
          p.vx *= TUNING.player.baseSpeed / spd;
          p.vy *= TUNING.player.baseSpeed / spd;
        }
        const fr = Math.exp(-TUNING.player.friction * dt);
        p.vx *= fr; p.vy *= fr;
      }

      const prevX = p.x, prevY = p.y;
      p.x = clamp(p.x + p.vx * dt, 20, WORLD.w - 20);
      p.y = clamp(p.y + p.vy * dt, 20, WORLD.h - 20);
      resolveBlockCollision(p, prevX, prevY);

      if (p.barkFaceMs <= 0) {
        p.state = isDashing ? "dash" : (mx !== 0 || my !== 0) ? "run" : "idle";
      }

      // consume edges
      pending.bark = false;
      pending.dash = false;
    });

    // Threats
    for (let i = 0; i < state.threats.length; i++) {
      const th = state.threats[i];
      if (th.stunnedMs > 0) {
        th.stunnedMs -= dtMs;
        const damp = Math.exp(-5 * dt);
        th.vx *= damp; th.vy *= damp;
      } else {
        switch (th.type) {
          case "mailman": {
            const targetX = WORLD.w * 0.5 + 60;
            const dx = targetX - th.x;
            th.vx = dx * 0.6;
            // never give up
            th.vy = 55;
            break;
          }
          case "leaf": {
            const t = th.spawnAt + state.t;
            th.vx += Math.sin(t * 1.1) * 5;
            th.vy += Math.cos(t * 0.8) * 3;
            const s = hypot(th.vx, th.vy);
            if (s > 65) { th.vx *= 65 / s; th.vy *= 65 / s; }
            break;
          }
          case "squirrel": {
            th.dirTimer -= dt;
            if (th.dirTimer <= 0) {
              th.dirTimer = rand(0.4, 1.0);
              const a = Math.random() * TAU;
              const speed = rand(100, 160);
              th.vx = Math.cos(a) * speed;
              th.vy = Math.sin(a) * speed;
            }
            if (th.x < 40)              { th.x = 40;             th.vx =  Math.abs(th.vx); }
            if (th.x > WORLD.w - 40)    { th.x = WORLD.w - 40;   th.vx = -Math.abs(th.vx); }
            if (th.y < 40)              { th.y = 40;             th.vy =  Math.abs(th.vy); }
            if (th.y > WORLD.h - 40)    { th.y = WORLD.h - 40;   th.vy = -Math.abs(th.vy); }
            break;
          }
          default: break;
        }
      }
      const prevX = th.x, prevY = th.y;
      th.x += th.vx * dt;
      th.y += th.vy * dt;
      resolveBlockCollision(th, prevX, prevY);
    }

    // Remove dead threats / OOB
    state.threats = state.threats.filter((th) => {
      if (th.hp <= 0) {
        pushEvent({ kind: "kill", x: th.x, y: th.y, type: th.type });
        return false;
      }
      if (th.x < -200 || th.x > WORLD.w + 200 || th.y < -200 || th.y > WORLD.h + 200) {
        return false;
      }
      return true;
    });

    // Props physics
    state.props.forEach((pr) => {
      const prevX = pr.x, prevY = pr.y;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      const fr = Math.exp(-TUNING.blocks.propFriction * dt);
      pr.vx *= fr; pr.vy *= fr;
      pr.x = clamp(pr.x, 20, WORLD.w - 20);
      pr.y = clamp(pr.y, 20, WORLD.h - 20);
      resolveBlockCollision(pr, prevX, prevY);
    });

    // Decay client-only effects (effects array is short-lived)
    state.effects = state.effects.filter((e) => {
      e.life -= dtMs;
      return e.life > 0;
    });
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  function snapshot(includeEvents = true) {
    const players = [];
    state.players.forEach((p) => {
      players.push({
        id: p.id,
        name: p.name,
        x: round1(p.x), y: round1(p.y),
        vx: round1(p.vx), vy: round1(p.vy),
        faceAngle: round3(p.faceAngle),
        state: p.state,
        fur: p.furColor, collar: p.collarColor, acc: p.accessoryId,
        tool: p.tool,
        bc: Math.round(p.barkCooldown), dc: Math.round(p.dashCooldown),
        score: p.score,
        seq: p.inputSeq,
      });
    });
    const blocks = [];
    state.blocks.forEach((b) => blocks.push({ k: b.kind, gx: b.gx, gy: b.gy, hp: b.hp, mh: b.maxHp }));
    const threats = state.threats.map((th) => ({
      id: th.id, type: th.type,
      x: round1(th.x), y: round1(th.y),
      vx: round1(th.vx), vy: round1(th.vy),
      r: th.r, hp: th.hp, mh: th.maxHp,
      st: Math.max(0, Math.round(th.stunnedMs || 0)),
    }));
    const props = state.props.map((p) => ({
      id: p.id, kind: p.kind,
      x: round1(p.x), y: round1(p.y), r: p.r,
    }));
    const ev = includeEvents ? state.events.slice() : [];
    if (includeEvents) state.events.length = 0;
    return { t: round3(state.t), players, threats, blocks, props, events: ev };
  }

  function loadSnapshot(snap) {
    // Used by client fallback / re-sync — replace world wholesale.
    state.t = snap.t || 0;
    state.players.clear();
    (snap.players || []).forEach((s) => {
      const p = makePlayer(s.id, {
        name: s.name, x: s.x, y: s.y,
        furColor: s.fur, collarColor: s.collar, accessoryId: s.acc, tool: s.tool,
      });
      p.vx = s.vx || 0; p.vy = s.vy || 0;
      p.faceAngle = s.faceAngle || 0;
      p.state = s.state || "idle";
      p.barkCooldown = s.bc || 0; p.dashCooldown = s.dc || 0;
      p.score = s.score || 0;
      state.players.set(p.id, p);
    });
    state.threats = (snap.threats || []).map((t) => ({ ...t, maxHp: t.mh, stunnedMs: t.st || 0 }));
    state.props = (snap.props || []).map((p) => ({ ...p }));
    state.blocks.clear();
    (snap.blocks || []).forEach((b) => state.blocks.set(blockKey(b.gx, b.gy), {
      kind: b.k, gx: b.gx, gy: b.gy, hp: b.hp, maxHp: b.mh,
    }));
  }

  function findPlayer(id) { return state.players.get(id); }

  return {
    state,
    addPlayer, removePlayer,
    applyInput, applyAction,
    step, snapshot, loadSnapshot,
    findPlayer,
  };
}

function round1(n) { return Math.round(n * 10) / 10; }
function round3(n) { return Math.round(n * 1000) / 1000; }
