import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge, TriageRouteBadge, TriageSeverityBadge } from "./Badges";

// ── StatusBadge ─────────────────────────────────────────────────────────────

const statusMeta: Meta<typeof StatusBadge> = {
  title: "AlertQueue/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="dark bg-[#0c0a14] p-6 min-h-[100px] flex items-center gap-4">
        <Story />
      </div>
    ),
  ],
};

export default statusMeta;
type StatusStory = StoryObj<typeof StatusBadge>;

export const Queued: StatusStory = { args: { status: "queued" } };
export const Processing: StatusStory = { args: { status: "processing" } };
export const Completed: StatusStory = { args: { status: "completed" } };
export const Failed: StatusStory = { args: { status: "failed" } };
export const Dismissed: StatusStory = { args: { status: "dismissed" } };

export const AllStatuses: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <StatusBadge status="queued" />
      <StatusBadge status="processing" />
      <StatusBadge status="completed" />
      <StatusBadge status="failed" />
      <StatusBadge status="dismissed" />
    </div>
  ),
};

// ── TriageRouteBadge ────────────────────────────────────────────────────────

export const TriageRoutes: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <TriageRouteBadge route="A_DUPLICATE_NOISY" />
      <TriageRouteBadge route="B_LOW_CONFIDENCE" />
      <TriageRouteBadge route="C_HIGH_CONFIDENCE" />
      <TriageRouteBadge route="D_LIKELY_BENIGN" />
    </div>
  ),
};

// ── TriageSeverityBadge ─────────────────────────────────────────────────────

export const TriageSeverities: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <TriageSeverityBadge severity="critical" />
      <TriageSeverityBadge severity="high" />
      <TriageSeverityBadge severity="medium" />
      <TriageSeverityBadge severity="low" />
      <TriageSeverityBadge severity="info" />
    </div>
  ),
};
