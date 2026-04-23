import type { AgentSpec } from './dsl.js';

export const codex: AgentSpec = {
  runtime: {
    type: 'codex',
    displayName: 'OpenAI Codex',
    command: 'codex',
    argsTemplate: (prompt: string) => [prompt],
    supportedTaskTypes: ['tests', 'implementation', 'refactor', 'docs', 'infra'],
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
    candidateCommands: ['codex'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
};
