import { describe, it, expect } from 'vitest';
import { buildNonInteractivePlan } from '../src/planner.js';

describe('buildNonInteractivePlan', () => {
  it('uses the description as the title when it is short enough', () => {
    const result = buildNonInteractivePlan('Build a REST API');
    expect(result.title).toBe('Build a REST API');
  });

  it('truncates long descriptions to 80 characters in the title', () => {
    const long = 'A'.repeat(100);
    const result = buildNonInteractivePlan(long);
    expect(result.title.length).toBeLessThanOrEqual(80);
    expect(result.title.endsWith('...')).toBe(true);
  });

  it('strips leading # from markdown headings for the title', () => {
    const md = '# Build an Authentication System\n\nSome details here.';
    const result = buildNonInteractivePlan(md);
    expect(result.title).toBe('Build an Authentication System');
  });

  it('includes a default completion criterion', () => {
    const result = buildNonInteractivePlan('Some task');
    expect(result.completionCriteria.length).toBeGreaterThan(0);
  });

  it('includes a design decision wrapping the description', () => {
    const result = buildNonInteractivePlan('My task description');
    expect(result.designDecisions).toHaveLength(1);
    expect(result.designDecisions[0].answer).toBe('My task description');
  });

  it('defaults to codex as the suggested agent', () => {
    const result = buildNonInteractivePlan('Task');
    expect(result.suggestedAgents).toContain('codex');
  });
});
