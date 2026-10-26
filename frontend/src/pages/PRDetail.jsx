import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import Loader from '../components/Loader.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { formatDate, shortSha } from '../utils/format.js';

export default function PRDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(`/api/pull-requests/${id}`);
  const [picked, setPicked] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'critical' | 'warning' | 'suggestion'
  const [viewMode, setViewMode] = useState('severity'); // 'severity' | 'file'
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedFixId, setCopiedFixId] = useState('');

  if (loading) return <Loader label="Loading code review report..." />;
  if (error && !data) {
    return (
      <div className="container">
        <p style={{ marginBottom: '1.25rem' }}>
          <Link to="/app" style={{ color: '#94a3b8' }}>&larr; Back to overview</Link>
        </p>
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const { pullRequest: pr, reviews } = data;
  const review = reviews.find((r) => r.id === picked) || reviews[0];

  const allFindings = review?.findings || [];
  const criticalFindings = allFindings.filter((f) => f.severity === 'critical');
  const warningFindings = allFindings.filter((f) => f.severity === 'warning');
  const suggestionFindings = allFindings.filter((f) => f.severity === 'suggestion');

  // Filtered findings according to active tab
  let displayedFindings = allFindings;
  if (activeTab === 'critical') displayedFindings = criticalFindings;
  else if (activeTab === 'warning') displayedFindings = warningFindings;
  else if (activeTab === 'suggestion') displayedFindings = suggestionFindings;

  // Group by file helper
  const groupedByFile = (() => {
    const map = new Map();
    for (const f of displayedFindings) {
      if (!map.has(f.filePath)) map.set(f.filePath, []);
      map.get(f.filePath).push(f);
    }
    return [...map.entries()].map(([file, items]) => [
      file,
      [...items].sort((a, b) => a.line - b.line),
    ]);
  })();

  return (
    <>
      <p style={{ marginBottom: '1.5rem' }}>
        <Link to="/app" style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          &larr; Back to Overview
        </Link>
      </p>

      {/* Report Header */}
      <div className="report-header row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge-pill small">{pr.repo}</span>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>PR #{pr.number}</span>
            <span style={{ color: '#64748b' }}>&middot;</span>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>by <strong>{pr.author || 'unknown'}</strong></span>
          </div>
          <h1 style={{ fontSize: '1.85rem', lineHeight: '1.2' }}>{pr.title || '(untitled pull request)'}</h1>
        </div>

        <div className="chips">
          <button
            className="btn btn-outline"
            onClick={() => {
              if (!review) return;
              const text = [
                `# AI Code Review Report: ${pr.title || 'Pull Request'}`,
                `Repository: ${pr.repo}#${pr.number} (by @${pr.author || 'unknown'})`,
                `Commit: ${review.headSha} | Risk: ${String(review.riskLevel).toUpperCase()}`,
                '',
                '## Summary',
                review.summary || 'No summary available.',
                '',
                review.riskReason ? `Risk Assessment: ${review.riskReason}` : '',
                '',
                review.changes?.length ? '### Key Changes:\n' + review.changes.map((c) => `- ${c}`).join('\n') : '',
                '',
                `### Findings (${allFindings.length} total, ${criticalFindings.length} critical, ${warningFindings.length} warnings):`,
                ...allFindings.map(
                  (f) => `- [${f.severity.toUpperCase()}] ${f.filePath}:${f.line} - ${f.message}${f.suggestion ? ` (Fix: ${f.suggestion})` : ''}`
                ),
              ].filter(Boolean).join('\n');

              navigator.clipboard.writeText(text).then(() => {
                setCopiedReport(true);
                setTimeout(() => setCopiedReport(false), 2000);
              });
            }}
          >
            {copiedReport ? '✓ Copied Markdown Report' : '📋 Copy Report'}
          </button>
          {review?.githubReviewUrl && (
            <a className="btn btn-outline" href={review.githubReviewUrl} target="_blank" rel="noreferrer">
              View on GitHub &rarr;
            </a>
          )}
          {pr.url && (
            <a className="btn btn-outline" href={pr.url} target="_blank" rel="noreferrer">
              Open PR &rarr;
            </a>
          )}
        </div>
      </div>

      {!review ? (
        <EmptyState title="No review report saved for this pull request yet">
          The pull request is either being processed by the worker or awaiting the webhook trigger.
        </EmptyState>
      ) : (
        <>
          {/* Review Commit History Selector (if multiple commits reviewed) */}
          {reviews.length > 1 && (
            <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#cbd5e1' }}>Commit History ({reviews.length} reviews):</span>
                <div className="chips">
                  {reviews.map((r) => (
                    <button
                      key={r.id}
                      className={`btn btn-sm ${r.id === review.id ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPicked(r.id)}
                    >
                      {shortSha(r.headSha)} &middot; {formatDate(r.createdAt)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 1. EXECUTIVE SUMMARY & RISK ASSESSMENT REPORT */}
          <div className="report-summary-card">
            <div className="report-risk-banner">
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b949e', display: 'block', marginBottom: '0.35rem' }}>
                  Risk Assessment Rating
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <Badge kind="risk" value={review.riskLevel} />
                  <span style={{ fontSize: '0.92rem', color: '#cbd5e1' }}>
                    Commit <code>{shortSha(review.headSha)}</code>
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right', color: '#8b949e', fontSize: '0.85rem' }}>
                Audited {formatDate(review.createdAt)}
              </div>
            </div>

            {/* Plain English Summary */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#ffffff' }}>Executive Summary</h3>
              {review.summary ? (
                <p style={{ fontSize: '1rem', lineHeight: '1.65', color: '#e2e8f0', margin: 0 }}>
                  {review.summary}
                </p>
              ) : (
                <p className="muted">No overview summary was generated for this review.</p>
              )}
            </div>

            {/* Risk Reasoning */}
            {review.riskReason && (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem 1.15rem', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                  Risk Factor Explanation
                </span>
                <div style={{ fontSize: '0.92rem', color: '#f1f5f9' }}>{review.riskReason}</div>
              </div>
            )}

            {/* Bulleted Changes */}
            {review.changes.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.95rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>Identified Functional Changes:</h4>
                <ul style={{ margin: 0, color: '#cbd5e1', fontSize: '0.92rem', lineHeight: '1.6' }}>
                  {review.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {review.summaryError && (
              <div className="error" style={{ marginTop: '1rem' }}>
                Summary Error: {review.summaryError}
              </div>
            )}
          </div>

          {/* 2. AUDIT METRICS BAR */}
          <div className="report-metrics-bar">
            <div className="report-metric-item">
              <div className="val">{allFindings.length}</div>
              <div className="lbl">Total Issues</div>
            </div>
            <div className="report-metric-item">
              <div className={`val ${criticalFindings.length > 0 ? 'critical' : ''}`}>
                {criticalFindings.length}
              </div>
              <div className="lbl">Critical</div>
            </div>
            <div className="report-metric-item">
              <div className={`val ${warningFindings.length > 0 ? 'warning' : ''}`}>
                {warningFindings.length}
              </div>
              <div className="lbl">Warnings</div>
            </div>
            <div className="report-metric-item">
              <div className={`val ${suggestionFindings.length > 0 ? 'suggestion' : ''}`}>
                {suggestionFindings.length}
              </div>
              <div className="lbl">Suggestions</div>
            </div>
            <div className="report-metric-item">
              <div className="val">{review.filesReviewed}</div>
              <div className="lbl">Files Checked</div>
            </div>
            <div className="report-metric-item">
              <div className="val">{review.inlineCount || 0}</div>
              <div className="lbl">Inline Comments</div>
            </div>
          </div>

          {/* 3. FINDINGS SECTION WITH FLOW (Criticals First) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2.5rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Audit Findings & Action Items</h2>
              <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.88rem' }}>
                Priority ordered review findings verified against the pull request diff lines.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className="chips">
                <button
                  className={`filter-pill ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  All ({allFindings.length})
                </button>
                <button
                  className={`filter-pill ${activeTab === 'critical' ? 'active' : ''}`}
                  onClick={() => setActiveTab('critical')}
                >
                  Critical ({criticalFindings.length})
                </button>
                <button
                  className={`filter-pill ${activeTab === 'warning' ? 'active' : ''}`}
                  onClick={() => setActiveTab('warning')}
                >
                  Warnings ({warningFindings.length})
                </button>
                <button
                  className={`filter-pill ${activeTab === 'suggestion' ? 'active' : ''}`}
                  onClick={() => setActiveTab('suggestion')}
                >
                  Suggestions ({suggestionFindings.length})
                </button>
              </div>

              <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.15)', paddingLeft: '0.75rem' }}>
                <select
                  className="input select"
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  aria-label="View grouping mode"
                >
                  <option value="severity">Order: By Severity (Critical First)</option>
                  <option value="file">Group: By File Path</option>
                </select>
              </div>
            </div>
          </div>

          {displayedFindings.length === 0 ? (
            <EmptyState title="No findings match this filter">
              {allFindings.length === 0
                ? 'The reviewed changes looked clean. No bugs, security issues, or code style defects were found.'
                : 'No issues in this severity category.'}
            </EmptyState>
          ) : viewMode === 'severity' ? (
            // Flow: Render by Severity (Critical -> Warning -> Suggestion)
            <div>
              {displayedFindings
                .slice()
                .sort((a, b) => {
                  const rank = { critical: 1, warning: 2, suggestion: 3 };
                  return (rank[a.severity] || 4) - (rank[b.severity] || 4);
                })
                .map((f) => (
                  <div key={f.id} className={`finding-card severity-${f.severity}`}>
                    <div className="finding-head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <Badge kind="severity" value={f.severity} />
                        <span className="finding-loc">
                          {f.filePath}:{f.line}
                        </span>
                        {f.category && (
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#94a3b8' }}>
                            {f.category}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Line {f.line}</span>
                    </div>

                    <div className="finding-desc">{f.message}</div>

                    {f.suggestion && (
                      <div className="finding-fix">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <strong style={{ margin: 0 }}>Recommended Fix:</strong>
                          <button
                            className="btn btn-sm btn-outline"
                            style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}
                            onClick={() => {
                              navigator.clipboard.writeText(f.suggestion);
                              setCopiedFixId(f.id);
                              setTimeout(() => setCopiedFixId(''), 2000);
                            }}
                          >
                            {copiedFixId === f.id ? '✓ Copied' : 'Copy Fix'}
                          </button>
                        </div>
                        <div>{f.suggestion}</div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            // Flow: Grouped by File
            groupedByFile.map(([file, items]) => (
              <div className="table-wrap" key={file} style={{ marginBottom: '1.5rem' }}>
                <div className="file-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{file}</span>
                  <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>{items.length} issue(s)</span>
                </div>
                <table>
                  <tbody>
                    {items.map((f) => (
                      <tr key={f.id}>
                        <td className="nowrap" style={{ width: '90px' }}>
                          <code>L:{f.line}</code>
                        </td>
                        <td className="nowrap" style={{ width: '120px' }}>
                          <Badge kind="severity" value={f.severity} />
                        </td>
                        <td>
                          <div style={{ fontSize: '0.78rem', color: '#8b949e', marginBottom: '0.2rem' }}>
                            {f.category || 'General'}
                          </div>
                          <div style={{ color: '#f1f5f9', marginBottom: f.suggestion ? '0.4rem' : '0' }}>
                            {f.message}
                          </div>
                          {f.suggestion && (
                            <div className="finding-fix" style={{ margin: '0.4rem 0 0', padding: '0.5rem 0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <strong style={{ margin: 0 }}>Fix:</strong>
                                <button
                                  className="btn btn-sm btn-outline"
                                  style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(f.suggestion);
                                    setCopiedFixId(f.id);
                                    setTimeout(() => setCopiedFixId(''), 2000);
                                  }}
                                >
                                  {copiedFixId === f.id ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                              <div>{f.suggestion}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {/* 4. FILES NOT REVIEWED (SKIPPED) */}
          {review.filesSkipped.length > 0 && (
            <div className="card" style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>Files Excluded from Review ({review.filesSkipped.length})</h3>
                <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>Ignored lockfiles, generated assets & binaries</span>
              </div>
              <ul style={{ color: '#94a3b8', fontSize: '0.88rem', margin: 0 }}>
                {review.filesSkipped.map((s) => (
                  <li key={s.file}>
                    <code>{s.file}</code> &mdash; <span style={{ color: '#cbd5e1' }}>{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 5. AUDIT ENGINE NOTES */}
          {review.warnings.length > 0 && (
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: '#ffffff' }}>Review Engine Notes</h3>
              <ul style={{ color: '#94a3b8', fontSize: '0.88rem', margin: 0 }}>
                {review.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
