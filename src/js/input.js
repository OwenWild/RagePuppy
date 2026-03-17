// Input handling for RagePuppy: keyboard + virtual joystick + buttons.

export function createInput() {
  const state = {
    moveX: 0,
    moveY: 0,
    barkPressed: false,
    dashPressed: false,
    pausePressed: false,
  };

  const keys = new Set();

  function recomputeMove() {
    let x = 0;
    let y = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;
    const m = Math.hypot(x, y);
    if (m > 0) {
      x /= m;
      y /= m;
    }
    state.moveX = x;
    state.moveY = y;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space") {
      state.barkPressed = true;
      e.preventDefault();
    } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      state.dashPressed = true;
    } else if (e.code === "Escape") {
      state.pausePressed = true;
    }
    recomputeMove();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    recomputeMove();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Virtual joystick + buttons for touch devices.
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
    const px = nx * clamped;
    const py = ny * clamped;
    joyStick.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    state.moveX = nx;
    state.moveY = ny;
  }

  function resetJoystick() {
    if (!joyStick) return;
    joyStick.style.transform = "translate(-50%, -50%)";
    state.moveX = 0;
    state.moveY = 0;
  }

  if (joyBase) {
    const start = (ev) => {
      joyActive = true;
      updateJoystickFromEvent(ev);
    };
    const move = (ev) => {
      if (!joyActive) return;
      updateJoystickFromEvent(ev);
    };
    const end = () => {
      joyActive = false;
      resetJoystick();
    };

    joyBase.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  const btnBark = document.getElementById("btnBark");
  const btnDash = document.getElementById("btnDash");
  if (btnBark) {
    btnBark.addEventListener("pointerdown", () => {
      state.barkPressed = true;
    });
  }
  if (btnDash) {
    btnDash.addEventListener("pointerdown", () => {
      state.dashPressed = true;
    });
  }

  function peek() {
    return { ...state };
  }

  function endFrame() {
    state.barkPressed = false;
    state.dashPressed = false;
    state.pausePressed = false;
  }

  return { peek, endFrame };
}

