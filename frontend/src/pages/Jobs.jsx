import { useState } from 'react';
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
  const { data, error, loading, reload } = useFetch(`/api/jobs${status ? `?status=${status}` : ''}`, { refreshMs: 8000 });

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
      <div className="row">
        <div>
          <h1>Jobs</h1>
          <p className="muted">Each pull request event becomes a job. Refreshes every 8 seconds.</p>
        </div>
        <div className="chips">
          <select className="input select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            {FILTERS.map((f) => <option key={f} value={f}>{f || 'All statuses'}</option>)}
          </select>
          <button className="btn btn-outline" onClick={reload}>Refresh</button>
        </div>
      </div>

      {notice && (
        <div className={notice.type === 'ok' ? 'notice' : 'error'} role="status">{notice.text}</div>
      )}

      {loading && <Loader />}
      {!loading && error && !data && <ErrorState message={error} onRetry={reload} />}
      {!loading && data && error && <div className="error">Could not refresh: {error}</div>}

      {data && data.items.length === 0 && (
        <EmptyState title="No jobs found">
          {status ? 'No jobs have this status.' : 'Jobs appear here as soon as GitHub sends a pull request event.'}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pull request</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.repo}#{job.prNumber}</strong>
                    <div className="muted small">commit {shortSha(job.headSha)}</div>
                  </td>
                  <td><Badge kind="status" value={job.status} /></td>
                  <td>{job.attempts}/{job.maxAttempts}</td>
                  <td className="small">{job.lastError || '-'}</td>
                  <td className="nowrap">{timeAgo(job.createdAt)}</td>
                  <td>
                    {job.canRerun && (
                      <button className="btn btn-outline" disabled={busyId === job.id} onClick={() => rerun(job)}>
                        {busyId === job.id ? 'Queuing...' : 'Re-run'}
                      </button>
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