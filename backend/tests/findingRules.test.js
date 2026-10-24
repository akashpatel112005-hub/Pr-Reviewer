import { describe, it, expect } from 'vitest';
import { escalateFindings } from '../src/services/findingRules.js';

const f = (over = {}) => ({ file: 'a.js', line: 1, severity: 'warning', category: 'security', message: 'x', suggestion: '', ...over });

describe('escalateFindings', () => {
  it('raises a hard-coded secret to critical', () => {
    const [r] = escalateFindings([f({ message: 'API key is hard-coded in source code' })]);
    expect(r.severity).toBe('critical');
    expect(r.escalated).toBe(true);
  });
  it('handles the non-breaking hyphen that models sometimes output', () => {
    const [r] = escalateFindings([f({ message: 'API key is hard\u2011coded in source code' })]);
    expect(r.severity).toBe('critical');
  });
  it('catches plain-text passwords', () => {
    const [r] = escalateFindings([f({ message: 'Password is stored in plain text' })]);
    expect(r.severity).toBe('critical');
  });
  it('leaves unrelated findings alone', () => {
    const [a, b] = escalateFindings([
      f({ message: 'Token validation is missing in the handler' }),
      f({ message: 'Database errors are not caught', severity: 'suggestion' }),
    ]);
    expect(a.severity).toBe('warning');
    expect(b.severity).toBe('suggestion');
  });
  it('keeps critical findings as they are and does not change the input', () => {
    const input = [f({ severity: 'critical', message: 'secret hard-coded' }), f({ message: 'API key is hard-coded' })];
    const out = escalateFindings(input);
    expect(out[0]).toBe(input[0]);
    expect(input[1].severity).toBe('warning');
  });
});