/**
 * Interactive planning session.
 *
 * Asks the user a set of design questions and returns a DesignDecision list
 * together with a structured task title derived from their answers.
 */
import { input, select, confirm, checkbox } from '@inquirer/prompts';
import type { DesignDecision, AgentType } from './types.js';

export interface PlannerResult {
  title: string;
  description: string;
  designDecisions: DesignDecision[];
  completionCriteria: string[];
  suggestedAgents: AgentType[];
}

/** Questions asked during the interactive planning session. */
const DESIGN_QUESTIONS: Array<{ key: string; question: string }> = [
  {
    key: 'goal',
    question: 'What is the main goal of this task?',
  },
  {
    key: 'components',
    question:
      'What are the main components or modules needed? (comma-separated)',
  },
  {
    key: 'stack',
    question: 'What is the preferred technology stack or language?',
  },
  {
    key: 'constraints',
    question: 'Are there any constraints, preferences or non-goals?',
  },
  {
    key: 'completion',
    question:
      'How will you know the task is done? Describe 1–3 acceptance criteria.',
  },
];

const ALL_AGENTS: AgentType[] = ['codex', 'claude-code', 'gemini', 'opencode'];

/**
 * Run the interactive planning session.
 *
 * @param rawDescription  Initial task description provided via CLI.
 * @returns               Structured planning result.
 */
export async function runInteractivePlanning(
  rawDescription: string,
): Promise<PlannerResult> {
  const decisions: DesignDecision[] = [];

  console.log('');

  for (const { key, question } of DESIGN_QUESTIONS) {
    if (key === 'goal' && rawDescription.trim()) {
      // Pre-fill goal from the CLI description so the user can confirm / refine.
      const answer = await input({
        message: question,
        default: rawDescription.trim(),
      });
      decisions.push({ question, answer: answer.trim() || rawDescription.trim() });
    } else {
      const answer = await input({ message: question });
      decisions.push({ question, answer: answer.trim() });
    }
  }

  // Derive a concise title from the goal answer.
  const goal = decisions[0]?.answer ?? rawDescription;
  const title = goal.length > 80 ? goal.slice(0, 77) + '...' : goal;

  // Parse components string into an array for downstream use.
  const componentsRaw = decisions[1]?.answer ?? '';
  const components = componentsRaw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  // Parse completion criteria.
  const completionRaw = decisions[4]?.answer ?? '';
  const completionCriteria = completionRaw
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean);

  // Let the user choose which agents to use.
  const useParallel = await confirm({
    message: 'Split this task across multiple parallel agents?',
    default: true,
  });

  let suggestedAgents: AgentType[];
  if (useParallel) {
    const chosen = await checkbox({
      message: 'Select agents to use (space to toggle, enter to confirm):',
      choices: ALL_AGENTS.map((a) => ({ name: a, value: a, checked: true })),
    });
    suggestedAgents = (chosen as AgentType[]).length
      ? (chosen as AgentType[])
      : ['codex'];
  } else {
    const single = await select({
      message: 'Which agent should handle the whole task?',
      choices: ALL_AGENTS.map((a) => ({ name: a, value: a })),
    });
    suggestedAgents = [single as AgentType];
  }

  // Build a richer description from all collected answers.
  const description = [
    `Goal: ${decisions[0]?.answer}`,
    components.length ? `Components: ${components.join(', ')}` : '',
    decisions[2]?.answer ? `Stack: ${decisions[2].answer}` : '',
    decisions[3]?.answer ? `Constraints: ${decisions[3].answer}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title,
    description,
    designDecisions: decisions,
    completionCriteria,
    suggestedAgents,
  };
}

/**
 * Extract a clean single-line title from a raw task description or markdown file.
 *
 * Strips leading `#` characters, takes the first non-empty line, and
 * truncates to 80 characters.
 */
function extractTitle(raw: string): string {
  const firstLine = raw
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0) ?? raw.trim();

  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

/**
 * Non-interactive planning – wraps a raw prompt in a minimal PlannerResult.
 *
 * When the description contains a "Components:" or "## Components" section the
 * splitter will parse it automatically via `extractComponents`.
 */
export function buildNonInteractivePlan(rawDescription: string): PlannerResult {
  const title = extractTitle(rawDescription);
  return {
    title,
    description: rawDescription,
    designDecisions: [
      { question: 'Task description', answer: rawDescription },
    ],
    completionCriteria: ['All sub-tasks complete without errors'],
    suggestedAgents: ['codex'],
  };
}
