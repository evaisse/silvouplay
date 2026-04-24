import { checkbox, number, select } from '@inquirer/prompts';

import { discoverAgents } from './agents.js';
import type { DiscoverySnapshot } from './runtime/dsl.js';
import { summarizeDiscoverySnapshot } from './runtime/selection.js';
import type { ProjectMode } from './types.js';
import type { WorkspaceState } from './types.js';
import {
  detectWorkspaceState,
  discoverRunnableWorkspaces,
  type RunnableWorkspace,
} from './workspace.js';

export interface WizardChoice {
  action: 'plan' | 'run' | 'status';
  mode?: ProjectMode;
  outputs?: string[];
  maxParallel?: number;
}

interface WizardOption {
  name: string;
  value: 'run' | 'run-one-prd' | 'run-multi-prd' | 'status' | ProjectMode;
}

function formatAgentList(agents: string[]): string {
  return agents.length > 0 ? agents.join(', ') : 'none';
}

function describeRunnableWorkspace(workspace: RunnableWorkspace): string {
  return `${workspace.title} (${workspace.outputDir}, ${workspace.openTaskCount} open${workspace.pausedTaskCount > 0 ? `, ${workspace.pausedTaskCount} paused` : ''})`;
}

export function buildWizardMessage(
  workspace: WorkspaceState,
  snapshot: DiscoverySnapshot,
): string {
  const summary = summarizeDiscoverySnapshot(snapshot);
  const lines = [
    workspace.hasActiveProject
      ? `Active project detected: ${workspace.title ?? 'Untitled project'} (${workspace.openTaskCount} open, ${workspace.pausedTaskCount} paused)`
      : 'No active project detected',
    `Available orchestrators: ${formatAgentList(summary.availableOrchestrators)}`,
    `Available workers: ${formatAgentList(summary.availableWorkers)}`,
    `Unavailable agents: ${summary.unavailableAgents.length > 0
      ? summary.unavailableAgents.map(({ type, reason }) => `${type} (${reason})`).join('; ')
      : 'none'}`,
  ];

  return lines.join('\n');
}

export function buildWizardChoices(
  workspace: WorkspaceState,
  runnableWorkspaces: RunnableWorkspace[],
): WizardOption[] {
  if (runnableWorkspaces.length > 1) {
    return workspace.hasActiveProject
      ? [
          { name: 'Run one PRD', value: 'run-one-prd' },
          { name: 'Run multiple PRDs in parallel', value: 'run-multi-prd' },
          { name: 'Revise plan', value: 'revise-plan' },
          { name: 'Add task', value: 'add-task' },
          { name: 'Show status', value: 'status' },
        ]
      : [
          { name: 'Run one PRD', value: 'run-one-prd' },
          { name: 'Run multiple PRDs in parallel', value: 'run-multi-prd' },
          { name: 'Create project', value: 'creation' },
        ];
  }

  return workspace.hasActiveProject
    ? [
        { name: 'Continue project', value: 'run' },
        { name: 'Revise plan', value: 'revise-plan' },
        { name: 'Add task', value: 'add-task' },
        { name: 'Show status', value: 'status' },
      ]
    : [
        { name: 'Create project', value: 'creation' },
      ];
}

export async function runWizard(
  outputDir = '.task-loop',
  snapshot = discoverAgents(),
): Promise<WizardChoice> {
  const workspace = detectWorkspaceState(outputDir);
  const runnableWorkspaces = discoverRunnableWorkspaces();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return workspace.hasActiveProject
      ? { action: 'status' }
      : { action: 'plan', mode: 'creation' };
  }

  const value = await select({
    message: buildWizardMessage(workspace, snapshot),
    choices: buildWizardChoices(workspace, runnableWorkspaces),
    default: runnableWorkspaces.length > 1
      ? 'run-one-prd'
      : workspace.suggestedMode === 'completion'
        ? 'run'
        : 'creation',
  });

  if (value === 'status') {
    return { action: 'status' };
  }
  if (value === 'run') {
    return { action: 'run', outputs: [outputDir], maxParallel: 1 };
  }
  if (value === 'run-one-prd') {
    const selectedOutput = await select({
      message: 'Select the PRD to run',
      choices: runnableWorkspaces.map((runnableWorkspace) => ({
        name: describeRunnableWorkspace(runnableWorkspace),
        value: runnableWorkspace.outputDir,
      })),
      default: outputDir,
    });
    return { action: 'run', outputs: [selectedOutput], maxParallel: 1 };
  }
  if (value === 'run-multi-prd') {
    const selectedOutputs = await checkbox({
      message: 'Select PRDs to run in parallel',
      choices: runnableWorkspaces.map((runnableWorkspace) => ({
        name: describeRunnableWorkspace(runnableWorkspace),
        value: runnableWorkspace.outputDir,
        checked: runnableWorkspace.outputDir === outputDir,
      })),
      required: true,
    });
    const maxParallel = await number({
      message: 'Max parallel PRD runs',
      default: 2,
      min: 1,
      max: selectedOutputs.length,
      required: true,
    });
    return { action: 'run', outputs: selectedOutputs, maxParallel };
  }
  return { action: 'plan', mode: value as ProjectMode };
}
