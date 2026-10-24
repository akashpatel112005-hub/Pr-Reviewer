const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'composer.lock', 'Gemfile.lock', 'poetry.lock', 'Cargo.lock', 'go.sum',
]);
const SKIP_DIRS = ['node_modules/', 'dist/', 'build/', 'vendor/', '.next/', 'coverage/', '__pycache__/'];
const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|gz|tar|jar|woff2?|ttf|eot|mp3|mp4|mov|exe|dll|so|class|pyc|map|snap)$/i;
const MINIFIED = /\.min\.(js|css)$/i;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Returns a reason string if the file should not be reviewed, otherwise null.
export function getSkipReason(file) {
  const name = file.filename;
  const base = name.split('/').pop();
  if (file.status === 'removed') return 'deleted file';
  if (LOCKFILES.has(base)) return 'lockfile';
  if (SKIP_DIRS.some((d) => name.startsWith(d) || name.includes('/' + d))) return 'generated or vendored folder';
  if (MINIFIED.test(name)) return 'minified file';
  if (SKIP_EXTENSIONS.test(name)) return 'binary, asset, or generated file type';
  if (!file.patch) return 'no diff available (binary or too large)';
  return null;
}

// Walks a unified-diff patch and tracks the real line number in the NEW file.
// These numbers are what GitHub needs for inline comments (Task 4).
export function parsePatch(patch) {
  const lines = [];
  let newLine = 0;
  let inHunk = false;

  for (const raw of patch.split('\n')) {
    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      lines.push({ type: 'hunk', line: null, text: raw });
      continue;
    }
    if (!inHunk || raw === '' || raw.startsWith('\\')) continue;

    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === '+') {
      lines.push({ type: 'add', line: newLine, text });
      newLine += 1;
    } else if (marker === '-') {
      lines.push({ type: 'del', line: null, text });
    } else {
      lines.push({ type: 'context', line: newLine, text });
      newLine += 1;
    }
  }
  return lines;
}

// Text for the LLM prompt: every visible line carries its real line number.
export function annotatePatch(patch) {
  return parsePatch(patch)
    .map((l) => {
      if (l.type === 'hunk') return l.text;
      if (l.type === 'add') return `L${l.line} + ${l.text}`;
      if (l.type === 'del') return `     - ${l.text}`;
      return `L${l.line}   ${l.text}`;
    })
    .join('\n');
}

// Lines GitHub accepts inline comments on (right side: added and context lines).
export function getCommentableLines(patch) {
  return new Set(parsePatch(patch).filter((l) => l.line !== null).map((l) => l.line));
}

export function prepareDiff(files, { maxChars = 24000, maxFiles = 40 } = {}) {
  const skipped = [];
  const candidates = [];

  for (const f of files) {
    const reason = getSkipReason(f);
    if (reason) skipped.push({ file: f.filename, reason });
    else candidates.push(f);
  }

  const reviewable = [];
  const truncated = [];

  for (const f of candidates) {
    if (reviewable.length >= maxFiles) {
      skipped.push({ file: f.filename, reason: `over the ${maxFiles}-file limit` });
      continue;
    }
    let annotated = annotatePatch(f.patch);
    let wasTruncated = false;
    if (annotated.length > maxChars) {
      annotated = annotated.slice(0, maxChars) + '\n... [diff truncated]';
      wasTruncated = true;
      truncated.push(f.filename);
    }
    reviewable.push({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      annotated,
      commentableLines: [...getCommentableLines(f.patch)],
      truncated: wasTruncated,
    });
  }

  // Greedy packing: keep each chunk under the character budget.
  const chunks = [];
  let current = [];
  let size = 0;
  for (const f of reviewable) {
    const len = f.annotated.length;
    if (current.length > 0 && size + len > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += len;
  }
  if (current.length > 0) chunks.push(current);

  return { reviewable, skipped, truncated, chunks };
}