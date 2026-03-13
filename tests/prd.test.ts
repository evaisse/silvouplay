import { describe, it, expect } from 'vitest';
import { generatePRD } from '../src/prd.js';
import type { TaskPlan } from '../src/types.js';

const SAMPLE_PLAN: TaskPlan = {
  id: 'abc-123',
  title: 'Build an API',
  description: 'Goal: Build a REST API\nComponents: auth, routes',
  createdAt: '2026-03-13T00:00:00.000Z',
  designDecisions: [
    { question: 'Main goal?', answer: 'Build a REST API' },
    { question: 'Stack?', answer: 'Node.js + TypeScript' },
  ],
  subTasks: [
    {
      id: 'task-001',
      title: 'auth',
      description: 'Implement the auth component',
      dependencies: [],
      agent: 'codex',
      status: 'pending',
    },
    {
      id: 'task-002',
      title: 'routes',
      description: 'Implement the routes component',
      dependencies: ['task-001'],
      agent: 'claude-code',
      status: 'pending',
    },
  ],
  completionCriteria: ['All routes return correct status codes', 'Auth tests pass'],
};

describe('generatePRD', () => {
  it('includes the plan title as a heading', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('# PRD: Build an API');
  });

  it('includes all design decisions', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('Build a REST API');
    expect(prd).toContain('Node.js + TypeScript');
  });

  it('includes a task breakdown table with all sub-tasks', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('task-001');
    expect(prd).toContain('task-002');
    expect(prd).toContain('| Task Breakdown |'.slice(0, 3));
  });

  it('lists completion criteria as checkboxes', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('- [ ] All routes return correct status codes');
    expect(prd).toContain('- [ ] Auth tests pass');
  });

  it('contains the todo checklist section', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('## Todo Checklist');
  });

  it('marks each agent assignment in the checklist', () => {
    const prd = generatePRD(SAMPLE_PLAN);
    expect(prd).toContain('`codex`');
    expect(prd).toContain('`claude-code`');
  });
});
