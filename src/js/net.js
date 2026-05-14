// Network adapter for the RagePuppy sandbox.
//
// Two backends, same API:
//   - "remote"  : real WebSocket to the Node server
//   - "local"   : runs the shared sim in this tab (offline / single-player)
//
// Either way the consumer interacts with `net` like:
//   net.connect({ name, fur, collar, accessory, url? })
//   net.sendInput({ mx, my, faceAngle, bark, dash, tool })
//   net.sendAction({ type, ... })
//   net.sendChat(text)
//   net.on("welcome" | "state" | "chat" | "event" | "status", cb)
//   net.disconnect()
//
// Snapshots flow through "state" callbacks. The renderer doesn't care which
// backend produced them.

import { MSG, ACTION, encode, decode, WORLD, INPUT_HZ } from "../shared/protocol.js";
import { createSim } from "../shared/sim.js";

export function createNet() {
  const listeners = new Map(); // event -> Set<fn>
  let backend = null; // { kind, ... }
  let myId    = null;
  let serverWorld = { ...WORLD };

  function on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev).add(fn);
    return () => listeners.get(ev)?.delete(fn);
  }
  function emit(ev, payload) {
    listeners.get(ev)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
  }

  // ── REMOTE backend ────────────────────────────────────────────────────────

  function connectRemote(opts) {
    const wsUrl = opts.url || autoWsUrl();
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn("WebSocket construct failed, falling back to local.", e);
      return connectLocal(opts);
    }

    backend = { kind: "remote", ws, openTimeout: null };

    backend.openTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        try { ws.close(); } catch {}
        console.warn("Server connect timed out — falling back to local sandbox.");
        connectLocal(opts);
      }
    }, 4000);

    ws.addEventListener("open", () => {
      clearTimeout(backend.openTimeout);
      ws.send(encode({
        type: MSG.HELLO,
        name: opts.name,
        fur: opts.fur,
        collar: opts.collar,
        accessory: opts.accessory,
      }));
      emit("status", { kind: "remote", state: "open", url: wsUrl });
    });

    ws.addEventListener("message", (ev) => {
      const m = decode(ev.data);
      if (!m) return;
      switch (m.type) {
        case MSG.WELCOME:
          myId = m.id;
          serverWorld = m.world || serverWorld;
          emit("welcome", { id: m.id, world: serverWorld, snapshot: m.snapshot });
          break;
        case MSG.STATE:
          emit("state", m);
          break;
        case MSG.CHAT:
          emit("chat", m);
          break;
        case MSG.EVENT:
          emit("event", m);
          break;
        default: break;
      }
    });

    ws.addEventListener("close", () => {
      emit("status", { kind: "remote", state: "closed" });
    });
    ws.addEventListener("error", () => {
      // Errors usually come with a close right after; let the close handler decide.
    });
  }

  // ── LOCAL backend (offline sandbox) ───────────────────────────────────────

  function connectLocal(opts) {
    const sim = createSim();
    const localId = "local";
    sim.addPlayer(localId, {
      name: opts.name || "Pup",
      furColor: opts.fur, collarColor: opts.collar, accessoryId: opts.accessory,
      x: WORLD.w * 0.5, y: WORLD.h * 0.5,
    });

    backend = { kind: "local", sim, localId, lastT: performance.now(), stop: null };
    myId = localId;

    emit("welcome", { id: localId, world: WORLD, snapshot: sim.snapshot(false), offline: true });
    emit("status", { kind: "local", state: "open" });

    const stepMs = 1000 / 30;
    let acc = 0;
    let last = performance.now();
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      // run a few fixed steps so the offline sim feels stable
      while (acc > 1 / 60) {
        sim.step(1 / 60);
        acc -= 1 / 60;
      }
      const snap = sim.snapshot(true);
      emit("state", { type: "state", ...snap });
      backend.stop = setTimeout(tick, 1000 / 30);
    }
    backend.stop = setTimeout(tick, stepMs);
  }

  // ── Public send API ───────────────────────────────────────────────────────

  let lastInputSent = 0;
  function sendInput(inp) {
    const now = performance.now();
    if (now - lastInputSent < 1000 / INPUT_HZ) return;
    lastInputSent = now;
    if (!backend) return;
    if (backend.kind === "remote") {
      if (backend.ws.readyState !== WebSocket.OPEN) return;
      backend.ws.send(encode({ type: MSG.INPUT, ...inp }));
    } else if (backend.kind === "local") {
      backend.sim.applyInput(backend.localId, inp);
    }
  }

  function sendAction(act) {
    if (!backend) return;
    if (backend.kind === "remote") {
      if (backend.ws.readyState !== WebSocket.OPEN) return;
      backend.ws.send(encode({ type: MSG.ACTION, ...act }));
    } else if (backend.kind === "local") {
      backend.sim.applyAction(backend.localId, { type: act.type, ...act });
    }
  }

  function sendChat(text) {
    if (!backend) return;
    const trimmed = String(text || "").slice(0, 140);
    if (!trimmed) return;
    if (backend.kind === "remote") {
      if (backend.ws.readyState !== WebSocket.OPEN) return;
      backend.ws.send(encode({ type: MSG.CHAT, text: trimmed }));
    } else if (backend.kind === "local") {
      emit("chat", { type: MSG.CHAT, from: backend.sim.findPlayer(backend.localId)?.name || "Pup", id: backend.localId, text: trimmed });
    }
  }

  function disconnect() {
    if (!backend) return;
    if (backend.kind === "remote") {
      try { backend.ws.close(); } catch {}
    } else if (backend.kind === "local") {
      clearTimeout(backend.stop);
    }
    backend = null;
  }

  function getId() { return myId; }
  function getWorld() { return serverWorld; }
  function getBackend() { return backend ? backend.kind : null; }

  return {
    on,
    connect: (opts) => {
      const forceLocal = opts && opts.mode === "local";
      if (forceLocal) return connectLocal(opts);
      return connectRemote(opts || {});
    },
    sendInput, sendAction, sendChat,
    disconnect,
    getId, getWorld, getBackend,
  };
}

function autoWsUrl() {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  // Same host + port as the page (server serves both static + WS)
  return `${proto}//${loc.host}/ws`;
}
