import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { shortSha, timeAgo } from '../utils/format.js';

const FILTERS = ['', 'queued', 'processing', 'done', 'failed'];

export default function Jobs() {
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState(null);
  const { data, error, loading, reload } = useFetch(
    `/api/jobs${status ? `?status=${status}` : ''}`,
    { refreshMs: 8000 }
  );

  async function rerun(job) {
    setBusyId(job.id);
    setNotice(null);
    try {
      await api(`/api/jobs/${job.id}/rerun`, { method: 'POST' });
      setNotice({ type: 'ok', text: `Queued a new review job for ${job.repo}#${job.prNumber}.` });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1>Review Pipeline Jobs</h1>
          <p className="muted" style={{ margin: 0 }}>
            Background review orchestration tasks triggered by GitHub webhooks and manual reviews. Auto-refreshes every 8s.
          </p>
        </div>
        <div className="chips">
          <select
            className="input select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f ? `Status: ${f.charAt(0).toUpperCase() + f.slice(1)}` : 'All statuses'}
              </option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={reload}>Refresh</button>
        </div>
      </div>

      {notice && (
        <div className={notice.type === 'ok' ? 'notice' : 'error'} role="status">
          {notice.text}
        </div>
      )}

      {loading && <Loader label="Fetching jobs..." />}
      {!loading && error && !data && <ErrorState message={error} onRetry={reload} />}
      {!loading && data && error && <div className="error">Could not refresh: {error}</div>}

      {data && data.items.length === 0 && (
        <EmptyState title="No jobs found">
          {status
            ? `No jobs found with status "${status}".`
            : 'Jobs appear here as soon as GitHub sends a pull request event or an open PR review is triggered.'}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pull Request</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Error Reason</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong style={{ color: '#ffffff' }}>{job.repo}#{job.prNumber}</strong>
                    <div style={{ color: '#8b949e', fontSize: '0.8rem', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                      commit {shortSha(job.headSha)}
                    </div>
                  </td>
                  <td>
                    <Badge kind="status" value={job.status} />
                  </td>
                  <td>
                    <span style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>
                      {job.attempts} / {job.maxAttempts}
                    </span>
                  </td>
                  <td style={{ maxWidth: '300px' }}>
                    <span style={{ fontSize: '0.85rem', color: job.lastError ? '#fca5a5' : '#64748b' }}>
                      {job.lastError || '—'}
                    </span>
                  </td>
                  <td className="nowrap" style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                    {timeAgo(job.createdAt)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {job.canRerun && (
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={busyId === job.id}
                        onClick={() => rerun(job)}
                      >
                        {busyId === job.id ? 'Queuing...' : 'Re-run Job'}
                      </button>
                    )}
                    {job.status === 'done' && (
                      <Link
                        className="btn btn-sm btn-outline"
                        to="/app"
                        style={{ fontSize: '0.8rem', color: '#93c5fd' }}
                      >
                        View in Overview &rarr;
                      </Link>
                    )}
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
