import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkbox, input, select } from '@inquirer/prompts';

import { parseAgents } from './agents.js';
import { indexWorkspaceMarkdown } from './markdowndb.js';
import { readProject, writeProject } from './project.js';
import { createInitialState, readState, writeState } from './state.js';
import { writeTask, readTask } from './task-files.js';
import { applyTaskStatuses, buildDefaultTddTasks } from './tdd.js';
import type { AgentType, PlanCommandOptions, ProjectDoc, ProjectMode, TaskDoc } from './types.js';
import { detectWorkspaceState, ensureWorkspaceDirs, resolveWorkspacePaths, sortTaskDocs, taskFiles } from './workspace.js';

function nowIso(): string {
  return new Date().toISOString();
}

function timestampLabel(message: string): string {
  return `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${message}`;
}

function extractTitle(raw: string): string {
  const firstLine = raw
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return firstLine || 'Untitled task';
}

async function resolveRawTask(opts: PlanCommandOptions): Promise<string> {
  if (opts.file) {
    const filePath = path.resolve(opts.file);
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return readFileSync(filePath, 'utf8').trim();
  }

  if (opts.task?.trim()) {
    return opts.task.trim();
  }

  if (!opts.interactive) {
    throw new Error('Provide a task via --task or --file when using --no-interactive.');
  }

  return (await input({
    message: 'What project or change should this loop cover?',
  })).trim();
}

