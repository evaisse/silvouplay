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
import { DEFAULT_EXECUTION_DEFAULTS } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function buildStateBudgets(project?: ProjectDoc): ProjectState['budgets'] {
  const executionDefaults = project?.executionDefaults ?? DEFAULT_EXECUTION_DEFAULTS;
  return {
    maxTokens: executionDefaults.maxTokens,
    maxTaskDurationMs: executionDefaults.timeoutMs,
  };
}

function normalizeState(raw: Partial<ProjectState> & {
  budgets?: {
    maxTokens?: number | null;
    maxTaskDurationMs?: number;
    maxCostUsd?: number | null;
  };
}, project?: ProjectDoc): ProjectState {
  return {
    projectId: raw.projectId ?? project?.projectId ?? '',
    status: raw.status ?? 'active',
    currentMode: raw.currentMode ?? project?.mode ?? 'creation',
    createdAt: raw.createdAt ?? nowIso(),
    updatedAt: raw.updatedAt ?? nowIso(),
    lastRunId: raw.lastRunId ?? null,
    orchestratorAgent: raw.orchestratorAgent ?? project?.orchestratorAgent ?? null,
    budgets: {
      maxTokens: raw.budgets?.maxTokens ?? buildStateBudgets(project).maxTokens,
      maxTaskDurationMs: raw.budgets?.maxTaskDurationMs ?? buildStateBudgets(project).maxTaskDurationMs,
    },
    tasks: raw.tasks ?? {},
  };
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
  orchestratorAgent: TaskDoc['primaryAgent'] | null = null,
): ProjectState {
  return {
    projectId: project.projectId,
    status: 'active',
    currentMode: mode,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastRunId: null,
    orchestratorAgent,
    budgets: buildStateBudgets(project),
    tasks: Object.fromEntries(
      tasks.map((task) => [task.taskId, createTaskRuntimeState(task)]),
    ),
  };
}

export function readState(stateFile: string, project?: ProjectDoc): ProjectState {
  return normalizeState(JSON.parse(readFileSync(stateFile, 'utf8')) as ProjectState, project);
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
  return readState(stateFile, project);
}

function depsComplete(task: TaskDoc, state: ProjectState): boolean {
  return task.deps.every((dep) => state.tasks[dep]?.status === 'complete');
}

export function syncRuntimeState(
  project: ProjectDoc,
  tasks: TaskDoc[],
  state: ProjectState,
): ProjectState {
  state.orchestratorAgent ??= project.orchestratorAgent ?? null;
  state.budgets.maxTokens ??= project.executionDefaults.maxTokens;
  state.budgets.maxTaskDurationMs ??= project.executionDefaults.timeoutMs;

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
