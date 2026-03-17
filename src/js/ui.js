import { CONFIG } from "./config.js";
import { loadSave, saveData } from "./storage.js";
import { isMuted, setMuted, initBgm } from "./audio.js";

// DOM HUD + overlays; game logic lives in game.js.

export function createUI(game) {
  const overlayEl = document.getElementById("overlay");
  const hudScore = document.getElementById("hudScore");
  const hudCombo = document.getElementById("hudCombo");
  const hudDelivered = document.getElementById("hudDelivered");
  const hudDeliveredFill = document.getElementById("hudDeliveredFill");
  const cdBark = document.getElementById("cdBark");
  const cdDash = document.getElementById("cdDash");
  const btnSound = document.getElementById("btnSound");
  const btnPause = document.getElementById("btnPause");

  let save = loadSave();

  function renderHud() {
    if (!game.state) return;
    const s = game.state;
    if (hudScore) hudScore.textContent = String(Math.floor(s.score ?? 0));
    if (hudCombo) hudCombo.textContent = `x${Math.max(1, Math.floor(s.combo || 1))}`;
    if (hudDelivered && hudDeliveredFill) {
      const max = CONFIG.gameplay.deliveredToLose;
      const v = s.delivered || 0;
      hudDelivered.textContent = `${v} / ${max}`;
      hudDeliveredFill.style.width = `${(v / max) * 100}%`;
    }
    if (cdBark && cdDash) {
      const bc = s.barkCooldown ?? 0;
      const dc = s.dashCooldown ?? 0;
      cdBark.style.width = `${100 - (bc / CONFIG.player.barkCooldownMs) * 100}%`;
      cdDash.style.width = `${100 - (dc / CONFIG.player.dashCooldownMs) * 100}%`;
    }
  }

  function showMenu() {
    if (!overlayEl) return;
    // Ensure BGM is ready once user reaches the title screen after first gesture.
    initBgm();
    overlayEl.innerHTML = `
      <section class="panel">
        <header class="panelHeader">
          <div>
            <div class="panelTitle">RagePuppy</div>
            <p class="panelSubtitle">
              Tiny Dog. Huge Feelings. Defend your mailbox from suspiciously ordinary chaos.
            </p>
          </div>
        </header>
        <div class="menuGrid">
          <button type="button" class="bigBtn primary" id="btnStartRun">
            <div class="btnTitle">Start Arcade Defense</div>
            <div class="btnSub">Endless waves of mailmen, squirrels, boxes, and very dangerous leaves.</div>
          </button>
          <button type="button" class="bigBtn" id="btnHowTo">
            <div class="btnTitle">How to Play</div>
            <div class="btnSub">Move, bark, dash, protect the porch. Chaos is rewarded.</div>
          </button>
        </div>
        <div class="splitRow">
          <div class="card">
            <div class="cardTitle">Customize Puppy</div>
            <div class="chips" id="chipsFur"></div>
          </div>
          <div class="card">
            <div class="cardTitle">High Score</div>
            <p class="muted" id="highScoreText"></p>
          </div>
        </div>
      </section>
    `;
    const hsText = document.getElementById("highScoreText");
    if (hsText) {
      hsText.textContent = `Best: ${Math.floor(save.bestScore || 0)} pts over ${save.runs || 0} runs.`;
    }
    const btnStartRun = document.getElementById("btnStartRun");
    const btnHowTo = document.getElementById("btnHowTo");
    btnStartRun?.addEventListener("click", () => {
      overlayEl.innerHTML = "";
      document.getElementById("hud")?.setAttribute("aria-hidden", "false");
      game.startRun();
    });
    btnHowTo?.addEventListener("click", showHowTo);
  }

  function showHowTo() {
    if (!overlayEl) return;
    overlayEl.innerHTML = `
      <section class="panel">
        <header class="panelHeader">
          <div>
            <div class="panelTitle">How to Play</div>
            <p class="panelSubtitle">RagePuppy takes every leaf personally.</p>
          </div>
          <button type="button" class="xBtn" id="btnHowClose">×</button>
        </header>
        <ul class="list">
          <li><b>Move</b>: WASD / arrows on desktop, thumb joystick on mobile.</li>
          <li><b>Bark</b>: Space or big BORK button. Stuns and scares threats in front of you.</li>
          <li><b>Dash</b>: Shift or ZOOM button. Zoomies through props and bonks threats.</li>
          <li><b>Protect</b>: Keep mailmen, boxes, and leaves away from the porch & mailbox.</li>
          <li><b>Score</b>: Chain hits quickly to build combo for titles like “Tiny Terror” and “Mailbox Defender”.</li>
        </ul>
      </section>
    `;
    document.getElementById("btnHowClose")?.addEventListener("click", showMenu);
  }

  function showGameOver() {
    if (!overlayEl) return;
    const lastScore = Math.floor(game.state.score || 0);
    overlayEl.innerHTML = `
      <section class="panel">
        <header class="panelHeader">
          <div>
            <div class="panelTitle">RagePuppy has been emotionally defeated.</div>
            <p class="panelSubtitle">The neighborhood remains... insufficiently barked at.</p>
          </div>
        </header>
        <p><b>Score</b>: ${lastScore}</p>
        <div class="menuGrid">
          <button type="button" class="bigBtn primary" id="btnRetry">
            <div class="btnTitle">One More Run</div>
            <div class="btnSub">Rage harder. Bark faster. Believe in the tiny dog.</div>
          </button>
          <button type="button" class="bigBtn" id="btnBackMenu">
            <div class="btnTitle">Back to Title</div>
            <div class="btnSub">Adjust vibes, check high scores, pet the goblin.</div>
          </button>
        </div>
      </section>
    `;
    document.getElementById("btnRetry")?.addEventListener("click", () => {
      overlayEl.innerHTML = "";
      game.startRun();
    });
    document.getElementById("btnBackMenu")?.addEventListener("click", () => {
      showMenu();
    });
  }

  if (btnSound) {
    btnSound.addEventListener("click", () => {
      const next = !isMuted();
      setMuted(next);
      btnSound.textContent = next ? "Sound: Off" : "Sound: On";
    });
  }

  if (btnPause) {
    btnPause.addEventListener("click", () => {
      if (game.state.mode === "running") {
        game.state.mode = "paused";
        if (overlayEl) overlayEl.innerHTML = "<section class=\"panel\"><div class=\"panelTitle\">Paused</div><p class=\"panelSubtitle\">RagePuppy is catching a tiny breath.</p></section>";
      } else if (game.state.mode === "paused") {
        if (overlayEl) overlayEl.innerHTML = "";
        game.state.mode = "running";
      }
    });
  }

  // initial
  showMenu();

  return {
    renderHud,
    showMenu,
    showGameOver,
  };
}