async function gatherInteractiveFields(rawDescription: string, defaultAgents: AgentType[]): Promise<{
  title: string;
  context: string;
  goal: string;
  constraints: string[];
  behaviors: string[];
  failureCases: string[];
  regressionRisks: string[];
  qualityGates: string[];
  agents: AgentType[];
}> {
  const title = (await input({
    message: 'Project title',
    default: extractTitle(rawDescription),
  })).trim();

  const context = (await input({
    message: 'Context',
    default: rawDescription,
  })).trim();

  const goal = (await input({
    message: 'Goal',
    default: title,
  })).trim();

  const constraints = (await input({
    message: 'Constraints (comma-separated)',
    default: 'Respect existing conventions, keep changes minimal, stay within local validation flow',
  }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const behaviors = (await input({
    message: 'Behaviors to prove (comma-separated)',
    default: `Deliver ${title}, preserve existing behavior`,
  }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const failureCases = (await input({
    message: 'Failure cases to cover (comma-separated)',
    default: 'Invalid input, missing implementation, regression in existing flows',
  }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const regressionRisks = (await input({
    message: 'Regression risks (comma-separated)',
    default: 'Existing behavior changes unintentionally, tests become flaky',
  }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const qualityGates = (await input({
    message: 'Local quality gates (comma-separated commands)',
    default: 'npm test,npm run typecheck,npm run build',
  }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const chosenAgents = await checkbox({
    message: 'Agents to use',
    choices: ['codex', 'claude-code', 'gemini', 'opencode'].map((agent) => ({
      name: agent,
      value: agent,
      checked: defaultAgents.includes(agent as AgentType),
    })),
  });

  return {
    title,
    context,
    goal,
    constraints,
    behaviors,
    failureCases,
    regressionRisks,
    qualityGates,
    agents: (chosenAgents as AgentType[]).length > 0 ? (chosenAgents as AgentType[]) : defaultAgents,
  };
}

function buildProjectDoc(args: {
  projectId: string;
  title: string;
  context: string;
  goal: string;
  constraints: string[];
  behaviors: string[];
  failureCases: string[];
  regressionRisks: string[];
  qualityGates: string[];
  primaryAgents: AgentType[];
  mode: ProjectMode;
}): ProjectDoc {
  const now = nowIso();
  return {
    svpVersion: 1,
    projectId: args.projectId,
    title: args.title,
    status: 'active',
    mode: args.mode,
    createdAt: now,
    updatedAt: now,
    primaryAgents: args.primaryAgents,
    fallbackAgents: args.primaryAgents.slice(1),
    testStrategy: 'tdd-first',
    taskDir: '.task-loop/tasks',
    qualityGates: args.qualityGates,
    context: args.context,
    goal: args.goal,
    constraints: args.constraints,
    testingPolicy: [
      'TDD first by default.',
      'Implementation starts only after test scenarios are defined.',
      'Test exceptions must be justified explicitly in the task file.',
      'Local validation is mandatory even without remote CI.',
    ],
    testCharter: {
      behaviorsToProve: args.behaviors,
      failureCasesToCover: args.failureCases,
      regressionRisks: args.regressionRisks,
    },
    tasks: [],
    completionCriteria: [
      { checked: false, text: 'Relevant behavior is specified clearly.' },
      { checked: false, text: 'Tests or justified safeguards exist.' },
      { checked: false, text: 'Quality gates pass.' },
      { checked: false, text: 'Task files reflect the final state.' },
    ],
    progressLog: [timestampLabel('Project created.')],
  };
}

function appendProjectProgress(project: ProjectDoc, message: string): void {
  project.updatedAt = nowIso();
  project.progressLog.push(timestampLabel(message));
}

function writeTasks(paths: ReturnType<typeof resolveWorkspacePaths>, tasks: TaskDoc[]): void {
  mkdirSync(paths.tasksDir, { recursive: true });
  for (const task of tasks) {
    writeTask(path.join(paths.tasksDir, `${task.taskId}.md`), task);
  }
}

function loadExistingTasks(paths: ReturnType<typeof resolveWorkspacePaths>): TaskDoc[] {
  return sortTaskDocs(taskFiles(paths).map((file) => readTask(file)));
}

function nextTaskIndex(tasks: TaskDoc[]): number {
  if (tasks.length === 0) {
    return 1;
  }

  const last = tasks[tasks.length - 1];
  return Number.parseInt(last.taskId.slice(2), 10) + 1;
}

function autoPlanDetails(rawDescription: string, agents: AgentType[]) {
  const title = extractTitle(rawDescription);
  return {
    title,
    context: rawDescription,
    goal: title,
    constraints: [
      'Respect existing conventions.',
      'Keep changes minimal and reviewable.',
      'Stay within local validation flow.',
    ],
    behaviors: [`Deliver ${title}.`],
    failureCases: ['Invalid input is handled cleanly.', 'Missing implementation is covered before coding.'],
    regressionRisks: ['Existing behavior changes unintentionally.', 'Validation coverage is incomplete.'],
    qualityGates: ['npm test', 'npm run typecheck', 'npm run build'],
    agents,
  };
}

function buildChecklist(texts: string[]) {
  return texts.map((text) => ({ checked: false, text }));
}

async function promptCommaList(message: string, defaultValue: string): Promise<string[]> {
  return (await input({ message, default: defaultValue }))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function reviseProjectInteractively(project: ProjectDoc, rawDescription: string): Promise<void> {
  const targets = await checkbox({
    message: 'What should this revision update?',
    choices: [
      { name: 'Context', value: 'context', checked: true },
      { name: 'Goal', value: 'goal', checked: true },
      { name: 'Constraints', value: 'constraints' },
      { name: 'Test charter', value: 'charter' },
      { name: 'Quality gates', value: 'gates' },
    ],
  });

  const selected = new Set(targets as string[]);
  if (selected.has('context')) {
    project.context = (await input({
      message: 'Updated context',
      default: `${project.context}\n\nRevision request: ${rawDescription}`,
    })).trim();
  }
  if (selected.has('goal')) {
    project.goal = (await input({
      message: 'Updated goal',
      default: project.goal,
    })).trim();
  }
  if (selected.has('constraints')) {
    project.constraints = await promptCommaList(
      'Updated constraints (comma-separated)',
      project.constraints.join(', '),
    );
  }
  if (selected.has('charter')) {
    project.testCharter.behaviorsToProve = await promptCommaList(
      'Behaviors to prove (comma-separated)',
      project.testCharter.behaviorsToProve.join(', '),
    );
    project.testCharter.failureCasesToCover = await promptCommaList(
      'Failure cases to cover (comma-separated)',
      project.testCharter.failureCasesToCover.join(', '),
    );
    project.testCharter.regressionRisks = await promptCommaList(
      'Regression risks (comma-separated)',
      project.testCharter.regressionRisks.join(', '),
    );
  }
  if (selected.has('gates')) {
    project.qualityGates = await promptCommaList(
      'Updated quality gates (comma-separated commands)',
      project.qualityGates.join(', '),
    );
  }
}

function buildManualValidationTask(args: {
  project: ProjectDoc;
  taskId: string;
  title: string;
  type: TaskDoc['type'];
  goal: string;
  scope: string;
  deps: string[];
  primaryAgent: AgentType;
  fallbackAgents: AgentType[];
  justification: string;
  riskReduction: string[];
  validationPlan: string[];
  validationCommands: string[];
  acceptanceCriteria: string[];
}): TaskDoc {
  const now = nowIso();
  return {
    svpVersion: 1,
    projectId: args.project.projectId,
    taskId: args.taskId,
    title: args.title,
    type: args.type,
    status: 'pending',
    deps: args.deps,
    primaryAgent: args.primaryAgent,
    fallbackAgents: args.fallbackAgents,
    createdAt: now,
    updatedAt: now,
    testRequired: false,
    testExceptionAllowed: true,
    timeoutMs: 1_800_000,
    maxAttempts: 3,
    goal: args.goal,
    scope: args.scope,
    acceptanceCriteria: buildChecklist(args.acceptanceCriteria),
    testPlanTargetFiles: [],
    expectedFailingCases: [],
    validationCommands: args.validationCommands,
    requiredPassingCommands: [],
    implementationNotes: ['Follow the validation plan before marking this task complete.'],
    testExceptionJustification: args.justification,
    riskReductionStrategy: args.riskReduction,
    validationPlan: args.validationPlan,
    progressLog: [timestampLabel('Task created.')],
  };
}

async function buildInteractiveAdditions(
  project: ProjectDoc,
  preferredAgents: AgentType[],
  startIndex: number,
  rawDescription: string,
): Promise<TaskDoc[]> {
  const taskStyle = await select({
    message: 'What kind of addition do you want to plan?',
    choices: [
      { name: 'Standard TDD feature slice', value: 'tdd' },
      { name: 'Single validation-only task', value: 'validation' },
    ],
  });

  const featureTitle = (await input({
    message: 'Feature or task title',
    default: extractTitle(rawDescription),
  })).trim();

  if (taskStyle === 'tdd') {
    return buildDefaultTddTasks(project, featureTitle, preferredAgents, startIndex);
  }

  const taskType = await select({
    message: 'Validation-only task type',
    choices: [
      { name: 'Documentation', value: 'docs' },
      { name: 'Infrastructure', value: 'infra' },
      { name: 'Refactor', value: 'refactor' },
    ],
  });
  const goal = (await input({
    message: 'Goal',
    default: rawDescription,
  })).trim();
  const scope = (await input({
    message: 'Scope',
    default: `Deliver only the minimal ${taskType} change for ${featureTitle}.`,
  })).trim();
  const acceptanceCriteria = await promptCommaList(
    'Acceptance criteria (comma-separated)',
    'The requested change is complete,Local validation has been executed,No unrelated files were modified',
  );
  const justification = (await input({
    message: 'Why is automated testing not meaningful for this task?',
  })).trim();
  const riskReduction = await promptCommaList(
    'Risk reduction strategy (comma-separated)',
    'Keep changes minimal,Prefer stronger typing or explicit structure,Reuse existing terminology and commands',
  );
  const validationPlan = await promptCommaList(
    'Validation plan (comma-separated)',
    project.qualityGates.join(', '),
  );
  const validationCommands = await promptCommaList(
    'Validation commands (comma-separated)',
    project.qualityGates.join(', '),
  );
  const depMode = await select({
    message: 'Dependency strategy',
    choices: [
      { name: 'No dependencies', value: 'none' },
      { name: 'Depend on latest existing task', value: 'latest' },
    ],
  });

  return [buildManualValidationTask({
    project,
    taskId: `T-${String(startIndex).padStart(3, '0')}`,
    title: featureTitle,
    type: taskType as TaskDoc['type'],
    goal,
    scope,
    deps: depMode === 'latest' && startIndex > 1 ? [`T-${String(startIndex - 1).padStart(3, '0')}`] : [],
    primaryAgent: preferredAgents[0] ?? 'codex',
    fallbackAgents: preferredAgents.slice(1),
    justification,
    riskReduction,
    validationPlan,
    validationCommands,
    acceptanceCriteria,
  })];
}

async function resolveMode(
  opts: PlanCommandOptions,
  hasProject: boolean,
): Promise<ProjectMode> {
  if (opts.mode) {
    return opts.mode;
  }

  if (!opts.interactive) {
    return hasProject ? 'add-task' : 'creation';
  }

  if (!hasProject) {
    return 'creation';
  }

  return (await select({
    message: 'Planning mode',
    choices: [
      { name: 'Continue current project by adding a task', value: 'add-task' },
      { name: 'Revise current project metadata', value: 'revise-plan' },
    ],
  })) as ProjectMode;
}

export async function commandPlan(opts: PlanCommandOptions): Promise<void> {
  const rawDescription = await resolveRawTask(opts);
  const preferredAgents = parseAgents(opts.agents);
  const workspace = detectWorkspaceState(opts.output);
  const mode = await resolveMode(opts, workspace.hasActiveProject);
  const paths = workspace.paths;
  ensureWorkspaceDirs(paths);

  if (mode === 'creation' && workspace.hasActiveProject) {
    throw new Error('A project is already active in this repository. Use add-task or revise-plan instead.');
  }
  if (mode !== 'creation' && !workspace.hasActiveProject) {
    throw new Error('No active project found. Create one first.');
  }

  if (mode === 'creation') {
    const details = opts.interactive
      ? await gatherInteractiveFields(rawDescription, preferredAgents)
      : autoPlanDetails(rawDescription, preferredAgents);
    const project = buildProjectDoc({
      projectId: randomUUID(),
      title: details.title,
      context: details.context,
      goal: details.goal,
      constraints: details.constraints,
      behaviors: details.behaviors,
      failureCases: details.failureCases,
      regressionRisks: details.regressionRisks,
      qualityGates: details.qualityGates,
      primaryAgents: details.agents,
      mode,
    });
    const tasks = buildDefaultTddTasks(project, details.title, details.agents);
    applyTaskStatuses(project, tasks);
    writeProject(paths.projectFile, project);
    writeTasks(paths, tasks);
    writeState(paths.stateFile, createInitialState(project, tasks, mode));
    await indexWorkspaceMarkdown(opts.output);

    process.stdout.write(
      `\nCreated project ${project.title}\nProject: ${paths.projectFile}\nTasks: ${tasks.length}\n\n`,
    );
    return;
  }

  const project = readProject(paths.projectFile);
  const tasks = loadExistingTasks(paths);
  const state = readState(paths.stateFile);

  if (mode === 'revise-plan') {
    if (opts.interactive) {
      await reviseProjectInteractively(project, rawDescription);
    } else {
      project.context = `${project.context}\n\nRevision request:\n${rawDescription}`.trim();
    }
    appendProjectProgress(project, `Plan revised: ${extractTitle(rawDescription)}`);
    writeProject(paths.projectFile, project);
    writeState(paths.stateFile, state);
    await indexWorkspaceMarkdown(opts.output);
    process.stdout.write(`\nRevised project ${project.title}\n\n`);
    return;
  }

  const startIndex = nextTaskIndex(tasks);
  const featureTitle = extractTitle(rawDescription);
  const newTasks = opts.interactive
    ? await buildInteractiveAdditions(project, preferredAgents, startIndex, rawDescription)
    : buildDefaultTddTasks(
        project,
        featureTitle,
        preferredAgents,
        startIndex,
      );
  const allTasks = sortTaskDocs([...tasks, ...newTasks]);
  appendProjectProgress(project, `Added task slice: ${newTasks[0]?.title ?? featureTitle}`);
  applyTaskStatuses(project, allTasks);
  writeProject(paths.projectFile, project);
  writeTasks(paths, allTasks);

  for (const task of newTasks) {
    state.tasks[task.taskId] = {
      status: 'pending',
      attempts: 0,
      maxAttempts: task.maxAttempts,
      primaryAgent: task.primaryAgent,
      activeAgent: task.primaryAgent,
      fallbackAgents: [...task.fallbackAgents],
      lastExitReason: null,
      lastError: null,
      lastRunAt: null,
      startedAt: null,
      completedAt: null,
      timeoutMs: task.timeoutMs,
    };
  }
  state.updatedAt = nowIso();
  state.currentMode = 'add-task';
  writeState(paths.stateFile, state);
  await indexWorkspaceMarkdown(opts.output);

  process.stdout.write(`\nAdded ${newTasks.length} tasks for ${newTasks[0]?.title ?? featureTitle}\n\n`);
}
