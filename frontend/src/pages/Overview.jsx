import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { shortSha, timeAgo } from '../utils/format.js';

function Stat({ value, label, to, highlight }) {
  const body = (
    <>
      <div className="num" style={highlight ? { color: highlight } : {}}>{value}</div>
      <div className="lbl">{label}</div>
    </>
  );
  return to ? <Link className="stat stat-link" to={to}>{body}</Link> : <div className="stat">{body}</div>;
}

export default function Overview() {
  const stats = useFetch('/api/stats', { refreshMs: 15000 });
  const prs = useFetch('/api/pull-requests', { refreshMs: 15000 });

  function reloadAll() {
    stats.reload();
    prs.reload();
  }

  if (stats.loading || prs.loading) return <Loader label="Loading review analytics..." />;
  if ((stats.error && !stats.data) || (prs.error && !prs.data)) {
    return <ErrorState message={stats.error || prs.error} onRetry={reloadAll} />;
  }

  const s = stats.data;
  const items = prs.data.items;

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1>Review Overview</h1>
          <p className="muted" style={{ margin: 0 }}>
            Real-time code review metrics and pull request risk intelligence. Auto-refreshes every 15s.
          </p>
        </div>
        <button className="btn btn-outline" onClick={reloadAll}>Refresh</button>
      </div>

      {(stats.error || prs.error) && <div className="error">Could not refresh: {stats.error || prs.error}</div>}

      {/* Top Stat Cards */}
      <div className="grid">
        <Stat value={s.pullRequests} label="Pull requests reviewed" />
        <Stat value={s.reviews} label="Total reviews posted" />
        <Stat
          value={s.findings.critical}
          label="Critical security issues"
          highlight={s.findings.critical > 0 ? '#f87171' : null}
        />
        <Stat
          value={s.jobs.failed}
          label="Failed worker jobs"
          to="/app/jobs"
          highlight={s.jobs.failed > 0 ? '#f87171' : null}
        />
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid" style={{ marginTop: '1rem' }}>
        <div className="stat">
          <div className="lbl" style={{ marginBottom: '0.65rem' }}>Risk Distribution (Latest PRs)</div>
          <div className="chips">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="risk" value="high" /> <strong>{s.risk.high}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="risk" value="medium" /> <strong>{s.risk.medium}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="risk" value="low" /> <strong>{s.risk.low}</strong>
            </span>
          </div>
        </div>

        <div className="stat">
          <div className="lbl" style={{ marginBottom: '0.65rem' }}>Findings Breakdown</div>
          <div className="chips">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="severity" value="critical" /> <strong>{s.findings.critical}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="severity" value="warning" /> <strong>{s.findings.warning}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="severity" value="suggestion" /> <strong>{s.findings.suggestion}</strong>
            </span>
          </div>
        </div>

        <div className="stat">
          <div className="lbl" style={{ marginBottom: '0.65rem' }}>Queue Worker Jobs</div>
          <div className="chips">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="status" value="queued" /> <strong>{s.jobs.queued}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="status" value="processing" /> <strong>{s.jobs.processing}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
              <Badge kind="status" value="done" /> <strong>{s.jobs.done}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Recent PRs Table */}
      <h2 style={{ marginTop: '2.5rem' }}>Recent Pull Requests</h2>
      {items.length === 0 ? (
        <EmptyState title="No pull requests reviewed yet">
          Open a pull request on any connected repository, or click "Review open PRs" in the Repositories tab to generate your first audit report.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pull Request</th>
                <th>Risk Rating</th>
                <th>Findings</th>
                <th>Reviews</th>
                <th>Latest Review</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <Link to={`/app/pull-requests/${pr.id}`} style={{ fontWeight: 600, color: '#ffffff' }}>
                      {pr.title || '(untitled pull request)'}
                    </Link>
                    <div style={{ color: '#8b949e', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      <code>{pr.repo}#{pr.number}</code> by {pr.author || 'unknown'}
                    </div>
                  </td>
                  <td>
                    <Badge kind="risk" value={pr.latest.riskLevel} />
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: pr.latest.findingsCount > 0 ? '#f1f5f9' : '#8b949e' }}>
                      {pr.latest.findingsCount} issue{pr.latest.findingsCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: '#8b949e', fontSize: '0.88rem' }}>{pr.reviewCount}</span>
                  </td>
                  <td>
                    <div style={{ color: '#cbd5e1', fontSize: '0.88rem' }}>
                      {timeAgo(pr.latest.createdAt)}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {shortSha(pr.latest.headSha)}
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
