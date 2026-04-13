import path from 'node:path';

import { MarkdownDB } from 'mddb';

import type {
  MarkdownDocKind,
  MarkdownIndexSummary,
  MarkdownQueryOptions,
  MarkdownQueryRow,
  WorkspacePaths,
} from './types.js';
import { detectWorkspaceState, resolveWorkspacePaths } from './workspace.js';

interface IndexedFileRecord {
  file_path: string;
  url_path: string | null;
  metadata?: Record<string, unknown> | null;
}

function createClient(paths: WorkspacePaths): MarkdownDB {
  return new MarkdownDB({
    client: 'sqlite3',
    connection: {
      filename: paths.markdownDbFile,
    },
  });
}

async function withWorkspaceCwd<T>(paths: WorkspacePaths, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(paths.workDir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

export async function indexWorkspaceMarkdown(outputDir = '.task-loop'): Promise<MarkdownIndexSummary> {
  const workspace = detectWorkspaceState(outputDir);
  if (!workspace.hasActiveProject) {
    throw new Error('No active project found to index.');
  }
  const paths = workspace.paths;
  const client = createClient(paths);

  await client.init();
  try {
    await withWorkspaceCwd(paths, async () => {
      await client.indexFolder({
        folderPath: paths.workDir,
        ignorePatterns: [
          /state\.json$/,
          /events\.jsonl$/,
          /markdown\.db$/,
          /\/runs\//,
          /\/\.markdowndb\//,
        ],
      });
    });

    const files = (await client.getFiles()) as IndexedFileRecord[];
    return {
      databasePath: paths.markdownDbFile,
      indexedFiles: files.length,
      indexedTasks: files.filter((file) => file.metadata?.doc_kind === 'task').length,
    };
  } finally {
    client._destroyDb();
  }
}

export async function queryWorkspaceMarkdown(
  options: MarkdownQueryOptions = {},
): Promise<MarkdownQueryRow[]> {
  const paths = resolveWorkspacePaths(options.output ?? '.task-loop');
  await indexWorkspaceMarkdown(options.output ?? '.task-loop');
  const client = createClient(paths);
  await client.init();

  try {
    const frontmatter: Record<string, string | number | boolean> = {};
    if (options.kind) {
      frontmatter.doc_kind = options.kind;
    }
    if (options.status) {
      frontmatter.status = options.status;
    }
    if (options.type) {
      frontmatter.type = options.type;
    }
    if (options.agent) {
      frontmatter.primary_agent = options.agent;
    }
    if (typeof options.testRequired === 'boolean') {
      frontmatter.test_required = options.testRequired;
    }

    const rows = (await client.getFiles({
      frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined,
    })) as IndexedFileRecord[];
    return rows.map((row) => ({
      filePath: row.file_path,
      urlPath: row.url_path,
      kind: (row.metadata?.doc_kind as MarkdownDocKind | undefined) ?? 'task',
      title: (row.metadata?.title as string | undefined) ?? null,
      taskId: (row.metadata?.task_id as string | undefined) ?? null,
      status: (row.metadata?.status as string | undefined) ?? null,
      type: (row.metadata?.type as string | undefined) ?? null,
      primaryAgent: (row.metadata?.primary_agent as string | undefined) ?? null,
      testRequired:
        typeof row.metadata?.test_required === 'boolean'
          ? (row.metadata?.test_required as boolean)
          : null,
    })).sort((left, right) => left.filePath.localeCompare(right.filePath));
  } finally {
    client._destroyDb();
  }
}

export async function commandIndex(opts: { output: string }): Promise<void> {
  const summary = await indexWorkspaceMarkdown(opts.output);
  process.stdout.write(
    `\nMarkdownDB indexed ${summary.indexedFiles} files (${summary.indexedTasks} tasks) at ${summary.databasePath}\n\n`,
  );
}

export async function commandQuery(opts: MarkdownQueryOptions): Promise<void> {
  const rows = await queryWorkspaceMarkdown(opts);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  if (rows.length === 0) {
    process.stdout.write('No indexed markdown documents matched the query.\n');
    return;
  }

  const lines = rows.map((row) => {
    const id = row.taskId ? `${row.taskId} ` : '';
    const suffix = [row.status, row.type, row.primaryAgent]
      .filter(Boolean)
      .join(', ');
    return `- ${row.kind}: ${id}${row.title ?? row.filePath}${suffix ? ` (${suffix})` : ''}`;
  });
  process.stdout.write(`${lines.join('\n')}\n`);
}
