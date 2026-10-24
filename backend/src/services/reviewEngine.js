import { callLLM } from './llm.js';
import { buildReviewPrompt, buildRepairPrompt } from './prompt.js';
import { parseFindings, verifyAgainstDiff, ReviewValidationError } from './reviewSchema.js';

export class ReviewEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewEngineError';
    this.permanent = false; // a fresh attempt may produce valid output
  }
}

const RANK = { critical: 3, warning: 2, suggestion: 1 };

// One chunk -> validated findings. One repair retry on invalid output, then a typed error.
export async function reviewChunk(chunk, { llm = callLLM } = {}) {
  const first = await llm(buildReviewPrompt(chunk));
  let parsed;
  try {
    parsed = parseFindings(first);
  } catch (err) {
    if (!(err instanceof ReviewValidationError)) throw err;
    const second = await llm(buildRepairPrompt(chunk, first, err.message));
    try {
      parsed = parseFindings(second);
    } catch (err2) {
      if (!(err2 instanceof ReviewValidationError)) throw err2;
      throw new ReviewEngineError(`The model returned invalid JSON twice (${err2.message})`);
    }
  }
  return verifyAgainstDiff(parsed.findings, chunk);
}

// Same file + line + category = same issue; keep the more severe one.
export function dedupe(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const prev = map.get(key);
    if (!prev || RANK[f.severity] > RANK[prev.severity]) map.set(key, f);
  }
  return [...map.values()];
}

export async function reviewChunks(chunks, opts) {
  const all = [];
  let droppedCount = 0;
  for (const chunk of chunks) {
    const { kept, dropped } = await reviewChunk(chunk, opts);
    all.push(...kept);
    droppedCount += dropped.length;
  }
  return { findings: dedupe(all), droppedCount };
}
