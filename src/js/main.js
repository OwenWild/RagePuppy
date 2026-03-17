import { CONFIG } from "./config.js";
import { createGame } from "./game.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { createUI } from "./ui.js";
import { loadSave, saveData } from "./storage.js";

// Entry point: wires canvas, game, renderer, input, UI, and tick loop.

const canvas = document.getElementById("game");
const hudEl = document.getElementById("hud");

const game = createGame();
game.state.saveData = loadSave();

const renderer = createRenderer(canvas);
const input = createInput();
const ui = createUI(game);

if (hudEl) hudEl.setAttribute("aria-hidden", "true");

let lastTime = performance.now();
let lastMode = game.state.mode;

function resizeCanvas() {
  const { world } = CONFIG;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  CONFIG.world.w = rect.width;
  CONFIG.world.h = rect.height;
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const inputSnapshot = input.peek();
  game.update(dt, inputSnapshot);
  renderer.draw(game.state, dt);
  ui.renderHud();
  input.endFrame();

  if (game.state.mode === "running" && hudEl) {
    hudEl.setAttribute("aria-hidden", "false");
  }

  if (lastMode === "running" && game.state.mode === "gameOver" && game.state.justEnded) {
    saveData(game.state.saveData);
    ui.showGameOver();
  }
  lastMode = game.state.mode;

  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(loop);

