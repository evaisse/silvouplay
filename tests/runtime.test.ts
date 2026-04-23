import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  AgentDiscoverySpec,
  AgentSpec,
  DiscoveredAgent,
  DiscoverySnapshot,
  RuntimeAgentSpec,
} from '../src/runtime/dsl.js';
import {
  AGENTS,
  AGENT_SPECS,
  BUILTIN_AGENT_SPECS,
  SUPPORTED_AGENT_TYPES,
  getAgent,
  getAgentSpec,
  loadAgentRegistry,
  loadAgentSpecs,
} from '../src/runtime/index.js';
import type { AgentType } from '../src/types.js';

const SAMPLE_SPEC: AgentSpec = {
  runtime: {
    type: 'codex',
    displayName: 'OpenAI Codex',
    command: 'codex',
    argsTemplate: (prompt: string) => [prompt],
    supportedTaskTypes: ['tests', 'implementation'],
    exitCodeMap: {
      0: 'success',
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

const EXPECTED_BUILTIN_SPECS = {
  codex: {
    displayName: 'OpenAI Codex',
    supportedRoles: ['orchestrator', 'worker'],
    candidateCommands: ['codex'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
  'claude-code': {
    displayName: 'Anthropic Claude Code',
    supportedRoles: ['orchestrator', 'worker'],
    candidateCommands: ['claude'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
  gemini: {
    displayName: 'Google Gemini',
    supportedRoles: ['worker'],
    candidateCommands: ['gemini'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: true,
  },
  opencode: {
    displayName: 'OpenCode',
    supportedRoles: ['orchestrator', 'worker'],
    candidateCommands: ['opencode'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: false,
  },
  amp: {
    displayName: 'Sourcegraph Amp',
    supportedRoles: ['orchestrator', 'worker'],
    candidateCommands: ['amp'],
    probeArgs: ['--version'],
    timeoutMs: 5000,
    supportsTokenBudget: false,
  },
} satisfies Record<
  AgentType,
  {
    displayName: string;
    supportedRoles: readonly ('orchestrator' | 'worker')[];
    candidateCommands: readonly string[];
    probeArgs: readonly string[];
    timeoutMs: number;
    supportsTokenBudget: boolean;
  }
>;

describe('runtime registry', () => {
  it('loads keyed runtime entries from shared agent specs', () => {
    const registry = loadAgentRegistry([SAMPLE_SPEC]);
    const specs = loadAgentSpecs([SAMPLE_SPEC]);

    expect(Object.keys(registry)).toEqual(['codex']);
    expect(registry.codex.displayName).toBe('OpenAI Codex');
    expect(specs.codex.discovery.candidateCommands).toEqual(['codex']);
  });

  it('exposes builtin discovery specs alongside runtime definitions', () => {
    expect(getAgent('codex').command).toBe(getAgentSpec('codex').runtime.command);
    expect(AGENT_SPECS.codex.discovery.candidateCommands).toContain('codex');
  });

  it('defines builtin specs for every supported agent in one source of truth', () => {
    expect(SUPPORTED_AGENT_TYPES).toEqual(Object.keys(EXPECTED_BUILTIN_SPECS));
    expect(BUILTIN_AGENT_SPECS).toHaveLength(SUPPORTED_AGENT_TYPES.length);
    expect(Object.keys(AGENT_SPECS)).toEqual(SUPPORTED_AGENT_TYPES);
    expect(Object.keys(AGENTS)).toEqual(SUPPORTED_AGENT_TYPES);
  });

  it('declares discovery metadata per builtin agent, including amp', () => {
    for (const agentType of SUPPORTED_AGENT_TYPES) {
      expect(AGENT_SPECS[agentType]).toMatchObject({
        runtime: {
          type: agentType,
          displayName: EXPECTED_BUILTIN_SPECS[agentType].displayName,
        },
        discovery: {
          supportedRoles: EXPECTED_BUILTIN_SPECS[agentType].supportedRoles,
          candidateCommands: EXPECTED_BUILTIN_SPECS[agentType].candidateCommands,
          probeArgs: EXPECTED_BUILTIN_SPECS[agentType].probeArgs,
          timeoutMs: EXPECTED_BUILTIN_SPECS[agentType].timeoutMs,
          supportsTokenBudget: EXPECTED_BUILTIN_SPECS[agentType].supportsTokenBudget,
        },
      });
      expect(getAgent(agentType)).toBe(AGENTS[agentType]);
      expect(getAgentSpec(agentType)).toBe(AGENT_SPECS[agentType]);
    }
  });

  it('defines typed discovery snapshots and supports amp as an agent type', () => {
    const amp: AgentType = 'amp';
    const discovered: DiscoveredAgent = {
      type: 'codex',
      spec: SAMPLE_SPEC,
      status: 'available',
      resolvedCommand: 'codex',
    };
    const snapshot: DiscoverySnapshot = {
      generatedAt: '2026-04-23T00:00:00.000Z',
      agents: {
        codex: discovered,
      },
    };

    expect(amp).toBe('amp');
    expect(snapshot.agents.codex?.status).toBe('available');
    expectTypeOf(SAMPLE_SPEC.runtime).toMatchTypeOf<RuntimeAgentSpec>();
    expectTypeOf(SAMPLE_SPEC.discovery).toMatchTypeOf<AgentDiscoverySpec>();
    expectTypeOf(snapshot.agents.codex).toEqualTypeOf<DiscoveredAgent | undefined>();
  });
});
