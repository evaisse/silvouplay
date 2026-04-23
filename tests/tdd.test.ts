import { describe, expect, it } from 'vitest';

import { buildDefaultTddTasks } from '../src/tdd.js';
import type { ProjectDoc } from '../src/types.js';

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
  qualityGates: ['npm test', 'npm run typecheck'],
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

describe('default TDD task generation', () => {
  it('inherits timeout and retry defaults from the project document', () => {
    const tasks = buildDefaultTddTasks(PROJECT, 'Ship TDD loop', PROJECT.workerAgents);

    for (const task of tasks) {
      expect(task.timeoutMs).toBe(PROJECT.executionDefaults.timeoutMs);
      expect(task.maxAttempts).toBe(PROJECT.executionDefaults.maxAttempts);
    }
  });
});
