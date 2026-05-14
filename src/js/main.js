// RagePuppy sandbox — multiplayer entrypoint.
// Wires net ↔ game ↔ renderer ↔ ui and runs the RAF loop.

import { createGame } from "./game.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { createUI } from "./ui.js";
import { createNet } from "./net.js";
import { loadSave } from "./storage.js";
import { ACTION, SPAWN_TOOLS, BLOCK_TOOLS, TOOLS } from "../shared/protocol.js";
import { playSound } from "./audio.js";

const canvas = document.getElementById("game");
const hudEl  = document.getElementById("hud");

const game     = createGame();
const renderer = createRenderer(canvas);
const input    = createInput();
const net      = createNet();

game.state.saveData = loadSave();

const FUR_COLORS = [
  { id: "golden",  color: "#f6bf6b" },
  { id: "cream",   color: "#f5e6c8" },
  { id: "brown",   color: "#a0572a" },
  { id: "grey",    color: "#9eaabb" },
  { id: "white",   color: "#f0f0f0" },
  { id: "black",   color: "#2a2a35" },
];
const COLLAR_COLORS = [
  { id: "raspberry", color: "#ff4d6d" },
  { id: "sky",       color: "#4db8ff" },
  { id: "lime",      color: "#4dffb5" },
  { id: "gold",      color: "#ffcc57" },
  { id: "purple",    color: "#9b59ff" },
];
function pickColor(arr, id) { return arr.find((x) => x.id === id)?.color; }

const ui = createUI(game, {
  join({ name, mode, url, cosmetics }) {
    const fur    = pickColor(FUR_COLORS, cosmetics?.fur)       ?? "#f6bf6b";
    const collar = pickColor(COLLAR_COLORS, cosmetics?.collar) ?? "#ff4d6d";
    const accessory = cosmetics?.accessoryId || "none";
    game.setMyCosmetics({ name, furColor: fur, collarColor: collar, accessoryId: accessory });
    net.connect({ name, fur, collar, accessory, mode, url });
  },
  leave() {
    net.disconnect();
    game.state.connected = false;
    game.state.backend = null;
    game.state.mode = "menu";
  },
  selectTool(t) {
    game.setSelectedTool(t);
    net.sendAction({ type: ACTION.TOOL, tool: t });
    input.setCurrentTool(t);
    ui.updateHotbarSelection();
  },
});

// ── Net event wiring ─────────────────────────────────────────────────────────

net.on("welcome", ({ id, world, snapshot, offline }) => {
  game.state.myId = id;
  game.state.world = world || game.state.world;
  game.state.connected = true;
  game.state.backend = net.getBackend();
  game.state.mode = "running";
  // Seed initial position from snapshot
  const me = (snapshot?.players || []).find((p) => p.id === id);
  if (me) {
    game.state._local.x = me.x;
    game.state._local.y = me.y;
    game.state._local.faceAngle = me.faceAngle;
    game.state._local.hasServerFix = true;
    game.state.camera.x = me.x;
    game.state.camera.y = me.y;
  }
  if (snapshot) game.ingestSnapshot(snapshot);
  ui.enterRunning();
  ui.appendChat({
    from: "server",
    text: offline ? "Solo sandbox started. (No server connected.)" : "Connected to the yard.",
    system: true,
  });
});

net.on("status", (info) => {
  if (info.state === "closed" && game.state.connected) {
    ui.appendChat({ from: "server", text: "Lost connection to server.", system: true });
    game.state.connected = false;
  }
});

net.on("state", (snap) => {
  game.ingestSnapshot(snap);
  // Translate server events to client effects + sounds
  drainEvents();
});

net.on("chat", (m) => {
  ui.appendChat(m);
});

// ── Events → FX / sounds ─────────────────────────────────────────────────────

