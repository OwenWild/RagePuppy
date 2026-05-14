// Sandbox renderer. Draws the shared world from a snapshot held in
// game.state. Applies a camera transform that follows the local player.
//
// Important coordinates:
//   - world coords:   0..world.w / 0..world.h (sim space)
//   - canvas coords:  CSS pixels relative to the canvas
//   - DPR is applied at the end (so all draw calls work in CSS pixels)

import { CONFIG } from "./config.js";
import { WORLD } from "../shared/protocol.js";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const { palette } = CONFIG;
  const camera = { shakeMs: 0, shakeAmp: 0, offX: 0, offY: 0 };
  const viewport = { w: 960, h: 540 }; // last known CSS size of the canvas

  // Cached image patterns / etc could live here.

  function triggerShake(intensity) {
    camera.shakeMs  = Math.max(camera.shakeMs, CONFIG.ui.shakeMs);
    camera.shakeAmp = Math.max(camera.shakeAmp, intensity);
  }

  function tickShake(dt) {
    if (camera.shakeMs <= 0) { camera.offX = camera.offY = 0; return; }
    camera.shakeMs -= dt * 1000;
    if (camera.shakeMs <= 0) { camera.offX = camera.offY = 0; return; }
    const t = Math.random() * Math.PI * 2;
    const mag = camera.shakeAmp * (camera.shakeMs / CONFIG.ui.shakeMs);
    camera.offX = Math.cos(t) * mag;
    camera.offY = Math.sin(t) * mag;
  }

  function getViewport() { return { ...viewport }; }

  // ── Background ─────────────────────────────────────────────────────────────

  function drawWorldBackground(world) {
    const w = world.w, h = world.h;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette.grassA);
    g.addColorStop(1, palette.grassB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Tile texture stripes
    ctx.fillStyle = "rgba(0,0,0,.06)";
    for (let y = 0; y < h; y += 36) ctx.fillRect(0, y, w, 18);

    // Soft yard markings: a checker pattern in low alpha for orientation
    ctx.fillStyle = "rgba(255,255,255,.04)";
    const cs = 80;
    for (let y = 0; y < h; y += cs) {
      for (let x = 0; x < w; x += cs) {
        if (((x / cs) + (y / cs)) % 2 === 0) ctx.fillRect(x, y, cs, cs);
      }
    }

    // Walls at the world border
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Decorative bushes scattered (purely cosmetic)
    [[w * 0.12, h * 0.22], [w * 0.85, h * 0.18], [w * 0.18, h * 0.85], [w * 0.82, h * 0.88]].forEach(([fx, fy]) => {
      ctx.fillStyle = "#1b8450";
      ctx.beginPath();
      ctx.ellipse(fx, fy, 48, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#258c5a";
      ctx.beginPath();
      ctx.ellipse(fx, fy - 2, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Small decoration flowers (cosmetic)
    [[w * 0.30, h * 0.12], [w * 0.66, h * 0.10], [w * 0.50, h * 0.92]].forEach(([fx, fy]) => {
      ctx.fillStyle = "#ff9ed5";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6, 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffcc57";
      ctx.beginPath();
      ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  function drawBlock(b) {
    const s = WORLD.blockSize;
    const x = b.gx * s;
    const y = b.gy * s;
    const dmg = b.mh ? 1 - (b.hp / b.mh) : 0;
    if (b.k === "bush") {
      ctx.fillStyle = "#2da963";
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, s - 6, s - 6, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.beginPath();
      ctx.ellipse(x + s * 0.4, y + s * 0.35, s * 0.3, s * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fill();
      if (dmg > 0.3) {
        ctx.strokeStyle = "rgba(0,0,0,.25)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x + 8, y + s - 12); ctx.lineTo(x + s - 10, y + 14); ctx.stroke();
      }
    } else {
      // stone / wood block
      ctx.fillStyle = dmg > 0.5 ? "#8a6f4e" : "#a08260";
      ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(x + 2, y + 2, s - 4, 6);
      if (dmg > 0.33) {
        ctx.strokeStyle = "rgba(0,0,0,.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + s - 8, y + s - 12);
        ctx.moveTo(x + 12, y + s - 8); ctx.lineTo(x + s - 14, y + 8);
        ctx.stroke();
      }
    }
  }

  // ── Players ────────────────────────────────────────────────────────────────

  function drawPuppy(p, isMe) {
    const expr = p.state === "bark" ? "angry" : p.state === "dash" ? "determined" : "idle";
    const furColor = p.fur || p.furColor || "#f6bf6b";
    const collarColor = p.collar || p.collarColor || "#ff4d6d";
    const earColor = darkenColor(furColor, 0.78);

    ctx.save();
    ctx.translate(p.x, p.y);

    const sx = p.state === "dash" ? 1.35 : 1;
    const sy = p.state === "dash" ? 0.75 : 1;
    ctx.scale(sx, sy);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(-4, -1, 11, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.ellipse(0, -12, 19, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = earColor;
    ctx.beginPath();
    ctx.ellipse(-12, -24, 8, 12, 0.25, 0, Math.PI * 2);
    ctx.ellipse(12, -24, 8, 12, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,160,160,.4)";
    ctx.beginPath();
    ctx.ellipse(-12, -24, 4, 8, 0.25, 0, Math.PI * 2);
    ctx.ellipse(12, -24, 4, 8, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // Collar
    ctx.strokeStyle = collarColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, -4, 14.5, Math.PI * 0.85, Math.PI * 0.15);
    ctx.stroke();
    ctx.fillStyle = collarColor;
    ctx.beginPath();
    ctx.arc(0, 10, 3, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = furColor;
    [[-8, 16], [8, 16]].forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.ellipse(lx, ly, 5.5, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Eye patches
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-6, -13, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -13, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.ink;
    if (expr === "angry") {
      ctx.beginPath();
      ctx.ellipse(-6, -14, 2.8, 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(6, -14, 2.8, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.8; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-11, -18); ctx.lineTo(-4, -16.5);
      ctx.moveTo(11, -18);  ctx.lineTo(4, -16.5);
      ctx.stroke();
    } else if (expr === "determined") {
      ctx.beginPath();
      ctx.ellipse(-5, -13, 3, 2.8, 0.2, 0, Math.PI * 2);
      ctx.ellipse(5, -13, 3, 2.8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-10, -17); ctx.lineTo(-3, -16);
      ctx.moveTo(10, -17);  ctx.lineTo(3, -16);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(-6, -13, 3.2, 3.3, 0, 0, Math.PI * 2);
      ctx.ellipse(6, -13, 3.2, 3.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.arc(-7.5, -14.5, 1.2, 0, Math.PI * 2);
      ctx.arc(4.5, -14.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Snout
    ctx.fillStyle = "#f9d49a";
    ctx.beginPath();
    ctx.ellipse(0, -7, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.ellipse(0, -9, 3.8, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.5; ctx.lineCap = "round";
    if (expr === "angry") {
      ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.quadraticCurveTo(0, -7, 4, -4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-3.5, -4); ctx.quadraticCurveTo(0, -1.5, 3.5, -4);
      ctx.stroke();
    }

    drawAccessory(p.acc || p.accessoryId);

    // Highlight ring around "me"
    if (isMe) {
      ctx.strokeStyle = "rgba(77,255,181,.65)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(0, 4, 26, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function drawAccessory(id) {
    if (!id || id === "none") return;
    if (id === "cap") {
      ctx.fillStyle = "#3558a8";
      ctx.beginPath(); ctx.ellipse(0, -27, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-15, -27, 30, -13);
      ctx.fillStyle = "#4d78d4";
      ctx.beginPath(); ctx.ellipse(0, -40, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffcc57";
      ctx.beginPath(); ctx.arc(0, -45, 3, 0, Math.PI * 2); ctx.fill();
    } else if (id === "sunnies") {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.beginPath();
      ctx.ellipse(-7, -14, 5.5, 4.5, 0, 0, Math.PI * 2);
      ctx.ellipse(7, -14, 5.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-2, -14); ctx.lineTo(2, -14); ctx.stroke();
    } else if (id === "bee") {
      ctx.fillStyle = "#ffcc57";
      ctx.beginPath(); ctx.ellipse(0, -2, 24, 15, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0a0f1e";
      ctx.fillRect(-24, -6, 48, 4); ctx.fillRect(-24, 2, 48, 4);
      ctx.fillStyle = "rgba(200,240,255,.55)";
      ctx.beginPath();
      ctx.ellipse(-19, -13, 11, 7, -0.5, 0, Math.PI * 2);
      ctx.ellipse(19, -13, 11, 7, 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === "dino") {
      ctx.fillStyle = "#4dffb5";
      ctx.beginPath(); ctx.ellipse(0, -4, 25, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2ec994";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8 - 4, -22);
        ctx.lineTo(i * 8,     -32);
        ctx.lineTo(i * 8 + 4, -22);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawNameTag(p, isMe) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.font = `900 12px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tag = p.name || "Pup";
    const m = ctx.measureText(tag);
    const pad = 6;
    const w = m.width + pad * 2;
    const h = 16;
    const y = -40;
    ctx.fillStyle = "rgba(10,15,30,.65)";
    ctx.beginPath();
    ctx.roundRect(-w / 2, y - h / 2, w, h, 6);
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = "rgba(77,255,181,.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = isMe ? "#4dffb5" : "#ffffff";
    ctx.fillText(tag, 0, y + 0.5);
    ctx.restore();
  }

  // ── Threats ────────────────────────────────────────────────────────────────

  function drawThreat(th) {
    ctx.save();
    ctx.translate(th.x, th.y);
    const stunPct = th.st > 0 ? th.st / 700 : 0;
    if (stunPct > 0) ctx.globalAlpha = 0.55 + 0.45 * (1 - stunPct);

    switch (th.type) {
      case "mailman": {
        ctx.fillStyle = palette.shadow;
        ctx.beginPath(); ctx.ellipse(0, 20, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3558a8";
        ctx.beginPath(); ctx.roundRect(-14, -20, 28, 38, 8); ctx.fill();
        ctx.fillStyle = "#4d78d4";
        ctx.beginPath(); ctx.roundRect(-14, -20, 28, 14, [8, 8, 0, 0]); ctx.fill();
        ctx.fillStyle = "#f4d2b2";
        ctx.beginPath(); ctx.arc(0, -26, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c8a26a";
        ctx.beginPath(); ctx.roundRect(-18, -8, 14, 20, 4); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(-16, -4, 10, 6);
        ctx.fillStyle = "#3558a8";
        ctx.beginPath(); ctx.ellipse(0, -36, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-10, -36, 20, -9);
        break;
      }
      case "leaf": {
        ctx.fillStyle = "#ffe66d";
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#d4b800"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
        break;
      }
      case "squirrel": {
        ctx.fillStyle = palette.shadow;
        ctx.beginPath(); ctx.ellipse(0, 12, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c07a3a";
        ctx.beginPath(); ctx.ellipse(0, 3, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#a06228";
        ctx.beginPath(); ctx.ellipse(-12, -8, 8, 13, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e0aa74";
        ctx.beginPath(); ctx.ellipse(-11, -9, 5, 9, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c07a3a";
        ctx.beginPath(); ctx.ellipse(-3, -8, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#a06228";
        ctx.beginPath();
        ctx.ellipse(-7, -15, 3, 5, -0.3, 0, Math.PI * 2);
        ctx.ellipse(1, -15, 3, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(-4, -9, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath(); ctx.arc(-4, -9, 1.2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "bike": {
        ctx.fillStyle = "#ddd";
        ctx.beginPath(); ctx.arc(-14, 10, 10, 0, Math.PI * 2); ctx.arc(14, 10, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#999"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-14, 10, 10, 0, Math.PI * 2); ctx.arc(14, 10, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#ffcc57"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, 10); ctx.lineTo(0, -5); ctx.lineTo(14, 10);
        ctx.moveTo(0, -5);   ctx.lineTo(0, -14); ctx.lineTo(-8, -14);
        ctx.stroke();
        ctx.fillStyle = "#f4d2b2";
        ctx.beginPath(); ctx.arc(4, -18, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff4d6d";
        ctx.beginPath(); ctx.ellipse(2, -11, 6, 8, -0.2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "box": {
        const dmg = th.mh ? 1 - (th.hp / th.mh) : 0;
        ctx.fillStyle = dmg > 0.5 ? "#b07a43" : "#d29b63";
        ctx.beginPath(); ctx.roundRect(-16, -16, 32, 32, 4); ctx.fill();
        ctx.strokeStyle = "#9a6a3a"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
        ctx.moveTo(0, -16); ctx.lineTo(0, 16);
        ctx.stroke();
        if (dmg > 0.33) {
          ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-4, -2); ctx.lineTo(-10, 4); ctx.stroke();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`HP:${th.hp}`, 0, 5);
        break;
      }
    }
    ctx.restore();
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  function drawProp(pr) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (pr.kind === "flower") {
      ctx.fillStyle = "#7ecdf5";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 7, Math.sin(a) * 7, 4.5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffcc57";
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else if (pr.kind === "slipper") {
      ctx.fillStyle = "#f3a7d5";
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e084b8";
      ctx.beginPath(); ctx.ellipse(-5, -4, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (pr.kind === "toy") {
      ctx.fillStyle = "#ffcc57";
      ctx.beginPath();
      ctx.arc(-8, 0, 6, 0, Math.PI * 2);
      ctx.arc(8, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e6b030"; ctx.fillRect(-3, -2, 6, 4);
    }
    ctx.restore();
  }

  // ── Effects (cones, floats, stars, kills) ──────────────────────────────────

  function drawEffects(effects) {
    effects.forEach((eff) => {
      const t = Math.max(0, eff.life / eff.maxLife);
      if (eff.type === "barkCone") {
        ctx.save();
        ctx.globalAlpha = t * 0.38;
        ctx.fillStyle = "#ffe066";
        ctx.beginPath();
        ctx.moveTo(eff.x, eff.y);
        ctx.arc(eff.x, eff.y, eff.range, eff.angle - eff.arc / 2, eff.angle + eff.arc / 2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        for (let i = 1; i <= 3; i++) {
          const rr = eff.range * (i / 3) * (1.2 - t * 0.4);
          ctx.globalAlpha = t * 0.45 * (1 - i * 0.25);
          ctx.beginPath();
          ctx.arc(eff.x, eff.y, rr, eff.angle - eff.arc / 2, eff.angle + eff.arc / 2);
          ctx.stroke();
        }
        ctx.restore();
      } else if (eff.type === "dashTrail") {
        ctx.save();
        ctx.globalAlpha = t * 0.38;
        ctx.fillStyle = eff.color || "#f6bf6b";
        ctx.beginPath();
        ctx.ellipse(eff.x, eff.y, eff.r * (0.5 + t), eff.r * (0.5 + t), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (eff.type === "float") {
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 2);
        const s = 0.8 + (1 - t) * 0.6;
        ctx.font = `900 ${Math.round(16 * s)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = eff.color || "#ffcc57";
        ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 3;
        ctx.strokeText(eff.text, eff.x, eff.y);
        ctx.fillText(eff.text, eff.x, eff.y);
        ctx.restore();
      } else if (eff.type === "star") {
        ctx.save();
        ctx.globalAlpha = t;
        ctx.fillStyle = eff.color || "#ffcc57";
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, eff.r * t, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  function drawToolCursor(state) {
    if (!state.cursor.inWindow) return;
    const x = state.cursor.x, y = state.cursor.y;
    const tool = state.selectedTool;
    ctx.save();

    if (tool === "move") {
      // simple ring
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    } else if (tool === "erase") {
      ctx.strokeStyle = "rgba(255,77,109,.85)";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
    } else if (tool === "block" || tool === "bush") {
      const s = WORLD.blockSize;
      const gx = Math.floor(x / s);
      const gy = Math.floor(y / s);
      ctx.strokeStyle = tool === "bush" ? "rgba(77,255,181,.8)" : "rgba(255,204,87,.85)";
      ctx.fillStyle   = tool === "bush" ? "rgba(77,255,181,.18)" : "rgba(255,204,87,.18)";
      ctx.lineWidth = 2;
      ctx.fillRect(gx * s, gy * s, s, s);
      ctx.strokeRect(gx * s + 1, gy * s + 1, s - 2, s - 2);
    } else {
      // spawn-tool ghost
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      ctx.font = "900 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tool.toUpperCase(), x, y + 32);
    }
    ctx.restore();
  }

  // ── Top-level draw ─────────────────────────────────────────────────────────

  function draw(state, dt) {
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (canvas.width !== Math.round(cssW * ratio) || canvas.height !== Math.round(cssH * ratio)) {
      canvas.width  = Math.round(cssW * ratio);
      canvas.height = Math.round(cssH * ratio);
    }
    viewport.w = cssW;
    viewport.h = cssH;

    tickShake(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0e1733";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // CSS-pixel + camera transform
    const cam = state.camera;
    const offX = cssW / 2 - cam.x;
    const offY = cssH / 2 - cam.y;
    ctx.setTransform(ratio, 0, 0, ratio,
      (offX + camera.offX) * ratio,
      (offY + camera.offY) * ratio);

    drawWorldBackground(state.world);

    // Blocks
    (state.blocks || []).forEach(drawBlock);

    // Props
    (state.props || []).forEach(drawProp);

    // Effects under entities
    const lowFX = (state.effects || []).filter((e) => e.type === "dashTrail" || e.type === "star");
    drawEffects(lowFX);

    // Threats
    (state.threats || []).forEach(drawThreat);

    // Players: draw "me" last so I'm on top
    const myId = state.myId;
    const others = [];
    let me = null;
    state.players.forEach((p) => {
      if (p.id === myId) me = p; else others.push(p);
    });
    others.forEach((p) => { drawPuppy(p, false); drawNameTag(p, false); });
    // For "me", prefer the predicted local pos to feel responsive
    if (me) {
      const pred = { ...me,
        x: state._local.x, y: state._local.y,
        faceAngle: state._local.faceAngle,
        state: state._local.state,
        fur: state.me.furColor || me.fur,
        collar: state.me.collarColor || me.collar,
        acc: state.me.accessoryId || me.acc,
      };
      drawPuppy(pred, true);
      drawNameTag({ ...me, name: state.me.name || me.name }, true);
    }

    // Top FX (cones, floats)
    const hiFX = (state.effects || []).filter((e) => e.type !== "dashTrail" && e.type !== "star");
    drawEffects(hiFX);

    // Tool ghost cursor (world coords)
    drawToolCursor(state);
  }

  return { draw, triggerShake, getViewport };
}

function darkenColor(hex, factor) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "#806030";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (n) => Math.round(n * factor).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
