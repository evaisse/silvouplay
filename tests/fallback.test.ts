import { describe, expect, it } from 'vitest';

import { chooseFallbackAgent, isFallbackReason } from '../src/fallback.js';

describe('fallback policy', () => {
  it('flags quota and timeout as fallback reasons', () => {
    expect(isFallbackReason('quota_exceeded')).toBe(true);
    expect(isFallbackReason('timeout')).toBe(true);
    expect(isFallbackReason('agent_error')).toBe(false);
  });

  it('selects the next fallback agent', () => {
    expect(chooseFallbackAgent({
      status: 'ready',
      attempts: 1,
      maxAttempts: 3,
      primaryAgent: 'codex',
      activeAgent: 'codex',
      fallbackAgents: ['opencode', 'gemini'],
      lastExitReason: null,
      lastError: null,
      lastRunAt: null,
      startedAt: null,
      completedAt: null,
      timeoutMs: 1800000,
    })).toBe('opencode');
  });
});
