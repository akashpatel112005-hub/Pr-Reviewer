import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function Landing() {
  const { token, loginWithGitHub } = useAuth();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (token) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="landing-wrap">
      <header className="landing-header">
        <div className="landing-brand">AI PR Reviewer</div>
        <button className="btn btn-primary" onClick={loginWithGitHub}>
          Sign in with GitHub
        </button>
      </header>

      {error && (
        <div className="container" style={{ marginTop: '1.5rem' }}>
          <div className="error" role="alert">
            {decodeURIComponent(error)}
          </div>
        </div>
      )}

      <main className="landing-main">
        <section className="hero-section">
          <div className="badge-pill">Autonomous Code Intelligence</div>
          <h1 className="hero-title">Instant, High-Precision AI Reviews on Every Pull Request</h1>
          <p className="hero-subtitle">
            Say goodbye to PR bottlenecks and missed security flaws. AI PR Reviewer integrates with your GitHub repositories
            to inspect diffs, detect real bugs, and publish inline review comments and risk assessments in seconds.
          </p>

          <div className="hero-actions">
            <button className="btn btn-lg btn-primary" onClick={loginWithGitHub}>
              Sign in with GitHub
            </button>
            <button className="btn btn-lg btn-outline" onClick={loginWithGitHub}>
              Create account
            </button>
          </div>
          <p className="hero-subtext">No passwords or personal tokens required. GitHub handles account creation on your first sign-in.</p>
        </section>

        <section className="steps-section">
          <h2>How It Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">1</div>
              <h3>Connect in One Click</h3>
              <p>Sign in with your GitHub account and install our GitHub App on your personal or organization repositories.</p>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <h3>Automated PR Ingestion</h3>
              <p>Whenever a PR is opened or updated, a background job filters noise (lockfiles, vendor assets) and analyzes code diffs.</p>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <h3>Inline Comments & Dashboard</h3>
              <p>The bot posts line-accurate inline review comments directly on GitHub, while your private dashboard tracks all metrics and risk scores.</p>
            </div>
          </div>
        </section>

        <section className="features-section">
          <h2>Built for Real Engineering Teams</h2>
          <div className="features-grid">
            <div className="feature-item">
              <h4>Strict Anti-Hallucination</h4>
              <p>Diff hunk line-mapping ensures comments are only placed on real modified lines, eliminating phantom findings.</p>
            </div>
            <div className="feature-item">
              <h4>Multi-Tenant & Isolated</h4>
              <p>Every review, pull request, and job is strictly scoped to your authorized GitHub installations.</p>
            </div>
            <div className="feature-item">
              <h4>Zero Nitpicks, Pure Value</h4>
              <p>Focuses strictly on critical security bugs, race conditions, edge cases, and missing error handling.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} AI PR Reviewer. Built with GitHub App Integration & Intelligent Diff Chunking.</p>
      </footer>
    </div>
  );
}
