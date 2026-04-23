import type { AgentSpec } from './dsl.js';

export const claudeCode: AgentSpec = {
  runtime: {
    type: 'claude-code',
    displayName: 'Anthropic Claude Code',
    command: 'claude',
    argsTemplate: (prompt: string) => ['-p', prompt],
    supportedTaskTypes: ['implementation', 'refactor', 'docs', 'infra'],
    exitCodeMap: {
      0: 'success',
      75: 'quota_exceeded',
      76: 'rate_limited',
      77: 'cost_limit_reached',
      127: 'binary_missing',
    },
  },
  discovery: {
    supportedRoles: ['orchestrator', 'worker'],
    candidateCommands: ['claude'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
};
