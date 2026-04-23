import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readTask } from '../src/task-files.js';
import { makeTempDir, runCli, writeAgentStubs } from './test-utils.js';

describe('svp CLI smoke tests', () => {
  it('creates the new project structure and runs tasks end-to-end', { timeout: 20000 }, () => {
    const cwd = makeTempDir('svp-smoke-success-');
    const binDir = path.join(cwd, 'bin');
    const logPath = path.join(cwd, 'agent-log.jsonl');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: logPath,
    };

    try {
      writeAgentStubs(binDir);

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Ship the new TDD-first harness',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env);
      expect(plan.status).toBe(0);
      expect(existsSync(path.join(cwd, '.task-loop', 'project.md'))).toBe(true);
      expect(existsSync(path.join(cwd, '.task-loop', 'tasks', 'T-001.md'))).toBe(true);
      expect(existsSync(path.join(cwd, '.task-loop', 'state.json'))).toBe(true);

      const run = runCli(cwd, ['run'], env);
      expect(run.status).toBe(0);

      const state = JSON.parse(readFileSync(path.join(cwd, '.task-loop', 'state.json'), 'utf8'));
      expect(Object.values(state.tasks).every((task: any) => task.status === 'complete')).toBe(true);

      const status = runCli(cwd, ['status'], env);
      expect(status.stdout).toContain('Project status');
      expect(status.stdout).toContain('complete');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('falls back to another agent and pauses if none remains', () => {
    const cwd = makeTempDir('svp-smoke-fallback-');
    const binDir = path.join(cwd, 'bin');
    const logPath = path.join(cwd, 'agent-log.jsonl');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: logPath,
    };

    try {
      writeAgentStubs(binDir, { failMap: { codex: 75 } });
      expect(runCli(cwd, [
        'plan',
        '--task',
        'Add a fallback scenario',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);

      expect(runCli(cwd, ['run'], env).status).toBe(0);

      const state = JSON.parse(readFileSync(path.join(cwd, '.task-loop', 'state.json'), 'utf8'));
      expect(state.tasks['T-001'].activeAgent).toBe('opencode');
      expect(state.tasks['T-001'].status).toBe('complete');
      expect(existsSync(path.join(cwd, '.task-loop', 'runs'))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports add-task and revise-plan modes', () => {
    const cwd = makeTempDir('svp-smoke-plan-modes-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir);
      expect(runCli(cwd, [
        'plan',
        '--task',
        'Create initial project',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);

      expect(runCli(cwd, [
        'plan',
        '--task',
        'Add another feature slice',
        '--mode',
        'add-task',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);
      expect(existsSync(path.join(cwd, '.task-loop', 'tasks', 'T-005.md'))).toBe(true);

      expect(runCli(cwd, [
        'plan',
        '--task',
        'Broaden the project framing',
        '--mode',
        'revise-plan',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);

      const project = readFileSync(path.join(cwd, '.task-loop', 'project.md'), 'utf8');
      expect(project).toContain('Revision request');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('supports explicit orchestrator and worker selection', () => {
    const cwd = makeTempDir('svp-smoke-worker-selection-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir, { commands: ['codex', 'opencode'] });

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Use discovery-backed worker selection',
        '--orchestrator',
        'codex',
        '--workers',
        'opencode',
        '--no-interactive',
      ], env);
      expect(plan.status).toBe(0);

      const state = JSON.parse(readFileSync(path.join(cwd, '.task-loop', 'state.json'), 'utf8'));
      expect(state.orchestratorAgent).toBe('codex');

      const testsTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-001.md'));
      const implementationTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-003.md'));
      expect(testsTask.primaryAgent).toBe('opencode');
      expect(implementationTask.primaryAgent).toBe('opencode');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps --agents as a compatibility alias for --workers', () => {
    const cwd = makeTempDir('svp-smoke-agents-alias-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir, { commands: ['codex', 'opencode'] });

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Use legacy workers alias',
        '--orchestrator',
        'codex',
        '--agents',
        'opencode',
        '--no-interactive',
      ], env);
      expect(plan.status).toBe(0);

      const state = JSON.parse(readFileSync(path.join(cwd, '.task-loop', 'state.json'), 'utf8'));
      expect(state.orchestratorAgent).toBe('codex');

      const testsTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-001.md'));
      expect(testsTask.primaryAgent).toBe('opencode');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails fast when the selected orchestrator is unavailable', () => {
    const cwd = makeTempDir('svp-smoke-orchestrator-validation-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir, { commands: ['opencode'] });

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Validate orchestrator availability',
        '--orchestrator',
        'codex',
        '--workers',
        'opencode',
        '--no-interactive',
      ], env);
      expect(plan.status).toBe(1);
      expect(plan.stderr).toContain('Selected orchestrator codex is not currently available');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('falls back to the local prompt builder when the planned orchestrator disappears', () => {
    const cwd = makeTempDir('svp-smoke-orchestrator-fallback-');
    const binDir = path.join(cwd, 'bin');
    const baseEnv = {
      ...process.env,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir, { commands: ['codex', 'opencode'] });

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Keep worker execution stable',
        '--orchestrator',
        'codex',
        '--workers',
        'opencode',
        '--no-interactive',
      ], {
        ...baseEnv,
        PATH: binDir,
      });
      expect(plan.status).toBe(0);

      rmSync(path.join(binDir, 'codex'));

      const run = runCli(cwd, ['run'], {
        ...baseEnv,
        PATH: binDir,
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('Prompt builder: local deterministic fallback');
      expect(run.stdout).toContain('codex');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('indexes and queries the markdown workspace from the CLI', () => {
    const cwd = makeTempDir('svp-smoke-index-query-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir);
      expect(runCli(cwd, [
        'plan',
        '--task',
        'Prepare markdown indexing',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);

      const index = runCli(cwd, ['index'], env);
      expect(index.status).toBe(0);
      expect(index.stdout).toContain('MarkdownDB indexed');

      const query = runCli(cwd, ['query', '--kind', 'task'], env);
      expect(query.status).toBe(0);
      expect(query.stdout).toContain('task: T-001');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('resolves default orchestrator and workers from discovery across all supported stubs', () => {
    const cwd = makeTempDir('svp-smoke-discovery-defaults-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir);

      const plan = runCli(cwd, [
        'plan',
        '--task',
        'Exercise discovery defaults',
        '--no-interactive',
      ], env);
      expect(plan.status).toBe(0);

      const project = readFileSync(path.join(cwd, '.task-loop', 'project.md'), 'utf8');
      const state = JSON.parse(readFileSync(path.join(cwd, '.task-loop', 'state.json'), 'utf8'));
      const testsTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-001.md'));
      const implementationTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-003.md'));
      const refactorTask = readTask(path.join(cwd, '.task-loop', 'tasks', 'T-004.md'));

      expect(project).toContain('orchestrator_agent: "codex"');
      expect(project).toContain('worker_agents:');
      expect(project).toContain('- "claude-code"');
      expect(project).toContain('- "gemini"');
      expect(project).toContain('- "opencode"');
      expect(project).toContain('- "amp"');
      expect(state.orchestratorAgent).toBe('codex');
      expect(testsTask.primaryAgent).toBe('codex');
      expect(testsTask.fallbackAgents).toEqual(['claude-code', 'gemini', 'opencode', 'amp']);
      expect(implementationTask.primaryAgent).toBe('opencode');
      expect(refactorTask.primaryAgent).toBe('claude-code');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reads legacy runtime state before rewriting it during add-task planning', () => {
    const cwd = makeTempDir('svp-smoke-legacy-state-rewrite-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: binDir,
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    };

    try {
      writeAgentStubs(binDir, { commands: ['codex', 'opencode'] });

      expect(runCli(cwd, [
        'plan',
        '--task',
        'Seed legacy state rewrite',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env).status).toBe(0);

      const legacyStatePath = path.join(cwd, '.task-loop', 'state.json');
      const legacyState = JSON.parse(readFileSync(legacyStatePath, 'utf8'));
      legacyState.budgets = {
        maxCostUsd: 42,
        maxTaskDurationMs: legacyState.budgets.maxTaskDurationMs,
      };
      delete legacyState.budgets.maxTokens;
      writeFileSync(legacyStatePath, `${JSON.stringify(legacyState, null, 2)}\n`, 'utf8');

      const revise = runCli(cwd, [
        'plan',
        '--task',
        'Append another slice',
        '--mode',
        'add-task',
        '--agents',
        'codex,opencode',
        '--no-interactive',
      ], env);
      expect(revise.status).toBe(0);

      const rewritten = readFileSync(legacyStatePath, 'utf8');
      const parsed = JSON.parse(rewritten);
      expect(parsed.budgets).toEqual({
        maxTokens: null,
        maxTaskDurationMs: 1800000,
      });
      expect(rewritten).not.toContain('maxCostUsd');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
