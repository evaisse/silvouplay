import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createInitialState, readState, writeState } from '../src/state.js';
import type { ProjectDoc, TaskDoc } from '../src/types.js';

const PROJECT: ProjectDoc = {
  svpVersion: 1,
  projectId: 'project-123',
  title: 'Ship TDD loop',
  status: 'active',
  mode: 'creation',
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
  primaryAgents: ['codex', 'opencode'],
  fallbackAgents: ['opencode'],
  orchestratorAgent: 'codex',
  workerAgents: ['codex', 'opencode'],
  executionDefaults: {
    timeoutMs: 900000,
    maxAttempts: 4,
    maxTokens: 32000,
  },
  testStrategy: 'tdd-first',
  taskDir: '.task-loop/tasks',
  qualityGates: ['npm test'],
  context: 'Context',
  goal: 'Goal',
  constraints: ['Constraint'],
  testingPolicy: ['TDD first by default.'],
  testCharter: {
    behaviorsToProve: ['Behavior'],
    failureCasesToCover: ['Failure'],
    regressionRisks: ['Risk'],
  },
  tasks: [],
  completionCriteria: [],
  progressLog: [],
};

const TASK: TaskDoc = {
  svpVersion: 1,
  projectId: 'project-123',
  taskId: 'T-001',
  title: 'Write failing tests',
  type: 'tests',
  status: 'pending',
  deps: [],
  primaryAgent: 'codex',
  fallbackAgents: ['opencode'],
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
  testRequired: true,
  testExceptionAllowed: false,
  timeoutMs: 900000,
  maxAttempts: 4,
  goal: 'Goal',
  scope: 'Scope',
  acceptanceCriteria: [{ checked: false, text: 'Criterion' }],
  testPlanTargetFiles: ['tests/example.test.ts'],
  expectedFailingCases: ['Missing behavior'],
  validationCommands: ['npm test'],
  requiredPassingCommands: [],
  implementationNotes: ['Note'],
  riskReductionStrategy: [],
  validationPlan: [],
  progressLog: [],
};

describe('workspace state persistence', () => {
  it('creates runtime budgets from project execution defaults', () => {
    const state = createInitialState(PROJECT, [TASK], 'creation', 'codex');

    expect(state.budgets).toEqual({
      maxTokens: 32000,
      maxTaskDurationMs: 900000,
    });
  });

  it('backfills legacy maxCostUsd budgets on read and rewrites upgraded state', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'svp-state-'));
    const stateFile = path.join(dir, 'state.json');

    try {
      writeFileSync(stateFile, `${JSON.stringify({
        projectId: 'project-123',
        status: 'active',
        currentMode: 'completion',
        createdAt: '2026-04-12T10:00:00.000Z',
        updatedAt: '2026-04-12T10:00:00.000Z',
        lastRunId: null,
        orchestratorAgent: null,
        budgets: {
          maxCostUsd: 12.5,
          maxTaskDurationMs: 1800000,
        },
        tasks: {
          'T-001': {
            status: 'ready',
            attempts: 0,
            maxAttempts: 3,
            primaryAgent: 'codex',
            activeAgent: 'codex',
            fallbackAgents: [],
            lastExitReason: null,
            lastError: null,
            lastRunAt: null,
            startedAt: null,
            completedAt: null,
            timeoutMs: 1800000,
          },
        },
      }, null, 2)}\n`, 'utf8');

      const parsed = readState(stateFile);
      expect(parsed.budgets).toEqual({
        maxTokens: null,
        maxTaskDurationMs: 1800000,
      });

      writeState(stateFile, parsed);
      const rewritten = readFileSync(stateFile, 'utf8');
      expect(rewritten).toContain('"maxTokens": null');
      expect(rewritten).not.toContain('maxCostUsd');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
