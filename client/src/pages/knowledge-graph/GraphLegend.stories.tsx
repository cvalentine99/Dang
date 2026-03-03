import type { Meta, StoryObj } from "@storybook/react";
import { GraphLegend } from "./GraphLegend";
import { StatsOverlay } from "./StatsOverlay";

// ── GraphLegend ─────────────────────────────────────────────────────────────

const legendMeta: Meta<typeof GraphLegend> = {
  title: "KnowledgeGraph/GraphLegend",
  component: GraphLegend,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="dark bg-[#0c0a14] p-6 min-h-[200px] relative" style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
};

export default legendMeta;

export const Default: StoryObj<typeof GraphLegend> = {
  args: {},
};

// ── StatsOverlay ────────────────────────────────────────────────────────────

export const StatsOverlayDefault: StoryObj = {
  render: () => (
    <div className="dark bg-[#0c0a14] p-6 relative" style={{ width: 400 }}>
      <StatsOverlay
        stats={{
          endpoints: 42,
          alerts: 1284,
          vulnerabilities: 356,
          rules: 89,
          connections: 2100,
        }}
      />
    </div>
  ),
};

export const StatsOverlayEmpty: StoryObj = {
  render: () => (
    <div className="dark bg-[#0c0a14] p-6 relative" style={{ width: 400 }}>
      <StatsOverlay stats={{ endpoints: 0, alerts: 0, vulnerabilities: 0, rules: 0, connections: 0 }} />
    </div>
  ),
};
