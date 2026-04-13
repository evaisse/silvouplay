import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { indexWorkspaceMarkdown, queryWorkspaceMarkdown } from '../src/markdowndb.js';
import { commandPlan } from '../src/plan.js';

describe('MarkdownDB integration', () => {
  it('indexes the active workspace and queries task documents', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'svp-mddb-'));
    const previous = process.cwd();
    process.chdir(dir);

    try {
      await commandPlan({
        task: 'Index the markdown workspace',
        agents: 'codex,opencode',
        output: '.task-loop',
        interactive: false,
        mode: 'creation',
      });

      const summary = await indexWorkspaceMarkdown('.task-loop');
      expect(summary.indexedFiles).toBeGreaterThanOrEqual(5);
      expect(readFileSync(path.join(dir, '.task-loop', 'markdown.db')).length).toBeGreaterThan(0);

      const tasks = await queryWorkspaceMarkdown({
        output: '.task-loop',
        kind: 'task',
      });
      expect(tasks).toHaveLength(4);
      expect(tasks[0].kind).toBe('task');
      expect(tasks[0].taskId).toBeTruthy();
    } finally {
      process.chdir(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
