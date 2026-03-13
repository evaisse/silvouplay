# agent-task-loop

`agent-task-loop` is a small CLI that turns one coding task into a persisted execution plan, splits it into parallel sub-tasks, assigns those sub-tasks to coding agents, optionally creates git worktrees, then runs the agents and tracks status.

## What It Does

The CLI revolves around three commands:

- `svp plan` collects or wraps a task description, generates a `PRD.md`, and saves a machine-readable `plan.json`
- `svp run` launches one agent process per sub-task
- `svp status` reads the saved plan and shows the current state of each sub-task

Supported agent backends are:

- `codex`
- `claude-code`
- `gemini`
- `opencode`

## Workflow

![Workflow diagram](docs/workflow.svg)

The source for the diagram lives in `WORKFLOW.mmd`. Run `npm run render:workflow` to regenerate the committed SVG locally. A GitHub Actions workflow also renders and commits `docs/workflow.svg` automatically whenever `WORKFLOW.mmd` changes.

## How It Works

### 1. Planning

`svp plan` supports two planning modes:

- Interactive mode asks for the goal, main components, preferred stack, constraints, and completion criteria. It also lets you choose which agents to use.
- Non-interactive mode uses the raw task description as-is. This works best when the prompt already includes either `Components: a, b, c` or a Markdown `## Components` list.

The command writes its artifacts to `.task-loop/` by default:

- `.task-loop/plan.json`
- `.task-loop/PRD.md`

### 2. Task Splitting

If the task description includes explicit components, the splitter creates one sub-task per component.

If not, it falls back to a default breakdown:

- Project setup and configuration
- Core implementation
- Tests
- Documentation

Each generated sub-task gets:

- an id such as `task-001`
- a branch-friendly slug
- a status, initially `pending`
- a shallow dependency list

### 3. Agent Assignment

Agent assignment is heuristic, not model-driven orchestration. Each sub-task is matched against the declared strengths of the available agents:

- `codex`: code generation, refactoring, tests, documentation
- `claude-code`: architecture, complex reasoning, planning, code review
- `gemini`: research, summarisation, multimodal tasks, data analysis
- `opencode`: code editing, debugging, terminal tasks, file operations

If no keyword match stands out, assignment falls back to round-robin distribution across the requested agents.

### 4. Optional Git Worktrees

When you pass `--worktrees` inside a git repository, `svp plan` creates one worktree per sub-task under `.worktrees/<branch>`. This gives each agent an isolated checkout while keeping one shared plan in `.task-loop/`.

### 5. Execution and Status

`svp run` reads `plan.json` and starts every sub-task in parallel by spawning the configured agent CLI with the task title and description as the prompt.

`svp status` then reports the saved status of every task in the plan.

## Current Limitations

- Runtime execution is fully parallel. Dependencies are recorded in the plan, but they are not enforced by the runner.
- A failed or missing agent binary marks the corresponding task as `failed`, but the runner does not currently implement retries or resume logic.
- Test coverage is strongest around pure planning and rendering logic. End-to-end CLI orchestration is covered by smoke tests rather than a full scheduler.

## Prerequisites

- Node.js 22
- npm
- git, if you want `--worktrees`
- the agent CLIs you intend to run on your `PATH`

## Local Usage

Install dependencies:

```bash
npm install
```

Run the CLI directly from source during development:

```bash
npm run dev -- plan --task $'Build the feature\nComponents: tests, architecture, research, file operations' --agents codex,claude-code,gemini,opencode --no-interactive
npm run dev -- run
npm run dev -- status
```

Build the distributable CLI:

```bash
npm run build
node dist/cli.js plan --task "Improve the README" --no-interactive
```

## Testing The Loop

### Unit And Smoke Tests

Run the full automated suite:

```bash
npm test
```

Run only the CLI smoke test layer:

```bash
npm run test:smoke
```

The smoke tests do not require real agent CLIs. They create temporary stub binaries named `codex`, `claude`, `gemini`, and `opencode`, then exercise the real CLI through:

- `plan`
- `run`
- `status`
- a failing agent case
- a missing binary case
- a `--worktrees` case inside a temporary git repository

### Dry-Run Validation

To validate the plan and command construction without invoking real agents:

```bash
npm run dev -- plan --task $'Ship a change\nComponents: tests, architecture' --agents codex,claude-code --no-interactive
npm run dev -- run --dry-run
npm run dev -- status
```

### Manual End-To-End Check

To test against real agent CLIs:

1. Ensure the chosen agent binaries are installed and available on `PATH`.
2. Generate a plan with components that map cleanly to those agents.
3. Run `svp run` or `npm run dev -- run`.
4. Inspect `.task-loop/plan.json`, `.task-loop/PRD.md`, terminal output, and optional `.worktrees/` directories.

## Diagram Automation

Regenerate the committed SVG locally:

```bash
npm run render:workflow
```

CI now targets Node 22 only. The separate render workflow keeps `docs/workflow.svg` in sync with `WORKFLOW.mmd` and commits the SVG back to the branch when it changes.
