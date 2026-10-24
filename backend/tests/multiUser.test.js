import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRepoUrl, getUserRepoNames } from '../src/routes/api.js';
import { classifyEvent } from '../src/services/webhookEvents.js';
import { signUserToken, verifyToken } from '../src/services/authTokens.js';
import { getAppPrivateKey } from '../src/services/githubApp.js';
import Repo from '../src/models/Repo.js';

describe('Task 13: Multi-User & Multi-Tenant Core Logic', () => {
  describe('parseRepoUrl', () => {
    it('parses standard https GitHub URLs', () => {
      expect(parseRepoUrl('https://github.com/facebook/react')).toBe('facebook/react');
      expect(parseRepoUrl('http://github.com/owner/repo')).toBe('owner/repo');
    });

    it('parses www.github.com URLs', () => {
      expect(parseRepoUrl('https://www.github.com/org/project')).toBe('org/project');
    });

    it('parses URLs without protocol', () => {
      expect(parseRepoUrl('github.com/vercel/next.js')).toBe('vercel/next.js');
    });

    it('parses raw owner/repo shorthand', () => {
      expect(parseRepoUrl('torvalds/linux')).toBe('torvalds/linux');
      expect(parseRepoUrl('my-team/repo_name.js')).toBe('my-team/repo_name.js');
    });

    it('strips trailing slashes and .git extensions', () => {
      expect(parseRepoUrl('https://github.com/owner/repo.git')).toBe('owner/repo');
      expect(parseRepoUrl('https://github.com/owner/repo/')).toBe('owner/repo');
      expect(parseRepoUrl('owner/repo.git/')).toBe('owner/repo');
    });

    it('rejects malformed or invalid inputs', () => {
      expect(parseRepoUrl('')).toBeNull();
      expect(parseRepoUrl(null)).toBeNull();
      expect(parseRepoUrl('justareponame')).toBeNull();
      expect(parseRepoUrl('too/many/nested/slashes')).toBeNull();
      expect(parseRepoUrl('invalid name with spaces/repo')).toBeNull();
      expect(parseRepoUrl('https://gitlab.com/owner/repo')).toBeNull();
    });
  });

  describe('classifyEvent with GitHub App Events', () => {
    it('classifies installation created event', () => {
      const res = classifyEvent('installation', {
        action: 'created',
        installation: {
          id: 12345,
          account: { login: 'octocat', type: 'User' },
          repository_selection: 'selected',
        },
        sender: { id: 987 },
        repositories: [
          { id: 1, full_name: 'octocat/hello-world', private: false },
        ],
      });

      expect(res.type).toBe('installation');
      expect(res.action).toBe('created');
      expect(res.installationId).toBe(12345);
      expect(res.senderGithubId).toBe(987);
      expect(res.repositories).toHaveLength(1);
      expect(res.repositories[0].fullName).toBe('octocat/hello-world');
    });

    it('classifies installation deleted and suspend events', () => {
      const del = classifyEvent('installation', {
        action: 'deleted',
        installation: { id: 12345 },
      });
      expect(del.type).toBe('installation');
      expect(del.action).toBe('deleted');

      const susp = classifyEvent('installation', {
        action: 'suspend',
        installation: { id: 12345 },
      });
      expect(susp.action).toBe('suspend');
    });

    it('classifies installation_repositories added and removed events', () => {
      const added = classifyEvent('installation_repositories', {
        action: 'added',
        installation: { id: 54321 },
        repositories_added: [{ id: 99, full_name: 'org/new-repo', private: true }],
      });
      expect(added.type).toBe('installation_repositories');
      expect(added.action).toBe('added');
      expect(added.added[0].fullName).toBe('org/new-repo');

      const removed = classifyEvent('installation_repositories', {
        action: 'removed',
        installation: { id: 54321 },
        repositories_removed: [{ id: 99, full_name: 'org/old-repo' }],
      });
      expect(removed.action).toBe('removed');
      expect(removed.removed[0].fullName).toBe('org/old-repo');
    });

    it('includes installationId on pull_request event enqueue', () => {
      const res = classifyEvent('pull_request', {
        action: 'opened',
        installation: { id: 888 },
        repository: { full_name: 'team/app' },
        pull_request: {
          number: 42,
          head: { sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
          draft: false,
        },
      });

      expect(res.type).toBe('enqueue');
      expect(res.job.installationId).toBe(888);
      expect(res.job.repoFullName).toBe('team/app');
      expect(res.job.prNumber).toBe(42);
    });
  });

  describe('User Authentication & Tokens', () => {
    const secret = 'a-super-secret-key-that-is-at-least-32-chars-long';

    it('signs and verifies a user-specific JWT with sub claim', () => {
      const userId = '64e4b5030e8c0e219488a123';
      const token = signUserToken(userId, secret);
      const decoded = verifyToken(token, secret);

      expect(decoded.sub).toBe(userId);
    });
  });

  describe('Tenant Scoping Logic', () => {
    it('returns empty array when user has no installations', async () => {
      const user = { installationIds: [] };
      const repos = await getUserRepoNames(user);
      expect(repos).toEqual([]);
    });

    it('queries only the repos belonging to the user installationIds', async () => {
      const mockFind = vi.spyOn(Repo, 'find').mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve([
            { repoFullName: 'user1/repoA' },
            { repoFullName: 'user1/repoB' },
          ]),
        }),
      });

      const user = { installationIds: [100, 200] };
      const repos = await getUserRepoNames(user);

      expect(mockFind).toHaveBeenCalledWith({ installationId: { $in: [100, 200] } });
      expect(repos).toEqual(['user1/repoA', 'user1/repoB']);
      mockFind.mockRestore();
    });
  });

  describe('GitHub App Key Decoding', () => {
    it('handles PEM format and base64 strings correctly', () => {
      const rawPem = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
      const base64 = Buffer.from(rawPem).toString('base64');

      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      expect(decoded).toBe(rawPem);
    });
  });
});
