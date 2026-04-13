import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { readProject } from './project.js';
import { readState } from './state.js';
import type { TaskDoc, WorkspacePaths, WorkspaceState } from './types.js';

export function resolveWorkspacePaths(outputDir = '.task-loop'): WorkspacePaths {
  const workDir = path.resolve(outputDir);
  return {
    rootDir: process.cwd(),
    workDir,
    projectFile: path.join(workDir, 'project.md'),
    stateFile: path.join(workDir, 'state.json'),
    tasksDir: path.join(workDir, 'tasks'),
    eventsFile: path.join(workDir, 'events.jsonl'),
    runsDir: path.join(workDir, 'runs'),
    markdownDbFile: path.join(workDir, 'markdown.db'),
  };
}

export function ensureWorkspaceDirs(paths: WorkspacePaths): void {
  mkdirSync(paths.workDir, { recursive: true });
  mkdirSync(paths.tasksDir, { recursive: true });
  mkdirSync(paths.runsDir, { recursive: true });
}

export function taskFiles(paths: WorkspacePaths): string[] {
  if (!existsSync(paths.tasksDir)) {
    return [];
  }

  return readdirSync(paths.tasksDir)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => path.join(paths.tasksDir, entry));
}

export function detectWorkspaceState(outputDir = '.task-loop'): WorkspaceState {
  const paths = resolveWorkspacePaths(outputDir);
  if (!existsSync(paths.projectFile) || !existsSync(paths.tasksDir) || !existsSync(paths.stateFile)) {
    return {
      hasActiveProject: false,
      suggestedMode: 'creation',
      paths,
      openTaskCount: 0,
      pausedTaskCount: 0,
    };
  }

  const project = readProject(paths.projectFile);
  const state = readState(paths.stateFile);
  const taskStates = Object.values(state.tasks);

  return {
    hasActiveProject: true,
    suggestedMode: taskStates.some((task) => task.status !== 'complete')
      ? 'completion'
      : 'creation',
    paths,
    title: project.title,
    openTaskCount: taskStates.filter((task) => task.status !== 'complete').length,
    pausedTaskCount: taskStates.filter((task) => task.status === 'paused').length,
  };
}

export function sortTaskDocs(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((left, right) => left.taskId.localeCompare(right.taskId));
}
