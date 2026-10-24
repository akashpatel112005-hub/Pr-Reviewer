import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Loader from './Loader.jsx';

export default function ProtectedRoute({ children }) {
  const { token, checking } = useAuth();
  const location = useLocation();

  if (checking) return <Loader label="Checking your session..." />;
  if (!token) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return children;
}