import { spawn } from 'node:child_process';

import { buildAgentCommand as buildCmd, inferExitReason } from './runtime/index.js';
import type { AgentType, ExitReason, ProjectDoc, RunTaskResult, TaskDoc } from './types.js';

export function buildAgentPrompt(project: ProjectDoc, task: TaskDoc): string {
  return [
    `Project: ${project.title}`,
    `Project goal: ${project.goal}`,
    `Task: ${task.taskId} ${task.title}`,
    `Type: ${task.type}`,
    '',
    'Task goal:',
    task.goal,
    '',
    'Scope:',
    task.scope,
    '',
    'Acceptance criteria:',
    ...task.acceptanceCriteria.map((criterion) => `- ${criterion.text}`),
    '',
    'Validation commands:',
    ...task.validationCommands.map((command) => `- ${command}`),
  ].join('\n');
}

export function buildAgentCommand(
  project: ProjectDoc,
  task: TaskDoc,
  activeAgent: AgentType,
): { command: string; args: string[] } {
  const prompt = buildAgentPrompt(project, task);
  return buildCmd(activeAgent, prompt);
}

export function runTaskAgent(
  project: ProjectDoc,
  task: TaskDoc,
  activeAgent: AgentType,
  cwd: string,
  timeoutMs: number,
): Promise<RunTaskResult> {
  return new Promise((resolve) => {
    const { command, args } = buildAgentCommand(project, task, activeAgent);
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: 'inherit',
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        taskId: task.taskId,
        exitCode: 127,
        success: false,
        exitReason: 'binary_missing',
        activeAgent,
        errorMessage: error.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          taskId: task.taskId,
          exitCode: 124,
          success: false,
          exitReason: 'timeout',
          activeAgent,
          errorMessage: `Task exceeded timeout of ${timeoutMs}ms.`,
        });
        return;
      }

      const exitCode = code ?? 1;
      const exitReason = inferExitReason(exitCode);
      resolve({
        taskId: task.taskId,
        exitCode,
        success: exitReason === 'success',
        exitReason,
        activeAgent,
        errorMessage: exitReason === 'success' ? null : `Agent exited with code ${exitCode}.`,
      });
    });
  });
}
