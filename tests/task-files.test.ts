import { describe, expect, it } from 'vitest';

import { parseTask, renderTask, validateTaskDoc } from '../src/task-files.js';
import type { TaskDoc } from '../src/types.js';

const SAMPLE_TASK: TaskDoc = {
  svpVersion: 1,
  projectId: 'project-123',
  taskId: 'T-001',
  title: 'Define test scenarios',
  type: 'tests',
  status: 'pending',
  deps: [],
  primaryAgent: 'codex',
  fallbackAgents: ['opencode'],
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
  implementationNotes: ['Keep it focused'],
  riskReductionStrategy: [],
  validationPlan: [],
  progressLog: ['[2026-04-12 10:00] Task created.'],
};

describe('task markdown', () => {
  it('renders and parses a test task', () => {
    const rendered = renderTask(SAMPLE_TASK);
    const parsed = parseTask(rendered);

    expect(parsed.taskId).toBe(SAMPLE_TASK.taskId);
    expect(parsed.validationCommands).toEqual(SAMPLE_TASK.validationCommands);
    expect(parsed.acceptanceCriteria[0].text).toBe('Criterion');
  });

  it('rejects a non-test task without justification', () => {
    expect(() => validateTaskDoc({
      ...SAMPLE_TASK,
      type: 'docs',
      testRequired: false,
      testExceptionAllowed: true,
    })).toThrow('missing a test exception justification');
  });

  it('accepts a non-test task with justification and validation plan', () => {
    expect(() => validateTaskDoc({
      ...SAMPLE_TASK,
      type: 'docs',
      testRequired: false,
      testExceptionAllowed: true,
      testExceptionJustification: 'Documentation clarity is not meaningfully testable automatically.',
      riskReductionStrategy: ['Reuse repo terminology'],
      validationPlan: ['Check referenced commands locally'],
    })).not.toThrow();
  });
});
