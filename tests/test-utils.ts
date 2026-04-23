import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { AgentOverrideMap, DiscoveryConfig } from '../src/runtime/dsl.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'src', 'cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeExecutable(
  binDir: string,
  command: string,
  options: {
    version?: string;
    probeExitCode?: number;
    probeStdout?: string;
    probeStderr?: string;
  } = {},
): string {
  mkdirSync(binDir, { recursive: true });

  const scriptPath = path.join(binDir, command);
  writeFileSync(
    scriptPath,
    `#!${process.execPath}
const isProbe = process.argv.slice(2).includes('--version');
if (isProbe) {
  ${options.probeStdout !== undefined ? `process.stdout.write(${JSON.stringify(options.probeStdout)});` : `console.log(${JSON.stringify(`${command} ${options.version ?? '1.0.0'}`)});`}
  ${options.probeStderr !== undefined ? `process.stderr.write(${JSON.stringify(options.probeStderr)});` : ''}
  process.exit(${options.probeExitCode ?? 0});
}
process.exit(0);
`,
    'utf8',
  );
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

export function writeConfig(rootDir: string, overrides: AgentOverrideMap): string {
  const configDir = path.join(rootDir, '.config', 'svp');
  mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, 'config.json');
  const config: DiscoveryConfig = {
    agents: overrides,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

export function runCli(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  const result = spawnSync(process.execPath, [TSX_CLI, CLI_ENTRY, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

export function writeAgentStubs(
  binDir: string,
  options: {
    commands?: string[];
    failMap?: Record<string, number>;
  } = {},
): void {
  mkdirSync(binDir, { recursive: true });

  for (const command of options.commands ?? ['codex', 'claude', 'gemini', 'opencode', 'amp']) {
    const scriptPath = path.join(binDir, command);
    const exitCode = options.failMap?.[command] ?? 0;
    writeFileSync(
      scriptPath,
      `#!${process.execPath}
const { appendFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const logFile = process.env.AGENT_STUB_LOG;
if (!logFile) throw new Error('AGENT_STUB_LOG is required');
const isProbe = process.argv.slice(2).includes('--version');

mkdirSync(path.dirname(logFile), { recursive: true });
appendFileSync(logFile, JSON.stringify({ command: path.basename(process.argv[1]), cwd: process.cwd(), prompt: process.argv.slice(2).join(' ') }) + '\\n');
process.exit(isProbe ? 0 : ${exitCode});
`,
      'utf8',
    );
    chmodSync(scriptPath, 0o755);
  }
}
