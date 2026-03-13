import { describe, it, expect } from 'vitest';
import { splitIntoSubTasks, branchNameFromTitle } from '../src/splitter.js';

describe('branchNameFromTitle', () => {
  it('converts a title to a URL-safe branch name', () => {
    expect(branchNameFromTitle('Core Implementation')).toBe('core-implementation');
  });

  it('strips leading and trailing hyphens', () => {
    expect(branchNameFromTitle('  Hello World  ')).toBe('hello-world');
  });

  it('truncates long titles to 50 characters', () => {
    const long = 'A'.repeat(60);
    expect(branchNameFromTitle(long).length).toBeLessThanOrEqual(50);
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(branchNameFromTitle('foo/bar (baz)')).toBe('foo-bar-baz');
  });
});

describe('splitIntoSubTasks', () => {
  it('returns the default breakdown when no components are listed', () => {
    const tasks = splitIntoSubTasks('Goal: Build an API', ['codex']);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0].id).toBe('task-001');
    expect(tasks[0].status).toBe('pending');
  });

  it('creates one sub-task per component', () => {
    const description = 'Goal: API\nComponents: auth, api, frontend';
    const tasks = splitIntoSubTasks(description, ['codex']);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('auth');
    expect(tasks[1].title).toBe('api');
    expect(tasks[2].title).toBe('frontend');
  });

  it('parses markdown section-style component lists', () => {
    const description = `# My App\n\n## Components\n- auth\n- api\n- frontend\n`;
    const tasks = splitIntoSubTasks(description, ['codex']);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('auth');
    expect(tasks[1].title).toBe('api');
    expect(tasks[2].title).toBe('frontend');
  });

  it('assigns tasks round-robin across agents', () => {
    const description = 'Goal: X\nComponents: a, b, c, d';
    const tasks = splitIntoSubTasks(description, ['codex', 'claude-code']);
    expect(tasks[0].agent).toBe('codex');
    expect(tasks[1].agent).toBe('claude-code');
    expect(tasks[2].agent).toBe('codex');
    expect(tasks[3].agent).toBe('claude-code');
  });

  it('sets dependencies on all tasks except the first', () => {
    const tasks = splitIntoSubTasks('Goal: Test', ['codex']);
    expect(tasks[0].dependencies).toHaveLength(0);
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i].dependencies).toContain('task-001');
    }
  });

  it('each task has a branch property derived from its title', () => {
    const tasks = splitIntoSubTasks('Goal: Test', ['codex']);
    for (const task of tasks) {
      expect(task.branch).toBeTruthy();
      expect(task.branch).not.toMatch(/[A-Z\s]/);
    }
  });
});
