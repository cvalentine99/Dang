// ─── Amethyst Nexus palette ─────────────────────────────────────────────────
export const PURPLE = "oklch(0.541 0.281 293.009)";
export const PURPLE_DIM = "oklch(0.4 0.15 293)";
export const VIOLET = "oklch(0.6 0.2 293)";
export const CYAN = "oklch(0.789 0.154 211.53)";
export const AMBER = "oklch(0.795 0.184 86.047)";
export const RED = "oklch(0.637 0.237 25.331)";
export const GREEN = "oklch(0.765 0.177 163.223)";
export const MUTED = "oklch(0.65 0.02 286)";
export const CARD_BG = "oklch(0.17 0.025 286)";
export const GLASS_BG = "oklch(0.15 0.02 286 / 70%)";
export const BORDER = "oklch(0.3 0.04 286 / 40%)";

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
