// Input layer: keyboard + mouse + virtual joystick + on-screen buttons.
// Adds:
//   - hotbar keys 1..0 → tool select
//   - mouse position (in CSS pixels) for the renderer to convert to world coords
//   - left-click + tap-to-act for the active tool
//   - "typing" mode (chat) that pauses gameplay key handlers

import { TOOLS } from "../shared/protocol.js";

export function createInput() {
  const state = {
    moveX: 0,
    moveY: 0,
    barkPressed: false,
    dashPressed: false,
    pausePressed: false,
    // Tool / cursor
    toolChange: null,     // tool id requested this frame
    actionPressed: false, // edge-press: use active tool at cursor
    erasePressed: false,  // edge-press: alt-action (right click)
    mouseCanvasX: 0,
    mouseCanvasY: 0,
    mouseInWindow: false,
    // Chat
    chatToggle: false,    // edge: open or close chat
    chatSubmit: null,     // string submitted this frame
    chatActive: false,
  };

  const keys = new Set();
  let typing = false;
  let chatBuffer = "";

  // Listen to UI announcing chat-input focus so we can toggle gameplay keys.
  document.addEventListener("ragepuppy:chat-active", (e) => {
    typing = !!e.detail?.active;
    state.chatActive = typing;
  });
  document.addEventListener("ragepuppy:chat-submit", (e) => {
    state.chatSubmit = String(e.detail?.text || "");
  });

  function recomputeMove() {
    if (typing) { state.moveX = 0; state.moveY = 0; return; }
    let x = 0, y = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;
    const m = Math.hypot(x, y);
    if (m > 0) { x /= m; y /= m; }
    state.moveX = x; state.moveY = y;
  }

  function onKeyDown(e) {
    // Chat toggle: T or Enter (when not typing)
    if (!typing && (e.code === "KeyT" || e.code === "Enter" || e.code === "Slash")) {
      state.chatToggle = true;
      e.preventDefault();
      return;
    }
    if (typing) return;
    if (e.repeat) return;

    keys.add(e.code);

    if (e.code === "Space") {
      state.barkPressed = true;
      e.preventDefault();
    } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      state.dashPressed = true;
    } else if (e.code === "Escape") {
      state.pausePressed = true;
    } else if (e.code.startsWith("Digit")) {
      const n = parseInt(e.code.slice(5), 10); // 0..9
      // Map 1..9 → TOOLS[0..8], 0 → TOOLS[9] (erase)
      const idx = n === 0 ? 9 : n - 1;
      const t = TOOLS[idx];
      if (t) state.toolChange = t.id;
    } else if (e.code === "KeyQ") {
      // Quick erase
      state.toolChange = "erase";
    }
    recomputeMove();
  }

  function onKeyUp(e) {
    if (typing) return;
    keys.delete(e.code);
    recomputeMove();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // ── Mouse on the canvas ────────────────────────────────────────────────────

  const canvas = document.getElementById("game");
  if (canvas) {
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      state.mouseCanvasX = e.clientX - rect.left;
      state.mouseCanvasY = e.clientY - rect.top;
      state.mouseInWindow = true;
    });
    canvas.addEventListener("mouseleave", () => { state.mouseInWindow = false; });
    canvas.addEventListener("mousedown", (e) => {
      if (typing) return;
      if (e.button === 0) state.actionPressed = true;
      if (e.button === 2) state.erasePressed = true;
    });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); });
    // Wheel cycles tools
    canvas.addEventListener("wheel", (e) => {
      if (typing) return;
      const i = TOOLS.findIndex((t) => t.id === currentTool);
      const next = (i + (e.deltaY > 0 ? 1 : -1) + TOOLS.length) % TOOLS.length;
      state.toolChange = TOOLS[next].id;
      e.preventDefault();
    }, { passive: false });
  }
  // We need the current tool for wheel cycling; we accept it via setter.
  let currentTool = "move";
  function setCurrentTool(t) { currentTool = t; }

  // ── Virtual joystick (mobile) ─────────────────────────────────────────────

  const joyBase = document.getElementById("joyBase");
  const joyStick = document.getElementById("joyStick");
  let joyActive = false;

  function updateJoystickFromEvent(ev) {
    if (!joyBase || !joyStick) return;
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const client = ev.touches ? ev.touches[0] : ev;
    const dx = client.clientX - cx;
    const dy = client.clientY - cy;
    const maxR = rect.width * 0.4;
    const dist = Math.hypot(dx, dy);
    const clamped = dist > 0 ? Math.min(dist, maxR) : 0;
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    joyStick.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px) translate(-50%, -50%)`;
    state.moveX = nx;
    state.moveY = ny;
  }
  function resetJoystick() {
    if (!joyStick) return;
    joyStick.style.transform = "translate(-50%, -50%)";
    state.moveX = 0; state.moveY = 0;
  }
  if (joyBase) {
    joyBase.addEventListener("pointerdown", (ev) => { joyActive = true; updateJoystickFromEvent(ev); });
    window.addEventListener("pointermove",  (ev) => { if (joyActive) updateJoystickFromEvent(ev); });
    window.addEventListener("pointerup",    () => { joyActive = false; resetJoystick(); });
    window.addEventListener("pointercancel",() => { joyActive = false; resetJoystick(); });
  }

  const btnBark = document.getElementById("btnBark");
  const btnDash = document.getElementById("btnDash");
  const btnUse  = document.getElementById("btnUse");
  if (btnBark) btnBark.addEventListener("pointerdown", () => { state.barkPressed = true; });
  if (btnDash) btnDash.addEventListener("pointerdown", () => { state.dashPressed = true; });
  if (btnUse)  btnUse.addEventListener("pointerdown",  () => { state.actionPressed = true; });

  function peek() { return { ...state }; }
  function endFrame() {
    state.barkPressed = false;
    state.dashPressed = false;
    state.pausePressed = false;
    state.toolChange = null;
    state.actionPressed = false;
    state.erasePressed = false;
    state.chatToggle = false;
    state.chatSubmit = null;
  }

  return { peek, endFrame, setCurrentTool };
}
