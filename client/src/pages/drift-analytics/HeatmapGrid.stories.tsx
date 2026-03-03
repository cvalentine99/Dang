import type { Meta, StoryObj } from "@storybook/react";
import { HeatmapGrid } from "./HeatmapGrid";

const meta: Meta<typeof HeatmapGrid> = {
  title: "DriftAnalytics/HeatmapGrid",
  component: HeatmapGrid,
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
type Story = StoryObj<typeof HeatmapGrid>;

const sampleAgents = ["agent-001", "agent-002", "agent-003", "agent-004", "agent-005"];
const sampleBuckets = [1, 2, 3, 4, 5, 6, 7, 8];

function generateGrid(agents: string[], buckets: number[]): Array<{ agentId: string; bucket: number; driftPercent: number }> {
  const grid: Array<{ agentId: string; bucket: number; driftPercent: number }> = [];
  for (const agent of agents) {
    for (const bucket of buckets) {
      grid.push({
        agentId: agent,
        bucket,
        driftPercent: Math.random() * 100,
      });
    }
  }
  return grid;
}

export const Default: Story = {
  args: {
    agents: sampleAgents,
    buckets: sampleBuckets,
    grid: generateGrid(sampleAgents, sampleBuckets),
  },
};

export const HighDrift: Story = {
  args: {
    agents: ["web-server-01", "db-server-01", "app-server-01"],
    buckets: [1, 2, 3, 4, 5],
    grid: [
      { agentId: "web-server-01", bucket: 1, driftPercent: 85 },
      { agentId: "web-server-01", bucket: 2, driftPercent: 92 },
      { agentId: "web-server-01", bucket: 3, driftPercent: 78 },
      { agentId: "web-server-01", bucket: 4, driftPercent: 95 },
      { agentId: "web-server-01", bucket: 5, driftPercent: 88 },
      { agentId: "db-server-01", bucket: 1, driftPercent: 12 },
      { agentId: "db-server-01", bucket: 2, driftPercent: 5 },
      { agentId: "db-server-01", bucket: 3, driftPercent: 8 },
      { agentId: "db-server-01", bucket: 4, driftPercent: 3 },
      { agentId: "db-server-01", bucket: 5, driftPercent: 15 },
      { agentId: "app-server-01", bucket: 1, driftPercent: 45 },
      { agentId: "app-server-01", bucket: 2, driftPercent: 52 },
      { agentId: "app-server-01", bucket: 3, driftPercent: 38 },
      { agentId: "app-server-01", bucket: 4, driftPercent: 61 },
      { agentId: "app-server-01", bucket: 5, driftPercent: 55 },
    ],
  },
};

export const Empty: Story = {
  args: {
    agents: [],
    buckets: [],
    grid: [],
  },
};
