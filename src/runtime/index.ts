import { codex } from './codex.js';
import { claudeCode } from './claude-code.js';
import { gemini } from './gemini.js';
import { opencode } from './opencode.js';
import type { AgentDefinition, AgentRegistry, AgentSpec, AgentSpecRegistry } from './dsl.js';
import type { AgentType } from '../types.js';
import type { ExitReason } from '../types.js';

export { codex } from './codex.js';
export { claudeCode } from './claude-code.js';
export { gemini } from './gemini.js';
export { opencode } from './opencode.js';

const BUILTIN_AGENT_SPECS: readonly AgentSpec[] = [
  {
    runtime: codex,
    discovery: {
      supportedRoles: ['orchestrator', 'worker'],
      candidateCommands: ['codex'],
      probeArgs: ['--version'],
      timeoutMs: 5000,
      supportsTokenBudget: true,
    },
  },
  {
    runtime: claudeCode,
    discovery: {
      supportedRoles: ['orchestrator', 'worker'],
      candidateCommands: ['claude'],
      probeArgs: ['--version'],
      timeoutMs: 5000,
      supportsTokenBudget: true,
    },
  },
  {
    runtime: gemini,
    discovery: {
      supportedRoles: ['worker'],
      candidateCommands: ['gemini'],
      probeArgs: ['--version'],
      timeoutMs: 5000,
      supportsTokenBudget: true,
    },
  },
  {
    runtime: opencode,
    discovery: {
      supportedRoles: ['orchestrator', 'worker'],
      candidateCommands: ['opencode'],
      probeArgs: ['--version'],
      timeoutMs: 5000,
      supportsTokenBudget: false,
    },
  },
];

export function loadAgentSpecs(specs: readonly AgentSpec[]): AgentSpecRegistry {
  return Object.fromEntries(specs.map((spec) => [spec.runtime.type, spec])) as AgentSpecRegistry;
}

export function loadAgentRegistry(specs: readonly AgentSpec[]): AgentRegistry {
  return Object.fromEntries(specs.map((spec) => [spec.runtime.type, spec.runtime])) as AgentRegistry;
}

export const AGENT_SPECS = loadAgentSpecs(BUILTIN_AGENT_SPECS);
export const AGENTS = loadAgentRegistry(BUILTIN_AGENT_SPECS);
export const SUPPORTED_AGENT_TYPES = Object.keys(AGENT_SPECS) as AgentType[];

export function getAgent(type: string): AgentDefinition {
  const agent = AGENTS[type];
  if (!agent) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return agent;
}

export function getAgentSpec(type: string): AgentSpec {
  const spec = AGENT_SPECS[type];
  if (!spec) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return spec;
}

export function isValidAgent(type: string): type is AgentType {
  return type in AGENT_SPECS;
}

export function inferExitReason(exitCode: number): ExitReason {
  if (exitCode === 0) return 'success';
  if (exitCode === 75) return 'quota_exceeded';
  if (exitCode === 76) return 'rate_limited';
  if (exitCode === 77) return 'cost_limit_reached';
  if (exitCode === 127) return 'binary_missing';
  return 'agent_error';
}

export function buildAgentCommand(
  agentType: string,
  prompt: string,
): { command: string; args: string[] } {
  const agent = getAgent(agentType);
  return {
    command: agent.command,
    args: agent.argsTemplate(prompt),
  };
}
