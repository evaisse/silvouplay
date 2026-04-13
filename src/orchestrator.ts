import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { appendEvent, writeRunSnapshot } from './events.js';
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
import { resolveWorkspacePaths, sortTaskDocs, taskFiles } from './workspace.js';

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
  const summary: RunSummary = {
    runId,
    completedTaskIds: [],
    pausedTaskIds: [],
    failedTaskIds: [],
    fallbackTaskIds: [],
  };

  appendEvent(paths.eventsFile, {
    type: 'run_started',
    runId,
    projectId: project.projectId,
  });

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

export async function commandRun(opts: { output: string }): Promise<void> {
  const summary = await runProject(opts.output);
  const lines = [
    '',
    `Run ${summary.runId}`,
    `Completed: ${summary.completedTaskIds.length}`,
    `Paused: ${summary.pausedTaskIds.length}`,
    `Failed: ${summary.failedTaskIds.length}`,
    `Fallbacks: ${summary.fallbackTaskIds.length}`,
    '',
  ];
  process.stdout.write(lines.join('\n'));
}
