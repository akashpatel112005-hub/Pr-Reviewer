export const REVIEW_SYSTEM_PROMPT = `You are a senior engineer doing a first-pass code review of a pull request diff.

Focus ONLY on: real bugs, security problems (injection, hardcoded secrets, unsafe input handling), missing error handling, and clearly bad practices.
Ignore style, formatting, naming and other nitpicks. If the code looks fine, return no findings.

Each diff line is prefixed with its line number in the new file (for example "L12 + code"). Lines starting with "-" were deleted and have no number.
Only report on lines that have a line number. Use that exact number.

Respond with JSON ONLY. No markdown, no code fences, no text before or after. Format:
{"findings":[{"file":"path/to/file.js","line":12,"severity":"critical|warning|suggestion","category":"bug|security|error-handling|performance|best-practice","message":"what is wrong and why it matters","suggestion":"how to fix it"}]}

Severity: critical = exploitable or will break in production; warning = likely problem; suggestion = worthwhile improvement.`;

export function buildReviewPrompt(chunk) {
  const body = chunk.map((f) => `=== FILE: ${f.filename} ===\n${f.annotated}`).join('\n\n');
  return { system: REVIEW_SYSTEM_PROMPT, user: `Review this diff.\n\n${body}` };
}

// Used for the single retry when the first answer was not valid JSON.
export function buildRepairPrompt(chunk, badOutput, problem) {
  const original = buildReviewPrompt(chunk);
  return {
    system: REVIEW_SYSTEM_PROMPT,
    user: `${original.user}\n\nYour previous answer was invalid (${problem}). It started with:\n${String(badOutput).slice(0, 300)}\n\nReply again with ONLY the JSON object in the required format.`,
  };
}
