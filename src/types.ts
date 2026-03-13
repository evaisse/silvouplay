/**
 * Shared TypeScript types for agent-task-loop.
 */

/** Supported coding agent backends. */
export type AgentType = 'codex' | 'claude-code' | 'gemini' | 'opencode';

/** Task execution status. */
export type TaskStatus = 'pending' | 'in-progress' | 'complete' | 'failed';

/** A design decision captured during the interactive planning session. */
export interface DesignDecision {
  question: string;
  answer: string;
}

/** A single parallelisable sub-task derived from the top-level plan. */
export interface SubTask {
  id: string;
  title: string;
  description: string;
  /** IDs of sub-tasks that must complete before this one starts. */
  dependencies: string[];
  agent: AgentType;
  branch?: string;
  worktreePath?: string;
  status: TaskStatus;
}

/** The top-level task plan produced by the planner. */
export interface TaskPlan {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  designDecisions: DesignDecision[];
  subTasks: SubTask[];
  completionCriteria: string[];
  /** Absolute path to the generated PRD markdown file. */
  prdPath?: string;
}

/** Options passed to the planning workflow. */
export interface PlanningOptions {
  /** Inline task prompt. */
  prompt?: string;
  /** Path to a file containing the task description. */
  file?: string;
  /** Agents available for assignment. */
  agents: AgentType[];
  /** Directory where .task-loop artefacts are written. */
  outputDir: string;
  /** Whether to ask interactive design questions. */
  interactive: boolean;
  /** Whether to create git worktrees for each sub-task. */
  useGitWorktrees: boolean;
}

/** Describes what a particular agent is good at. */
export interface AgentCapability {
  type: AgentType;
  command: string;
  strengths: string[];
}

/** Result of a worktree creation operation. */
export interface WorktreeResult {
  branch: string;
  path: string;
}
