export const LEVELS = ['low', 'medium', 'high'];

const SENSITIVE_AREAS = [
  { label: 'authentication', re: /(^|[\/._-])(auth|authn|authz|authentication|authorization|login|signin|session|oauth|jwt|passport|password)([\/._-]|$)/i },
  { label: 'payments', re: /(payment|billing|checkout|stripe|paypal|invoice)/i },
  { label: 'secrets or environment config', re: /(^|\/)\.env|secret|credential/i },
  { label: 'configuration or deployment', re: /(^|\/)(config|settings)[\/.]|dockerfile|docker-compose|\.github\/workflows|terraform/i },
  { label: 'database migrations', re: /migration/i },
];

export function maxLevel(a, b) {
  return LEVELS[Math.max(LEVELS.indexOf(a), LEVELS.indexOf(b))];
}

export function raiseLevel(level) {
  return LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)];
}

export function findSensitiveAreas(filenames) {
  const found = new Set();
  for (const name of filenames) {
    for (const area of SENSITIVE_AREAS) {
      if (area.re.test(name)) found.add(area.label);
    }
  }
  return [...found];
}

// Final risk = the stricter of the model's rating and rule-based checks.
export function computeRisk({ llmRisk = null, findings = [], filenames = [] } = {}) {
  const signals = [];
  let level = LEVELS.includes(llmRisk) ? llmRisk : 'low';

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  if (critical > 0) {
    level = maxLevel(level, 'high');
    signals.push(`${critical} critical finding${critical > 1 ? 's' : ''}`);
  } else if (warnings >= 3) {
    level = maxLevel(level, 'medium');
    signals.push(`${warnings} warnings`);
  }

  const areas = findSensitiveAreas(filenames);
  if (areas.length > 0) {
    level = raiseLevel(level);
    signals.push(`touches ${areas.join(', ')}`);
  }

  return { level, signals };
}