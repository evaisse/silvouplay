import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectWorkspaceState } from '../src/workspace.js';

describe('detectWorkspaceState', () => {
  it('returns creation when no workspace exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'svp-workspace-empty-'));
    const previous = process.cwd();
    process.chdir(dir);

    try {
      const state = detectWorkspaceState('.task-loop');
      expect(state.hasActiveProject).toBe(false);
      expect(state.suggestedMode).toBe('creation');
    } finally {
      process.chdir(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns completion when a workspace exists', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'svp-workspace-active-'));
    const taskLoopDir = path.join(dir, '.task-loop');
    mkdirSync(path.join(taskLoopDir, 'tasks'), { recursive: true });
    writeFileSync(path.join(taskLoopDir, 'project.md'), `---
svp_version: 1
project_id: "p1"
title: "Test"
status: "active"
mode: "creation"
created_at: "2026-04-12T10:00:00.000Z"
updated_at: "2026-04-12T10:00:00.000Z"
primary_agents:
  - "codex"
fallback_agents: []
test_strategy: "tdd-first"
task_dir: ".task-loop/tasks"
quality_gates:
  - "npm test"
---

# Project: Test

## Context
Context

## Goal
Goal

## Constraints
- keep it tight

## Testing Policy
- TDD first by default.

## Test Charter
### Behaviors To Prove
- behavior

### Failure Cases To Cover
- failure

### Regression Risks
- risk

## Quality Gates
- \`npm test\`

## Task Index
- [ ] T-001: Define test scenarios

## Completion Criteria
- [ ] Quality gates pass.

## Progress Log
- [2026-04-12 10:00] Project created.
`, 'utf8');
    writeFileSync(path.join(taskLoopDir, 'state.json'), JSON.stringify({
      projectId: 'p1',
      status: 'active',
      currentMode: 'completion',
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
      lastRunId: null,
      budgets: { maxCostUsd: null, maxTaskDurationMs: 1800000 },
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
    }, null, 2), 'utf8');

    const previous = process.cwd();
    process.chdir(dir);
    try {
      const state = detectWorkspaceState('.task-loop');
      expect(state.hasActiveProject).toBe(true);
      expect(state.suggestedMode).toBe('completion');
      expect(state.title).toBe('Test');
    } finally {
      process.chdir(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
