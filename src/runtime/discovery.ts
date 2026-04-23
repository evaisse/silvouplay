import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AgentType } from '../types.js';
import { BUILTIN_AGENT_SPECS } from './index.js';
import type {
  AgentOverride,
  AgentOverrideMap,
  AgentSpec,
  DiscoveryConfig,
  DiscoveredAgent,
  DiscoveryOverrideSource,
  DiscoverySnapshot,
} from './dsl.js';

export interface DiscoverAgentsOptions {
  specs?: readonly AgentSpec[];
  cliOverrides?: AgentOverrideMap;
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  now?: () => string;
}

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'svp', 'config.json');

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPathLike(command: string): boolean {
  return command.includes(path.sep) || command.includes(path.posix.sep) || command.includes(path.win32.sep);
}

function getExecutableCandidates(commandPath: string, env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') {
    return [commandPath];
  }

  if (path.extname(commandPath)) {
    return [commandPath];
  }

  const pathExt = env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';
  return pathExt
    .split(';')
    .filter(Boolean)
    .map((extension) => `${commandPath}${extension.toLowerCase()}`);
}

function canExecute(candidatePath: string): boolean {
  try {
    accessSync(candidatePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommandPath(command: string, env: NodeJS.ProcessEnv): string | undefined {
  if (isPathLike(command)) {
    const resolvedPath = path.resolve(command);
    return canExecute(resolvedPath) ? resolvedPath : undefined;
  }

  const searchPath = env.PATH ?? process.env.PATH ?? '';
  for (const searchDir of searchPath.split(path.delimiter).filter(Boolean)) {
    const commandPath = path.join(searchDir, command);
    for (const candidatePath of getExecutableCandidates(commandPath, env)) {
      if (canExecute(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return undefined;
}

function readDiscoveryConfig(configPath: string): DiscoveryConfig {
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed)) {
      return {};
    }

    const agents = parsed.agents;
    if (!isObject(agents)) {
      return {};
    }

    const normalizedAgents: AgentOverrideMap = {};
    for (const [agentType, value] of Object.entries(agents)) {
      if (!isObject(value)) {
        continue;
      }

      const override: AgentOverride = {};
      if (typeof value.command === 'string' && value.command.trim()) {
        override.command = value.command.trim();
      }
      if (typeof value.enabled === 'boolean') {
        override.enabled = value.enabled;
      }
      normalizedAgents[agentType as AgentType] = override;
    }

    return { agents: normalizedAgents };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw new Error(`Unable to read svp config at ${configPath}: ${String(error)}`);
  }
}

function parseEnabledValue(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }

  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return undefined;
  }
}

function envKeyForAgent(agentType: AgentType): string {
  return agentType.replace(/-/g, '_').toUpperCase();
}

function readEnvOverrides(env: NodeJS.ProcessEnv, specs: readonly AgentSpec[]): AgentOverrideMap {
  const overrides: AgentOverrideMap = {};

  for (const spec of specs) {
    const envKey = envKeyForAgent(spec.runtime.type);
    const rawCommand = env[`SVP_AGENT_${envKey}_COMMAND`];
    const command = typeof rawCommand === 'string' && rawCommand.trim()
      ? rawCommand.trim()
      : undefined;
    const enabled = parseEnabledValue(env[`SVP_AGENT_${envKey}_ENABLED`]);

    if (command === undefined && enabled === undefined) {
      continue;
    }

    overrides[spec.runtime.type] = {
      ...(command !== undefined ? { command } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    };
  }

  return overrides;
}

function resolveEnabled(
  cliOverride: AgentOverride | undefined,
  envOverride: AgentOverride | undefined,
  configOverride: AgentOverride | undefined,
): { enabled: boolean; source: DiscoveryOverrideSource } {
  if (cliOverride?.enabled !== undefined) {
    return { enabled: cliOverride.enabled, source: 'cli' };
  }
  if (envOverride?.enabled !== undefined) {
    return { enabled: envOverride.enabled, source: 'env' };
  }
  if (configOverride?.enabled !== undefined) {
    return { enabled: configOverride.enabled, source: 'config' };
  }
  return { enabled: true, source: 'builtin' };
}

function resolveCommandOverride(
  cliOverride: AgentOverride | undefined,
  envOverride: AgentOverride | undefined,
  configOverride: AgentOverride | undefined,
): { command?: string; source: DiscoveryOverrideSource } {
  if (cliOverride?.command) {
    return { command: cliOverride.command, source: 'cli' };
  }
  if (envOverride?.command) {
    return { command: envOverride.command, source: 'env' };
  }
  if (configOverride?.command) {
    return { command: configOverride.command, source: 'config' };
  }
  return { source: 'builtin' };
}

function probeCommand(
  resolvedCommand: string,
  spec: AgentSpec,
  env: NodeJS.ProcessEnv,
): Pick<DiscoveredAgent, 'status' | 'version' | 'reason' | 'resolvedCommand'> {
  const result = spawnSync(resolvedCommand, spec.discovery.probeArgs, {
    env,
    encoding: 'utf8',
    timeout: spec.discovery.timeoutMs,
  });

  if (result.error) {
    return {
      status: 'misconfigured',
      resolvedCommand,
      reason: `Failed to probe ${resolvedCommand}: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ');
    return {
      status: 'misconfigured',
      resolvedCommand,
      reason: output
        ? `Probe failed for ${resolvedCommand}: ${output}`
        : `Probe failed for ${resolvedCommand} with exit code ${result.status ?? 'unknown'}.`,
    };
  }

  return {
    status: 'available',
    resolvedCommand,
    version: result.stdout.trim() || result.stderr.trim() || undefined,
  };
}

function discoverAgent(
  spec: AgentSpec,
  overrides: {
    cli?: AgentOverride;
    env?: AgentOverride;
    config?: AgentOverride;
    processEnv: NodeJS.ProcessEnv;
  },
): DiscoveredAgent {
  const enabled = resolveEnabled(overrides.cli, overrides.env, overrides.config);
  const command = resolveCommandOverride(overrides.cli, overrides.env, overrides.config);

  if (!enabled.enabled) {
    return {
      type: spec.runtime.type,
      spec,
      status: 'disabled',
      enabled: false,
      enabledSource: enabled.source,
      commandSource: command.source,
      ...(command.command ? { requestedCommand: command.command } : {}),
      reason: `Agent disabled by ${enabled.source} override.`,
    };
  }

  if (command.command) {
    const resolvedCommand = resolveCommandPath(command.command, overrides.processEnv);
    if (!resolvedCommand) {
      return {
        type: spec.runtime.type,
        spec,
        status: 'misconfigured',
        enabled: true,
        enabledSource: enabled.source,
        commandSource: command.source,
        requestedCommand: command.command,
        reason: `Configured command override not found: ${command.command}`,
      };
    }

    return {
      type: spec.runtime.type,
      spec,
      enabled: true,
      enabledSource: enabled.source,
      commandSource: command.source,
      requestedCommand: command.command,
      ...probeCommand(resolvedCommand, spec, overrides.processEnv),
    };
  }

  for (const candidateCommand of spec.discovery.candidateCommands) {
    const resolvedCommand = resolveCommandPath(candidateCommand, overrides.processEnv);
    if (!resolvedCommand) {
      continue;
    }

    return {
      type: spec.runtime.type,
      spec,
      enabled: true,
      enabledSource: enabled.source,
      commandSource: 'builtin',
      requestedCommand: candidateCommand,
      ...probeCommand(resolvedCommand, spec, overrides.processEnv),
    };
  }

  return {
    type: spec.runtime.type,
    spec,
    status: 'missing',
    enabled: true,
    enabledSource: enabled.source,
    commandSource: 'builtin',
    requestedCommand: spec.discovery.candidateCommands[0],
    reason: `Command not found on PATH: ${spec.discovery.candidateCommands.join(', ')}`,
  };
}

export function discoverAgents(options: DiscoverAgentsOptions = {}): DiscoverySnapshot {
  const specs = options.specs ?? BUILTIN_AGENT_SPECS;
  const processEnv = options.env ?? process.env;
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const config = readDiscoveryConfig(configPath);
  const envOverrides = readEnvOverrides(processEnv, specs);

  const agents = Object.fromEntries(
    specs.map((spec) => [
      spec.runtime.type,
      discoverAgent(spec, {
        cli: options.cliOverrides?.[spec.runtime.type],
        env: envOverrides[spec.runtime.type],
        config: config.agents?.[spec.runtime.type],
        processEnv,
      }),
    ]),
  ) as DiscoverySnapshot['agents'];

  return {
    generatedAt: (options.now ?? nowIso)(),
    agents,
  };
}
