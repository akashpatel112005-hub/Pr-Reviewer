import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { shortSha, timeAgo } from '../utils/format.js';

function Stat({ value, label, to }) {
  const body = (
    <>
      <div className="num">{value}</div>
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

  if (stats.loading || prs.loading) return <Loader />;
  if ((stats.error && !stats.data) || (prs.error && !prs.data)) {
    return <ErrorState message={stats.error || prs.error} onRetry={reloadAll} />;
  }

  const s = stats.data;
  const items = prs.data.items;

  return (
    <>
      <div className="row">
        <div>
          <h1>Overview</h1>
          <p className="muted">Pull requests reviewed by the bot. Updates every 15 seconds.</p>
        </div>
        <button className="btn btn-outline" onClick={reloadAll}>Refresh</button>
      </div>

      {(stats.error || prs.error) && <div className="error">Could not refresh: {stats.error || prs.error}</div>}

      <div className="grid">
        <Stat value={s.pullRequests} label="Pull requests reviewed" />
        <Stat value={s.reviews} label="Reviews posted" />
        <Stat value={s.findings.critical} label="Critical findings (latest reviews)" />
        <Stat value={s.jobs.failed} label="Failed jobs" to="/app/jobs" />
      </div>

      <div className="grid">
        <div className="stat">
          <div className="lbl">Risk (latest review per PR)</div>
          <div className="chips">
            <span><Badge kind="risk" value="high" /> {s.risk.high}</span>
            <span><Badge kind="risk" value="medium" /> {s.risk.medium}</span>
            <span><Badge kind="risk" value="low" /> {s.risk.low}</span>
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Findings (latest reviews)</div>
          <div className="chips">
            <span><Badge kind="severity" value="critical" /> {s.findings.critical}</span>
            <span><Badge kind="severity" value="warning" /> {s.findings.warning}</span>
            <span><Badge kind="severity" value="suggestion" /> {s.findings.suggestion}</span>
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Jobs</div>
          <div className="chips">
            <span><Badge kind="status" value="queued" /> {s.jobs.queued}</span>
            <span><Badge kind="status" value="processing" /> {s.jobs.processing}</span>
            <span><Badge kind="status" value="done" /> {s.jobs.done}</span>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Recent pull requests</h2>
      {items.length === 0 ? (
        <EmptyState title="No pull requests reviewed yet">
          Open a pull request on a connected repository and its review will appear here.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pull request</th>
                <th>Risk</th>
                <th>Findings</th>
                <th>Reviews</th>
                <th>Last review</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <Link to={`/app/pull-requests/${pr.id}`}><strong>{pr.title || '(untitled)'}</strong></Link>
                    <div className="muted small">{pr.repo}#{pr.number} by {pr.author || 'unknown'}</div>
                  </td>
                  <td><Badge kind="risk" value={pr.latest.riskLevel} /></td>
                  <td>{pr.latest.findingsCount}</td>
                  <td>{pr.reviewCount}</td>
                  <td>
                    {timeAgo(pr.latest.createdAt)}
                    <div className="muted small">commit {shortSha(pr.latest.headSha)}</div>
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