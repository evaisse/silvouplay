import { describe, expect, it } from 'vitest';

import { runProjectsInParallel } from '../src/orchestrator.js';
import type { RunnableWorkspace } from '../src/workspace.js';
import type { RunSummary } from '../src/types.js';

function createRunnableWorkspace(relativeOutputDir: string, title: string): RunnableWorkspace {
  return {
    title,
    outputDir: relativeOutputDir,
    absoluteOutputDir: `/tmp/project/${relativeOutputDir}`,
    openTaskCount: 2,
    pausedTaskCount: 0,
  };
}

function createRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-123',
    completedTaskIds: ['T-001'],
    pausedTaskIds: [],
    failedTaskIds: [],
    fallbackTaskIds: [],
    orchestratorAgent: 'codex',
    promptBuilder: 'local-deterministic',
    orchestratorFallbackReason: null,
    ...overrides,
  };
}

describe('multi-PRD orchestration', () => {
  it('bounds concurrency and aggregates success, pause, and failure outcomes', async () => {
    const targets = [
      createRunnableWorkspace('.task-loop-a', 'Alpha'),
      createRunnableWorkspace('.task-loop-b', 'Beta'),
      createRunnableWorkspace('.task-loop-c', 'Gamma'),
    ];
    let activeRuns = 0;
    let maxObservedParallelism = 0;

    const summary = await runProjectsInParallel(targets, {
      maxParallel: 2,
      executeTarget: async (target) => {
        activeRuns += 1;
        maxObservedParallelism = Math.max(maxObservedParallelism, activeRuns);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeRuns -= 1;

        if (target.outputDir === '.task-loop-a') {
          return {
            target,
            isolatedRootDir: '/tmp/alpha.worktree',
            outcome: 'success',
            summary: createRunSummary(),
            stdout: '',
            stderr: '',
          };
        }
        if (target.outputDir === '.task-loop-b') {
          return {
            target,
            isolatedRootDir: '/tmp/beta.worktree',
            outcome: 'paused',
            summary: createRunSummary({
              completedTaskIds: [],
              pausedTaskIds: ['T-001'],
            }),
            stdout: '',
            stderr: '',
          };
        }
        return {
          target,
          isolatedRootDir: '/tmp/gamma.worktree',
          outcome: 'failed',
          summary: createRunSummary({
            completedTaskIds: [],
            failedTaskIds: ['T-001'],
          }),
          stdout: '',
          stderr: '',
        };
      },
    });

    expect(maxObservedParallelism).toBe(2);
    expect(summary.maxParallel).toBe(2);
    expect(summary.successfulPrds).toEqual(['.task-loop-a']);
    expect(summary.pausedPrds).toEqual(['.task-loop-b']);
    expect(summary.failedPrds).toEqual(['.task-loop-c']);
    expect(summary.results.map((result) => result.outcome)).toEqual([
      'success',
      'paused',
      'failed',
    ]);
  });
});
