import { describe, it, expect, vi } from 'vitest';
import { reviewChunk, reviewChunks, ReviewEngineError } from '../src/services/reviewEngine.js';

const chunk = [{ filename: 'src/a.js', annotated: 'L1 + x', commentableLines: [1, 2, 3] }];
const good = { findings: [{ file: 'src/a.js', line: 2, severity: 'critical', category: 'security', message: 'SQL injection', suggestion: 'Use params' }] };

describe('reviewChunk', () => {
  it('accepts valid JSON', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(good));
    const { kept } = await reviewChunk(chunk, { llm });
    expect(kept).toHaveLength(1);
    expect(llm).toHaveBeenCalledTimes(1);
  });
  it('accepts JSON wrapped in code fences', async () => {
    const llm = vi.fn().mockResolvedValue('```json\n' + JSON.stringify(good) + '\n```');
    expect((await reviewChunk(chunk, { llm })).kept).toHaveLength(1);
  });
  it('repairs once after malformed output', async () => {
    const llm = vi.fn().mockResolvedValueOnce('Sure! here are issues').mockResolvedValueOnce(JSON.stringify(good));
    expect((await reviewChunk(chunk, { llm })).kept).toHaveLength(1);
    expect(llm).toHaveBeenCalledTimes(2);
  });
  it('throws a typed error after two malformed answers', async () => {
    const llm = vi.fn().mockResolvedValue('nope');
    await expect(reviewChunk(chunk, { llm })).rejects.toBeInstanceOf(ReviewEngineError);
    expect(llm).toHaveBeenCalledTimes(2);
  });
  it('discards hallucinated lines and files', async () => {
    const bad = { findings: [
      { ...good.findings[0], line: 99 },
      { ...good.findings[0], file: 'other.js' },
      good.findings[0],
    ] };
    const llm = vi.fn().mockResolvedValue(JSON.stringify(bad));
    const { kept, dropped } = await reviewChunk(chunk, { llm });
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(2);
  });
});

describe('reviewChunks', () => {
  it('merges and de-duplicates across chunks', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(good));
    const { findings } = await reviewChunks([chunk, chunk], { llm });
    expect(findings).toHaveLength(1);
  });
});
