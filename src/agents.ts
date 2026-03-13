/**
 * Defines the strengths and CLI commands for each supported coding agent.
 */
import type { AgentCapability, AgentType } from './types.js';

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    type: 'codex',
    command: 'codex',
    strengths: [
      'code generation',
      'refactoring',
      'tests',
      'documentation',
      'general programming',
    ],
  },
  {
    type: 'claude-code',
    command: 'claude',
    strengths: [
      'architecture',
      'complex reasoning',
      'code review',
      'design patterns',
      'planning',
    ],
  },
  {
    type: 'gemini',
    command: 'gemini',
    strengths: [
      'data analysis',
      'multimodal tasks',
      'research',
      'summarisation',
      'code generation',
    ],
  },
  {
    type: 'opencode',
    command: 'opencode',
    strengths: [
      'code editing',
      'debugging',
      'file operations',
      'terminal tasks',
      'general programming',
    ],
  },
];

/**
 * Return the capability record for a given agent type.
 */
export function getAgentCapability(type: AgentType): AgentCapability {
  const cap = AGENT_CAPABILITIES.find((c) => c.type === type);
  if (!cap) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return cap;
}
