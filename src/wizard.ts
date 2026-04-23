import { select } from '@inquirer/prompts';

import { discoverAgents } from './agents.js';
import type { DiscoverySnapshot } from './runtime/dsl.js';
import { summarizeDiscoverySnapshot } from './runtime/selection.js';
import type { ProjectMode } from './types.js';
import type { WorkspaceState } from './types.js';
import { detectWorkspaceState } from './workspace.js';

export interface WizardChoice {
  action: 'plan' | 'run' | 'status';
  mode?: ProjectMode;
}

function formatAgentList(agents: string[]): string {
  return agents.length > 0 ? agents.join(', ') : 'none';
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

export async function runWizard(
  outputDir = '.task-loop',
  snapshot = discoverAgents(),
): Promise<WizardChoice> {
  const workspace = detectWorkspaceState(outputDir);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return workspace.hasActiveProject
      ? { action: 'status' }
      : { action: 'plan', mode: 'creation' };
  }

  const value = await select({
    message: buildWizardMessage(workspace, snapshot),
    choices: workspace.hasActiveProject
      ? [
          { name: 'Continue project', value: 'run' },
          { name: 'Revise plan', value: 'revise-plan' },
          { name: 'Add task', value: 'add-task' },
          { name: 'Show status', value: 'status' },
        ]
      : [
          { name: 'Create project', value: 'creation' },
        ],
    default: workspace.suggestedMode === 'completion' ? 'run' : 'creation',
  });

  if (value === 'status') {
    return { action: 'status' };
  }
  if (value === 'run') {
    return { action: 'run' };
  }
  return { action: 'plan', mode: value as ProjectMode };
}
