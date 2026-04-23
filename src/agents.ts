export type {
  AgentArgument,
  AgentCapability,
  AgentDefinition,
  AgentDiscoverySpec,
  AgentRegistry,
  AgentSpec,
  AgentSpecRegistry,
  DiscoveredAgent,
  DiscoverySnapshot,
  RuntimeAgentSpec,
} from './runtime/dsl.js';
export {
  AGENTS,
  AGENT_SPECS,
  BUILTIN_AGENT_SPECS,
  SUPPORTED_AGENT_TYPES,
  buildAgentCommand,
  getAgent,
  getAgentSpec,
  inferExitReason,
  isValidAgent,
} from './runtime/index.js';
export { amp, codex, claudeCode, gemini, opencode } from './runtime/index.js';

export type { AgentType } from './types.js';
export type { AgentCapability as LegacyAgentCapability } from './types.js';

import { AGENTS, isValidAgent } from './runtime/index.js';
import type { AgentType } from './types.js';
import type { ChecklistItem } from './types.js';

export const AGENT_CAPABILITIES = Object.values(AGENTS).map((agent) => ({
  type: agent.type,
  command: agent.command,
  strengths: agent.supportedTaskTypes,
}));

export function getAgentCapability(type: AgentType) {
  const agent = AGENTS[type];
  if (!agent) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return {
    type: agent.type,
    command: agent.command,
    strengths: agent.supportedTaskTypes,
  };
}

export function parseAgents(raw: string): AgentType[] {
  const parsed = raw
    .split(',')
    .map((value) => value.trim() as AgentType)
    .filter((value) => isValidAgent(value));

  return parsed.length > 0 ? parsed : ['codex'];
}

export function choosePrimaryAgent(
  preferred: AgentType[],
  type: 'tests' | 'implementation' | 'refactor',
): AgentType {
  const priority: Record<typeof type, AgentType[]> = {
    tests: ['codex', 'opencode', 'claude-code', 'gemini'],
    implementation: ['opencode', 'codex', 'claude-code', 'gemini'],
    refactor: ['claude-code', 'opencode', 'codex', 'gemini'],
  };

  const match = priority[type].find((agent) => preferred.includes(agent));
  return match ?? preferred[0] ?? 'codex';
}

export function buildFallbackAgents(
  preferred: AgentType[],
  primary: AgentType,
): AgentType[] {
  return preferred.filter((agent) => agent !== primary);
}

export interface TaskTypePriority {
  tests: AgentType[];
  implementation: AgentType[];
  refactor: AgentType[];
}

export const TASK_TYPE_PRIORITY: TaskTypePriority = {
  tests: ['codex', 'opencode', 'claude-code', 'gemini'],
  implementation: ['opencode', 'codex', 'claude-code', 'gemini'],
  refactor: ['claude-code', 'opencode', 'codex', 'gemini'],
};

export function getAgentForTaskType(
  agents: AgentType[],
  taskType: 'tests' | 'implementation' | 'refactor',
): AgentType {
  const priority = TASK_TYPE_PRIORITY[taskType];
  const match = priority.find((agent) => agents.includes(agent));
  return match ?? agents[0] ?? 'codex';
}
