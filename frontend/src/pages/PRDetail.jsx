import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { formatDate, shortSha } from '../utils/format.js';

function groupByFile(findings) {
  const map = new Map();
  for (const f of findings) {
    if (!map.has(f.filePath)) map.set(f.filePath, []);
    map.get(f.filePath).push(f);
  }
  return [...map.entries()].map(([file, items]) => [file, [...items].sort((a, b) => a.line - b.line)]);
}

export default function PRDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(`/api/pull-requests/${id}`);
  const [picked, setPicked] = useState(null);

  if (loading) return <Loader />;
  if (error && !data) {
    return (
      <>
        <p><Link to="/app">&larr; Back to overview</Link></p>
        <ErrorState message={error} onRetry={reload} />
      </>
    );
  }

  const { pullRequest: pr, reviews } = data;
  const review = reviews.find((r) => r.id === picked) || reviews[0];

  return (
    <>
      <p><Link to="/app">&larr; Back to overview</Link></p>
      <div className="row">
        <div>
          <h1>{pr.title || '(untitled)'}</h1>
          <p className="muted">{pr.repo}#{pr.number} by {pr.author || 'unknown'}</p>
        </div>
        {pr.url && <a className="btn btn-outline" href={pr.url} target="_blank" rel="noreferrer">Open on GitHub</a>}
      </div>

      {!review ? (
        <EmptyState title="No review saved for this pull request yet" />
      ) : (
        <>
          {reviews.length > 1 && (
            <div className="card">
              <h2>Review history</h2>
              <div className="chips">
                {reviews.map((r) => (
                  <button
                    key={r.id}
                    className={`btn ${r.id === review.id ? '' : 'btn-outline'}`}
                    onClick={() => setPicked(r.id)}
                  >
                    {shortSha(r.headSha)} &middot; {formatDate(r.createdAt)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="row">
              <h2>Summary</h2>
              <Badge kind="risk" value={review.riskLevel} />
            </div>
            <p className="muted small">Commit {shortSha(review.headSha)} &middot; {formatDate(review.createdAt)}</p>
            {review.summary ? <p>{review.summary}</p> : <p className="muted">No summary was generated for this review.</p>}
            {review.summaryError && <div className="error small">Summary unavailable: {review.summaryError}</div>}
            {review.changes.length > 0 && (
              <ul>
                {review.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
            {review.riskReason && <p><strong>Risk assessment:</strong> {review.riskReason}</p>}
            <p className="small">
              {review.filesReviewed} file(s) reviewed &middot; {review.findingsCount} finding(s) &middot; {review.inlineCount} inline comment(s)
              {review.githubReviewUrl && (
                <> &middot; <a href={review.githubReviewUrl} target="_blank" rel="noreferrer">View review on GitHub</a></>
              )}
            </p>
          </div>

          <h2 style={{ marginTop: '2rem' }}>Findings</h2>
          {review.findings.length === 0 ? (
            <EmptyState title="No findings for this commit">The reviewed changes looked clean.</EmptyState>
          ) : (
            groupByFile(review.findings).map(([file, items]) => (
              <div className="table-wrap" key={file}>
                <div className="file-head">{file}</div>
                <table>
                  <tbody>
                    {items.map((f) => (
                      <tr key={f.id}>
                        <td className="nowrap">Line {f.line}</td>
                        <td className="nowrap"><Badge kind="severity" value={f.severity} /></td>
                        <td>
                          <div className="muted small">{f.category}</div>
                          <div>{f.message}</div>
                          {f.suggestion && <div className="small"><strong>Fix:</strong> {f.suggestion}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {review.filesSkipped.length > 0 && (
            <div className="card">
              <h2>Files not reviewed ({review.filesSkipped.length})</h2>
              <ul>
                {review.filesSkipped.map((s) => (
                  <li key={s.file}><code>{s.file}</code>: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {review.warnings.length > 0 && (
            <div className="card">
              <h2>Notes</h2>
              <ul>
                {review.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}