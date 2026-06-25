const memoryState = new Map<string, string>();

function emitStorageEvent(name: "lf-storage-changed" | "lf-storage-error", detail: { key: string; error?: string }) {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // No browser event target available.
  }
}

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key) ?? memoryState.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    try {
      const raw = memoryState.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
}

export function saveState<T>(key: string, value: T) {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch (err) {
    emitStorageEvent("lf-storage-error", { key, error: err instanceof Error ? err.message : "Could not serialize saved data." });
    return;
  }

  memoryState.set(key, raw);
  try {
    localStorage.setItem(key, raw);
    emitStorageEvent("lf-storage-changed", { key });
  } catch (err) {
    emitStorageEvent("lf-storage-error", { key, error: err instanceof Error ? err.message : "Browser storage is unavailable." });
  }
}