function drainEvents() {
  const evs = game.state.events;
  if (!evs.length) return;
  for (const ev of evs) {
    if (ev.kind === "bark") {
      // Spawn a visual cone at the barker's position
      game.state.effects.push({
        type: "barkCone", x: ev.x, y: ev.y, angle: ev.angle,
        arc: Math.PI * 0.8, range: 130,
        life: 220, maxLife: 220,
      });
      if (ev.id === game.state.myId) playSound("bark");
    } else if (ev.kind === "dash") {
      game.state.effects.push({
        type: "dashTrail", x: ev.x, y: ev.y, r: 16,
        color: "#ffcc57", life: 240, maxLife: 240,
      });
      if (ev.id === game.state.myId) playSound("dash");
    } else if (ev.kind === "kill") {
      // burst of stars
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 80;
        game.state.effects.push({
          type: "star",
          x: ev.x + (Math.random() - 0.5) * 20,
          y: ev.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 30,
          r: 4 + Math.random() * 4,
          color: "#ffcc57",
          life: 500, maxLife: 500,
        });
      }
      playSound("hit");
    } else if (ev.kind === "score" && ev.id === game.state.myId) {
      game.state.effects.push({
        type: "float", text: `+${ev.gained}`, x: ev.x, y: ev.y - 25,
        vy: -55, color: "#ffcc57", life: 900, maxLife: 900,
      });
    } else if (ev.kind === "join" || ev.kind === "leave") {
      // (chat already announces system messages from the server)
    }
  }
  evs.length = 0;
}

// ── Local effect ticking (floats / stars drift; cones decay) ────────────────

function tickEffects(dt) {
  const dtMs = dt * 1000;
  game.state.effects = game.state.effects.filter((eff) => {
    eff.life -= dtMs;
    if (eff.type === "float") eff.y += eff.vy * dt;
    if (eff.type === "star") {
      eff.x += eff.vx * dt;
      eff.y += eff.vy * dt;
      eff.vy += 200 * dt;
    }
    return eff.life > 0;
  });
}

// ── Main loop ────────────────────────────────────────────────────────────────

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const snap = input.peek();

  // Process input bookkeeping that the UI cares about
  if (snap.toolChange) {
    game.setSelectedTool(snap.toolChange);
    net.sendAction({ type: ACTION.TOOL, tool: snap.toolChange });
    input.setCurrentTool(snap.toolChange);
    ui.updateHotbarSelection();
  }

  if (snap.chatToggle && game.state.mode === "running") {
    ui.setChatActive(true);
  }
  if (snap.chatSubmit !== null && typeof snap.chatSubmit === "string") {
    if (snap.chatSubmit.trim()) net.sendChat(snap.chatSubmit.trim());
  }

  if (snap.pausePressed) {
    if (game.state.mode === "running") {
      game.state.mode = "paused";
      ui.showPause();
    }
  }

  // Local prediction + camera follow
  if (game.state.mode === "running") {
    game.tickLocalPrediction(dt, snap);
    const vp = renderer.getViewport();
    game.tickCamera(dt, vp.w, vp.h);

    // Update world-space cursor from canvas-space mouse
    if (snap.mouseInWindow) {
      const vp2 = renderer.getViewport();
      const cam = game.state.camera;
      const wx = snap.mouseCanvasX - vp2.w / 2 + cam.x;
      const wy = snap.mouseCanvasY - vp2.h / 2 + cam.y;
      game.state.cursor.x = wx;
      game.state.cursor.y = wy;
      game.state.cursor.inWindow = true;
    } else {
      game.state.cursor.inWindow = false;
    }

    // Send input to net
    net.sendInput({
      mx: snap.moveX, my: snap.moveY,
      faceAngle: game.state._local.faceAngle,
      bark: snap.barkPressed, dash: snap.dashPressed,
      tool: game.state.selectedTool,
    });

    // Tool action at cursor
    if (snap.actionPressed) handleToolAction();
    if (snap.erasePressed)  net.sendAction({ type: ACTION.REMOVE, x: game.state.cursor.x, y: game.state.cursor.y });
  }

  tickEffects(dt);
  renderer.draw(game.state, dt);
  ui.renderHud();
  input.endFrame();

  requestAnimationFrame(loop);
}

function handleToolAction() {
  const tool = game.state.selectedTool;
  const x = game.state.cursor.x, y = game.state.cursor.y;
  if (tool === "move") return;
  if (tool === "erase") {
    net.sendAction({ type: ACTION.REMOVE, x, y });
    return;
  }
  if (SPAWN_TOOLS.has(tool)) {
    net.sendAction({ type: ACTION.SPAWN, kind: tool, x, y });
    return;
  }
  if (BLOCK_TOOLS.has(tool)) {
    net.sendAction({ type: ACTION.PLACE, kind: tool, x, y });
    return;
  }
  if (tool === "prop") {
    net.sendAction({ type: ACTION.PROP, kind: "toy", x, y });
  }
}

requestAnimationFrame(loop);
