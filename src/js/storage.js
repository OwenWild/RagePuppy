// Simple localStorage wrapper for RagePuppy.

const KEY = "ragepuppy_save_v1";

const defaultData = () => ({
  bestScore: 0,
  runs: 0,
  soundOn: true,
  cosmetics: {
    fur: "golden",
    collar: "raspberry",
    accessoryId: "none",
  },
  unlockedAccessories: {
    none: true,
  },
  highscores: [],
});

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch {
    return defaultData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function recordRun(data, score) {
  const s = Math.floor(score);
  data.bestScore = Math.max(data.bestScore ?? 0, s);
  data.runs = (data.runs ?? 0) + 1;
  const now = new Date();
  const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const entry = { score: s, label };
  data.highscores = [entry, ...(data.highscores ?? [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

