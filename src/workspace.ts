import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { readProject } from './project.js';
import { readState } from './state.js';
import type { TaskDoc, WorkspacePaths, WorkspaceState } from './types.js';

const IGNORED_DISCOVERY_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
]);

export interface RunnableWorkspace {
  title: string;
  outputDir: string;
  absoluteOutputDir: string;
  openTaskCount: number;
  pausedTaskCount: number;
}

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

function normalizeOutputDir(rootDir: string, outputDir: string): string {
  const relative = path.relative(rootDir, path.resolve(rootDir, outputDir));
  return relative || '.';
}

export function readRunnableWorkspace(
  outputDir: string,
  rootDir = process.cwd(),
): RunnableWorkspace {
  const normalizedOutputDir = normalizeOutputDir(rootDir, outputDir);
  const absoluteOutputDir = path.resolve(rootDir, normalizedOutputDir);
  const projectFile = path.join(absoluteOutputDir, 'project.md');
  const stateFile = path.join(absoluteOutputDir, 'state.json');
  const tasksDir = path.join(absoluteOutputDir, 'tasks');

  if (!existsSync(projectFile) || !existsSync(stateFile) || !existsSync(tasksDir)) {
    throw new Error(`No runnable PRD found at ${normalizedOutputDir}`);
  }

  const project = readProject(projectFile);
  const state = readState(stateFile, project);
  const taskStates = Object.values(state.tasks);

  return {
    title: project.title,
    outputDir: normalizedOutputDir,
    absoluteOutputDir,
    openTaskCount: taskStates.filter((task) => task.status !== 'complete').length,
    pausedTaskCount: taskStates.filter((task) => task.status === 'paused').length,
  };
}

export function discoverRunnableWorkspaces(rootDir = process.cwd()): RunnableWorkspace[] {
  const matches: RunnableWorkspace[] = [];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    const fileNames = new Set(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name),
    );
    const hasTasksDir = entries.some((entry) => entry.isDirectory() && entry.name === 'tasks');

    if (fileNames.has('project.md') && fileNames.has('state.json') && hasTasksDir) {
      const outputDir = normalizeOutputDir(rootDir, currentDir);
      try {
        matches.push(readRunnableWorkspace(outputDir, rootDir));
      } catch {
        // Ignore malformed workspaces during recursive discovery.
      }
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      if (IGNORED_DISCOVERY_DIRS.has(entry.name)) {
        continue;
      }
      walk(path.join(currentDir, entry.name));
    }
  }

  walk(rootDir);

  return matches.sort((left, right) => left.outputDir.localeCompare(right.outputDir));
}

export function sortTaskDocs(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((left, right) => left.taskId.localeCompare(right.taskId));
}
