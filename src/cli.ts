#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

import { SUPPORTED_AGENT_TYPES } from './agents.js';
import { commandIndex, commandQuery } from './markdowndb.js';
import { commandRun } from './orchestrator.js';
import { commandPlan } from './plan.js';
import { commandStatus } from './status.js';
import { runWizard } from './wizard.js';

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();
const supportedAgentsLabel = SUPPORTED_AGENT_TYPES.join(', ');
const defaultAgents = SUPPORTED_AGENT_TYPES.join(',');

program
  .name('svp')
  .description(
    `A parallel agent loop that plugs into any coding agent (${supportedAgentsLabel})`,
  )
  .version('0.1.0');

program
  .command('plan')
  .description('Create, revise, or extend the active project plan')
  .option('-t, --task <description>', 'Inline task description')
  .option('-f, --file <path>', 'Path to a file containing the task description')
  .option(
    '-a, --agents <list>',
    `Comma-separated list of agents to use (${defaultAgents})`,
    'codex',
  )
  .option(
    '-o, --output <dir>',
    'Output directory for plan artefacts',
    '.task-loop',
  )
  .option(
    '--no-interactive',
    'Skip interactive prompts and derive the plan from the raw description',
  )
  .option(
    '-m, --mode <mode>',
    'Planning mode (creation, revise-plan, add-task)',
  )
  .action(commandPlan);

program
  .command('run')
  .description('Run the active project loop')
  .option(
    '-o, --output <dir>',
    'Directory containing the plan artefacts',
    '.task-loop',
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

program
  .command('index')
  .description('Index the active markdown workspace with MarkdownDB')
  .option(
    '-o, --output <dir>',
    'Directory containing the plan artefacts',
    '.task-loop',
  )
  .action(commandIndex);

program
  .command('query')
  .description('Query the indexed markdown workspace')
  .option(
    '-o, --output <dir>',
    'Directory containing the plan artefacts',
    '.task-loop',
  )
  .option('--kind <kind>', 'Document kind filter (project|task)')
  .option('--status <status>', 'Status filter')
  .option('--type <type>', 'Task type filter')
  .option('--agent <agent>', 'Primary agent filter')
  .option('--test-required', 'Filter to documents that require automated tests', false)
  .option('--test-exception', 'Filter to documents with test exceptions', false)
  .option('--json', 'Print JSON output', false)
  .action((opts) => commandQuery({
    output: opts.output,
    kind: opts.kind,
    status: opts.status,
    type: opts.type,
    agent: opts.agent,
    testRequired: opts.testRequired ? true : opts.testException ? false : undefined,
    json: opts.json,
  }));

program.action(async () => {
  try {
    const choice = await runWizard();
    if (choice.action === 'status') {
      commandStatus({ output: '.task-loop' });
      return;
    }
    if (choice.action === 'run') {
      await commandRun({ output: '.task-loop' });
      return;
    }
    await commandPlan({
      agents: defaultAgents,
      output: '.task-loop',
      interactive: true,
      mode: choice.mode,
    });
  } catch (error) {
    console.error(chalk.red(String(error instanceof Error ? error.message : error)));
    process.exit(1);
  }
});

program.parseAsync().catch((error) => {
  console.error(chalk.red(String(error instanceof Error ? error.message : error)));
  process.exit(1);
});
