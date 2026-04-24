import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendEvent, writeRunSnapshot } from './events.js';
import { discoverAgents } from './runtime/discovery.js';
import { validateAgentRoleAvailability } from './runtime/selection.js';
import { chooseFallbackAgent, isFallbackReason } from './fallback.js';
import { indexWorkspaceMarkdown } from './markdowndb.js';
import { readProject, writeProject } from './project.js';
import { runTaskAgent } from './runner.js';
import {
  createInitialState,
  deriveProjectStatus,
  readState,
  syncRuntimeState,
  updateTaskRuntimeStatus,
  writeState,
} from './state.js';
import { readTask, writeTask } from './task-files.js';
import { applyTaskStatuses } from './tdd.js';
import type { ProjectState, RunSummary, TaskDoc } from './types.js';
import {
  discoverRunnableWorkspaces,
  readRunnableWorkspace,
  resolveWorkspacePaths,
  sortTaskDocs,
  taskFiles,
  type RunnableWorkspace,
} from './workspace.js';

const IGNORED_COPY_DIRS = new Set([
  '.git',
  'dist',
  'node_modules',
]);

export type PrdRunOutcome = 'success' | 'paused' | 'failed';

export interface ParallelRunResult {
  target: RunnableWorkspace;
  isolatedRootDir: string;
  outcome: PrdRunOutcome;
  summary: RunSummary | null;
  stdout: string;
  stderr: string;
}

export interface ParallelRunSummary {
  maxParallel: number;
  results: ParallelRunResult[];
  successfulPrds: string[];
  pausedPrds: string[];
  failedPrds: string[];
}

export interface RunCommandOptions {
  output: string;
  outputs?: string | string[];
  all?: boolean;
  maxParallel?: number;
  json?: boolean;
}

interface PreparedRunContext {
  rootDir: string;
  syncBack: () => void;
}

function loadArtifacts(outputDir: string): {
  project: ReturnType<typeof readProject>;
  tasks: TaskDoc[];
  state: ProjectState;
  paths: ReturnType<typeof resolveWorkspacePaths>;
} {
  const paths = resolveWorkspacePaths(outputDir);
  const project = readProject(paths.projectFile);
  const tasks = sortTaskDocs(taskFiles(paths).map((file) => readTask(file)));
  const state = syncRuntimeState(
    project,
    tasks,
    taskFiles(paths).length > 0 ? readState(paths.stateFile) : createInitialState(project, tasks, 'completion'),
  );
  return { project, tasks, state, paths };
}

function persistArtifacts(
  paths: ReturnType<typeof resolveWorkspacePaths>,
  project: ReturnType<typeof readProject>,
  tasks: TaskDoc[],
  state: ProjectState,
): void {
  const syncedTasks = tasks.map((task) => ({
    ...task,
    status: state.tasks[task.taskId]?.status ?? task.status,
    updatedAt: state.updatedAt,
  }));

  for (const task of syncedTasks) {
    writeTask(path.join(paths.tasksDir, `${task.taskId}.md`), task);
  }

  applyTaskStatuses(project, syncedTasks);
  project.status = deriveProjectStatus(state, syncedTasks);
  project.updatedAt = state.updatedAt;
  writeProject(paths.projectFile, project);
  writeState(paths.stateFile, state);
}

function nextReadyTask(tasks: TaskDoc[], state: ProjectState): TaskDoc | undefined {
  return tasks.find((task) => state.tasks[task.taskId]?.status === 'ready');
}

