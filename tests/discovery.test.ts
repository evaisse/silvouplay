import { rmSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverAgents } from '../src/runtime/discovery.js';
import { makeTempDir, writeConfig, writeExecutable } from './test-utils.js';

describe('agent discovery', () => {
  it('discovers builtin commands from PATH and reports missing agents', () => {
    const rootDir = makeTempDir('svp-discovery-path-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const codexPath = writeExecutable(binDir, 'codex', { version: '1.2.3' });
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
      const codexOverridePath = writeExecutable(binDir, 'codex-config', { version: '2.0.0' });
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
      const configCommandPath = writeExecutable(binDir, 'codex-config', { version: '2.0.0' });
      const envCommandPath = writeExecutable(binDir, 'codex-env', { version: '3.0.0' });
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

  it('normalizes hyphenated env keys and trims env command values', () => {
    const rootDir = makeTempDir('svp-discovery-env-normalize-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const claudePath = writeExecutable(binDir, 'claude-env', { version: '9.9.9' });
      const snapshot = discoverAgents({
        env: {
          PATH: '',
          SVP_AGENT_CLAUDE_CODE_COMMAND: `  ${claudePath}  `,
          SVP_AGENT_CLAUDE_CODE_ENABLED: ' YeS ',
        },
        configPath: path.join(rootDir, '.config', 'svp', 'config.json'),
      });

      expect(snapshot.agents['claude-code']).toMatchObject({
        status: 'available',
        enabled: true,
        enabledSource: 'env',
        commandSource: 'env',
        resolvedCommand: claudePath,
        version: 'claude-env 9.9.9',
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('applies CLI overrides over env, config, and builtin defaults', () => {
    const rootDir = makeTempDir('svp-discovery-cli-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const configCommandPath = writeExecutable(binDir, 'codex-config', { version: '2.0.0' });
      const envCommandPath = writeExecutable(binDir, 'codex-env', { version: '3.0.0' });
      const cliCommandPath = writeExecutable(binDir, 'codex-cli', { version: '4.0.0' });
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

  it('marks probe failures as misconfigured with probe output', () => {
    const rootDir = makeTempDir('svp-discovery-probe-failure-');
    const binDir = path.join(rootDir, 'bin');

    try {
      const ampPath = writeExecutable(binDir, 'amp-broken', {
        probeExitCode: 2,
        probeStderr: 'amp not initialized\n',
      });
      const snapshot = discoverAgents({
        env: {
          PATH: '',
          SVP_AGENT_AMP_COMMAND: ampPath,
        },
        configPath: path.join(rootDir, '.config', 'svp', 'config.json'),
      });

      expect(snapshot.agents.amp).toMatchObject({
        status: 'misconfigured',
        commandSource: 'env',
        resolvedCommand: ampPath,
      });
      expect(snapshot.agents.amp?.reason).toContain('amp not initialized');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
