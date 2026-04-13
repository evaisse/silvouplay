import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type {
  ProjectDoc,
  ProjectMode,
  ProjectState,
  ProjectStatus,
  TaskDoc,
  TaskRuntimeState,
  TaskStatus,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function createTaskRuntimeState(task: TaskDoc): TaskRuntimeState {
  return {
    status: 'pending',
    attempts: 0,
    maxAttempts: task.maxAttempts,
    primaryAgent: task.primaryAgent,
    activeAgent: task.primaryAgent,
    fallbackAgents: [...task.fallbackAgents],
    lastExitReason: null,
    lastError: null,
    lastRunAt: null,
    startedAt: null,
    completedAt: null,
    timeoutMs: task.timeoutMs,
  };
}

export function createInitialState(
  project: ProjectDoc,
  tasks: TaskDoc[],
  mode: ProjectMode,
): ProjectState {
  return {
    projectId: project.projectId,
    status: 'active',
    currentMode: mode,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastRunId: null,
    budgets: {
      maxCostUsd: null,
      maxTaskDurationMs: 1800000,
    },
    tasks: Object.fromEntries(
      tasks.map((task) => [task.taskId, createTaskRuntimeState(task)]),
    ),
  };
}

export function readState(stateFile: string): ProjectState {
  return JSON.parse(readFileSync(stateFile, 'utf8')) as ProjectState;
}

export function writeState(stateFile: string, state: ProjectState): void {
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function loadOrCreateState(
  stateFile: string,
  project: ProjectDoc,
  tasks: TaskDoc[],
  mode: ProjectMode,
): ProjectState {
  if (!existsSync(stateFile)) {
    const state = createInitialState(project, tasks, mode);
    writeState(stateFile, state);
    return state;
  }
  return readState(stateFile);
}

function depsComplete(task: TaskDoc, state: ProjectState): boolean {
  return task.deps.every((dep) => state.tasks[dep]?.status === 'complete');
}

export function syncRuntimeState(
  project: ProjectDoc,
  tasks: TaskDoc[],
  state: ProjectState,
): ProjectState {
  for (const task of tasks) {
    state.tasks[task.taskId] ??= createTaskRuntimeState(task);
    const runtime = state.tasks[task.taskId];

    if (runtime.status === 'running') {
      runtime.status = depsComplete(task, state) ? 'ready' : 'pending';
    }

    if (runtime.status === 'pending' && depsComplete(task, state)) {
      runtime.status = 'ready';
    }
  }

  state.updatedAt = nowIso();
  state.status = deriveProjectStatus(state, tasks);
  project.status = state.status;
  project.updatedAt = state.updatedAt;
  return state;
}

export function deriveProjectStatus(
  state: ProjectState,
  tasks: TaskDoc[],
): ProjectStatus {
  if (tasks.length > 0 && tasks.every((task) => state.tasks[task.taskId]?.status === 'complete')) {
    return 'complete';
  }
  if (tasks.some((task) => state.tasks[task.taskId]?.status === 'failed')) {
    return 'failed';
  }
  if (tasks.some((task) => state.tasks[task.taskId]?.status === 'paused')) {
    return 'paused';
  }
  return 'active';
}

export function updateTaskRuntimeStatus(
  state: ProjectState,
  taskId: string,
  status: TaskStatus,
): void {
  state.tasks[taskId].status = status;
  state.updatedAt = nowIso();
}
