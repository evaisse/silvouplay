import type { AgentDefinition } from './dsl.js';

export const codex: AgentDefinition = {
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
};
