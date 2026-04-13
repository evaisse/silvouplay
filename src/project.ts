import { readFileSync, writeFileSync } from 'node:fs';

import { parseFrontmatter, renderFrontmatter } from './frontmatter.js';
import type {
  AgentType,
  ChecklistItem,
  ProjectDoc,
  ProjectStatus,
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

function parseTaskIndex(lines: string[]): ProjectDoc['tasks'] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^- \[([ xX])]\s+(T-\d+):\s+(.+)$/);
      if (!match) {
        throw new Error(`Invalid task index line: ${line}`);
      }
      return {
        checked: match[1].toLowerCase() === 'x',
        id: match[2],
        title: match[3],
      };
    });
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

function requireStringArray(
  value: unknown,
  key: string,
): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Project frontmatter field ${key} must be an array of strings.`);
  }
  return value as string[];
}

export function renderProject(doc: ProjectDoc): string {
  const lines: string[] = [];
  lines.push(
    renderFrontmatter({
      svp_version: doc.svpVersion,
      doc_kind: 'project',
      project_id: doc.projectId,
      title: doc.title,
      status: doc.status,
      mode: doc.mode,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt,
      primary_agents: doc.primaryAgents,
      fallback_agents: doc.fallbackAgents,
      test_strategy: doc.testStrategy,
      task_dir: doc.taskDir,
      quality_gates: doc.qualityGates,
    }),
  );
  lines.push(`# Project: ${doc.title}`, '');
  lines.push('## Context', doc.context, '');
  lines.push('## Goal', doc.goal, '');
  lines.push('## Constraints');
  for (const constraint of doc.constraints) {
    lines.push(`- ${constraint}`);
  }
  lines.push('', '## Testing Policy');
  for (const rule of doc.testingPolicy) {
    lines.push(`- ${rule}`);
  }
  lines.push('', '## Test Charter', '### Behaviors To Prove');
  for (const behavior of doc.testCharter.behaviorsToProve) {
    lines.push(`- ${behavior}`);
  }
  lines.push('', '### Failure Cases To Cover');
  for (const failureCase of doc.testCharter.failureCasesToCover) {
    lines.push(`- ${failureCase}`);
  }
  lines.push('', '### Regression Risks');
  for (const risk of doc.testCharter.regressionRisks) {
    lines.push(`- ${risk}`);
  }
  lines.push('', '## Quality Gates');
  for (const gate of doc.qualityGates) {
    lines.push(`- \`${gate}\``);
  }
  lines.push('', '## Task Index');
  for (const task of doc.tasks) {
    lines.push(`- [${task.checked ? 'x' : ' '}] ${task.id}: ${task.title}`);
  }
  lines.push('', '## Completion Criteria');
  for (const criterion of doc.completionCriteria) {
    lines.push(`- [${criterion.checked ? 'x' : ' '}] ${criterion.text}`);
  }
  lines.push('', '## Progress Log');
  for (const entry of doc.progressLog) {
    lines.push(`- ${entry}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function parseProject(content: string): ProjectDoc {
  const { data, body } = parseFrontmatter(content);
  const sections = parseSections(body);

  return {
    svpVersion: Number(data.svp_version ?? 1),
    projectId: String(data.project_id ?? ''),
    title: String(data.title ?? ''),
    status: String(data.status ?? 'active') as ProjectStatus,
    mode: String(data.mode ?? 'creation') as ProjectDoc['mode'],
    createdAt: String(data.created_at ?? ''),
    updatedAt: String(data.updated_at ?? ''),
    primaryAgents: requireStringArray(data.primary_agents, 'primary_agents') as AgentType[],
    fallbackAgents: requireStringArray(data.fallback_agents, 'fallback_agents') as AgentType[],
    testStrategy: 'tdd-first',
    taskDir: String(data.task_dir ?? '.task-loop/tasks'),
    qualityGates: requireStringArray(data.quality_gates, 'quality_gates'),
    context: trimParagraph(sections.get('Context')),
    goal: trimParagraph(sections.get('Goal')),
    constraints: parseBullets(sections.get('Constraints') ?? []),
    testingPolicy: parseBullets(sections.get('Testing Policy') ?? []),
    testCharter: {
      behaviorsToProve: parseBullets(subsectionLines(sections.get('Test Charter') ?? [], 'Behaviors To Prove')),
      failureCasesToCover: parseBullets(subsectionLines(sections.get('Test Charter') ?? [], 'Failure Cases To Cover')),
      regressionRisks: parseBullets(subsectionLines(sections.get('Test Charter') ?? [], 'Regression Risks')),
    },
    tasks: parseTaskIndex(sections.get('Task Index') ?? []),
    completionCriteria: parseChecklist(sections.get('Completion Criteria') ?? []),
    progressLog: parseBullets(sections.get('Progress Log') ?? []),
  };
}

export function readProject(projectFile: string): ProjectDoc {
  return parseProject(readFileSync(projectFile, 'utf8'));
}

export function writeProject(projectFile: string, doc: ProjectDoc): void {
  writeFileSync(projectFile, renderProject(doc), 'utf8');
}
