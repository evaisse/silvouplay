import { readFileSync, writeFileSync } from 'node:fs';

import { parseFrontmatter, renderFrontmatter } from './frontmatter.js';
import type {
  AgentType,
  ChecklistItem,
  TaskDoc,
  TaskStatus,
  TaskType,
} from './types.js';

function parseChecklist(lines: string[]): ChecklistItem[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^- \[([ xX])]\s+(.+)$/);
      if (!match) {
        throw new Error(`Invalid checklist line: ${line}`);
      }
      return { checked: match[1].toLowerCase() === 'x', text: match[2] };
    });
}

function parseBullets(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s+/, '').replace(/^`|`$/g, ''));
}

function parseSections(body: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = '';
  sections.set(current, []);

  for (const line of body.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1];
      sections.set(current, []);
      continue;
    }
    sections.get(current)?.push(line);
  }

  return sections;
}

function subsectionLines(lines: string[], name: string): string[] {
  const result: string[] = [];
  let capture = false;

  for (const line of lines) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      capture = heading[1] === name;
      continue;
    }
    if (capture) {
      result.push(line);
    }
  }

  return result;
}

function trimParagraph(lines: string[] | undefined): string {
  return (lines ?? []).join('\n').trim();
}

function requireStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Task frontmatter field ${key} must be an array of strings.`);
  }
  return value as string[];
}

export function validateTaskDoc(task: TaskDoc): void {
  if (task.testRequired) {
    if (task.validationCommands.length === 0) {
      throw new Error(`${task.taskId} requires validation commands.`);
    }
    return;
  }

  if (!task.testExceptionAllowed) {
    throw new Error(`${task.taskId} disables tests without allowing an exception.`);
  }
  if (!task.testExceptionJustification?.trim()) {
    throw new Error(`${task.taskId} is missing a test exception justification.`);
  }
  if (task.riskReductionStrategy.length === 0) {
    throw new Error(`${task.taskId} is missing a risk reduction strategy.`);
  }
  if (task.validationPlan.length === 0) {
    throw new Error(`${task.taskId} is missing a validation plan.`);
  }
}

export function renderTask(task: TaskDoc): string {
  validateTaskDoc(task);

  const lines: string[] = [];
  lines.push(
    renderFrontmatter({
      svp_version: task.svpVersion,
      doc_kind: 'task',
      project_id: task.projectId,
      task_id: task.taskId,
      title: task.title,
      type: task.type,
      status: task.status,
      deps: task.deps,
      primary_agent: task.primaryAgent,
      fallback_agents: task.fallbackAgents,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      test_required: task.testRequired,
      test_exception_allowed: task.testExceptionAllowed,
      timeout_ms: task.timeoutMs,
      max_attempts: task.maxAttempts,
    }),
  );
  lines.push(`# Task: ${task.title}`, '');
  lines.push('## Goal', task.goal, '', '## Scope', task.scope, '', '## Acceptance Criteria');
  for (const criterion of task.acceptanceCriteria) {
    lines.push(`- [${criterion.checked ? 'x' : ' '}] ${criterion.text}`);
  }
  lines.push('', '## Test Plan', '### Target Files');
  for (const file of task.testPlanTargetFiles) {
    lines.push(`- ${file}`);
  }
  lines.push('', '### Expected Failing Cases');
  for (const failureCase of task.expectedFailingCases) {
    lines.push(`- ${failureCase}`);
  }
  lines.push('', '### Validation Commands');
  for (const command of task.validationCommands) {
    lines.push(`- \`${command}\``);
  }
  if (task.requiredPassingCommands.length > 0) {
    lines.push('', '### Required Passing Commands');
    for (const command of task.requiredPassingCommands) {
      lines.push(`- \`${command}\``);
    }
  }
  lines.push('', '## Implementation Notes');
  for (const note of task.implementationNotes) {
    lines.push(`- ${note}`);
  }
  if (!task.testRequired) {
    lines.push('', '## Test Exception Justification', task.testExceptionJustification ?? '');
    lines.push('', '## Risk Reduction Strategy');
    for (const riskControl of task.riskReductionStrategy) {
      lines.push(`- ${riskControl}`);
    }
    lines.push('', '## Validation Plan');
    for (const step of task.validationPlan) {
      lines.push(`- ${step}`);
    }
  }
  lines.push('', '## Progress Log');
  for (const entry of task.progressLog) {
    lines.push(`- ${entry}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function parseTask(content: string): TaskDoc {
  const { data, body } = parseFrontmatter(content);
  const sections = parseSections(body);
  const testPlanLines = sections.get('Test Plan') ?? [];

  const task: TaskDoc = {
    svpVersion: Number(data.svp_version ?? 1),
    projectId: String(data.project_id ?? ''),
    taskId: String(data.task_id ?? ''),
    title: String(data.title ?? ''),
    type: String(data.type ?? 'tests') as TaskType,
    status: String(data.status ?? 'pending') as TaskStatus,
    deps: requireStringArray(data.deps, 'deps'),
    primaryAgent: String(data.primary_agent ?? 'codex') as AgentType,
    fallbackAgents: requireStringArray(data.fallback_agents, 'fallback_agents') as AgentType[],
    createdAt: String(data.created_at ?? ''),
    updatedAt: String(data.updated_at ?? ''),
    testRequired: Boolean(data.test_required),
    testExceptionAllowed: Boolean(data.test_exception_allowed),
    timeoutMs: Number(data.timeout_ms ?? 1800000),
    maxAttempts: Number(data.max_attempts ?? 3),
    goal: trimParagraph(sections.get('Goal')),
    scope: trimParagraph(sections.get('Scope')),
    acceptanceCriteria: parseChecklist(sections.get('Acceptance Criteria') ?? []),
    testPlanTargetFiles: parseBullets(subsectionLines(testPlanLines, 'Target Files')),
    expectedFailingCases: parseBullets(subsectionLines(testPlanLines, 'Expected Failing Cases')),
    validationCommands: parseBullets(subsectionLines(testPlanLines, 'Validation Commands')),
    requiredPassingCommands: parseBullets(subsectionLines(testPlanLines, 'Required Passing Commands')),
    implementationNotes: parseBullets(sections.get('Implementation Notes') ?? []),
    testExceptionJustification: trimParagraph(sections.get('Test Exception Justification')) || undefined,
    riskReductionStrategy: parseBullets(sections.get('Risk Reduction Strategy') ?? []),
    validationPlan: parseBullets(sections.get('Validation Plan') ?? []),
    progressLog: parseBullets(sections.get('Progress Log') ?? []),
  };

  validateTaskDoc(task);
  return task;
}

export function readTask(taskFile: string): TaskDoc {
  return parseTask(readFileSync(taskFile, 'utf8'));
}

export function writeTask(taskFile: string, task: TaskDoc): void {
  writeFileSync(taskFile, renderTask(task), 'utf8');
}
