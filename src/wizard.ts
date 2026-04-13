import { select } from '@inquirer/prompts';

import type { ProjectMode } from './types.js';
import { detectWorkspaceState } from './workspace.js';

export interface WizardChoice {
  action: 'plan' | 'run' | 'status';
  mode?: ProjectMode;
}

export async function runWizard(outputDir = '.task-loop'): Promise<WizardChoice> {
  const workspace = detectWorkspaceState(outputDir);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return workspace.hasActiveProject
      ? { action: 'status' }
      : { action: 'plan', mode: 'creation' };
  }

  const value = await select({
    message: workspace.hasActiveProject
      ? `Active project detected: ${workspace.title ?? 'Untitled project'} (${workspace.openTaskCount} open, ${workspace.pausedTaskCount} paused)`
      : 'No active project detected',
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
