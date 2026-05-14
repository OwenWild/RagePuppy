// Shared wire protocol constants. Used by both server and client.
// Plain ES module with no DOM/Node deps so it works in either runtime.

export const PROTOCOL_VERSION = 1;

// Default world bounds for the sandbox. The renderer can show a viewport
// smaller than this; the simulation always uses these absolute coordinates.
export const WORLD = {
  w: 1600,
  h: 1000,
  blockSize: 40, // grid cell size for placed blocks
};

// Tick / broadcast cadence
export const SIM_HZ = 30;          // server simulation rate
export const SNAPSHOT_HZ = 15;     // server → client broadcast rate
export const INPUT_HZ = 30;        // client → server input rate

// Hotbar tools. Keep order stable; clients map 1..N to these.
export const TOOLS = [
  { id: "move",      label: "Move",        hint: "Walk around. Bark + Dash always available.", key: "1" },
  { id: "mailman",   label: "Mailman",     hint: "Click to spawn a wandering mailman.",         key: "2" },
  { id: "squirrel",  label: "Squirrel",    hint: "Click to spawn a hyperactive squirrel.",      key: "3" },
  { id: "leaf",      label: "Leaf",        hint: "Click to release a drifting leaf.",           key: "4" },
  { id: "box",       label: "Box",         hint: "Click to drop a tough delivery box.",         key: "5" },
  { id: "bike",      label: "Bike",        hint: "Click to launch a bicycle.",                  key: "6" },
  { id: "block",     label: "Block",       hint: "Click to place a solid wall block.",          key: "7" },
  { id: "bush",      label: "Bush",        hint: "Click to plant a soft bush block.",           key: "8" },
  { id: "prop",      label: "Toy",         hint: "Click to drop a chew toy.",                   key: "9" },
  { id: "erase",     label: "Erase",       hint: "Click to remove the thing at your cursor.",   key: "0" },
];

export const SPAWN_TOOLS = new Set(["mailman", "squirrel", "leaf", "box", "bike"]);
export const BLOCK_TOOLS = new Set(["block", "bush"]);

// Message types (kept short so payloads are small).
export const MSG = {
  HELLO:    "hello",
  WELCOME:  "welcome",
  INPUT:    "input",
  ACTION:   "action",
  STATE:    "state",
  CHAT:     "chat",
  EVENT:    "event",
  PING:     "ping",
  PONG:     "pong",
};

export const ACTION = {
  SPAWN:  "spawn",   // { kind, x, y }
  PLACE:  "place",   // { kind, gx, gy }  (grid coords for blocks)
  PROP:   "prop",    // { kind, x, y }
  REMOVE: "remove",  // { x, y }
  TOOL:   "tool",    // { tool }          (server tracks for tinting cursors)
  CLEAR:  "clear",   // { what: "threats" | "blocks" | "props" | "all" }
};

export function encode(obj) {
  return JSON.stringify(obj);
}

export function decode(str) {
  try { return JSON.parse(str); } catch { return null; }
}
