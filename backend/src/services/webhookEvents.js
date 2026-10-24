const HANDLED_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/i;

// Decides what to do with a verified GitHub event. Pure function: no I/O.
// Returns { type: 'ping' | 'ignore' | 'invalid' | 'enqueue' | 'installation' | 'installation_repositories', ... }
export function classifyEvent(event, payload) {
  if (event === 'ping') return { type: 'ping' };
  if (!payload || typeof payload !== 'object') return { type: 'invalid', reason: 'payload is not an object' };

  if (event === 'installation') {
    const action = payload.action;
    const installationId = payload.installation?.id;
    if (!installationId) return { type: 'invalid', reason: 'missing installation.id' };

    return {
      type: 'installation',
      action,
      installationId: Number(installationId),
      accountLogin: payload.installation?.account?.login || '',
      accountType: payload.installation?.account?.type || 'User',
      repositorySelection: payload.installation?.repository_selection || 'all',
      senderGithubId: payload.sender?.id ? Number(payload.sender.id) : null,
      repositories: (payload.repositories || []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        isPrivate: Boolean(r.private),
      })),
    };
  }

  if (event === 'installation_repositories') {
    const action = payload.action;
    const installationId = payload.installation?.id;
    if (!installationId) return { type: 'invalid', reason: 'missing installation.id' };

    return {
      type: 'installation_repositories',
      action,
      installationId: Number(installationId),
      added: (payload.repositories_added || []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        isPrivate: Boolean(r.private),
      })),
      removed: (payload.repositories_removed || []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
      })),
    };
  }

  if (event !== 'pull_request') {
    return { type: 'ignore', reason: `event "${event}" is not handled` };
  }

  if (!HANDLED_ACTIONS.has(payload.action)) {
    return { type: 'ignore', reason: `action "${payload.action}" is not handled` };
  }

  const pr = payload.pull_request;
  const repoFullName = payload.repository?.full_name;
  const prNumber = pr?.number;
  const headSha = pr?.head?.sha;
  const installationId = payload.installation?.id;

  if (typeof repoFullName !== 'string' || !REPO_RE.test(repoFullName)) {
    return { type: 'invalid', reason: 'missing or malformed repository name' };
  }
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    return { type: 'invalid', reason: 'missing or malformed pull request number' };
  }
  if (typeof headSha !== 'string' || !SHA_RE.test(headSha)) {
    return { type: 'invalid', reason: 'missing or malformed head commit SHA' };
  }
  if (pr.draft === true) return { type: 'ignore', reason: 'draft pull request' };

  return {
    type: 'enqueue',
    job: {
      repoFullName,
      prNumber,
      headSha: headSha.toLowerCase(),
      installationId: installationId ? Number(installationId) : undefined,
    },
  };
}
