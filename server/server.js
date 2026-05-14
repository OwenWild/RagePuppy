// RagePuppy multiplayer sandbox — authoritative WebSocket server.
// Also serves the static client (so `npm start` is the only command players need).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { WebSocketServer } from "ws";

import { createSim } from "../src/shared/sim.js";
import {
  MSG, ACTION, SIM_HZ, SNAPSHOT_HZ, WORLD, PROTOCOL_VERSION, encode, decode,
} from "../src/shared/protocol.js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");
const PORT       = Number(process.env.PORT) || 8080;

// ─── Static file server ─────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".ico":  "image/x-icon",
};

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const target  = path.normalize(path.join(root, decoded === "/" ? "/index.html" : decoded));
  if (!target.startsWith(root)) return null;
  return target;
}

const httpServer = http.createServer((req, res) => {
  const target = safeJoin(ROOT, req.url || "/");
  if (!target) { res.writeHead(400); res.end("bad path"); return; }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      // Fall back to index.html for unknown routes
      const fallback = path.join(ROOT, "index.html");
      fs.readFile(fallback, (e2, buf) => {
        if (e2) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(buf);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(target).pipe(res);
  });
});

// ─── World / sim ────────────────────────────────────────────────────────────

const sim = createSim();
const clients = new Map(); // ws -> { id }

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

let _idCounter = 1;
function nextId() { return `u${_idCounter++}_${Math.random().toString(36).slice(2, 6)}`; }

function sanitizeName(raw) {
  const s = String(raw || "Pup").replace(/[\u0000-\u001f]/g, "").trim();
  return s.slice(0, 18) || "Pup";
}

function sanitizeChat(raw) {
  return String(raw || "").replace(/[\u0000-\u001f]/g, "").slice(0, 140).trim();
}

wss.on("connection", (ws, req) => {
  const id = nextId();
  clients.set(ws, { id });
  let helloed = false;

  ws.on("message", (raw) => {
    let msg;
    try { msg = decode(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === MSG.HELLO) {
      if (helloed) return;
      helloed = true;
      const name = sanitizeName(msg.name);
      const fur = typeof msg.fur === "string" ? msg.fur : "#f6bf6b";
      const collar = typeof msg.collar === "string" ? msg.collar : "#ff4d6d";
      const acc = typeof msg.accessory === "string" ? msg.accessory : "none";
      sim.addPlayer(id, {
        name,
        furColor: fur, collarColor: collar, accessoryId: acc,
        x: WORLD.w * 0.5 + (Math.random() - 0.5) * 200,
        y: WORLD.h * 0.5 + (Math.random() - 0.5) * 200,
      });
      ws.send(encode({
        type: MSG.WELCOME,
        protocol: PROTOCOL_VERSION,
        id,
        world: WORLD,
        snapshot: sim.snapshot(false),
      }));
      broadcastChat({ from: "server", text: `${name} joined the yard.`, system: true });
      return;
    }

    if (!helloed) return;

    switch (msg.type) {
      case MSG.INPUT:
        sim.applyInput(id, msg);
        break;
      case MSG.ACTION:
        sim.applyAction(id, msg);
        break;
      case MSG.CHAT: {
        const text = sanitizeChat(msg.text);
        if (!text) return;
        const p = sim.findPlayer(id);
        broadcastChat({ from: p ? p.name : "???", id, text });
        break;
      }
      case MSG.PING:
        ws.send(encode({ type: MSG.PONG, t: msg.t }));
        break;
      default:
        break;
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    sim.removePlayer(id);
    broadcastChat({ from: "server", text: "A pup wandered off.", system: true });
  });

  ws.on("error", () => { /* ignore */ });
});

function broadcastChat(payload) {
  const data = encode({ type: MSG.CHAT, ...payload });
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastState() {
  const snap = sim.snapshot(true);
  const data = encode({ type: MSG.STATE, ...snap });
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ─── Tick loops ─────────────────────────────────────────────────────────────

const simDtMs   = 1000 / SIM_HZ;
const snapDtMs  = 1000 / SNAPSHOT_HZ;
let last = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt  = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.step(dt);
}, simDtMs);

setInterval(broadcastState, snapDtMs);

// Idle-pup pruner: drop players with no input for 60s (server-side keepalive)
setInterval(() => {
  const now = Date.now();
  const stale = [];
  sim.state.players.forEach((p) => {
    if (now - p.lastSeen > 60_000) stale.push(p.id);
  });
  stale.forEach((id) => sim.removePlayer(id));
}, 5_000);

httpServer.listen(PORT, () => {
  console.log(`🐶 RagePuppy multiplayer sandbox listening on http://localhost:${PORT}`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
