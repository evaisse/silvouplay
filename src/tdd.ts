import { buildFallbackAgents, choosePrimaryAgent } from './agents.js';
import type { AgentType, ChecklistItem, ProjectDoc, TaskDoc } from './types.js';

function createdLog(): string {
  return `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] Task created.`;
}

function buildCriteria(items: string[]): ChecklistItem[] {
  return items.map((text) => ({ checked: false, text }));
}

function buildTaskDoc(args: {
  project: ProjectDoc;
  projectId: string;
  taskId: string;
  title: string;
  type: TaskDoc['type'];
  deps: string[];
  primaryAgent: AgentType;
  fallbackAgents: AgentType[];
  goal: string;
  scope: string;
  acceptanceCriteria: string[];
  targetFiles: string[];
  expectedFailingCases: string[];
  validationCommands: string[];
  requiredPassingCommands?: string[];
  implementationNotes: string[];
}): TaskDoc {
  const now = new Date().toISOString();
  return {
    svpVersion: 1,
    projectId: args.projectId,
    taskId: args.taskId,
    title: args.title,
    type: args.type,
    status: 'pending',
    deps: args.deps,
    primaryAgent: args.primaryAgent,
    fallbackAgents: args.fallbackAgents,
    createdAt: now,
    updatedAt: now,
    testRequired: true,
    testExceptionAllowed: false,
    timeoutMs: args.project.executionDefaults.timeoutMs,
    maxAttempts: args.project.executionDefaults.maxAttempts,
    goal: args.goal,
    scope: args.scope,
    acceptanceCriteria: buildCriteria(args.acceptanceCriteria),
    testPlanTargetFiles: args.targetFiles,
    expectedFailingCases: args.expectedFailingCases,
    validationCommands: args.validationCommands,
    requiredPassingCommands: args.requiredPassingCommands ?? [],
    implementationNotes: args.implementationNotes,
    riskReductionStrategy: [],
    validationPlan: [],
    progressLog: [createdLog()],
  };
}

function nextTaskId(index: number): string {
  return `T-${String(index).padStart(3, '0')}`;
}

export function buildDefaultTddTasks(
  project: ProjectDoc,
  featureTitle: string,
  agents: AgentType[],
  startIndex = 1,
): TaskDoc[] {
  const testsAgent = choosePrimaryAgent(agents, 'tests');
  const implementationAgent = choosePrimaryAgent(agents, 'implementation');
  const refactorAgent = choosePrimaryAgent(agents, 'refactor');

  const t1 = nextTaskId(startIndex);
  const t2 = nextTaskId(startIndex + 1);
  const t3 = nextTaskId(startIndex + 2);
  const t4 = nextTaskId(startIndex + 3);

  return [
    buildTaskDoc({
      project,
      projectId: project.projectId,
      taskId: t1,
      title: `Define test scenarios for ${featureTitle}`,
      type: 'tests',
      deps: [],
      primaryAgent: testsAgent,
      fallbackAgents: buildFallbackAgents(agents, testsAgent),
      goal: `Define the test scenarios needed to prove ${featureTitle}.`,
      scope: `Identify happy paths, edge cases, and regression risks for ${featureTitle}.`,
      acceptanceCriteria: [
        'Happy path scenarios are identified.',
        'Edge cases are identified.',
        'Regression risks are identified.',
        'Each scenario maps to a concrete test target.',
      ],
      targetFiles: ['tests/', 'src/'],
      expectedFailingCases: [
        `Missing behavior for ${featureTitle} is described explicitly.`,
      ],
      validationCommands: project.qualityGates,
      implementationNotes: [
        'Keep the scenario list aligned with the project test charter.',
      ],
    }),
    buildTaskDoc({
      project,
      projectId: project.projectId,
      taskId: t2,
      title: `Write failing tests for ${featureTitle}`,
      type: 'tests',
      deps: [t1],
      primaryAgent: testsAgent,
      fallbackAgents: buildFallbackAgents(agents, testsAgent),
      goal: `Write failing automated tests for ${featureTitle}.`,
      scope: `Add focused tests that fail for the expected reasons before implementation starts.`,
      acceptanceCriteria: [
        'Target tests exist.',
        'Target tests fail for the expected reasons.',
        'Test failures isolate missing behavior rather than broken setup.',
      ],
      targetFiles: ['tests/'],
      expectedFailingCases: [
        `The new behavior for ${featureTitle} is not implemented yet.`,
      ],
      validationCommands: project.qualityGates,
      implementationNotes: [
        'Prefer narrow tests over broad end-to-end coverage at this stage.',
      ],
    }),
    buildTaskDoc({
      project,
      projectId: project.projectId,
      taskId: t3,
      title: `Implement minimal code for ${featureTitle}`,
      type: 'implementation',
      deps: [t2],
      primaryAgent: implementationAgent,
      fallbackAgents: buildFallbackAgents(agents, implementationAgent),
      goal: `Implement the smallest code change that makes the tests for ${featureTitle} pass.`,
      scope: `Only change code that is needed for the targeted tests and validation commands.`,
      acceptanceCriteria: [
        'Target tests pass.',
        'No unrelated behavior changes are introduced.',
        'Code follows existing project conventions.',
      ],
      targetFiles: ['src/'],
      expectedFailingCases: [
        'Any remaining failing tests are understood and scoped.',
      ],
      validationCommands: project.qualityGates,
      requiredPassingCommands: project.qualityGates,
      implementationNotes: [
        'Prefer minimal code changes.',
        'Do not expand scope beyond the referenced tests.',
      ],
    }),
    buildTaskDoc({
      project,
      projectId: project.projectId,
      taskId: t4,
      title: `Refactor and harden ${featureTitle}`,
      type: 'refactor',
      deps: [t3],
      primaryAgent: refactorAgent,
      fallbackAgents: buildFallbackAgents(agents, refactorAgent),
      goal: `Refactor and harden the implementation for ${featureTitle} without breaking the passing tests.`,
      scope: 'Clarify the code, improve maintainability, and verify quality gates still pass.',
      acceptanceCriteria: [
        'Code is simplified or clarified.',
        'Quality gates still pass.',
        'The task is ready for hand-off or further extension.',
      ],
      targetFiles: ['src/', 'tests/'],
      expectedFailingCases: [
        'Any refactor-induced regressions are prevented by the test suite.',
      ],
      validationCommands: project.qualityGates,
      requiredPassingCommands: project.qualityGates,
      implementationNotes: [
        'Keep refactors behavior-preserving.',
      ],
    }),
  ];
}

export function applyTaskStatuses(project: ProjectDoc, tasks: TaskDoc[]): ProjectDoc {
  project.tasks = tasks.map((task) => ({
    id: task.taskId,
    title: task.title,
    checked: task.status === 'complete',
  }));

  const allComplete = tasks.length > 0 && tasks.every((task) => task.status === 'complete');
  project.completionCriteria = project.completionCriteria.map((criterion) => ({
    ...criterion,
    checked: allComplete,
  }));

  return project;
}
