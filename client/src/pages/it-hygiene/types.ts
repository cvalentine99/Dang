export interface TabDataProps {
  items: Array<Record<string, unknown>>;
  total: number;
}

export interface TabCommonProps {
  data: TabDataProps;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  agentId: string;
  rawData?: Record<string, unknown>;
}
