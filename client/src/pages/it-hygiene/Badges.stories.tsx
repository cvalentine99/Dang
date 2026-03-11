import type { Meta, StoryObj } from "@storybook/react";
import { ServiceStateBadge, ShellBadge } from "./Badges";

const meta: Meta = {
  title: "ITHygiene/Badges",
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="dark bg-[#0c0a14] p-6 min-h-[100px] flex items-center gap-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

export const ServiceStates: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <ServiceStateBadge state="running" />
      <ServiceStateBadge state="stopped" />
      <ServiceStateBadge state="dead" />
      <ServiceStateBadge state="inactive" />
      <ServiceStateBadge state="exited" />
      <ServiceStateBadge state="unknown" />
    </div>
  ),
};

export const ShellTypes: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <ShellBadge shell="/bin/bash" />
      <ShellBadge shell="/usr/sbin/nologin" />
      <ShellBadge shell="/bin/false" />
      <ShellBadge shell="/bin/zsh" />
    </div>
  ),
};
