import { describe, expect, it } from 'vitest';

import { parseProject, renderProject } from '../src/project.js';
import type { ProjectDoc } from '../src/types.js';

const SAMPLE_PROJECT: ProjectDoc = {
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
  context: 'Context line',
  goal: 'Goal line',
  constraints: ['Keep changes minimal'],
  testingPolicy: ['TDD first by default.'],
  testCharter: {
    behaviorsToProve: ['Behavior'],
    failureCasesToCover: ['Failure'],
    regressionRisks: ['Risk'],
  },
  tasks: [{ id: 'T-001', title: 'Define test scenarios', checked: false }],
  completionCriteria: [{ checked: false, text: 'Quality gates pass.' }],
  progressLog: ['[2026-04-12 10:00] Project created.'],
};

describe('project markdown', () => {
  it('renders and parses the project document', () => {
    const rendered = renderProject(SAMPLE_PROJECT);
    const parsed = parseProject(rendered);

    expect(parsed.projectId).toBe(SAMPLE_PROJECT.projectId);
    expect(parsed.title).toBe(SAMPLE_PROJECT.title);
    expect(parsed.qualityGates).toEqual(SAMPLE_PROJECT.qualityGates);
    expect(parsed.orchestratorAgent).toBe(SAMPLE_PROJECT.orchestratorAgent);
    expect(parsed.workerAgents).toEqual(SAMPLE_PROJECT.workerAgents);
    expect(parsed.executionDefaults).toEqual(SAMPLE_PROJECT.executionDefaults);
    expect(parsed.tasks[0]).toEqual(SAMPLE_PROJECT.tasks[0]);
  });

  it('keeps the task index minimal and parseable', () => {
    const rendered = renderProject(SAMPLE_PROJECT);
    expect(rendered).toContain('- [ ] T-001: Define test scenarios');
  });

  it('backfills legacy project docs without orchestration defaults', () => {
    const legacy = `---
svp_version: 1
project_id: "project-123"
title: "Ship TDD loop"
status: "active"
mode: "creation"
created_at: "2026-04-12T10:00:00.000Z"
updated_at: "2026-04-12T10:00:00.000Z"
primary_agents:
  - "codex"
  - "opencode"
fallback_agents:
  - "opencode"
test_strategy: "tdd-first"
task_dir: ".task-loop/tasks"
quality_gates:
  - "npm test"
---

# Project: Ship TDD loop

## Context
Context line

## Goal
Goal line

## Constraints
- Keep changes minimal

## Testing Policy
- TDD first by default.

## Test Charter
### Behaviors To Prove
- Behavior

### Failure Cases To Cover
- Failure

### Regression Risks
- Risk

## Quality Gates
- \`npm test\`

## Task Index
- [ ] T-001: Define test scenarios

## Completion Criteria
- [ ] Quality gates pass.

## Progress Log
- [2026-04-12 10:00] Project created.
`;

    expect(parseProject(legacy)).toMatchObject({
      orchestratorAgent: null,
      workerAgents: ['codex', 'opencode'],
      executionDefaults: {
        timeoutMs: 1800000,
        maxAttempts: 3,
        maxTokens: null,
      },
    });
  });
});
