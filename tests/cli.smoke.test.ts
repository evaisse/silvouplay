import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { TaskPlan } from '../src/types.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'src', 'cli.ts');
const TSX_CLI = path.join(
  REPO_ROOT,
  'node_modules',
  'tsx',
  'dist',
  'cli.mjs',
);

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  const result = spawnSync(process.execPath, [TSX_CLI, CLI_ENTRY, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function loadPlan(cwd: string): TaskPlan {
  const planPath = path.join(cwd, '.task-loop', 'plan.json');
  return JSON.parse(readFileSync(planPath, 'utf8')) as TaskPlan;
}

function loadAgentLog(logPath: string): Array<{
  command: string;
  cwd: string;
  prompt: string;
}> {
  if (!existsSync(logPath)) {
    return [];
  }

  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { command: string; cwd: string; prompt: string });
}

function writeAgentStubs(
  binDir: string,
  options: { omit?: string[] } = {},
): void {
  mkdirSync(binDir, { recursive: true });

  for (const command of ['codex', 'claude', 'gemini', 'opencode']) {
    if (options.omit?.includes(command)) {
      continue;
    }

    const scriptPath = path.join(binDir, command);
    writeFileSync(
      scriptPath,
      `#!${process.execPath}
const { appendFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const logFile = process.env.AGENT_STUB_LOG;
if (!logFile) {
  throw new Error('AGENT_STUB_LOG is required');
}

mkdirSync(path.dirname(logFile), { recursive: true });

const entry = {
  command: path.basename(process.argv[1]),
  cwd: process.cwd(),
  prompt: process.argv.slice(2).join(' ')
};

appendFileSync(logFile, JSON.stringify(entry) + '\\n');

const failing = new Set(
  (process.env.AGENT_STUB_FAIL_COMMANDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

process.exit(failing.has(entry.command) ? 7 : 0);
`,
      'utf8',
    );
    chmodSync(scriptPath, 0o755);
  }
}

function createEnv(
  binDir: string,
  extra: NodeJS.ProcessEnv = {},
  includeSystemPath = false,
): NodeJS.ProcessEnv {
  const pathValue = includeSystemPath
    ? `${binDir}${path.delimiter}${process.env.PATH ?? ''}`
    : binDir;

  return {
    ...process.env,
    ...extra,
    PATH: pathValue,
  };
}

function initGitRepo(cwd: string): void {
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' });
  writeFileSync(path.join(cwd, 'README.md'), '# temp repo\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd, stdio: 'ignore' });
}

describe('svp CLI smoke tests', () => {
  it('runs a full successful plan, run, and status cycle with stub agents', () => {
    const cwd = makeTempDir('agent-task-loop-success-');
    const binDir = path.join(cwd, 'bin');
    const logPath = path.join(cwd, 'agent-log.jsonl');
    const env = createEnv(binDir, {
      AGENT_STUB_LOG: logPath,
    });

    try {
      writeAgentStubs(binDir);

      const task = [
        'Build a smoke test scenario',
        'Components: tests, architecture, research, file operations',
      ].join('\n');

      const planResult = runCli(
        cwd,
        [
          'plan',
          '--task',
          task,
          '--agents',
          'codex,claude-code,gemini,opencode',
          '--no-interactive',
        ],
        env,
      );
      expect(planResult.status).toBe(0);

      const plan = loadPlan(cwd);
      expect(plan.subTasks).toHaveLength(4);
      expect(existsSync(path.join(cwd, '.task-loop', 'PRD.md'))).toBe(true);

      const runResult = runCli(cwd, ['run'], env);
      expect(runResult.status).toBe(0);

      const updatedPlan = loadPlan(cwd);
      expect(updatedPlan.subTasks.every((task) => task.status === 'complete')).toBe(true);

      const statusResult = runCli(cwd, ['status'], env);
      expect(statusResult.status).toBe(0);
      expect(statusResult.stdout).toContain('complete');

      const entries = loadAgentLog(logPath);
      expect(entries).toHaveLength(4);
      expect(new Set(entries.map((entry) => entry.command))).toEqual(
        new Set(['codex', 'claude', 'gemini', 'opencode']),
      );
      expect(entries.every((entry) => path.isAbsolute(entry.cwd))).toBe(true);
      expect(entries.some((entry) => entry.prompt.includes('architecture'))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('marks tasks as failed when an agent exits non-zero', () => {
    const cwd = makeTempDir('agent-task-loop-failure-');
    const binDir = path.join(cwd, 'bin');
    const env = createEnv(binDir, {
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
      AGENT_STUB_FAIL_COMMANDS: 'claude',
    });

    try {
      writeAgentStubs(binDir);

      const task = [
        'Simulate one failing agent',
        'Components: architecture, tests',
      ].join('\n');

      expect(
        runCli(
          cwd,
          [
            'plan',
            '--task',
            task,
            '--agents',
            'codex,claude-code',
            '--no-interactive',
          ],
          env,
        ).status,
      ).toBe(0);

      expect(runCli(cwd, ['run'], env).status).toBe(0);

      const plan = loadPlan(cwd);
      expect(plan.subTasks.find((task) => task.agent === 'claude-code')?.status).toBe('failed');
      expect(plan.subTasks.find((task) => task.agent === 'codex')?.status).toBe('complete');

      const statusResult = runCli(cwd, ['status'], env);
      expect(statusResult.stdout).toContain('failed');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('marks tasks as failed when the assigned binary is missing', () => {
    const cwd = makeTempDir('agent-task-loop-missing-bin-');
    const binDir = path.join(cwd, 'bin');
    const env = createEnv(binDir, {
      AGENT_STUB_LOG: path.join(cwd, 'agent-log.jsonl'),
    });

    try {
      writeAgentStubs(binDir, { omit: ['claude'] });

      expect(
        runCli(
          cwd,
          [
            'plan',
            '--task',
            'Simulate a missing agent binary\nComponents: architecture',
            '--agents',
            'claude-code',
            '--no-interactive',
          ],
          env,
        ).status,
      ).toBe(0);

      expect(runCli(cwd, ['run'], env).status).toBe(0);

      const plan = loadPlan(cwd);
      expect(plan.subTasks).toHaveLength(1);
      expect(plan.subTasks[0].status).toBe('failed');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs tasks inside per-task worktrees when requested', () => {
    const cwd = makeTempDir('agent-task-loop-worktrees-');
    const binDir = path.join(cwd, 'bin');
    const logPath = path.join(cwd, 'agent-log.jsonl');
    const env = createEnv(binDir, {
      AGENT_STUB_LOG: logPath,
    }, true);

    try {
      initGitRepo(cwd);
      writeAgentStubs(binDir);

      const task = [
        'Exercise git worktrees',
        'Components: tests, architecture',
      ].join('\n');

      expect(
        runCli(
          cwd,
          [
            'plan',
            '--task',
            task,
            '--agents',
            'codex,claude-code',
            '--no-interactive',
            '--worktrees',
          ],
          env,
        ).status,
      ).toBe(0);

      const plan = loadPlan(cwd);
      expect(plan.subTasks.every((task) => task.worktreePath?.includes(`${path.sep}.worktrees${path.sep}`))).toBe(true);

      expect(runCli(cwd, ['run'], env).status).toBe(0);

      const updatedPlan = loadPlan(cwd);
      expect(updatedPlan.subTasks.every((task) => task.status === 'complete')).toBe(true);

      const entries = loadAgentLog(logPath);
      expect(entries).toHaveLength(2);
      expect(entries.every((entry) => entry.cwd.includes(`${path.sep}.worktrees${path.sep}`))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
