import { CONFIG } from "./config.js";
import { clamp } from "./util.js";

// Responsible for all canvas drawing. Pure functions that read from state.

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const { world, palette } = CONFIG;

  const camera = { shakeMs: 0, shakeAmp: 0, offX: 0, offY: 0 };

  function updateShake(dt) {
    if (camera.shakeMs <= 0) {
      camera.offX = camera.offY = 0;
      return;
    }
    camera.shakeMs -= dt * 1000;
    const t = Math.random() * Math.PI * 2;
    const mag = camera.shakeAmp * (camera.shakeMs / CONFIG.ui.shakeMs);
    camera.offX = Math.cos(t) * mag;
    camera.offY = Math.sin(t) * mag;
  }

  function triggerShake(intensity) {
    camera.shakeMs = CONFIG.ui.shakeMs;
    camera.shakeAmp = intensity;
  }

  function drawYard() {
    const { w, h } = world;
    // Grass
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette.grassA);
    g.addColorStop(1, palette.grassB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Path + porch
    const pathW = 160;
    const pathX = w * 0.5 - pathW * 0.5;
    ctx.fillStyle = palette.path;
    ctx.fillRect(pathX, h * 0.4, pathW, h * 0.6);

    ctx.fillStyle = palette.porch;
    ctx.fillRect(pathX - 40, h * 0.28, pathW + 80, h * 0.12);

    // Mailbox
    const boxX = pathX + pathW * 0.7;
    const boxY = h * 0.32;
    ctx.fillStyle = palette.shadow;
    ctx.fillRect(boxX - 3, boxY + 32, 26, 8);
    ctx.fillStyle = palette.fence;
    ctx.fillRect(boxX, boxY + 8, 8, 32);
    ctx.fillStyle = palette.hot;
    ctx.beginPath();
    ctx.roundRect(boxX - 12, boxY - 4, 32, 20, 6);
    ctx.fill();

    // Fence
    ctx.fillStyle = palette.fence;
    ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = palette.fenceLine;
    for (let x = 10; x < w; x += 30) {
      ctx.fillRect(x, 0, 12, 34);
    }

    // Bushes
    ctx.fillStyle = "#1b8450";
    ctx.beginPath();
    ctx.ellipse(90, h * 0.55, 40, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(w - 90, h * 0.62, 46, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPuppy(p) {
    const { palette } = CONFIG;
    const baseX = p.x;
    const baseY = p.y;

    ctx.save();
    ctx.translate(baseX, baseY);

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const furColor = p.furColor || "#f6bf6b";
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.ellipse(0, 4, 20, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.ellipse(0, -10, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = "#d28b4a";
    ctx.beginPath();
    ctx.ellipse(-10, -20, 6, 10, 0.2, 0, Math.PI * 2);
    ctx.ellipse(10, -20, 6, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Collar
    ctx.strokeStyle = p.collarColor || palette.hot;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -4, 13, Math.PI * 0.9, Math.PI * 0.1);
    ctx.stroke();

    // Face
    const expr = p.state === "bark" ? "angry" : p.state === "dash" ? "determined" : "idle";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-6, -11, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -11, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.ink;
    if (expr === "angry") {
      ctx.beginPath();
      ctx.ellipse(-6, -12, 2.5, 2.8, 0, 0, Math.PI * 2);
      ctx.ellipse(6, -12, 2.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, -15);
      ctx.lineTo(-4, -14);
      ctx.moveTo(10, -15);
      ctx.lineTo(4, -14);
      ctx.stroke();
    } else if (expr === "determined") {
      ctx.beginPath();
      ctx.ellipse(-5, -11, 3, 2.4, 0.2, 0, Math.PI * 2);
      ctx.ellipse(5, -11, 3, 2.4, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(-6, -11, 2.6, 2.8, 0, 0, Math.PI * 2);
      ctx.ellipse(6, -11, 2.6, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Snout
    ctx.fillStyle = "#f9d49a";
    ctx.beginPath();
    ctx.ellipse(0, -6, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.ellipse(0, -8, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function draw(state, dt) {
    const { world } = CONFIG;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateShake(dt);
    ctx.translate(camera.offX, camera.offY);

    drawYard();
    if (state.player) {
      drawPuppy(state.player);
    }

    ctx.restore();
  }

  return { draw, triggerShake };
}

