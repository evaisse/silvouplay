import chalk from 'chalk';

import { readProject } from './project.js';
import { readState, syncRuntimeState } from './state.js';
import { readTask } from './task-files.js';
import { detectWorkspaceState, resolveWorkspacePaths, taskFiles } from './workspace.js';

export function getStatusReport(outputDir = '.task-loop'): string {
  const workspace = detectWorkspaceState(outputDir);
  if (!workspace.hasActiveProject) {
    return `${chalk.yellow('No active project found.')} Run ${chalk.bold('svp')} or ${chalk.bold('svp plan')} to create one.\n`;
  }

  const paths = resolveWorkspacePaths(outputDir);
  const project = readProject(paths.projectFile);
  const tasks = taskFiles(paths).map((file) => readTask(file));
  const state = syncRuntimeState(project, tasks, readState(paths.stateFile));

  const lines: string[] = [];
  lines.push(chalk.bold.cyan(`\nProject status: ${project.title}\n`));
  lines.push(`Status: ${project.status}`);
  lines.push(`Mode: ${state.currentMode}`);
  lines.push(`Open tasks: ${tasks.filter((task) => state.tasks[task.taskId]?.status !== 'complete').length}`);
  lines.push('');

  for (const task of tasks) {
    const runtime = state.tasks[task.taskId];
    const marker = runtime.status === 'complete' ? chalk.green('x') : ' ';
    const notes = [
      runtime.status,
      runtime.activeAgent,
      !task.testRequired ? 'test-exception' : null,
    ].filter(Boolean).join(', ');
    lines.push(`- [${marker}] ${task.taskId}: ${task.title} (${notes})`);
  }

  const paused = tasks.filter((task) => state.tasks[task.taskId]?.status === 'paused');
  if (paused.length > 0) {
    lines.push('', 'Paused tasks:');
    for (const task of paused) {
      const runtime = state.tasks[task.taskId];
      lines.push(`- ${task.taskId}: ${runtime.lastExitReason ?? 'paused'} (${runtime.activeAgent})`);
    }
  }

  const nextTask = tasks.find((task) => state.tasks[task.taskId]?.status === 'ready');
  if (nextTask) {
    lines.push('', `Next ready task: ${nextTask.taskId} ${nextTask.title}`);
  }

  return `${lines.join('\n')}\n`;
}

export function commandStatus(opts: { output: string }): void {
  process.stdout.write(getStatusReport(opts.output));
}
