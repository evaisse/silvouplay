import type { AgentType, ExitReason, TaskRuntimeState } from './types.js';

const FALLBACK_REASONS = new Set<ExitReason>([
  'quota_exceeded',
  'rate_limited',
  'cost_limit_reached',
  'binary_missing',
  'timeout',
]);

export function isFallbackReason(reason: ExitReason): boolean {
  return FALLBACK_REASONS.has(reason);
}

export function chooseFallbackAgent(
  runtime: TaskRuntimeState,
): AgentType | null {
  const next = runtime.fallbackAgents.find((agent) => agent !== runtime.activeAgent);
  return next ?? null;
}
