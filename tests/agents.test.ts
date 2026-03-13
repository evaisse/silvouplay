import { describe, it, expect } from 'vitest';
import { getAgentCapability, AGENT_CAPABILITIES } from '../src/agents.js';

describe('getAgentCapability', () => {
  it('returns capability for each supported agent', () => {
    const agents = ['codex', 'claude-code', 'gemini', 'opencode'] as const;
    for (const agent of agents) {
      const cap = getAgentCapability(agent);
      expect(cap.type).toBe(agent);
      expect(cap.command).toBeTruthy();
      expect(cap.strengths.length).toBeGreaterThan(0);
    }
  });

  it('throws for an unknown agent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getAgentCapability('unknown' as any)).toThrow();
  });
});

describe('AGENT_CAPABILITIES', () => {
  it('contains exactly 4 agents', () => {
    expect(AGENT_CAPABILITIES).toHaveLength(4);
  });

  it('each capability has a non-empty command', () => {
    for (const cap of AGENT_CAPABILITIES) {
      expect(cap.command.trim().length).toBeGreaterThan(0);
    }
  });
});
