import type { Meta, StoryObj } from "@storybook/react";
import { GlassPanel } from "./GlassPanel";
import { KpiCard } from "./KpiCard";
import { Activity, Shield, AlertTriangle, TrendingUp } from "lucide-react";
import { PURPLE, CYAN, AMBER, RED } from "./theme";

const meta: Meta<typeof GlassPanel> = {
  title: "DriftAnalytics/GlassPanel",
  component: GlassPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="dark bg-[#0c0a14] p-6 min-h-[200px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GlassPanel>;

export const Default: Story = {
  args: {
    title: "Drift Overview",
    icon: Activity,
    children: (
      <div className="px-5 pb-4 text-sm text-muted-foreground">
        Panel content goes here. This is a glass-morphism panel with backdrop blur.
      </div>
    ),
  },
};

export const WithAction: Story = {
  args: {
    title: "Anomaly Detection",
    icon: AlertTriangle,
    action: (
      <button className="text-xs px-2 py-1 rounded border border-white/10 text-muted-foreground hover:bg-white/5">
        View All
      </button>
    ),
    children: (
      <div className="px-5 pb-4 text-sm text-muted-foreground">
        Panel with an action button in the header.
      </div>
    ),
  },
};

export const NoTitle: Story = {
  args: {
    children: (
      <div className="p-5 text-sm text-muted-foreground">
        A glass panel without a title — useful for wrapping content.
      </div>
    ),
  },
};

// ── KpiCard stories ─────────────────────────────────────────────────────────

export const KpiCards: StoryObj = {
  render: () => (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard label="Total Drifts" value={142} sub="Last 24h" icon={Activity} color={PURPLE} />
      <KpiCard label="Active Agents" value={38} sub="Monitored" icon={Shield} color={CYAN} />
      <KpiCard label="Anomalies" value={7} sub="Requires attention" icon={AlertTriangle} color={AMBER} />
      <KpiCard label="Drift Rate" value="3.2%" sub="Trending up" icon={TrendingUp} color={RED} />
    </div>
  ),
};
