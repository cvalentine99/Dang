// ─── Obsidian Instrument Panel palette ───────────────────────────────────────
export const PURPLE = "oklch(0.795 0.184 85)";
export const PURPLE_DIM = "oklch(0.5 0.12 85)";
export const VIOLET = "oklch(0.7 0.16 85)";
export const CYAN = "oklch(0.75 0.15 195)";
export const AMBER = "oklch(0.769 0.188 70.08)";
export const RED = "oklch(0.628 0.258 29.234)";
export const GREEN = "oklch(0.723 0.219 149.579)";
export const MUTED = "oklch(0.6 0.01 260)";
export const CARD_BG = "oklch(0.15 0.005 260)";
export const GLASS_BG = "oklch(0.15 0.02 60 / 70%)";
export const BORDER = "oklch(0.3 0.01 260 / 40%)";

export const SCHEDULE_COLORS = [PURPLE, CYAN, AMBER, GREEN, VIOLET, RED, "oklch(0.7 0.15 330)", "oklch(0.7 0.15 200)"];
export const CATEGORY_COLORS = { packages: CYAN, services: VIOLET, users: AMBER };
export const CHANGE_COLORS = { added: GREEN, removed: RED, changed: AMBER };

// ─── Time range presets ─────────────────────────────────────────────────────
export const TIME_RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatPct(v: number): string {
  return `${Math.round(v * 100) / 100}%`;
}
