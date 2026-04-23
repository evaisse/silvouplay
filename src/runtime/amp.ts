import type { AgentSpec } from './dsl.js';

export const amp: AgentSpec = {
  runtime: {
    type: 'amp',
    displayName: 'Sourcegraph Amp',
    command: 'amp',
    argsTemplate: (prompt: string) => ['-x', prompt],
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
    candidateCommands: ['amp'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: false,
  },
};
