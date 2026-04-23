import { describe, expect, it } from 'vitest';

import { getAgentSpec } from '../src/agents.js';
import { buildWizardMessage } from '../src/wizard.js';
import type { DiscoverySnapshot } from '../src/runtime/dsl.js';
import type { WorkspaceState } from '../src/types.js';

const WORKSPACE: WorkspaceState = {
  hasActiveProject: false,
  suggestedMode: 'creation',
  paths: {
    rootDir: '/tmp/project',
    workDir: '/tmp/project/.task-loop',
    projectFile: '/tmp/project/.task-loop/project.md',
    stateFile: '/tmp/project/.task-loop/state.json',
    tasksDir: '/tmp/project/.task-loop/tasks',
    eventsFile: '/tmp/project/.task-loop/events.jsonl',
    runsDir: '/tmp/project/.task-loop/runs',
    markdownDbFile: '/tmp/project/.task-loop/markdown.db',
  },
  openTaskCount: 0,
  pausedTaskCount: 0,
};

describe('wizard discovery summary', () => {
  it('lists available orchestrators, workers, and unavailable agents with reasons', () => {
    const snapshot: DiscoverySnapshot = {
      generatedAt: '2026-04-23T18:00:00.000Z',
      agents: {
        codex: {
          type: 'codex',
          spec: getAgentSpec('codex'),
          status: 'available',
          enabled: true,
          enabledSource: 'builtin',
          commandSource: 'builtin',
          requestedCommand: 'codex',
          resolvedCommand: '/tmp/bin/codex',
        },
        opencode: {
          type: 'opencode',
          spec: getAgentSpec('opencode'),
          status: 'available',
          enabled: true,
          enabledSource: 'builtin',
          commandSource: 'builtin',
          requestedCommand: 'opencode',
          resolvedCommand: '/tmp/bin/opencode',
        },
        gemini: {
          type: 'gemini',
          spec: getAgentSpec('gemini'),
          status: 'missing',
          enabled: true,
          enabledSource: 'builtin',
          commandSource: 'builtin',
          requestedCommand: 'gemini',
          reason: 'Command not found on PATH: gemini',
        },
      },
    };

    const message = buildWizardMessage(WORKSPACE, snapshot);
    expect(message).toContain('Available orchestrators: codex, opencode');
    expect(message).toContain('Available workers: codex, opencode');
    expect(message).toContain('gemini (Command not found on PATH: gemini)');
  });
});
