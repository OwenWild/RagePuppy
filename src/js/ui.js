// UI for the multiplayer sandbox:
//   - Title / join screen (name + cosmetics + Join / Solo)
//   - HUD: hotbar, player list, score, server status
//   - Chat box (press T or Enter)
//   - Pause overlay

import { TOOLS } from "../shared/protocol.js";
import { loadSave, saveData } from "./storage.js";
import { isMuted, setMuted, initBgm } from "./audio.js";

const FUR_COLORS = [
  { id: "golden",  label: "Golden",  color: "#f6bf6b" },
  { id: "cream",   label: "Cream",   color: "#f5e6c8" },
  { id: "brown",   label: "Choco",   color: "#a0572a" },
  { id: "grey",    label: "Storm",   color: "#9eaabb" },
  { id: "white",   label: "Cloud",   color: "#f0f0f0" },
  { id: "black",   label: "Void",    color: "#2a2a35" },
];
const COLLAR_COLORS = [
  { id: "raspberry", label: "Berry",  color: "#ff4d6d" },
  { id: "sky",       label: "Sky",    color: "#4db8ff" },
  { id: "lime",      label: "Lime",   color: "#4dffb5" },
  { id: "gold",      label: "Gold",   color: "#ffcc57" },
  { id: "purple",    label: "Grape",  color: "#9b59ff" },
];
const ACCESSORIES = [
  { id: "none", name: "No Hat" },
  { id: "cap", name: "Tiny Cap" },
  { id: "sunnies", name: "Sunglasses" },
  { id: "bee", name: "Bee Costume" },
  { id: "dino", name: "Dino Hoodie" },
];

