import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  const [actionBusy, setActionBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

  // Dedicated window/modal state for the selected repository
  const [selectedRepo, setSelectedRepo] = useState(null);

  // Filter repositories by search term
  const filteredRepos = useMemo(() => {
    if (!data?.items) return [];
    if (!searchTerm.trim()) return data.items;
    const term = searchTerm.toLowerCase().trim();
    return data.items.filter((r) => r.repoFullName.toLowerCase().includes(term));
  }, [data, searchTerm]);

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
    setActionBusy(true);
    setActionNotice(null);
    try {
      const updated = await api(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        body: { enabled: !repo.enabled },
      });
      const updatedRepo = { ...repo, enabled: !repo.enabled };
      setSelectedRepo(updatedRepo);
      setActionNotice({ type: 'ok', text: `${repo.repoFullName}: ${updated.message}` });
      reload();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReviewOpenPRs(repo) {
    setActionBusy(true);
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
      setActionBusy(false);
    }
  }

  return (
    <>
      {/* Top Header */}
      <div className="row" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1>Repositories</h1>
          <p className="muted" style={{ margin: 0 }}>
            Repositories authorized for autonomous AI code review. Click any repository to manage and trigger reviews.
          </p>
        </div>

        <div className="chips">
          <button
            className={`btn ${showConnectForm ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowConnectForm(!showConnectForm)}
          >
            {showConnectForm ? 'Close Connect' : '+ Connect Repository'}
          </button>
          <button className="btn btn-outline" onClick={reload} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {actionNotice && (
        <div
          className={actionNotice.type === 'ok' ? 'notice' : 'error'}
          role="status"
          style={{ marginBottom: '1.5rem' }}
        >
          {actionNotice.text}
        </div>
      )}

      {/* Connect Repository Collapsible Panel */}
      {showConnectForm && (
        <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Connect New Repository</h3>
            <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>Fast GitHub App Linkage</span>
          </div>

          <p className="muted small">
            Paste your GitHub repository URL (e.g. <code>owner/repo</code> or <code>https://github.com/owner/repo</code>).
          </p>

          <form onSubmit={handleLookup} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              placeholder="e.g. username/repo or https://github.com/username/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={checking}
              style={{ flex: 1, minWidth: '260px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={checking || !repoUrl.trim()}>
              {checking ? 'Checking...' : 'Check / Connect'}
            </button>
          </form>

          {lookupError && <div className="error" style={{ marginTop: '1rem' }}>{lookupError}</div>}

          {lookupResult && (
            <div style={{ marginTop: '1.25rem' }}>
              {lookupResult.status === 'connected' ? (
                <div className="notice">
                  <strong>Connected!</strong> Reviews are currently {lookupResult.repo.enabled ? 'active' : 'paused'} for{' '}
                  <code>{lookupResult.repo.repoFullName}</code>.
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '1.25rem',
                  }}
                >
                  <p style={{ margin: '0 0 0.75rem', color: '#f1f5f9' }}>
                    Repository <code>{lookupResult.repoFullName}</code> is not yet connected to your account.
                  </p>
                  <a
                    className="btn btn-primary"
                    href={lookupResult.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Install GitHub App on this Repository &rarr;
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      {data && data.items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
            <input
              type="text"
              className="input"
              placeholder="Filter repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '1rem' }}
            />
          </div>
          <span style={{ fontSize: '0.85rem', color: '#8b949e' }}>
            Showing {filteredRepos.length} of {data.items.length} repositories
          </span>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && <Loader label="Fetching connected repositories..." />}
      {!loading && error && !data && <ErrorState message={error} onRetry={reload} />}

      {/* Empty State */}
      {data && data.items.length === 0 && (
        <EmptyState title="No repositories connected yet">
          Connect your GitHub repository to enable autonomous AI code reviews.
          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn btn-primary" onClick={() => setShowConnectForm(true)}>
              + Connect Your First Repository
            </button>
          </div>
        </EmptyState>
      )}

      {/* Clean Repositories Grid */}
      {data && data.items.length > 0 && (
        <div className="repo-grid">
          {filteredRepos.map((repo) => (
            <div
              key={repo.id}
              className="repo-card-item"
              onClick={() => setSelectedRepo(repo)}
              title="Click to view details and trigger reviews"
            >
              <div>
                <div className="repo-card-top">
                  <span className="repo-card-name">{repo.repoFullName}</span>
                  <span className={`badge badge-${repo.enabled ? 'done' : 'failed'}`}>
                    {repo.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div className="chips" style={{ marginTop: '0.5rem' }}>
                  <span className="badge-pill small">{repo.isPrivate ? 'Private' : 'Public'}</span>
                  <span style={{ fontSize: '0.82rem', color: '#8b949e' }}>
                    {repo.reviewCount} review{repo.reviewCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="repo-card-footer">
                <div>
                  {repo.latestReview ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge kind="risk" value={repo.latestReview.riskLevel} />
                      <span style={{ color: '#8b949e' }}>{timeAgo(repo.latestReview.createdAt)}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#64748b' }}>No reviews yet</span>
                  )}
                </div>

                <span style={{ color: '#93c5fd', fontWeight: '500' }}>Manage &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================================
          DEDICATED REPOSITORY DETAIL WINDOW (MODAL DIALOG)
          ====================================================================== */}
      {selectedRepo && (
        <div className="modal-overlay" onClick={() => setSelectedRepo(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b949e', display: 'block', marginBottom: '0.2rem' }}>
                  Repository Control Center
                </span>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#ffffff' }}>
                  {selectedRepo.repoFullName}
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedRepo(null)}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Status and Info Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <span className={`badge badge-${selectedRepo.enabled ? 'done' : 'failed'}`}>
                  {selectedRepo.enabled ? 'Reviews Active' : 'Reviews Paused'}
                </span>
                <span className="badge-pill small">
                  {selectedRepo.isPrivate ? 'Private Repository' : 'Public Repository'}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                  Total Reviews: <strong>{selectedRepo.reviewCount}</strong>
                </span>
              </div>

              {/* Latest Review Info Box */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '1.15rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#cbd5e1' }}>
                    Latest Code Review Status
                  </span>
                  {selectedRepo.latestReview?.riskLevel && (
                    <Badge kind="risk" value={selectedRepo.latestReview.riskLevel} />
                  )}
                </div>

                {selectedRepo.latestReview ? (
                  <>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.5' }}>
                      {selectedRepo.latestReview.summary || 'Summary completed without text.'}
                    </p>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Last reviewed {timeAgo(selectedRepo.latestReview.createdAt)}
                    </span>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b' }}>
                    No pull requests have been reviewed for this repository yet.
                  </p>
                )}
              </div>

              {/* Action Buttons Box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Primary Button: Review / Test Open PRs */}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.8rem 1.25rem', fontSize: '0.95rem' }}
                  disabled={actionBusy}
                  onClick={() => handleReviewOpenPRs(selectedRepo)}
                >
                  {actionBusy ? 'Processing...' : '⚡ Trigger Review for Open PRs'}
                </button>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                  Inspects and reviews up to 5 currently open pull requests immediately.
                </p>

                {/* Secondary Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    className={`btn ${selectedRepo.enabled ? 'btn-danger' : 'btn-outline'}`}
                    disabled={actionBusy}
                    onClick={() => toggleEnabled(selectedRepo)}
                  >
                    {selectedRepo.enabled ? 'Pause Reviews' : 'Resume Reviews'}
                  </button>

                  <a
                    className="btn btn-outline"
                    href={`https://github.com/${selectedRepo.repoFullName}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on GitHub &rarr;
                  </a>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedRepo(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
