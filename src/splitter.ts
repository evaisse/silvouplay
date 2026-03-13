/**
 * Splits a task plan into parallelisable sub-tasks.
 *
 * The splitter uses the list of components derived from the design decisions
 * to create one sub-task per component.  When no explicit components are
 * listed it creates a sensible default breakdown (setup, implementation,
 * testing, documentation).
 */
import type { SubTask, AgentType } from './types.js';

/** Default breakdown applied when no components are specified. */
const DEFAULT_BREAKDOWN = [
  {
    title: 'Project setup & configuration',
    description:
      'Initialise repository structure, install dependencies, and configure build tooling.',
  },
  {
    title: 'Core implementation',
    description: 'Implement the primary business logic and main feature set.',
  },
  {
    title: 'Tests',
    description:
      'Write unit and integration tests covering the core implementation.',
  },
  {
    title: 'Documentation',
    description:
      'Write README, API docs, and inline code comments.',
  },
];

/**
 * Parse a components list from the description.
 *
 * Supports two formats:
 *  - Single-line:  `Components: auth, api, frontend`
 *  - Markdown list under a `## Components` heading (each `- item` becomes a component)
 */
function extractComponents(description: string): string[] {
  // Single-line format: "Components: a, b, c"
  const inlineMatch = description.match(/^Components:\s*(.+)$/m);
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }

  // Markdown section format: "## Components\n- item1\n- item2"
  const sectionMatch = description.match(
    /##\s+Components?\s*\n((?:\s*[-*]\s+.+\n?)+)/i,
  );
  if (sectionMatch) {
    return sectionMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Generate a URL-safe branch name from a task title.
 */
export function branchNameFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Split a task description into an array of parallelisable SubTask objects.
 *
 * @param description   Full task description (may contain "Components: …" line).
 * @param agents        Ordered list of agents available for assignment.
 * @returns             Array of sub-tasks ready for agent assignment.
 */
export function splitIntoSubTasks(
  description: string,
  agents: AgentType[],
): SubTask[] {
  const components = extractComponents(description);

  const breakdowns =
    components.length > 0
      ? components.map((comp) => ({
          title: comp,
          description: `Implement the "${comp}" component as part of the overall task.`,
        }))
      : DEFAULT_BREAKDOWN;

  return breakdowns.map((breakdown, index) => {
    const id = `task-${String(index + 1).padStart(3, '0')}`;

    // Round-robin assignment across available agents.
    const agent = agents[index % agents.length] ?? 'codex';

    // The first task has no dependencies; subsequent tasks depend on setup
    // (task-001) unless they are the setup task itself.
    const dependencies: string[] = index > 0 ? ['task-001'] : [];

    return {
      id,
      title: breakdown.title,
      description: breakdown.description,
      dependencies,
      agent,
      branch: branchNameFromTitle(breakdown.title),
      status: 'pending',
    };
  });
}
