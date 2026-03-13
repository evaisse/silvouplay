/**
 * Runs coding agents in their assigned worktree (or current directory).
 *
 * Each agent is launched as a child process with the task description piped
 * via stdin or passed as a CLI argument, depending on the agent type.
 */
import { spawn } from 'node:child_process';
import type { SubTask } from './types.js';
import { getAgentCapability } from './agents.js';

export interface RunResult {
  taskId: string;
  exitCode: number;
  success: boolean;
}

/**
 * Build the CLI command and argument list for a given sub-task.
 *
 * The task description is passed as the first positional argument so that the
 * invocation matches common coding-agent conventions:
 *   codex "implement the foo component"
 *   claude "implement the foo component"
 *   gemini "implement the foo component"
 *   opencode "implement the foo component"
 */
export function buildAgentCommand(
  task: SubTask,
): { command: string; args: string[] } {
  const cap = getAgentCapability(task.agent);
  const prompt = `${task.title}\n\n${task.description}`;
  return { command: cap.command, args: [prompt] };
}

/**
 * Launch an agent for a single sub-task and wait for it to exit.
 *
 * @param task       Sub-task to execute.
 * @param cwd        Working directory for the agent process.
 * @param dryRun     When true, print the command instead of running it.
 * @returns          RunResult with exit code and success flag.
 */
export function runAgent(
  task: SubTask,
  cwd: string = process.cwd(),
  dryRun = false,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const { command, args } = buildAgentCommand(task);

    if (dryRun) {
      console.log(`[dry-run] ${command} ${args.map((a) => JSON.stringify(a)).join(' ')} (cwd: ${cwd})`);
      resolve({ taskId: task.id, exitCode: 0, success: true });
      return;
    }

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      resolve({ taskId: task.id, exitCode, success: exitCode === 0 });
    });

    child.on('error', () => {
      // Agent binary not found – treat as dry-run for graceful degradation.
      resolve({ taskId: task.id, exitCode: 127, success: false });
    });
  });
}

/**
 * Run all sub-tasks concurrently.
 *
 * Tasks without a `worktreePath` run in the provided `defaultCwd`.
 */
export async function runAllAgents(
  subTasks: SubTask[],
  defaultCwd: string = process.cwd(),
  dryRun = false,
): Promise<RunResult[]> {
  const promises = subTasks.map((task) =>
    runAgent(task, task.worktreePath ?? defaultCwd, dryRun),
  );
  return Promise.all(promises);
}