export async function runProject(outputDir = '.task-loop'): Promise<RunSummary> {
  const runId = randomUUID();
  const { project, tasks, state, paths } = loadArtifacts(outputDir);
  const orchestratorFallbackReason = state.orchestratorAgent
    ? validateAgentRoleAvailability(discoverAgents(), state.orchestratorAgent, 'orchestrator')
    : null;
  const summary: RunSummary = {
    runId,
    completedTaskIds: [],
    pausedTaskIds: [],
    failedTaskIds: [],
    fallbackTaskIds: [],
    orchestratorAgent: state.orchestratorAgent ?? null,
    promptBuilder: 'local-deterministic',
    orchestratorFallbackReason,
  };

  appendEvent(paths.eventsFile, {
    type: 'run_started',
    runId,
    projectId: project.projectId,
  });

  if (orchestratorFallbackReason && state.orchestratorAgent) {
    appendEvent(paths.eventsFile, {
      type: 'orchestrator_fallback',
      runId,
      orchestratorAgent: state.orchestratorAgent,
      promptBuilder: 'local-deterministic',
      reason: orchestratorFallbackReason,
    });
  }

  while (true) {
    syncRuntimeState(project, tasks, state);
    const task = nextReadyTask(tasks, state);
    if (!task) {
      break;
    }

    const runtime = state.tasks[task.taskId];
    runtime.attempts += 1;
    runtime.startedAt = new Date().toISOString();
    runtime.lastRunAt = runtime.startedAt;
    updateTaskRuntimeStatus(state, task.taskId, 'running');
    persistArtifacts(paths, project, tasks, state);

    appendEvent(paths.eventsFile, {
      type: 'task_started',
      runId,
      taskId: task.taskId,
      agent: runtime.activeAgent,
    });

    const result = await runTaskAgent(
      project,
      task,
      runtime.activeAgent,
      paths.rootDir,
      runtime.timeoutMs,
    );

    runtime.lastExitReason = result.exitReason;
    runtime.lastError = result.errorMessage;
    state.lastRunId = runId;
    state.updatedAt = new Date().toISOString();

    if (result.success) {
      runtime.completedAt = new Date().toISOString();
      updateTaskRuntimeStatus(state, task.taskId, 'complete');
      summary.completedTaskIds.push(task.taskId);
      appendEvent(paths.eventsFile, {
        type: 'task_completed',
        runId,
        taskId: task.taskId,
      });
      persistArtifacts(paths, project, tasks, state);
      continue;
    }

    if (isFallbackReason(result.exitReason)) {
      const fallbackAgent = chooseFallbackAgent(runtime);
      if (fallbackAgent) {
        runtime.activeAgent = fallbackAgent;
        runtime.fallbackAgents = runtime.fallbackAgents.filter((agent) => agent !== fallbackAgent);
        updateTaskRuntimeStatus(state, task.taskId, 'ready');
        summary.fallbackTaskIds.push(task.taskId);
        appendEvent(paths.eventsFile, {
          type: 'task_fallback',
          runId,
          taskId: task.taskId,
          fallbackAgent,
          reason: result.exitReason,
        });
        persistArtifacts(paths, project, tasks, state);
        continue;
      }

      updateTaskRuntimeStatus(state, task.taskId, 'paused');
      runtime.lastExitReason = 'no_fallback_available';
      summary.pausedTaskIds.push(task.taskId);
      appendEvent(paths.eventsFile, {
        type: 'task_paused',
        runId,
        taskId: task.taskId,
        reason: 'no_fallback_available',
      });
      persistArtifacts(paths, project, tasks, state);
      continue;
    }

    updateTaskRuntimeStatus(state, task.taskId, 'failed');
    summary.failedTaskIds.push(task.taskId);
    appendEvent(paths.eventsFile, {
      type: 'task_failed',
      runId,
      taskId: task.taskId,
      reason: result.exitReason,
    });
    persistArtifacts(paths, project, tasks, state);
  }

  state.status = deriveProjectStatus(state, tasks);
  persistArtifacts(paths, project, tasks, state);
  writeRunSnapshot(paths.runsDir, runId, {
    runId,
    projectId: project.projectId,
    summary,
    state,
  });

  appendEvent(paths.eventsFile, {
    type: 'run_finished',
    runId,
    summary,
  });
  await indexWorkspaceMarkdown(outputDir);

  return summary;
}

export function classifyRunOutcome(summary: RunSummary): PrdRunOutcome {
  if (summary.failedTaskIds.length > 0) {
    return 'failed';
  }
  if (summary.pausedTaskIds.length > 0) {
    return 'paused';
  }
  return 'success';
}

function formatSingleRunSummary(summary: RunSummary): string {
  const lines = [
    '',
    `Run ${summary.runId}`,
    ...(summary.orchestratorFallbackReason && summary.orchestratorAgent
      ? [`Prompt builder: local deterministic fallback (${summary.orchestratorAgent}: ${summary.orchestratorFallbackReason})`]
      : []),
    `Completed: ${summary.completedTaskIds.length}`,
    `Paused: ${summary.pausedTaskIds.length}`,
    `Failed: ${summary.failedTaskIds.length}`,
    `Fallbacks: ${summary.fallbackTaskIds.length}`,
    '',
  ];
  return lines.join('\n');
}

