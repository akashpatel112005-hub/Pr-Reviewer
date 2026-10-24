import { App, Octokit } from 'octokit';
import { env } from '../config/env.js';
import { GitHubError } from './github.js';
import User from '../models/User.js';
import Installation from '../models/Installation.js';
import Repo from '../models/Repo.js';

let appInstance = null;

export function getAppPrivateKey() {
  const raw = env.githubAppPrivateKey || '';
  if (!raw) return '';
  if (raw.includes('BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return raw;
  }
}

export function getApp() {
  if (!env.githubAppId || !env.githubAppPrivateKey) {
    throw new GitHubError('GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY is not configured', { permanent: true });
  }
  if (!appInstance) {
    const privateKey = getAppPrivateKey();
    appInstance = new App({
      appId: env.githubAppId,
      privateKey,
    });
  }
  return appInstance;
}

// Returns an authenticated Octokit client for a specific installation of the GitHub App.
// If the installation was deleted or suspended, throws a permanent GitHubError so the worker does not retry.
export async function getInstallationOctokit(installationId) {
  if (!installationId) {
    throw new GitHubError('Missing installationId for GitHub App authentication', { permanent: true });
  }
  try {
    const app = getApp();
    return await app.getInstallationOctokit(Number(installationId));
  } catch (err) {
    const status = err.status;
    if (status === 404 || status === 401 || status === 403) {
      throw new GitHubError(
        `Installation ${installationId} is deleted, suspended, or unauthorized (${status}): ${err.message}`,
        { status, permanent: true }
      );
    }
    throw new GitHubError(`Failed to authenticate installation ${installationId}: ${err.message}`, {
      status,
      permanent: status >= 400 && status < 500,
    });
  }
}

// Lists all repositories accessible to an installation (paginated).
export async function listInstallationRepos(installationId) {
  const octokit = await getInstallationOctokit(installationId);
  try {
    const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    });
    return repos;
  } catch (err) {
    throw new GitHubError(`Failed to list repositories for installation ${installationId}: ${err.message}`, {
      status: err.status,
      permanent: err.status === 404 || err.status === 401,
    });
  }
}

// Automatically syncs installations and repositories for a signed-in user
export async function syncUserInstallations(user) {
  if (!env.githubAppId || !env.githubAppPrivateKey || !user?.login) return user?.installationIds || [];
  try {
    const app = getApp();
    const { data: installations } = await app.octokit.request('GET /app/installations');
    const matched = installations.filter(
      (inst) =>
        inst.account?.login?.toLowerCase() === user.login.toLowerCase() ||
        (user.githubId && inst.account?.id === user.githubId)
    );
    const instIds = matched.map((i) => i.id);
    if (instIds.length > 0) {
      if (user._id) {
        await User.updateOne({ _id: user._id }, { $addToSet: { installationIds: { $each: instIds } } });
      }
      user.installationIds = [...new Set([...(user.installationIds || []), ...instIds])];

      for (const inst of matched) {
        await Installation.findOneAndUpdate(
          { installationId: inst.id },
          {
            $set: {
              accountLogin: inst.account?.login || '',
              accountType: inst.account?.type || 'User',
              repositorySelection: inst.repository_selection || 'all',
              suspended: Boolean(inst.suspended_at),
            },
          },
          { upsert: true }
        );
        try {
          const ghRepos = await listInstallationRepos(inst.id);
          if (ghRepos && ghRepos.length > 0) {
            const ops = ghRepos.map((r) => ({
              updateOne: {
                filter: { installationId: inst.id, repoFullName: r.full_name },
                update: { $set: { githubRepoId: r.id, isPrivate: Boolean(r.private), enabled: true } },
                upsert: true,
              },
            }));
            await Repo.bulkWrite(ops);
          }
        } catch (rErr) {
          console.warn(`Could not list repos for installation ${inst.id}:`, rErr.message);
        }
      }
    }
    return user.installationIds;
  } catch (err) {
    console.warn('Could not auto-sync user installations from GitHub App:', err.message);
    return user.installationIds || [];
  }
}
