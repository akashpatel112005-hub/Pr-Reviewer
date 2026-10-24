import { describe, it, expect } from 'vitest';
import { computeRisk, findSensitiveAreas, raiseLevel, maxLevel } from '../src/services/risk.js';

const crit = { severity: 'critical' };
const warn = { severity: 'warning' };

describe('computeRisk', () => {
  it('defaults to low with no signals', () => {
    expect(computeRisk({ findings: [], filenames: ['src/utils/format.js'] }).level).toBe('low');
  });
  it('keeps the model rating when nothing stricter applies', () => {
    expect(computeRisk({ llmRisk: 'medium', findings: [], filenames: ['a.js'] }).level).toBe('medium');
  });
  it('forces high when there is a critical finding, whatever the model said', () => {
    expect(computeRisk({ llmRisk: 'low', findings: [crit], filenames: ['a.js'] }).level).toBe('high');
  });
  it('gives at least medium for three or more warnings', () => {
    expect(computeRisk({ llmRisk: 'low', findings: [warn, warn, warn], filenames: ['a.js'] }).level).toBe('medium');
    expect(computeRisk({ llmRisk: 'low', findings: [warn, warn], filenames: ['a.js'] }).level).toBe('low');
  });
  it('raises one level for sensitive files', () => {
    expect(computeRisk({ llmRisk: 'low', findings: [], filenames: ['src/routes/auth.js'] }).level).toBe('medium');
    expect(computeRisk({ llmRisk: 'medium', findings: [], filenames: ['.github/workflows/deploy.yml'] }).level).toBe('high');
  });
  it('never goes above high', () => {
    expect(computeRisk({ llmRisk: 'high', findings: [crit], filenames: ['src/auth.js'] }).level).toBe('high');
  });
  it('ignores an invalid model rating', () => {
    expect(computeRisk({ llmRisk: 'banana', findings: [], filenames: ['a.js'] }).level).toBe('low');
  });
  it('explains itself with signals', () => {
    const { signals } = computeRisk({ findings: [crit], filenames: ['src/auth.js'] });
    expect(signals.join(' ')).toMatch(/critical/);
    expect(signals.join(' ')).toMatch(/authentication/);
  });
});

describe('helpers', () => {
  it('detects sensitive areas without false positives', () => {
    expect(findSensitiveAreas(['src/routes/auth.js'])).toContain('authentication');
    expect(findSensitiveAreas(['src/author.js', 'README.md'])).toEqual([]);
  });
  it('raises and compares levels', () => {
    expect(raiseLevel('low')).toBe('medium');
    expect(raiseLevel('high')).toBe('high');
    expect(maxLevel('low', 'high')).toBe('high');
  });
});