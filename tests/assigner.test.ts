import { describe, it, expect } from 'vitest';
import { assignAgents } from '../src/assigner.js';
import type { SubTask } from '../src/types.js';

function makeTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'task-001',
    title: 'Implement core logic',
    description: 'Write the main implementation',
    dependencies: [],
    agent: 'codex',
    status: 'pending',
    ...overrides,
  };
}

describe('assignAgents', () => {
  it('throws when no agents are provided', () => {
    expect(() => assignAgents([makeTask()], [])).toThrow();
  });

  it('assigns the only available agent when pool has one entry', () => {
    const tasks = assignAgents([makeTask()], ['gemini']);
    expect(tasks[0].agent).toBe('gemini');
  });

  it('assigns claude-code to architecture tasks', () => {
    const tasks = assignAgents(
      [makeTask({ title: 'Architecture design', description: 'Design the overall architecture and design patterns' })],
      ['codex', 'claude-code'],
    );
    expect(tasks[0].agent).toBe('claude-code');
  });

  it('assigns codex to test tasks', () => {
    const tasks = assignAgents(
      [makeTask({ title: 'Write tests', description: 'Create unit tests for the codebase' })],
      ['codex', 'claude-code'],
    );
    expect(tasks[0].agent).toBe('codex');
  });

  it('does not mutate the original array', () => {
    const original = [makeTask()];
    const result = assignAgents(original, ['gemini']);
    expect(result).not.toBe(original);
    expect(original[0].agent).toBe('codex');
  });

  it('returns the same number of tasks', () => {
    const tasks = [makeTask({ id: 'task-001' }), makeTask({ id: 'task-002' })];
    const result = assignAgents(tasks, ['codex', 'claude-code', 'gemini']);
    expect(result).toHaveLength(2);
  });
});
