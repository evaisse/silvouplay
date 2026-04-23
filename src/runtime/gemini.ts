import type { AgentSpec } from './dsl.js';

export const gemini: AgentSpec = {
  runtime: {
    type: 'gemini',
    displayName: 'Google Gemini',
    command: 'gemini',
    argsTemplate: (prompt: string) => [prompt],
    supportedTaskTypes: ['implementation', 'docs', 'infra'],
    exitCodeMap: {
      0: 'success',
      75: 'quota_exceeded',
      76: 'rate_limited',
      77: 'cost_limit_reached',
      127: 'binary_missing',
    },
  },
  discovery: {
    supportedRoles: ['worker'],
    candidateCommands: ['gemini'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
};