// Called from the UI: when the user wants to join a server (or solo).
// Receives the chosen identity. Wired up in main.js.
export function createUI(game, hooks) {
  const overlayEl  = document.getElementById("overlay");
  const hudEl      = document.getElementById("hud");
  const hudScore   = document.getElementById("hudScore");
  const hudPlayers = document.getElementById("hudPlayers");
  const hudStatus  = document.getElementById("hudStatus");
  const hotbarEl   = document.getElementById("hotbar");
  const chatLog    = document.getElementById("chatLog");
  const chatBox    = document.getElementById("chatBox");
  const chatInput  = document.getElementById("chatInput");
  const playerListEl = document.getElementById("playerList");
  const cdBark     = document.getElementById("cdBark");
  const cdDash     = document.getElementById("cdDash");
  const btnSound   = document.getElementById("btnSound");
  const btnPause   = document.getElementById("btnPause");
  const toolNameEl = document.getElementById("toolName");
  const toolHintEl = document.getElementById("toolHint");

  let save = loadSave();

  function setOverlay(html, dim = false) {
    if (!overlayEl) return;
    overlayEl.innerHTML = html;
    overlayEl.classList.toggle("dim", dim);
  }

  // ── HUD ──────────────────────────────────────────────────────────────────

  function buildHotbar() {
    if (!hotbarEl) return;
    hotbarEl.innerHTML = TOOLS.map((t) => `
      <button type="button" class="hotSlot" data-tool="${t.id}" title="${t.hint}">
        <div class="hotKey">${t.key}</div>
        <div class="hotLabel">${t.label}</div>
      </button>
    `).join("");
    hotbarEl.querySelectorAll("[data-tool]").forEach((el) => {
      el.addEventListener("click", () => {
        hooks.selectTool(el.dataset.tool);
      });
    });
  }

  function updateHotbarSelection() {
    if (!hotbarEl) return;
    const sel = game.state.selectedTool;
    hotbarEl.querySelectorAll("[data-tool]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.tool === sel);
    });
    const t = TOOLS.find((x) => x.id === sel);
    if (toolNameEl) toolNameEl.textContent = t ? t.label : "—";
    if (toolHintEl) toolHintEl.textContent = t ? t.hint : "";
  }

  function renderHud() {
    if (!game.state || game.state.mode !== "running") return;
    const s = game.state;
    if (hudScore) {
      const me = s.players.get(s.myId);
      hudScore.textContent = String(Math.floor(me?.score ?? 0));
    }
    if (hudPlayers) hudPlayers.textContent = String(s.players.size);
    if (hudStatus) {
      hudStatus.textContent = s.backend === "remote" ? "Online" : s.backend === "local" ? "Solo" : "—";
      hudStatus.classList.toggle("online", s.backend === "remote");
      hudStatus.classList.toggle("offline", s.backend === "local");
    }
    if (cdBark) {
      const pct = 1 - (s._local.barkCooldown ?? 0) / 380;
      cdBark.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
    }
    if (cdDash) {
      const pct = 1 - (s._local.dashCooldown ?? 0) / 1100;
      cdDash.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
    }
    // Player list
    if (playerListEl) {
      const me = s.myId;
      const rows = [];
      s.players.forEach((p) => {
        rows.push(`<div class="plRow${p.id === me ? " me" : ""}">
          <span class="plDot" style="background:${p.fur || "#f6bf6b"}"></span>
          <span class="plName">${escapeHtml(p.name || "Pup")}</span>
          <span class="plScore">${Math.floor(p.score || 0)}</span>
        </div>`);
      });
      playerListEl.innerHTML = rows.join("") || `<div class="plRow"><span class="plName muted">No pups yet.</span></div>`;
    }
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  function appendChat({ from, text, system }) {
    if (!chatLog) return;
    const div = document.createElement("div");
    div.className = "chatLine" + (system ? " system" : "");
    if (system) {
      div.innerHTML = `<i>${escapeHtml(text)}</i>`;
    } else {
      div.innerHTML = `<b>${escapeHtml(from || "?")}</b>: ${escapeHtml(text)}`;
    }
    chatLog.appendChild(div);
    while (chatLog.children.length > 60) chatLog.removeChild(chatLog.firstChild);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function setChatActive(active) {
    if (!chatBox) return;
    chatBox.classList.toggle("active", active);
    document.dispatchEvent(new CustomEvent("ragepuppy:chat-active", { detail: { active } }));
    if (active) {
      chatInput.value = "";
      // requestAnimationFrame so the focus survives the keydown that opened it.
      requestAnimationFrame(() => chatInput?.focus());
    } else {
      chatInput?.blur();
    }
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const text = chatInput.value.trim();
        if (text) document.dispatchEvent(new CustomEvent("ragepuppy:chat-submit", { detail: { text } }));
        setChatActive(false);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Escape") {
        setChatActive(false);
        e.preventDefault();
        e.stopPropagation();
      }
      // Stop game from seeing T/Enter/Slash while typing
      e.stopPropagation();
    });
    chatInput.addEventListener("keyup", (e) => e.stopPropagation());
  }

  // ── Title / Join screen ──────────────────────────────────────────────────

  function showJoin() {
    if (hudEl) hudEl.setAttribute("aria-hidden", "true");
    save = loadSave();
    initBgm();
    const cos = save.cosmetics || {};
    const lastName = save.lastName || "Pup";

    const furChips = FUR_COLORS.map((fc) => `
      <button type="button" class="chip ${cos.fur === fc.id ? "selected" : ""}" data-fur="${fc.id}">
        <span class="chipDot" style="background:${fc.color}"></span> ${fc.label}
      </button>`).join("");

    const collarChips = COLLAR_COLORS.map((cc) => `
      <button type="button" class="chip ${cos.collar === cc.id ? "selected" : ""}" data-collar="${cc.id}">
        <span class="chipDot" style="background:${cc.color}"></span> ${cc.label}
      </button>`).join("");

    const accChips = ACCESSORIES.map((a) => `
      <button type="button" class="chip ${cos.accessoryId === a.id ? "selected" : ""}" data-acc="${a.id}">
        ${a.name}
      </button>`).join("");

    setOverlay(`
      <section class="panel">
        <div style="text-align:center;margin-bottom:14px">
          <div style="font-size:48px;line-height:1">🐶</div>
          <div class="panelTitle" style="font-size:32px;margin-top:6px">RagePuppy Sandbox</div>
          <p class="panelSubtitle" style="margin-top:4px">
            Tiny Dogs. Huge Feelings.<br>Build, bark, and bonk together in a shared yard.
          </p>
        </div>

        <div class="card" style="margin-bottom:10px">
          <div class="cardTitle">Your Pup</div>
          <label class="field">
            <span class="fieldLabel">Name</span>
            <input id="joinName" class="fieldInput" maxlength="18" value="${escapeAttr(lastName)}" placeholder="What's your pup's name?" />
          </label>
          <div class="cardTitle" style="margin-top:10px">Fur</div>
          <div class="chips">${furChips}</div>
          <div class="cardTitle" style="margin-top:10px">Collar</div>
          <div class="chips">${collarChips}</div>
          <div class="cardTitle" style="margin-top:10px">Accessory</div>
          <div class="chips">${accChips}</div>
        </div>

        <div class="card" style="margin-bottom:10px">
          <div class="cardTitle">Server</div>
          <label class="field">
            <span class="fieldLabel">WebSocket URL <span class="muted">(optional)</span></span>
            <input id="joinUrl" class="fieldInput" placeholder="leave blank to use this page's server" />
          </label>
          <p class="muted" style="margin-top:8px">If a server is reachable, you'll join it. Otherwise the game runs a local sandbox in this tab.</p>
        </div>

        <div class="menuGrid">
          <button type="button" class="bigBtn primary" id="btnJoin" style="grid-column:1/-1">
            <div class="btnTitle" style="font-size:18px">▶ Enter the Yard</div>
            <div class="btnSub">Connect to the server (or play solo if none is running).</div>
          </button>
          <button type="button" class="bigBtn" id="btnSolo">
            <div class="btnTitle">🐾 Solo Sandbox</div>
            <div class="btnSub">Skip multiplayer and just goof around.</div>
          </button>
          <button type="button" class="bigBtn" id="btnHowTo">
            <div class="btnTitle">📋 How to Play</div>
            <div class="btnSub">Controls + the art of the BORK.</div>
          </button>
        </div>
      </section>
    `);

    overlayEl.querySelectorAll("[data-fur]").forEach((b) => b.addEventListener("click", () => {
      save.cosmetics = { ...(save.cosmetics || {}), fur: b.dataset.fur };
      const fc = FUR_COLORS.find((x) => x.id === b.dataset.fur);
      if (fc) game.setMyCosmetics({ furColor: fc.color });
      saveData(save);
      showJoin();
    }));
    overlayEl.querySelectorAll("[data-collar]").forEach((b) => b.addEventListener("click", () => {
      save.cosmetics = { ...(save.cosmetics || {}), collar: b.dataset.collar };
      const cc = COLLAR_COLORS.find((x) => x.id === b.dataset.collar);
      if (cc) game.setMyCosmetics({ collarColor: cc.color });
      saveData(save);
      showJoin();
    }));
    overlayEl.querySelectorAll("[data-acc]").forEach((b) => b.addEventListener("click", () => {
      save.cosmetics = { ...(save.cosmetics || {}), accessoryId: b.dataset.acc };
      game.setMyCosmetics({ accessoryId: b.dataset.acc });
      saveData(save);
      showJoin();
    }));

    const join = () => {
      const name = (document.getElementById("joinName")?.value || "Pup").trim().slice(0, 18) || "Pup";
      const wsUrl = (document.getElementById("joinUrl")?.value || "").trim();
      save.lastName = name;
      saveData(save);
      game.setMyCosmetics({ name });
      hooks.join({ name, mode: "remote", url: wsUrl || undefined, cosmetics: save.cosmetics || {} });
    };
    document.getElementById("btnJoin")?.addEventListener("click", join);
    document.getElementById("btnSolo")?.addEventListener("click", () => {
      const name = (document.getElementById("joinName")?.value || "Pup").trim().slice(0, 18) || "Pup";
      save.lastName = name;
      saveData(save);
      game.setMyCosmetics({ name });
      hooks.join({ name, mode: "local", cosmetics: save.cosmetics || {} });
    });
    document.getElementById("btnHowTo")?.addEventListener("click", showHowTo);
  }

  function showHowTo() {
    setOverlay(`
      <section class="panel">
        <div class="panelHeader">
          <div>
            <div class="panelTitle">How to Play</div>
            <p class="panelSubtitle">Sandbox edition. No rules. Lots of barking.</p>
          </div>
          <button type="button" class="xBtn" id="btnHowClose">×</button>
        </div>
        <ul class="list">
          <li><b>Move</b> — WASD / Arrow keys. Touch joystick on mobile.</li>
          <li><b>Bark (Space)</b> — cone in front of you. Stuns threats, knocks other pups, chips blocks.</li>
          <li><b>Dash (Shift)</b> — zoomies. Plows through anything in your way.</li>
          <li><b>Hotbar (1–9, 0)</b> — switch tools. Click in the world to use the active tool.</li>
          <li><b>Mouse wheel</b> — cycle tools. <b>Right-click</b> — quick erase.</li>
          <li><b>Chat</b> — press <span class="kbd">T</span> or <span class="kbd">Enter</span> to type. <span class="kbd">Esc</span> closes the box.</li>
          <li><b>Build</b> — Block & Bush tools place into a 40px grid. Bark / dash chips them.</li>
          <li><b>Spawn</b> — Mailman, Squirrel, Leaf, Box, Bike are spawnable wherever you click.</li>
          <li><b>Server</b> — start it via <span class="kbd">npm start</span> to share the yard with friends.</li>
        </ul>
      </section>
    `, true);
    document.getElementById("btnHowClose")?.addEventListener("click", showJoin);
  }

  // ── Pause ────────────────────────────────────────────────────────────────

  function showPause() {
    setOverlay(`
      <section class="panel">
        <div class="panelTitle" style="text-align:center">⏸ Paused</div>
        <p class="panelSubtitle" style="text-align:center;margin-top:6px">The world keeps spinning on the server. You'll catch up when you resume.</p>
        <div class="menuGrid" style="margin-top:14px">
          <button type="button" class="bigBtn good" id="btnResume">
            <div class="btnTitle">▶ Resume</div>
          </button>
          <button type="button" class="bigBtn" id="btnQuit">
            <div class="btnTitle">🏠 Quit to Title</div>
          </button>
        </div>
      </section>
    `, true);
    document.getElementById("btnResume")?.addEventListener("click", () => {
      setOverlay("");
      game.state.mode = "running";
    });
    document.getElementById("btnQuit")?.addEventListener("click", () => {
      hooks.leave();
      game.state.mode = "menu";
      showJoin();
    });
  }

  // ── Top-bar buttons ──────────────────────────────────────────────────────

  if (btnSound) {
    btnSound.addEventListener("click", () => {
      const next = !isMuted();
      setMuted(next);
      btnSound.textContent = next ? "🔇 Sound" : "🔊 Sound";
      save.soundOn = !next;
      saveData(save);
    });
  }
  if (btnPause) {
    btnPause.addEventListener("click", () => {
      if (game.state.mode === "running") {
        game.state.mode = "paused";
        showPause();
      } else if (game.state.mode === "paused") {
        setOverlay("");
        game.state.mode = "running";
      }
    });
  }

  // Apply saved cosmetics on init (instant local re-skin)
  (() => {
    const cos = save.cosmetics || {};
    const fc = FUR_COLORS.find((f) => f.id === cos.fur);
    const cc = COLLAR_COLORS.find((c) => c.id === cos.collar);
    game.setMyCosmetics({
      name: save.lastName || "Pup",
      furColor: fc ? fc.color : undefined,
      collarColor: cc ? cc.color : undefined,
      accessoryId: cos.accessoryId,
    });
  })();

  buildHotbar();
  updateHotbarSelection();
  showJoin();

  return {
    renderHud,
    showJoin,
    showPause,
    updateHotbarSelection,
    appendChat,
    setChatActive,
    enterRunning() {
      if (hudEl) hudEl.setAttribute("aria-hidden", "false");
      setOverlay("");
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}
