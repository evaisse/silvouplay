import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getAgentSpec, SUPPORTED_AGENT_TYPES } from '../src/agents.js';
import { resolveAgentSelection } from '../src/runtime/selection.js';
import type { DiscoverySnapshot } from '../src/runtime/dsl.js';
import { DEFAULT_EXECUTION_DEFAULTS, type WorkspaceState } from '../src/types.js';
import { buildWizardMessage } from '../src/wizard.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const TRANSCRIPT_PATH = path.join(REPO_ROOT, 'docs', 'examples', 'wizard-transcript.txt');

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

function buildDiscoverySnapshot(): DiscoverySnapshot {
  return {
    generatedAt: '2026-04-23T18:45:00.000Z',
    agents: Object.fromEntries(
      SUPPORTED_AGENT_TYPES.map((agentType) => [
        agentType,
        {
          type: agentType,
          spec: getAgentSpec(agentType),
          status: 'available',
          enabled: true,
          enabledSource: 'builtin',
          commandSource: 'builtin',
          requestedCommand: agentType === 'claude-code' ? 'claude' : agentType,
          resolvedCommand: `/tmp/bin/${agentType}`,
          version: `${agentType} 1.0.0`,
        },
      ]),
    ) as DiscoverySnapshot['agents'],
  };
}

function buildCanonicalTranscript(): string {
  const snapshot = buildDiscoverySnapshot();
  const selection = resolveAgentSelection(snapshot);

  return [
    '$ svp',
    ...buildWizardMessage(WORKSPACE, snapshot).split('\n').map((line, index) => (index === 0 ? `? ${line}` : `  ${line}`)),
    '❯ Create project',
    '',
    `Default orchestrator: ${selection.orchestrator}`,
    `Default workers: ${selection.workers.join(', ')}`,
    'Execution defaults:',
    `- timeoutMs: ${DEFAULT_EXECUTION_DEFAULTS.timeoutMs}`,
    `- maxAttempts: ${DEFAULT_EXECUTION_DEFAULTS.maxAttempts}`,
    `- maxTokens: ${String(DEFAULT_EXECUTION_DEFAULTS.maxTokens)}`,
  ].join('\n');
}

function extractReadmeSection(readme: string, sectionName: string): string {
  const match = readme.match(
    new RegExp(`<!-- ${sectionName}:start -->([\\s\\S]*?)<!-- ${sectionName}:end -->`),
  );

  if (!match) {
    throw new Error(`README is missing the ${sectionName} markers.`);
  }

  return match[1].trim();
}

describe('README canonical docs', () => {
  it('keeps the maintained wizard transcript example in sync with discovery defaults', () => {
    const transcript = readFileSync(TRANSCRIPT_PATH, 'utf8').trim();
    expect(transcript).toBe(buildCanonicalTranscript());
  });

  it('embeds the maintained wizard transcript in README', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    const transcript = readFileSync(TRANSCRIPT_PATH, 'utf8').trim();

    expect(extractReadmeSection(readme, 'wizard-transcript')).toBe([
      '```text',
      transcript,
      '```',
    ].join('\n'));
  });

  it('documents the global config path and supported environment overrides', () => {
    const readme = readFileSync(README_PATH, 'utf8');

    expect(readme).toContain('~/.config/svp/config.json');
    expect(readme).toContain('SVP_AGENT_CODEX_COMMAND');
    expect(readme).toContain('SVP_AGENT_CODEX_ENABLED');
    expect(readme).toContain('SVP_AGENT_CLAUDE_CODE_COMMAND');
    expect(readme).toContain('SVP_AGENT_CLAUDE_CODE_ENABLED');
    expect(readme).toContain('SVP_AGENT_GEMINI_COMMAND');
    expect(readme).toContain('SVP_AGENT_GEMINI_ENABLED');
    expect(readme).toContain('SVP_AGENT_OPENCODE_COMMAND');
    expect(readme).toContain('SVP_AGENT_OPENCODE_ENABLED');
    expect(readme).toContain('SVP_AGENT_AMP_COMMAND');
    expect(readme).toContain('SVP_AGENT_AMP_ENABLED');
  });
});
