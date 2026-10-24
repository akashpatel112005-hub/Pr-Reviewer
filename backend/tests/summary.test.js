import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/llm.js', () => ({ callLLM: vi.fn() }));

import { callLLM } from '../src/services/llm.js';
import { summarizePR, parseSummaryResponse, SummaryParseError } from '../src/services/summary.js';

const files = [{ filename: 'src/app.js', status: 'modified', additions: 3, deletions: 1 }];
const reply = JSON.stringify({
  summary: 'Adds a user endpoint.',
  changes: ['Adds GET /user'],
  risk_level: 'low',
  risk_reason: 'Small change.',
});

beforeEach(() => {
  callLLM.mockReset();
});

describe('parseSummaryResponse', () => {
  it('parses a valid reply', () => {
    const r = parseSummaryResponse(reply);
    expect(r.summary).toBe('Adds a user endpoint.');
    expect(r.riskLevel).toBe('low');
  });
  it('accepts fenced JSON and maps risk synonyms', () => {
    const fenced = '```json\n' + JSON.stringify({ summary: 'x', risk_level: 'Moderate' }) + '\n```';
    expect(parseSummaryResponse(fenced).riskLevel).toBe('medium');
  });
  it('rejects a reply with no summary text', () => {
    expect(() => parseSummaryResponse('{"changes":[]}')).toThrow(SummaryParseError);
    expect(() => parseSummaryResponse('not json')).toThrow(SummaryParseError);
  });
});

describe('summarizePR', () => {
  it('returns a summary and a risk level', async () => {
    callLLM.mockResolvedValueOnce(reply);
    const r = await summarizePR({ title: 't', body: '', files, findings: [] });
    expect(r.summary).toBe('Adds a user endpoint.');
    expect(r.riskLevel).toBe('low');
    expect(r.summaryError).toBeNull();
  });
  it('forces high risk when there is a critical finding, even if the model said low', async () => {
    callLLM.mockResolvedValueOnce(reply);
    const r = await summarizePR({ title: 't', body: '', files, findings: [{ severity: 'critical' }] });
    expect(r.llmRiskLevel).toBe('low');
    expect(r.riskLevel).toBe('high');
  });
  it('repairs a malformed reply with one retry', async () => {
    callLLM.mockResolvedValueOnce('here is prose').mockResolvedValueOnce(reply);
    const r = await summarizePR({ title: 't', body: '', files, findings: [] });
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(r.summary).toBe('Adds a user endpoint.');
  });
  it('records the gap and still computes risk when the summary call fails', async () => {
    callLLM.mockImplementation(async () => { throw new Error('boom'); });
    const r = await summarizePR({ title: 't', body: '', files, findings: [{ severity: 'critical' }] });
    expect(r.summary).toBeNull();
    expect(r.summaryError).toBe('boom');
    expect(r.riskLevel).toBe('high');
  });
});