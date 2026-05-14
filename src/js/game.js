// Sandbox client state. Holds the latest authoritative snapshot from `net`,
// remembers which id is "me", and exposes helpers the renderer + UI need.
//
// Local input integration: between snapshots we apply simple client-side
// prediction to the local player so movement feels snappy. Remote players are
// interpolated between the two most recent snapshots.

import { WORLD, TOOLS } from "../shared/protocol.js";
import { TUNING } from "../shared/sim.js";

export function createGame() {
  const state = {
    mode: "menu",        // menu | running | paused
    connected: false,
    backend: null,       // "remote" | "local" | null
    world: { ...WORLD },
    myId: null,
    selectedTool: "move",
    // Live world snapshot (the source of truth for rendering)
    world_t: 0,
    players: new Map(),  // id -> player (latest)
    threats: [],
    blocks: [],          // array form for easy iteration
    props: [],
    effects: [],         // client-side transient FX (floats, stars, cones)
    events: [],          // recent events from server (used to spawn FX)
    chat: [],            // [{from, text, system?, t}]
    // Interpolation buffer (last two snapshots) for remote players
    _prevSnap: null,
    _lastSnap: null,
    _renderTime: 0,      // simulated wall-clock for interpolation
    // Local prediction state for "me"
    _local: {
      x: WORLD.w * 0.5, y: WORLD.h * 0.5,
      vx: 0, vy: 0,
      faceAngle: -Math.PI / 2,
      state: "idle",
      barkCooldown: 0,
      dashCooldown: 0,
      dashTime: 0,
      barkFaceMs: 0,
      hasServerFix: false,
    },
    // Cursor (world coords) for tool placement
    cursor: { x: WORLD.w * 0.5, y: WORLD.h * 0.5, inWindow: false },
    // Camera (follows local player; renderer applies it)
    camera: { x: WORLD.w * 0.5, y: WORLD.h * 0.5, zoom: 1 },
    saveData: null,
    shakeRequest: 0,
    // Cosmetics for the local pup so the renderer can re-skin "me" before the
    // server roundtrip lands.
    me: { name: "Pup", furColor: "#f6bf6b", collarColor: "#ff4d6d", accessoryId: "none" },
  };

  function setSelectedTool(tool) {
    if (!TOOLS.find((t) => t.id === tool)) return;
    state.selectedTool = tool;
  }

  // ── Snapshot ingestion ────────────────────────────────────────────────────

  function ingestSnapshot(snap) {
    state.world_t = snap.t || 0;
    // Move last → prev, set new last
    state._prevSnap = state._lastSnap;
    state._lastSnap = { t: snap.t || 0, players: snap.players || [], _wallClock: performance.now() };

    // Build player map
    state.players.clear();
    (snap.players || []).forEach((p) => state.players.set(p.id, p));

    state.threats = snap.threats || [];
    state.blocks  = snap.blocks  || [];
    state.props   = snap.props   || [];

    // Server fix for "me": align local prediction if too far off, else keep
    const me = state.players.get(state.myId);
    if (me) {
      const lp = state._local;
      const dx = me.x - lp.x;
      const dy = me.y - lp.y;
      const d2 = dx * dx + dy * dy;
      if (!lp.hasServerFix || d2 > 50 * 50) {
        lp.x = me.x; lp.y = me.y;
        lp.vx = me.vx; lp.vy = me.vy;
        lp.faceAngle = me.faceAngle;
        lp.barkCooldown = me.bc || 0;
        lp.dashCooldown = me.dc || 0;
        lp.hasServerFix = true;
      } else {
        // Gentle correction
        lp.x += dx * 0.18;
        lp.y += dy * 0.18;
        lp.barkCooldown = me.bc || 0;
        lp.dashCooldown = me.dc || 0;
      }
    }

    // Stash events for renderer-side FX
    (snap.events || []).forEach((ev) => state.events.push(ev));
  }

  // ── Local prediction tick ─────────────────────────────────────────────────

  function tickLocalPrediction(dt, inp) {
    const lp = state._local;
    const dtMs = dt * 1000;
    lp.barkCooldown = Math.max(0, lp.barkCooldown - dtMs);
    lp.dashCooldown = Math.max(0, lp.dashCooldown - dtMs);
    lp.dashTime     = Math.max(0, lp.dashTime - dtMs);
    if (lp.barkFaceMs > 0) {
      lp.barkFaceMs -= dtMs;
      if (lp.barkFaceMs <= 0 && lp.state === "bark") lp.state = "idle";
    }

    const mx = inp?.moveX || 0;
    const my = inp?.moveY || 0;
    if (mx || my) lp.faceAngle = Math.atan2(my, mx);

    const isDashing = lp.dashTime > 0;

    // Local bark/dash kicks are visual; server is authoritative on outcomes.
    if (inp?.barkPressed && lp.barkCooldown === 0) {
      lp.barkCooldown = TUNING.player.barkCooldownMs;
      lp.state = "bark";
      lp.barkFaceMs = 230;
    }
    if (inp?.dashPressed && lp.dashCooldown === 0) {
      lp.dashCooldown = TUNING.player.dashCooldownMs;
      lp.dashTime = TUNING.player.dashMs;
      lp.state = "dash";
      const dx = (mx || my) ? mx : Math.cos(lp.faceAngle);
      const dy = (mx || my) ? my : Math.sin(lp.faceAngle);
      lp.vx = dx * TUNING.player.dashSpeed;
      lp.vy = dy * TUNING.player.dashSpeed;
    }

    if (!isDashing) {
      lp.vx += mx * TUNING.player.accel * dt;
      lp.vy += my * TUNING.player.accel * dt;
      const spd = Math.hypot(lp.vx, lp.vy);
      if (spd > TUNING.player.baseSpeed) {
        lp.vx *= TUNING.player.baseSpeed / spd;
        lp.vy *= TUNING.player.baseSpeed / spd;
      }
      const fr = Math.exp(-TUNING.player.friction * dt);
      lp.vx *= fr; lp.vy *= fr;
    }
    lp.x = Math.max(20, Math.min(state.world.w - 20, lp.x + lp.vx * dt));
    lp.y = Math.max(20, Math.min(state.world.h - 20, lp.y + lp.vy * dt));

    if (lp.barkFaceMs <= 0) {
      lp.state = isDashing ? "dash" : (mx || my) ? "run" : "idle";
    }
  }

  // ── Camera tick (smooth follow) ───────────────────────────────────────────

  function tickCamera(dt, viewportW, viewportH) {
    const cam = state.camera;
    const target = state._local;
    // Snap on first frame
    if (cam.x === 0 && cam.y === 0) { cam.x = target.x; cam.y = target.y; }
    const lambda = 6.5;
    const k = 1 - Math.exp(-lambda * dt);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;

    // Clamp so we don't pan past world bounds
    if (viewportW && viewportH) {
      const halfW = viewportW / 2;
      const halfH = viewportH / 2;
      cam.x = Math.max(halfW, Math.min(state.world.w - halfW, cam.x));
      cam.y = Math.max(halfH, Math.min(state.world.h - halfH, cam.y));
    }
  }

  // ── Cosmetics for "me" (instant local re-skin) ────────────────────────────

  function setMyCosmetics(c) {
    if (c.furColor)    state.me.furColor = c.furColor;
    if (c.collarColor) state.me.collarColor = c.collarColor;
    if (c.accessoryId) state.me.accessoryId = c.accessoryId;
    if (c.name)        state.me.name = c.name;
  }

  return {
    state,
    setSelectedTool,
    ingestSnapshot,
    tickLocalPrediction,
    tickCamera,
    setMyCosmetics,
  };
}
