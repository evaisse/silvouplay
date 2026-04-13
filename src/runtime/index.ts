import { codex } from './codex.js';
import { claudeCode } from './claude-code.js';
import { gemini } from './gemini.js';
import { opencode } from './opencode.js';
import type { AgentDefinition, AgentRegistry } from './dsl.js';
import type { ExitReason } from '../types.js';

export { codex } from './codex.js';
export { claudeCode } from './claude-code.js';
export { gemini } from './gemini.js';
export { opencode } from './opencode.js';

export const AGENTS: AgentRegistry = {
  codex,
  'claude-code': claudeCode,
  gemini,
  opencode,
} as const;

export function getAgent(type: string): AgentDefinition {
  const agent = AGENTS[type];
  if (!agent) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return agent;
}

export function isValidAgent(type: string): type is keyof AgentRegistry {
  return type in AGENTS;
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
