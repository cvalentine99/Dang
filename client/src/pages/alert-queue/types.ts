/**
 * Shared types for AlertQueue sub-components.
 */

export interface QueueItem {
  id: number;
  alertId: string;
  ruleId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentId: string | null;
  agentName: string | null;
  alertTimestamp: string | null;
  rawJson: Record<string, unknown> | null;
  status: string;
  triageResult: Record<string, unknown> | null;
  queuedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  pipelineTriageId?: string | null;
  autoTriageStatus?: string | null;
}

export interface TriageData {
  answer?: string;
  reasoning?: string;
  trustScore?: number;
  confidence?: number;
  safetyStatus?: string;
  suggestedFollowUps?: string[];
  splunkTicketId?: string;
  splunkTicketCreatedAt?: string;
  splunkTicketCreatedBy?: string;
}
