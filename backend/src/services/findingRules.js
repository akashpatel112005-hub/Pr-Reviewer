const SECRET_WORDS = /\b(secrets?|api[\s_-]?keys?|passwords?|passwd|tokens?|credentials?|private[\s_-]?keys?)\b/i;
// Models sometimes write a non-breaking hyphen (U+2011), so the range below covers it.
const HARDCODED = /(hard[\s\-\u2010-\u2015]?coded|plain[\s\-\u2010-\u2015]?text|embedded in|committed to|checked into)/i;

// A secret sitting in source code is always critical, whatever severity the model chose.
export function escalateFindings(findings) {
  return findings.map((f) => {
    if (f.severity === 'critical') return f;
    const text = `${f.message || ''} ${f.suggestion || ''}`;
    if (SECRET_WORDS.test(f.message || '') && HARDCODED.test(text)) {
      return { ...f, severity: 'critical', escalated: true };
    }
    return f;
  });
}