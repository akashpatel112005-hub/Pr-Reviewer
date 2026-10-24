import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Landing from './pages/Landing.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Overview from './pages/Overview.jsx';
import Repositories from './pages/Repositories.jsx';
import PRDetail from './pages/PRDetail.jsx';
import Jobs from './pages/Jobs.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="repos" element={<Repositories />} />
        <Route path="pull-requests/:id" element={<PRDetail />} />
        <Route path="jobs" element={<Jobs />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
