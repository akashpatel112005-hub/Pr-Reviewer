import { useState } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function Login() {
  const { token, login, loginWithGitHub } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  if (token) return <Navigate to="/app" replace />;

  async function onSubmit(event) {
    event.preventDefault();
    if (!password) {
      setError('Enter the admin password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(password);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="center-page" style={{ background: '#07080b' }}>
      <div className="card login-card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="badge-pill" style={{ marginBottom: '0.75rem' }}>AI PR Reviewer</div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Welcome Back</h1>
          <p className="muted" style={{ margin: 0 }}>Sign in to access your repository reviews & audit reports</p>
        </div>

        {/* Primary Recommended Method: GitHub OAuth */}
        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={loginWithGitHub}
          style={{ width: '100%', marginBottom: '1.25rem' }}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0', color: '#64748b' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
          <span style={{ padding: '0 0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
        </div>

        {/* Password Fallback Toggle */}
        {!showPasswordForm ? (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowPasswordForm(true)}
              style={{ fontSize: '0.82rem', color: '#94a3b8' }}
            >
              Sign in with admin password &rarr;
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate style={{ animation: 'fadeIn 0.2s ease' }}>
            <label className="label" htmlFor="password">
              Admin Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="Enter master admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-outline btn-block" type="submit" disabled={busy}>
              {busy ? 'Authenticating...' : 'Sign in as Admin'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <Link to="/" style={{ color: '#8b949e', fontSize: '0.85rem' }}>
            &larr; Back to Landing Page
          </Link>
        </div>
      </div>
    </div>
  );
}
