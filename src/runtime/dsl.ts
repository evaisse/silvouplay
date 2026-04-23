import type { AgentType, ExitReason, TaskType } from '../types.js';

export interface AgentArgument {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface AgentCapability {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  supportedTaskTypes: TaskType[];
  exitCodeMap: Partial<Record<number, ExitReason>>;
  promptTemplate?: string;
}

export interface RuntimeAgentSpec {
  type: AgentType;
  displayName: string;
  command: string;
  argsTemplate: (prompt: string) => string[];
  env?: Record<string, string>;
  supportedTaskTypes: readonly TaskType[];
  exitCodeMap: Partial<Record<number, ExitReason>>;
  maxConcurrent?: number;
}

export interface AgentDiscoverySpec {
  supportedRoles: readonly ('orchestrator' | 'worker')[];
  candidateCommands: readonly string[];
  probeArgs: readonly string[];
  timeoutMs: number;
  supportsTokenBudget: boolean;
}

export interface AgentSpec {
  runtime: RuntimeAgentSpec;
  discovery: AgentDiscoverySpec;
}

export type DiscoveryStatus = 'available' | 'missing' | 'disabled' | 'misconfigured';
export type DiscoveryOverrideSource = 'builtin' | 'config' | 'env' | 'cli';

export interface AgentOverride {
  command?: string;
  enabled?: boolean;
}

export type AgentOverrideMap = Partial<Record<AgentType, AgentOverride>>;

export interface DiscoveryConfig {
  agents?: AgentOverrideMap;
}

export interface DiscoveredAgent {
  type: AgentType;
  spec: AgentSpec;
  status: DiscoveryStatus;
  enabled: boolean;
  enabledSource: DiscoveryOverrideSource;
  commandSource: DiscoveryOverrideSource;
  requestedCommand?: string;
  resolvedCommand?: string;
  reason?: string;
  version?: string;
}

export interface DiscoverySnapshot {
  generatedAt: string;
  agents: Partial<Record<AgentType, DiscoveredAgent>>;
}

export type AgentDefinition = RuntimeAgentSpec;
export type AgentRegistry = Record<string, RuntimeAgentSpec>;
export type AgentSpecRegistry = Record<string, AgentSpec>;
