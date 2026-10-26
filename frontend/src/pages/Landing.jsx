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
      {/* Top Navbar */}
      <header className="landing-header">
        <div className="landing-brand">AI PR Reviewer</div>
        <button className="btn btn-primary" onClick={loginWithGitHub}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </button>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: 0 }}>
          <div className="error" role="alert">
            {decodeURIComponent(error)}
          </div>
        </div>
      )}

      {/* Hero Section */}
      <main className="landing-main">
        <section className="hero-section">
          <div className="badge-pill">Autonomous Code Review &bull; GitHub App Integrated</div>
          <h1 className="hero-title">
            Instant, High-Precision AI Reviews on Every Pull Request
          </h1>
          <p className="hero-subtitle">
            Say goodbye to PR review bottlenecks and subtle vulnerabilities. AI PR Reviewer connects directly to your
            GitHub repositories to analyze diffs, pinpoint real security flaws, and post line-accurate review comments in seconds.
          </p>

          <div className="hero-actions">
            <button className="btn btn-lg btn-primary" onClick={loginWithGitHub}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Sign in with GitHub
            </button>
            <button className="btn btn-lg btn-outline" onClick={loginWithGitHub}>
              Connect Your Repositories &rarr;
            </button>
          </div>
          <p className="hero-subtext">
            No passwords or manual API tokens needed. Secured via GitHub App OAuth with isolated multi-tenant workspaces.
          </p>
        </section>

        {/* 3 Steps */}
        <section className="steps-section">
          <h2>How It Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">1</div>
              <h3>One-Click GitHub Sign In</h3>
              <p>Authorize your GitHub account in one click. Install the official GitHub App on your personal or team repositories.</p>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <h3>Automated Diff Analysis</h3>
              <p>Every time a PR is opened or updated, our background engine strips noise, filters lockfiles, and analyzes modified lines with high-speed LLMs.</p>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <h3>Actionable Audit Reports</h3>
              <p>The bot posts line-accurate inline review comments directly on your GitHub PR and creates a complete security risk assessment.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="features-section">
          <h2>Engineered for Modern Software Teams</h2>
          <div className="features-grid">
            <div className="feature-item">
              <h4>Strict Anti-Hallucination</h4>
              <p>Diff hunk verification ensures findings are mapped only to actual modified code lines, eliminating ghost comments.</p>
            </div>
            <div className="feature-item">
              <h4>Deterministic Risk Scoring</h4>
              <p>Calculates explicit Low, Medium, and High risk ratings based on critical vulnerabilities, auth touches, and schema changes.</p>
            </div>
            <div className="feature-item">
              <h4>Zero Nitpicks, Pure Value</h4>
              <p>Engineered to detect critical bugs, unhandled exceptions, race conditions, and SQL/XSS risks instead of formatting trivia.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} AI PR Reviewer</p>
      </footer>
    </div>
  );
}
