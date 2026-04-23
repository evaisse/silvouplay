export type AgentType = 'codex' | 'claude-code' | 'gemini' | 'opencode' | 'amp';

export type ProjectMode = 'creation' | 'completion' | 'revise-plan' | 'add-task';

export type ProjectStatus = 'active' | 'paused' | 'complete' | 'failed';

export type TaskType = 'tests' | 'implementation' | 'refactor' | 'docs' | 'infra';

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'complete'
  | 'failed';

export type ExitReason =
  | 'success'
  | 'timeout'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'cost_limit_reached'
  | 'binary_missing'
  | 'agent_error'
  | 'manual_pause'
  | 'no_fallback_available';

export type MarkdownDocKind = 'project' | 'task';

export interface AgentCapability {
  type: AgentType;
  command: string;
  strengths: string[];
}

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

export interface ProjectTaskIndexItem {
  id: string;
  title: string;
  checked: boolean;
}

export interface TestCharter {
  behaviorsToProve: string[];
  failureCasesToCover: string[];
  regressionRisks: string[];
}

export interface ProjectDoc {
  svpVersion: number;
  projectId: string;
  title: string;
  status: ProjectStatus;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
  primaryAgents: AgentType[];
  fallbackAgents: AgentType[];
  testStrategy: 'tdd-first';
  taskDir: string;
  qualityGates: string[];
  context: string;
  goal: string;
  constraints: string[];
  testingPolicy: string[];
  testCharter: TestCharter;
  tasks: ProjectTaskIndexItem[];
  completionCriteria: ChecklistItem[];
  progressLog: string[];
}

export interface TaskDoc {
  svpVersion: number;
  projectId: string;
  taskId: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  deps: string[];
  primaryAgent: AgentType;
  fallbackAgents: AgentType[];
  createdAt: string;
  updatedAt: string;
  testRequired: boolean;
  testExceptionAllowed: boolean;
  timeoutMs: number;
  maxAttempts: number;
  goal: string;
  scope: string;
  acceptanceCriteria: ChecklistItem[];
  testPlanTargetFiles: string[];
  expectedFailingCases: string[];
  validationCommands: string[];
  requiredPassingCommands: string[];
  implementationNotes: string[];
  testExceptionJustification?: string;
  riskReductionStrategy: string[];
  validationPlan: string[];
  progressLog: string[];
}

export interface TaskRuntimeState {
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  primaryAgent: AgentType;
  activeAgent: AgentType;
  fallbackAgents: AgentType[];
  lastExitReason: ExitReason | null;
  lastError: string | null;
  lastRunAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeoutMs: number;
}

export interface ProjectState {
  projectId: string;
  status: ProjectStatus;
  currentMode: ProjectMode;
  createdAt: string;
  updatedAt: string;
  lastRunId: string | null;
  budgets: {
    maxCostUsd: number | null;
    maxTaskDurationMs: number;
  };
  tasks: Record<string, TaskRuntimeState>;
}

export interface WorkspacePaths {
  rootDir: string;
  workDir: string;
  projectFile: string;
  stateFile: string;
  tasksDir: string;
  eventsFile: string;
  runsDir: string;
  markdownDbFile: string;
}

export interface WorkspaceState {
  hasActiveProject: boolean;
  suggestedMode: 'creation' | 'completion';
  paths: WorkspacePaths;
  title?: string;
  openTaskCount: number;
  pausedTaskCount: number;
}

export interface PlanCommandOptions {
  task?: string;
  file?: string;
  agents: string;
  output: string;
  interactive: boolean;
  mode?: ProjectMode;
}

export interface RunTaskResult {
  taskId: string;
  exitCode: number;
  success: boolean;
  exitReason: ExitReason;
  activeAgent: AgentType;
  errorMessage: string | null;
}

export interface RunSummary {
  runId: string;
  completedTaskIds: string[];
  pausedTaskIds: string[];
  failedTaskIds: string[];
  fallbackTaskIds: string[];
}

export interface MarkdownIndexSummary {
  databasePath: string;
  indexedFiles: number;
  indexedTasks: number;
}

export interface MarkdownQueryOptions {
  output?: string;
  kind?: MarkdownDocKind;
  status?: ProjectStatus | TaskStatus;
  type?: TaskType;
  agent?: AgentType;
  testRequired?: boolean;
  json?: boolean;
}

export interface MarkdownQueryRow {
  filePath: string;
  urlPath: string | null;
  kind: MarkdownDocKind;
  title: string | null;
  taskId: string | null;
  status: string | null;
  type: string | null;
  primaryAgent: string | null;
  testRequired: boolean | null;
}
