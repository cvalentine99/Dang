import type { Meta, StoryObj } from "@storybook/react";
import { Pagination } from "./Pagination";
import { fn } from "@storybook/test";

const meta: Meta<typeof Pagination> = {
  title: "ITHygiene/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="dark bg-[#0c0a14] p-6 min-h-[100px] max-w-lg">
        <Story />
      </div>
    ),
  ],
  args: {
    onPageChange: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Pagination>;

export const FirstPage: Story = {
  args: {
    page: 0,
    totalPages: 10,
    total: 245,
  },
};

export const MiddlePage: Story = {
  args: {
    page: 4,
    totalPages: 10,
    total: 245,
  },
};

export const LastPage: Story = {
  args: {
    page: 9,
    totalPages: 10,
    total: 245,
  },
};

export const SinglePage: Story = {
  args: {
    page: 0,
    totalPages: 1,
    total: 12,
  },
};
