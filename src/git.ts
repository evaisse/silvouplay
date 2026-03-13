/**
 * Git worktree management for parallel agent execution.
 *
 * When the working directory is inside a git repository, each sub-task can be
 * assigned its own worktree so that agents operate on isolated branches
 * without interfering with each other.
 */
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import type { SubTask, WorktreeResult } from './types.js';

/**
 * Return true when `dir` (or any of its parents) is the root of a git repo.
 */
export function isGitRepository(dir: string = process.cwd()): boolean {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}

/**
 * Return the root directory of the current git repository.
 */
export function getGitRoot(dir: string = process.cwd()): string {
  const result = spawnSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    { cwd: dir, encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) {
    throw new Error('Not inside a git repository.');
  }
  return result.stdout.trim();
}

/**
 * Return the name of the currently checked-out branch.
 */
export function getCurrentBranch(dir: string = process.cwd()): string {
  const result = spawnSync(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: dir, encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.status !== 0) {
    throw new Error('Could not determine the current branch.');
  }
  return result.stdout.trim();
}

/**
 * Create a git worktree for a sub-task branch.
 *
 * The worktree is placed at `<gitRoot>/.worktrees/<branchName>`.
 * If the branch does not yet exist it is created from the current HEAD.
 *
 * @param subTask   The sub-task to create a worktree for.
 * @param gitRoot   Root directory of the git repository.
 * @returns         The branch name and absolute path of the worktree.
 */
export function createWorktree(
  subTask: SubTask,
  gitRoot: string,
): WorktreeResult {
  const branch = subTask.branch ?? subTask.id;
  const worktreePath = path.join(gitRoot, '.worktrees', branch);

  // Check whether the branch already exists.
  const branchExists =
    spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: gitRoot,
      stdio: 'pipe',
    }).status === 0;

  const args = branchExists
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath];

  const result = spawnSync('git', args, {
    cwd: gitRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to create worktree for branch "${branch}": ${result.stderr}`,
    );
  }

  return { branch, path: worktreePath };
}

/**
 * Remove a git worktree and (optionally) delete its branch.
 */
export function removeWorktree(
  worktreePath: string,
  gitRoot: string,
  deleteBranch = false,
): void {
  execSync(`git worktree remove --force "${worktreePath}"`, { cwd: gitRoot });
  if (deleteBranch) {
    const branch = path.basename(worktreePath);
    execSync(`git branch -D "${branch}"`, { cwd: gitRoot });
  }
}

/**
 * Create worktrees for all sub-tasks that have a `branch` property.
 * Updates each sub-task's `worktreePath` field in place.
 */
export function createWorktreesForSubTasks(
  subTasks: SubTask[],
  gitRoot: string,
): SubTask[] {
  return subTasks.map((task) => {
    const result = createWorktree(task, gitRoot);
    return { ...task, worktreePath: result.path, branch: result.branch };
  });
}
