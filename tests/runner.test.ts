import { describe, expect, it } from 'vitest';

import { buildAgentCommand, buildAgentPrompt } from '../src/runner.js';
import type { ProjectDoc, TaskDoc } from '../src/types.js';

const PROJECT: ProjectDoc = {
  svpVersion: 1,
  projectId: 'project-123',
  title: 'Ship TDD loop',
  status: 'active',
  mode: 'creation',
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
  primaryAgents: ['codex'],
  fallbackAgents: [],
  orchestratorAgent: 'codex',
  workerAgents: ['codex'],
  executionDefaults: {
    timeoutMs: 1800000,
    maxAttempts: 3,
    maxTokens: null,
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
  status: 'ready',
  deps: [],
  primaryAgent: 'codex',
  fallbackAgents: [],
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
  testRequired: true,
  testExceptionAllowed: false,
  timeoutMs: 1800000,
  maxAttempts: 3,
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

describe('runner prompt and command', () => {
  it('includes project and task details in the prompt', () => {
    const prompt = buildAgentPrompt(PROJECT, TASK);
    expect(prompt).toContain(PROJECT.title);
    expect(prompt).toContain(TASK.taskId);
    expect(prompt).toContain('Validation commands');
  });

  it('uses the configured binary for the active agent', () => {
    const { command, args } = buildAgentCommand(PROJECT, TASK, 'codex');
    expect(command).toBe('codex');
    expect(args[0]).toContain(TASK.title);
  });
});