export function formatParallelRunSummary(summary: ParallelRunSummary): string {
  const lines = [
    '',
    `Parallel run (${summary.results.length} PRDs, max parallel: ${summary.maxParallel})`,
  ];

  for (const result of summary.results) {
    lines.push(`- ${result.target.outputDir}: ${result.outcome} -> ${result.isolatedRootDir}`);
  }

  lines.push(
    '',
    `Success: ${summary.successfulPrds.length}`,
    `Paused: ${summary.pausedPrds.length}`,
    `Failed: ${summary.failedPrds.length}`,
    '',
  );

  return lines.join('\n');
}

function maybeWriteSummaryFile(summary: RunSummary | ParallelRunSummary): void {
  const summaryFile = process.env.SVP_RUN_SUMMARY_FILE;
  if (!summaryFile) {
    return;
  }
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

function parseOutputList(outputs: string | string[] | undefined): string[] {
  const rawValues = Array.isArray(outputs) ? outputs : outputs ? [outputs] : [];
  return rawValues
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveRunTargets(options: RunCommandOptions): RunnableWorkspace[] {
  const explicitOutputs = parseOutputList(options.outputs);
  if (explicitOutputs.length > 0) {
    return explicitOutputs.map((output) => readRunnableWorkspace(output));
  }

  if (options.all) {
    const discovered = discoverRunnableWorkspaces();
    if (discovered.length === 0) {
      throw new Error('No runnable PRDs found.');
    }
    return discovered;
  }

  return [readRunnableWorkspace(options.output)];
}

function sanitizeWorkspaceSlug(outputDir: string): string {
  return outputDir
    .replace(/^[./\\]+/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'task-loop';
}

function getSiblingWorktreesRoot(rootDir: string): string {
  return path.join(path.dirname(rootDir), `${path.basename(rootDir)}.worktrees`);
}

function getIsolatedRootDir(rootDir: string, target: RunnableWorkspace): string {
  return path.join(getSiblingWorktreesRoot(rootDir), sanitizeWorkspaceSlug(target.outputDir));
}

function hasGitCheckout(rootDir: string): boolean {
  const result = spawnSync('git', ['-C', rootDir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function ensureGitWorktree(rootDir: string, isolatedRootDir: string): void {
  if (existsSync(path.join(isolatedRootDir, '.git'))) {
    return;
  }

  mkdirSync(path.dirname(isolatedRootDir), { recursive: true });
  const result = spawnSync(
    'git',
    ['-C', rootDir, 'worktree', 'add', '--detach', isolatedRootDir, 'HEAD'],
    {
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Failed to create git worktree.');
  }
}

function ensureCopiedCheckout(rootDir: string, isolatedRootDir: string): void {
  if (existsSync(isolatedRootDir)) {
    return;
  }

  mkdirSync(path.dirname(isolatedRootDir), { recursive: true });
  cpSync(rootDir, isolatedRootDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(rootDir, sourcePath);
      if (!relativePath) {
        return true;
      }
      const firstSegment = relativePath.split(path.sep)[0];
      return !IGNORED_COPY_DIRS.has(firstSegment);
    },
  });
}

function ensureSharedNodeModules(rootDir: string, isolatedRootDir: string): void {
  const sourceNodeModules = path.join(rootDir, 'node_modules');
  const targetNodeModules = path.join(isolatedRootDir, 'node_modules');

  if (!existsSync(sourceNodeModules) || existsSync(targetNodeModules)) {
    return;
  }

  try {
    symlinkSync(sourceNodeModules, targetNodeModules, 'dir');
  } catch {
    cpSync(sourceNodeModules, targetNodeModules, { recursive: true });
  }
}

function syncWorkspaceDirectory(
  sourceRootDir: string,
  targetRootDir: string,
  outputDir: string,
): void {
  const sourceOutputDir = path.resolve(sourceRootDir, outputDir);
  const targetOutputDir = path.resolve(targetRootDir, outputDir);

  rmSync(targetOutputDir, { recursive: true, force: true });
  mkdirSync(path.dirname(targetOutputDir), { recursive: true });
  cpSync(sourceOutputDir, targetOutputDir, { recursive: true });
}

function prepareRunContext(target: RunnableWorkspace): PreparedRunContext {
  const rootDir = process.cwd();
  const isolatedRootDir = getIsolatedRootDir(rootDir, target);

  if (hasGitCheckout(rootDir)) {
    ensureGitWorktree(rootDir, isolatedRootDir);
  } else {
    ensureCopiedCheckout(rootDir, isolatedRootDir);
  }

  ensureSharedNodeModules(rootDir, isolatedRootDir);
  syncWorkspaceDirectory(rootDir, isolatedRootDir, target.outputDir);

  return {
    rootDir: isolatedRootDir,
    syncBack: () => {
      syncWorkspaceDirectory(isolatedRootDir, rootDir, target.outputDir);
    },
  };
}

function resolveCliInvocation(): { command: string; argsPrefix: string[] } {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const tsEntry = path.join(moduleDir, 'cli.ts');
  if (existsSync(tsEntry)) {
    const sourceRootDir = path.dirname(moduleDir);
    const tsxCli = path.join(sourceRootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (!existsSync(tsxCli)) {
      throw new Error('Unable to locate tsx CLI for isolated run execution.');
    }
    return {
      command: process.execPath,
      argsPrefix: [tsxCli, tsEntry],
    };
  }

  const jsEntry = path.join(moduleDir, 'cli.js');
  if (!existsSync(jsEntry)) {
    throw new Error('Unable to locate the svp CLI entrypoint for isolated run execution.');
  }
  return {
    command: process.execPath,
    argsPrefix: [jsEntry],
  };
}

async function executeProjectTarget(target: RunnableWorkspace): Promise<ParallelRunResult> {
  const rootDir = process.cwd();
  const isolatedRootDir = getIsolatedRootDir(rootDir, target);

  try {
    const prepared = prepareRunContext(target);
    const cli = resolveCliInvocation();
    const summaryFile = path.join(os.tmpdir(), `svp-run-summary-${randomUUID()}.json`);

    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(
          cli.command,
          [...cli.argsPrefix, 'run', '--output', target.outputDir],
          {
            cwd: prepared.rootDir,
            env: {
              ...process.env,
              SVP_RUN_SUMMARY_FILE: summaryFile,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', () => resolve({ stdout, stderr }));
      });

      const summary = existsSync(summaryFile)
        ? JSON.parse(readFileSync(summaryFile, 'utf8')) as RunSummary
        : null;
      const outcome = summary ? classifyRunOutcome(summary) : 'failed';
      prepared.syncBack();

      return {
        target,
        isolatedRootDir,
        outcome,
        summary,
        stdout,
        stderr,
      };
    } finally {
      rmSync(summaryFile, { force: true });
    }
  } catch (error) {
    return {
      target,
      isolatedRootDir,
      outcome: 'failed',
      summary: null,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
    };
  }
}

export async function runProjectsInParallel(
  targets: RunnableWorkspace[],
  options: {
    maxParallel?: number;
    executeTarget?: (target: RunnableWorkspace) => Promise<ParallelRunResult>;
  } = {},
): Promise<ParallelRunSummary> {
  if (targets.length === 0) {
    throw new Error('No runnable PRDs selected.');
  }

  const executeTarget = options.executeTarget ?? executeProjectTarget;
  const maxParallel = Math.max(1, Math.min(options.maxParallel ?? 2, targets.length));
  const results = new Array<ParallelRunResult>(targets.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= targets.length) {
      return;
    }

    results[currentIndex] = await executeTarget(targets[currentIndex]);
    await runNext();
  }

  await Promise.all(
    Array.from({ length: maxParallel }, () => runNext()),
  );

  return {
    maxParallel,
    results,
    successfulPrds: results
      .filter((result) => result.outcome === 'success')
      .map((result) => result.target.outputDir),
    pausedPrds: results
      .filter((result) => result.outcome === 'paused')
      .map((result) => result.target.outputDir),
    failedPrds: results
      .filter((result) => result.outcome === 'failed')
      .map((result) => result.target.outputDir),
  };
}

export async function commandRun(options: RunCommandOptions): Promise<void> {
  const targets = resolveRunTargets(options);

  if (targets.length <= 1) {
    const summary = await runProject(targets[0]?.outputDir ?? options.output);
    maybeWriteSummaryFile(summary);
    process.stdout.write(options.json
      ? `${JSON.stringify(summary, null, 2)}\n`
      : formatSingleRunSummary(summary));
    return;
  }

  const summary = await runProjectsInParallel(targets, {
    maxParallel: options.maxParallel ?? 2,
  });
  maybeWriteSummaryFile(summary);
  process.stdout.write(options.json
    ? `${JSON.stringify(summary, null, 2)}\n`
    : formatParallelRunSummary(summary));
}
