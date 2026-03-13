import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAgentCommand } from '../src/runner.js';
import type { SubTask } from '../src/types.js';

function makeTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'task-001',
    title: 'Implement feature',
    description: 'Add the new feature to the codebase',
    dependencies: [],
    agent: 'codex',
    status: 'pending',
    ...overrides,
  };
}

describe('buildAgentCommand', () => {
  it('uses the correct command for codex', () => {
    const { command } = buildAgentCommand(makeTask({ agent: 'codex' }));
    expect(command).toBe('codex');
  });

  it('uses "claude" as the command for claude-code', () => {
    const { command } = buildAgentCommand(makeTask({ agent: 'claude-code' }));
    expect(command).toBe('claude');
  });

  it('uses "gemini" as the command for gemini', () => {
    const { command } = buildAgentCommand(makeTask({ agent: 'gemini' }));
    expect(command).toBe('gemini');
  });

  it('uses "opencode" as the command for opencode', () => {
    const { command } = buildAgentCommand(makeTask({ agent: 'opencode' }));
    expect(command).toBe('opencode');
  });

  it('includes both title and description in the args', () => {
    const task = makeTask({ title: 'My Title', description: 'My Desc' });
    const { args } = buildAgentCommand(task);
    expect(args[0]).toContain('My Title');
    expect(args[0]).toContain('My Desc');
  });
});
