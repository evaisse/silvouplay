import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'src', 'cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

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

function writeAgentStubs(binDir: string, options: { failMap?: Record<string, number> } = {}): void {
  mkdirSync(binDir, { recursive: true });

  for (const command of ['codex', 'claude', 'gemini', 'opencode']) {
    const scriptPath = path.join(binDir, command);
    const exitCode = options.failMap?.[command] ?? 0;
    writeFileSync(
      scriptPath,
      `#!${process.execPath}
const { appendFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const logFile = process.env.AGENT_STUB_LOG;
if (!logFile) throw new Error('AGENT_STUB_LOG is required');

mkdirSync(path.dirname(logFile), { recursive: true });
appendFileSync(logFile, JSON.stringify({ command: path.basename(process.argv[1]), cwd: process.cwd(), prompt: process.argv.slice(2).join(' ') }) + '\\n');
process.exit(${exitCode});
`,
      'utf8',
    );
    chmodSync(scriptPath, 0o755);
  }
}

describe('svp CLI smoke tests', () => {
  it('creates the new project structure and runs tasks end-to-end', { timeout: 20000 }, () => {
    const cwd = makeTempDir('svp-smoke-success-');
    const binDir = path.join(cwd, 'bin');
    const logPath = path.join(cwd, 'agent-log.jsonl');
    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
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
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
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
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
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

  it('indexes and queries the markdown workspace from the CLI', () => {
    const cwd = makeTempDir('svp-smoke-index-query-');
    const binDir = path.join(cwd, 'bin');
    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
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
});
