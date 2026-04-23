import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AgentOverrideMap, DiscoveryConfig } from '../src/runtime/dsl.js';
import { discoverAgents } from '../src/runtime/discovery.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(binDir: string, command: string, version = '1.0.0'): string {
  mkdirSync(binDir, { recursive: true });

  const scriptPath = path.join(binDir, command);
  writeFileSync(
    scriptPath,
    `#!${process.execPath}
console.log(${JSON.stringify(`${command} ${version}`)});
`,
    'utf8',
  );
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeConfig(rootDir: string, overrides: AgentOverrideMap): string {
  const configDir = path.join(rootDir, '.config', 'svp');
  mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, 'config.json');
  const config: DiscoveryConfig = {
    agents: overrides,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

describe('agent discovery', () => {
  it('discovers builtin commands from PATH and reports missing agents', () => {
    const rootDir = makeTempDir('svp-discovery-path-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const codexPath = writeExecutable(binDir, 'codex', '1.2.3');
      const snapshot = discoverAgents({
        env: {
          PATH: binDir,
        },
        configPath: path.join(rootDir, '.config', 'svp', 'config.json'),
        now: () => '2026-04-23T18:30:00.000Z',
      });

      expect(snapshot.generatedAt).toBe('2026-04-23T18:30:00.000Z');
      expect(snapshot.agents.codex).toMatchObject({
        status: 'available',
        resolvedCommand: codexPath,
        commandSource: 'builtin',
        version: 'codex 1.2.3',
      });
      expect(snapshot.agents.gemini).toMatchObject({
        status: 'missing',
        commandSource: 'builtin',
      });
      expect(snapshot.agents.gemini?.reason).toContain('gemini');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('applies global config command overrides and disable toggles', () => {
    const rootDir = makeTempDir('svp-discovery-config-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const codexOverridePath = writeExecutable(binDir, 'codex-config', '2.0.0');
      const configPath = writeConfig(rootDir, {
        codex: { command: codexOverridePath },
        gemini: { enabled: false },
      });

      const snapshot = discoverAgents({
        env: {
          PATH: '',
        },
        configPath,
      });

      expect(snapshot.agents.codex).toMatchObject({
        status: 'available',
        resolvedCommand: codexOverridePath,
        commandSource: 'config',
        version: 'codex-config 2.0.0',
      });
      expect(snapshot.agents.gemini).toMatchObject({
        status: 'disabled',
        enabled: false,
        commandSource: 'builtin',
      });
      expect(snapshot.agents.gemini?.reason).toContain('config');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('applies env overrides over global config', () => {
    const rootDir = makeTempDir('svp-discovery-env-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const configCommandPath = writeExecutable(binDir, 'codex-config', '2.0.0');
      const envCommandPath = writeExecutable(binDir, 'codex-env', '3.0.0');
      const configPath = writeConfig(rootDir, {
        codex: { command: configCommandPath },
        amp: { enabled: true },
      });

      const snapshot = discoverAgents({
        env: {
          PATH: '',
          SVP_AGENT_CODEX_COMMAND: envCommandPath,
          SVP_AGENT_AMP_ENABLED: 'false',
        },
        configPath,
      });

      expect(snapshot.agents.codex).toMatchObject({
        status: 'available',
        resolvedCommand: envCommandPath,
        commandSource: 'env',
        version: 'codex-env 3.0.0',
      });
      expect(snapshot.agents.amp).toMatchObject({
        status: 'disabled',
        enabled: false,
      });
      expect(snapshot.agents.amp?.reason).toContain('env');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('applies CLI overrides over env, config, and builtin defaults', () => {
    const rootDir = makeTempDir('svp-discovery-cli-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const configCommandPath = writeExecutable(binDir, 'codex-config', '2.0.0');
      const envCommandPath = writeExecutable(binDir, 'codex-env', '3.0.0');
      const cliCommandPath = writeExecutable(binDir, 'codex-cli', '4.0.0');
      const configPath = writeConfig(rootDir, {
        codex: { command: configCommandPath, enabled: false },
      });

      const snapshot = discoverAgents({
        cliOverrides: {
          codex: { command: cliCommandPath, enabled: true },
        },
        env: {
          PATH: '',
          SVP_AGENT_CODEX_COMMAND: envCommandPath,
          SVP_AGENT_CODEX_ENABLED: 'false',
        },
        configPath,
      });

      expect(snapshot.agents.codex).toMatchObject({
        status: 'available',
        enabled: true,
        resolvedCommand: cliCommandPath,
        commandSource: 'cli',
        enabledSource: 'cli',
        version: 'codex-cli 4.0.0',
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('marks forced invalid command overrides as misconfigured while builtin misses stay missing', () => {
    const rootDir = makeTempDir('svp-discovery-misconfigured-');

    try {
      const invalidCommandPath = path.join(rootDir, 'missing-claude');
      const configPath = writeConfig(rootDir, {
        'claude-code': { command: invalidCommandPath },
      });

      const snapshot = discoverAgents({
        env: {
          PATH: '',
        },
        configPath,
      });

      expect(snapshot.agents['claude-code']).toMatchObject({
        status: 'misconfigured',
        commandSource: 'config',
      });
      expect(snapshot.agents['claude-code']?.reason).toContain(invalidCommandPath);
      expect(snapshot.agents.gemini).toMatchObject({
        status: 'missing',
        commandSource: 'builtin',
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
