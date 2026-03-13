#!/usr/bin/env node
/**
 * agent-task-loop CLI
 *
 * Commands
 *   plan   – Interactively plan a task and generate a PRD + sub-task list
 *   run    – Execute a previously generated plan
 *   status – Show the status of sub-tasks in a plan
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import chalk from 'chalk';

import type { TaskPlan, AgentType } from './types.js';
import {
  runInteractivePlanning,
  buildNonInteractivePlan,
} from './planner.js';
import { splitIntoSubTasks } from './splitter.js';
import { assignAgents } from './assigner.js';
import { generatePRD } from './prd.js';
import {
  isGitRepository,
  getGitRoot,
  createWorktreesForSubTasks,
} from './git.js';
import { runAllAgents } from './runner.js';

const PLAN_FILE = 'plan.json';
const PRD_FILE = 'PRD.md';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePlanDir(outputDir: string): string {
  return path.resolve(outputDir);
}

function savePlan(planDir: string, plan: TaskPlan): void {
  mkdirSync(planDir, { recursive: true });
  writeFileSync(
    path.join(planDir, PLAN_FILE),
    JSON.stringify(plan, null, 2),
    'utf8',
  );
}

function loadPlan(planDir: string): TaskPlan {
  const planPath = path.join(planDir, PLAN_FILE);
  if (!existsSync(planPath)) {
    console.error(chalk.red(`No plan found at ${planPath}. Run 'plan' first.`));
    process.exit(1);
  }
  return JSON.parse(readFileSync(planPath, 'utf8')) as TaskPlan;
}

function parseAgents(raw: string): AgentType[] {
  const valid: AgentType[] = ['codex', 'claude-code', 'gemini', 'opencode'];
  return raw
    .split(',')
    .map((a) => a.trim() as AgentType)
    .filter((a) => valid.includes(a));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandPlan(opts: {
  task?: string;
  file?: string;
  agents: string;
  output: string;
  interactive: boolean;
  worktrees: boolean;
}): Promise<void> {
  // 1. Resolve raw task description.
  let rawDescription = '';
  if (opts.file) {
    const filePath = path.resolve(opts.file);
    if (!existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      process.exit(1);
    }
    rawDescription = readFileSync(filePath, 'utf8');
  } else if (opts.task) {
    rawDescription = opts.task;
  }

  if (!rawDescription.trim() && !opts.interactive) {
    console.error(
      chalk.red('Provide a task via --task or --file when using --no-interactive.'),
    );
    process.exit(1);
  }

  // 2. Run the planning session.
  console.log(chalk.bold.cyan('\n🤖  agent-task-loop – Task Planner\n'));

  const plannerResult = !opts.interactive
    ? buildNonInteractivePlan(rawDescription)
    : await runInteractivePlanning(rawDescription);

  const agents = parseAgents(opts.agents).length
    ? parseAgents(opts.agents)
    : plannerResult.suggestedAgents;

  // 3. Split into sub-tasks and assign agents.
  const rawSubTasks = splitIntoSubTasks(plannerResult.description, agents);
  const subTasks = assignAgents(rawSubTasks, agents);

  // 4. Optionally create git worktrees.
  let finalSubTasks = subTasks;
  if (opts.worktrees) {
    if (!isGitRepository()) {
      console.warn(
        chalk.yellow(
          '⚠  Not inside a git repository – skipping worktree creation.',
        ),
      );
    } else {
      const gitRoot = getGitRoot();
      console.log(chalk.dim(`Creating worktrees in ${gitRoot}/.worktrees/…`));
      try {
        finalSubTasks = createWorktreesForSubTasks(subTasks, gitRoot);
      } catch (err) {
        console.warn(chalk.yellow(`⚠  Worktree creation failed: ${String(err)}`));
        finalSubTasks = subTasks;
      }
    }
  }

  // 5. Build and persist the plan.
  const planDir = resolvePlanDir(opts.output);
  const plan: TaskPlan = {
    id: randomUUID(),
    title: plannerResult.title,
    description: plannerResult.description,
    createdAt: new Date().toISOString(),
    designDecisions: plannerResult.designDecisions,
    subTasks: finalSubTasks,
    completionCriteria: plannerResult.completionCriteria,
  };

  // 6. Generate and write PRD.
  const prd = generatePRD(plan);
  mkdirSync(planDir, { recursive: true });
  const prdPath = path.join(planDir, PRD_FILE);
  writeFileSync(prdPath, prd, 'utf8');
  plan.prdPath = prdPath;

  savePlan(planDir, plan);

  // 7. Print summary.
  console.log('');
  console.log(chalk.bold.green('✅  Plan created successfully!'));
  console.log('');
  console.log(`   ${chalk.bold('Title:')}    ${plan.title}`);
  console.log(`   ${chalk.bold('Sub-tasks:')} ${finalSubTasks.length}`);
  console.log(`   ${chalk.bold('PRD:')}       ${prdPath}`);
  console.log(`   ${chalk.bold('Plan:')}      ${path.join(planDir, PLAN_FILE)}`);
  console.log('');
  console.log(chalk.bold('Sub-task summary:'));
  for (const task of finalSubTasks) {
    const worktreeInfo = task.worktreePath
      ? chalk.dim(` → ${task.worktreePath}`)
      : '';
    console.log(
      `  ${chalk.cyan(task.id)}  ${task.title}  ${chalk.dim(`[${task.agent}]`)}${worktreeInfo}`,
    );
  }
  console.log('');
  console.log(
    `Run ${chalk.bold('agent-task-loop run')} to launch agents on these tasks.`,
  );
}

async function commandRun(opts: {
  output: string;
  dryRun: boolean;
}): Promise<void> {
  const planDir = resolvePlanDir(opts.output);
  const plan = loadPlan(planDir);

  console.log(chalk.bold.cyan(`\n🚀  Running plan: ${plan.title}\n`));

  const results = await runAllAgents(
    plan.subTasks,
    process.cwd(),
    opts.dryRun,
  );

  // Update plan statuses.
  for (const result of results) {
    const task = plan.subTasks.find((t) => t.id === result.taskId);
    if (task) {
      task.status = result.success ? 'complete' : 'failed';
    }
  }
  savePlan(planDir, plan);

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('');
  console.log(chalk.bold(`Results: ${chalk.green(succeeded + ' succeeded')}  ${failed > 0 ? chalk.red(failed + ' failed') : chalk.dim('0 failed')}`));
}

function commandStatus(opts: { output: string }): void {
  const planDir = resolvePlanDir(opts.output);
  const plan = loadPlan(planDir);

  console.log(chalk.bold.cyan(`\n📋  Plan status: ${plan.title}\n`));
  console.log(`   Created: ${plan.createdAt}`);
  console.log('');

  const statusColors: Record<string, (s: string) => string> = {
    pending: chalk.dim,
    'in-progress': chalk.yellow,
    complete: chalk.green,
    failed: chalk.red,
  };

  for (const task of plan.subTasks) {
    const colour = statusColors[task.status] ?? chalk.white;
    console.log(
      `  ${chalk.cyan(task.id)}  ${task.title.padEnd(40)}  ${colour(task.status.padEnd(12))}  [${task.agent}]`,
    );
  }
  console.log('');
  console.log(chalk.bold('Completion Criteria:'));
  for (const criterion of plan.completionCriteria) {
    const done = plan.subTasks.every((t) => t.status === 'complete');
    const tick = done ? chalk.green('✓') : chalk.dim('○');
    console.log(`  ${tick}  ${criterion}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('agent-task-loop')
  .description(
    'A parallel agent loop that plugs into any coding agent (codex, claude-code, gemini, opencode)',
  )
  .version('0.1.0');

program
  .command('plan')
  .description('Interactively plan a task and generate a PRD with sub-tasks')
  .option('-t, --task <description>', 'Inline task description')
  .option('-f, --file <path>', 'Path to a file containing the task description')
  .option(
    '-a, --agents <list>',
    'Comma-separated list of agents to use (codex,claude-code,gemini,opencode)',
    'codex',
  )
  .option(
    '-o, --output <dir>',
    'Output directory for plan artefacts',
    '.task-loop',
  )
  .option(
    '--no-interactive',
    'Skip interactive design questions (use raw description as-is)',
  )
  .option('--worktrees', 'Create git worktrees for each sub-task', false)
  .action(commandPlan);

program
  .command('run')
  .description('Launch agents to execute a previously generated plan')
  .option(
    '-o, --output <dir>',
    'Directory containing the plan artefacts',
    '.task-loop',
  )
  .option(
    '--dry-run',
    'Print agent commands without executing them',
    false,
  )
  .action(commandRun);

program
  .command('status')
  .description('Show the execution status of sub-tasks in a plan')
  .option(
    '-o, --output <dir>',
    'Directory containing the plan artefacts',
    '.task-loop',
  )
  .action(commandStatus);

program.parse();
