import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import Loader from '../components/Loader.jsx';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { saveToken } = useAuth();
  const [error, setError] = useState(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      setError('No authorization code was provided in the callback URL.');
      return;
    }

    if (attemptedRef.current) return;
    attemptedRef.current = true;

    async function handleExchange() {
      try {
        const { token } = await api('/api/auth/exchange', {
          method: 'POST',
          body: { code },
          auth: false,
        });

        await saveToken(token);

        // Check if user has repositories connected already
        try {
          const reposData = await api('/api/repos');
          if (reposData.items && reposData.items.length > 0) {
            navigate('/app', { replace: true });
          } else {
            navigate('/app/repos', { replace: true });
          }
        } catch {
          navigate('/app', { replace: true });
        }
      } catch (err) {
        setError(err.message || 'Failed to exchange authorization code. Please try signing in again.');
      }
    }

    handleExchange();
  }, [params, saveToken, navigate]);

  if (error) {
    return (
      <div className="center-page">
        <div className="card" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h2>Sign-in Failed</h2>
          <div className="error" role="alert" style={{ margin: '1rem 0' }}>
            {error}
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-page">
      <Loader label="Completing GitHub sign-in and setting up your workspace..." />
    </div>
  );
}
