/**
 * Assigns sub-tasks to the most appropriate agent based on keyword matching.
 *
 * If only a single agent is available every task is assigned to it.
 * Otherwise the assigner scores each (task, agent) pair and picks the best.
 */
import { AGENT_CAPABILITIES } from './agents.js';
import type { AgentType, SubTask } from './types.js';

/**
 * Score how well an agent's strengths match a task's title and description.
 */
function scoreAgentForTask(
  agentType: AgentType,
  task: SubTask,
): number {
  const cap = AGENT_CAPABILITIES.find((c) => c.type === agentType);
  if (!cap) return 0;

  const text = `${task.title} ${task.description}`.toLowerCase();
  return cap.strengths.reduce((score, strength) => {
    return text.includes(strength.toLowerCase()) ? score + 1 : score;
  }, 0);
}

/**
 * Assign the best available agent to each sub-task, modifying in place.
 *
 * When no agent has a clear keyword match the tasks are distributed
 * round-robin across the available pool so work is spread evenly.
 *
 * @param subTasks  Sub-tasks to assign.
 * @param agents    Pool of available agents.
 * @returns         The same array with `.agent` fields updated.
 */
export function assignAgents(
  subTasks: SubTask[],
  agents: AgentType[],
): SubTask[] {
  if (agents.length === 0) {
    throw new Error('At least one agent must be available for assignment.');
  }

  return subTasks.map((task, index) => {
    if (agents.length === 1) {
      return { ...task, agent: agents[0] };
    }

    // Pick the agent with the highest relevance score.
    let bestAgent = agents[index % agents.length]; // round-robin default
    let bestScore = 0;

    for (const agentType of agents) {
      const score = scoreAgentForTask(agentType, task);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentType;
      }
    }

    return { ...task, agent: bestAgent };
  });
}
