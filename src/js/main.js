import { CONFIG } from "./config.js";
import { createGame } from "./game.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";

// Entry point: wires canvas, game, renderer, input, and tick loop.

const canvas = document.getElementById("game");
const hudEl = document.getElementById("hud");
const overlayEl = document.getElementById("overlay");

const game = createGame();
const renderer = createRenderer(canvas);
const input = createInput();

let lastTime = performance.now();

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
  input.endFrame();

  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Temporary simple title overlay; richer UI comes from ui.js later.
if (overlayEl) {
  overlayEl.innerHTML = `
    <section class="panel">
      <header class="panelHeader">
        <div>
          <div class="panelTitle">RagePuppy</div>
          <p class="panelSubtitle">
            Tiny dog. Huge feelings. Defend your porch from extremely suspicious everyday life.
          </p>
        </div>
      </header>
      <div class="menuGrid">
        <button type="button" class="bigBtn primary" id="btnStart">
          <div class="btnTitle">Start Arcade Defense</div>
          <div class="btnSub">Sprint, bark, and zoomie your way through endless neighborhood nonsense.</div>
        </button>
        <button type="button" class="bigBtn" id="btnHow">
          <div class="btnTitle">How to Play</div>
          <div class="btnSub">Move, bark, dash, protect the porch. Causing mild chaos is encouraged.</div>
        </button>
      </div>
    </section>
  `;

  const startBtn = document.getElementById("btnStart");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      overlayEl.innerHTML = "";
      hudEl?.setAttribute("aria-hidden", "false");
      game.startRun();
    });
  }

  const howBtn = document.getElementById("btnHow");
  if (howBtn) {
    howBtn.addEventListener("click", () => {
      alert("Move with WASD or arrows. Bark with Space. Dash with Shift. Protect the porch!");
    });
  }
}

requestAnimationFrame(loop);

