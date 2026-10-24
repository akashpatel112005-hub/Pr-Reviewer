export const SEVERITIES = ['critical', 'warning', 'suggestion'];

export class ReviewValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewValidationError';
  }
}

export function stripFences(text) {
  return String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// Parses model output into a validated { findings } object. Throws ReviewValidationError.
export function parseFindings(raw) {
  let text = stripFences(raw);
  // Models sometimes add a sentence around the JSON; take the outermost object.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ReviewValidationError('no JSON object found');
  text = text.slice(start, end + 1);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ReviewValidationError('not valid JSON');
  }
  if (!data || !Array.isArray(data.findings)) throw new ReviewValidationError('missing "findings" array');

  const findings = [];
  for (const f of data.findings) {
    if (!f || typeof f !== 'object') continue;
    const line = Number(f.line);
    const severity = String(f.severity || '').toLowerCase();
    if (typeof f.file !== 'string' || !f.file) continue;
    if (!Number.isInteger(line) || line < 1) continue;
    if (!SEVERITIES.includes(severity)) continue;
    if (typeof f.message !== 'string' || !f.message.trim()) continue;
    findings.push({
      file: f.file,
      line,
      severity,
      category: typeof f.category === 'string' && f.category ? f.category : 'general',
      message: f.message.trim(),
      suggestion: typeof f.suggestion === 'string' ? f.suggestion.trim() : '',
    });
  }
  return { findings };
}

// Drops findings whose file/line are not in the diff (hallucinated locations).
export function verifyAgainstDiff(findings, chunk) {
  const valid = new Map(chunk.map((f) => [f.filename, new Set(f.commentableLines)]));
  const kept = [];
  const dropped = [];
  for (const f of findings) {
    if (valid.get(f.file)?.has(f.line)) kept.push(f);
    else dropped.push(f);
  }
  return { kept, dropped };
}
