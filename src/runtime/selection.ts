import type { AgentType } from '../types.js';
import { SUPPORTED_AGENT_TYPES } from './index.js';
import type { DiscoveredAgent, DiscoverySnapshot } from './dsl.js';

export interface DiscoveryRoleSummary {
  availableOrchestrators: AgentType[];
  availableWorkers: AgentType[];
  unavailableAgents: Array<{ type: AgentType; reason: string }>;
}

function supportsRole(agent: DiscoveredAgent | undefined, role: 'orchestrator' | 'worker'): boolean {
  return agent?.spec.discovery.supportedRoles.includes(role) ?? false;
}

function availabilityReason(agent: DiscoveredAgent | undefined): string {
  if (!agent) {
    return 'Agent discovery data is unavailable.';
  }

  return agent.reason ?? `Agent is ${agent.status}.`;
}

export function summarizeDiscoverySnapshot(snapshot: DiscoverySnapshot): DiscoveryRoleSummary {
  const availableOrchestrators: AgentType[] = [];
  const availableWorkers: AgentType[] = [];
  const unavailableAgents: DiscoveryRoleSummary['unavailableAgents'] = [];

  for (const agentType of SUPPORTED_AGENT_TYPES) {
    const discovered = snapshot.agents[agentType];
    if (discovered?.status === 'available') {
      if (supportsRole(discovered, 'orchestrator')) {
        availableOrchestrators.push(agentType);
      }
      if (supportsRole(discovered, 'worker')) {
        availableWorkers.push(agentType);
      }
      continue;
    }

    unavailableAgents.push({
      type: agentType,
      reason: availabilityReason(discovered),
    });
  }

  return {
    availableOrchestrators,
    availableWorkers,
    unavailableAgents,
  };
}

export function validateAgentRoleAvailability(
  snapshot: DiscoverySnapshot,
  agentType: AgentType,
  role: 'orchestrator' | 'worker',
): string | null {
  const discovered = snapshot.agents[agentType];
  if (!discovered || discovered.status !== 'available') {
    return availabilityReason(discovered);
  }
  if (!supportsRole(discovered, role)) {
    return `${agentType} does not support the ${role} role.`;
  }
  return null;
}

export function resolveAgentSelection(
  snapshot: DiscoverySnapshot,
  requestedOrchestrator?: AgentType,
  requestedWorkers: AgentType[] = [],
): { orchestrator: AgentType; workers: AgentType[] } {
  const summary = summarizeDiscoverySnapshot(snapshot);
  const orchestrator = requestedOrchestrator ?? summary.availableOrchestrators[0];

  if (!orchestrator) {
    throw new Error('No orchestrators are currently available.');
  }

  const orchestratorError = validateAgentRoleAvailability(snapshot, orchestrator, 'orchestrator');
  if (orchestratorError) {
    throw new Error(`Selected orchestrator ${orchestrator} is not currently available: ${orchestratorError}`);
  }

  const workers = requestedWorkers.length > 0 ? requestedWorkers : summary.availableWorkers;
  if (workers.length === 0) {
    throw new Error('No workers are currently available.');
  }

  for (const worker of workers) {
    const workerError = validateAgentRoleAvailability(snapshot, worker, 'worker');
    if (workerError) {
      throw new Error(`Selected worker ${worker} is not currently available: ${workerError}`);
    }
  }

  return {
    orchestrator,
    workers,
  };
}
