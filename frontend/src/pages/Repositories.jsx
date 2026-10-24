import { useState } from 'react';
import { api } from '../api/client.js';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { timeAgo } from '../utils/format.js';

export default function Repositories() {
  const { data, error, loading, reload } = useFetch('/api/repos', { refreshMs: 20000 });
  const [repoUrl, setRepoUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [actionNotice, setActionNotice] = useState(null);
  const [actionBusyId, setActionBusyId] = useState('');

  async function handleLookup(e) {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setChecking(true);
    setLookupError('');
    setLookupResult(null);
    setActionNotice(null);

    try {
      const res = await api('/api/repos/lookup', {
        method: 'POST',
        body: { url: repoUrl.trim() },
      });
      setLookupResult(res);
      if (res.status === 'connected') {
        reload();
      }
    } catch (err) {
      setLookupError(err.message || 'Failed to check repository');
    } finally {
      setChecking(false);
    }
  }

  async function toggleEnabled(repo) {
    setActionBusyId(repo.id);
    setActionNotice(null);
    try {
      const updated = await api(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        body: { enabled: !repo.enabled },
      });
      setActionNotice({ type: 'ok', text: `${repo.repoFullName}: ${updated.message}` });
      reload();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setActionBusyId('');
    }
  }

  async function handleReviewOpenPRs(repo) {
    setActionBusyId(repo.id);
    setActionNotice(null);
    try {
      const res = await api(`/api/repos/${repo.id}/review-open-prs`, {
        method: 'POST',
      });
      setActionNotice({ type: 'ok', text: `${repo.repoFullName}: ${res.message}` });
      reload();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setActionBusyId('');
    }
  }

  return (
    <>
      <div className="row">
        <div>
          <h1>Connected Repositories</h1>
          <p className="muted">Manage repositories authorized via the AI PR Reviewer GitHub App.</p>
        </div>
        <button className="btn btn-outline" onClick={reload} disabled={loading}>
          Refresh
        </button>
      </div>

      {actionNotice && (
        <div className={actionNotice.type === 'ok' ? 'notice' : 'error'} role="status" style={{ marginBottom: '1.5rem' }}>
          {actionNotice.text}
        </div>
      )}

      {/* 3-Step Setup Guide */}
      <div className="card guide-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Connecting a Repository</h3>
        <ol className="guide-steps">
          <li>Paste your repository link below (e.g. <code>github.com/owner/repo</code> or <code>owner/repo</code>).</li>
          <li>If the bot is not yet installed on that account/repo, click <strong>Install on GitHub</strong>.</li>
          <li>Once installed, incoming pull requests will be automatically reviewed, or click <strong>Review open PRs</strong> to review existing ones right now.</li>
        </ol>
      </div>

      {/* Paste-a-link connect box */}
      <div className="card lookup-card" style={{ marginBottom: '2rem' }}>
        <h3>Connect New Repository</h3>
        <form onSubmit={handleLookup} className="lookup-form">
          <input
            type="text"
            className="input"
            placeholder="e.g. owner/repo or https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={checking}
          />
          <button type="submit" className="btn btn-primary" disabled={checking || !repoUrl.trim()}>
            {checking ? 'Checking...' : 'Connect / Check'}
          </button>
        </form>

        {lookupError && <div className="error" style={{ marginTop: '1rem' }}>{lookupError}</div>}

        {lookupResult && (
          <div className="lookup-result" style={{ marginTop: '1rem' }}>
            {lookupResult.status === 'connected' ? (
              <div className="notice">
                <strong>Connected!</strong> Reviews are {lookupResult.repo.enabled ? 'active' : 'paused'} for{' '}
                <code>{lookupResult.repo.repoFullName}</code>.
              </div>
            ) : (
              <div className="card" style={{ background: '#f6f8fa', border: '1px solid #d0d7de', padding: '1rem' }}>
                <p>
                  Repository <code>{lookupResult.repoFullName}</code> is not yet connected to this workspace.
                </p>
                <a
                  className="btn btn-primary"
                  href={lookupResult.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.5rem' }}
                >
                  Install GitHub App on this repository &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connected Repositories List */}
      <h2>Your Repositories</h2>

      {loading && <Loader />}
      {!loading && error && !data && <ErrorState message={error} onRetry={reload} />}

      {data && data.items.length === 0 && (
        <EmptyState title="No repositories connected yet">
          Paste a repository link above to connect your first repo and start automated code reviews.
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Visibility</th>
                <th>Status</th>
                <th>Reviews</th>
                <th>Latest Review</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((repo) => (
                <tr key={repo.id}>
                  <td>
                    <strong>
                      <a href={`https://github.com/${repo.repoFullName}`} target="_blank" rel="noreferrer">
                        {repo.repoFullName}
                      </a>
                    </strong>
                  </td>
                  <td>
                    <span className="badge-pill small">{repo.isPrivate ? 'Private' : 'Public'}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${repo.enabled ? 'done' : 'failed'}`}>
                      {repo.enabled ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td>{repo.reviewCount} review(s)</td>
                  <td>
                    {repo.latestReview ? (
                      <div>
                        {repo.latestReview.riskLevel && (
                          <Badge kind="risk" value={repo.latestReview.riskLevel} />
                        )}{' '}
                        <span className="muted small">{timeAgo(repo.latestReview.createdAt)}</span>
                      </div>
                    ) : (
                      <span className="muted small">No reviews yet</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="chips" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-outline"
                        disabled={actionBusyId === repo.id}
                        onClick={() => handleReviewOpenPRs(repo)}
                        title="Review up to 5 existing open PRs immediately"
                      >
                        {actionBusyId === repo.id ? 'Queuing...' : 'Review open PRs'}
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={actionBusyId === repo.id}
                        onClick={() => toggleEnabled(repo)}
                      >
                        {repo.enabled ? 'Pause' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
